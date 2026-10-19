import {
  buildLocationChoice,
  locationChoiceMessage,
  readDevicePosition,
  resolveLocationRef,
  resolveTransferLocations,
  resolveUpdateLocation,
  type GeoPoint,
} from "@/src/lib/agents/location-choice";
import { describeStock, largeQuantityWarning, pickProduct, type ProductSearchResult } from "@/src/lib/agents/product-resolution";
import { ProcessRecorder, answerStep, mutationOutcomeStep, type ProcessStep } from "@/src/lib/agents/process-trace";
import { OFFLINE_MUTATION_MESSAGE } from "@/src/lib/agents/turn/replies";
import { executeTool, fetchTenantLocations, searchProducts } from "@/src/lib/agents/turn/tools";
import type { MutationChoice, MutationOutcome, MutationTool, PendingConfirmation } from "@/src/lib/agents/turn/types";

async function executeMutation(
  toolName: MutationTool,
  executedArgs: Record<string, unknown>,
  product: ProductSearchResult | null,
  conversationId: string,
  businessId: string,
): Promise<MutationOutcome> {
  const result = (await executeTool(toolName, executedArgs, conversationId, businessId)) as {
    audit_log_id?: string;
    message?: string;
    error?: string;
  } | null;
  if (result?.audit_log_id && result.message) {
    const warning =
      toolName === "updateStock" && executedArgs.direction === "masuk"
        ? largeQuantityWarning(Number(executedArgs.quantity), product)
        : null;
    return {
      message: warning ? `${result.message}\n${warning}` : result.message,
      pendingConfirmation: {
        audit_log_id: result.audit_log_id,
        tool_name: toolName,
        message: result.message,
        ...(warning && { warning }),
      },
      result: { status: "pending_confirmation", audit_log_id: result.audit_log_id, ...(warning && { warning }) },
      executedArgs,
    };
  }
  const error = result?.error ?? "Gagal mencatat transaksi. Coba lagi ya.";
  const stockNote = product && /tidak mencukupi/i.test(error) ? ` Stok tersedia ${product.name}: ${describeStock(product)}.` : "";
  return { message: `${error}.${stockNote}`.replace("..", "."), result: { status: "rejected", error }, executedArgs };
}

/**
 * Alat transaksi satu langkah: model cukup menulis nama barang, jumlah, arah, dan
 * lokasi seperti disebut staf. Kode yang mencari produk, memetakan lokasi, dan
 * mengeksekusi; hasilnya pesan deterministik, konfirmasi PIN, atau kartu pilihan.
 */
export async function advanceMutation(
  toolName: MutationTool,
  args: Record<string, unknown>,
  userMessage: string,
  conversationId: string,
  businessId: string,
  getDevicePosition: () => Promise<GeoPoint | null>,
  /** Tindakan kode untuk "Lihat proses" (mis. "Lokasi diisi: Gudang"). */
  note: (text: string) => void = () => {},
  /** Pesan asli staf (sebelum singkatan diluruskan); disimpan sebagai alasan di audit log. */
  originalMessage: string = userMessage,
): Promise<MutationOutcome> {
  if (!navigator.onLine) return { message: OFFLINE_MUTATION_MESSAGE, result: { status: "offline" } };

  const locations = await fetchTenantLocations();
  const locRef = (v: unknown) => (locations ? resolveLocationRef(v, locations)?.id ?? null : null);

  // 1. Produk: dari pilihan staf (product_id) atau dicari dari nama tulisan model.
  let product: ProductSearchResult | null = null;
  let productId = typeof args.product_id === "string" ? args.product_id : null;
  let productName = typeof args.product_name === "string" ? args.product_name : null;
  let modelProductId: string | null = null;
  if (!productId) {
    const query = String(args.product ?? args.product_name ?? "").trim();
    if (!query) return { message: "Barang apa yang mau dicatat?", result: { status: "product_missing" } };
    const search = await searchProducts(query, conversationId, businessId);
    if (search.fromCache) {
      return {
        message: "Pencarian barang ke server sedang gagal. Coba kirim ulang sebentar lagi.",
        result: { status: "product_search_failed", query },
      };
    }
    const pick = pickProduct(search.results);
    if (pick.status === "none") {
      return {
        message: `Barang "${query}" tidak ditemukan di data toko. Coba sebut nama lain atau nomor part-nya.`,
        result: { status: "product_not_found", query, search_results: search.results.length },
      };
    }
    if (pick.status === "ambiguous") {
      return {
        message: `Ada beberapa barang yang mirip "${query}". Pilih yang dimaksud di bawah.`,
        choice: {
          kind: "product",
          toolName,
          args,
          userMessage,
          originalMessage,
          options: pick.candidates.map((c) => ({ id: c.product_id, name: c.name, detail: describeStock(c) })),
        },
        result: { status: "product_choice_required", candidates: pick.candidates.map((c) => c.product_id) },
      };
    }
    product = pick.product;
    productId = product.product_id;
    productName = product.name;
    modelProductId = product.product_id;
    note(`Barang dicocokkan kode: ${product.name}`);
  }
  const name = productName ?? "barang ini";

  const quantity = Number(args.quantity);
  const reasoning = String(args.reasoning ?? "").trim() || originalMessage;
  const resolvedArgs: Record<string, unknown> =
    toolName === "updateStock"
      ? {
          product_id: modelProductId,
          location_id: locRef(args.location ?? args.location_id),
          quantity: args.quantity,
          direction: args.direction,
        }
      : {
          product_id: modelProductId,
          quantity: args.quantity,
          from_location_id: locRef(args.from_location ?? args.from_location_id),
          to_location_id: locRef(args.to_location ?? args.to_location_id),
        };

  // Angka ≤ 0 yang ditulis (mis. "keluar -5") dibedakan dari jumlah yang tidak disebut.
  if (Number.isFinite(quantity) && args.quantity !== undefined && args.quantity !== null && args.quantity !== "" && quantity <= 0) {
    return {
      message: `Jumlah harus lebih dari 0. Berapa ${name} yang mau dicatat?`,
      result: { status: "quantity_invalid", quantity },
      resolvedArgs,
    };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { message: `Berapa jumlah ${name} yang mau dicatat?`, result: { status: "quantity_missing" }, resolvedArgs };
  }
  if (!locations) {
    return { message: "Daftar lokasi toko tidak bisa dimuat. Coba lagi sebentar lagi.", result: { status: "locations_unavailable" }, resolvedArgs };
  }

  if (toolName === "updateStock") {
    const direction = String(args.direction ?? "").toLowerCase();
    if (direction !== "masuk" && direction !== "keluar") {
      return { message: `${name} mau dicatat masuk atau keluar?`, result: { status: "direction_missing" }, resolvedArgs };
    }
    const base = { product_id: productId, quantity, direction, reasoning };
    const resolved = resolveUpdateLocation({ location_id: args.location ?? args.location_id }, userMessage, locations);
    if (resolved === "choose") {
      const choice = buildLocationChoice(base, userMessage, locations, await getDevicePosition());
      return {
        message: locationChoiceMessage(choice, productName),
        choice,
        result: {
          status: "location_choice_required",
          suggested_location_id: choice.suggestedLocationId,
          suggestion_reason: choice.suggestionReason,
        },
        resolvedArgs,
      };
    }
    const locationId = resolved === "passthrough" ? null : resolved.locationId;
    const locationName = locations.find((l) => l.id === locationId)?.name;
    note(locationName ? `Lokasi diisi: ${locationName}` : "Lokasi diteruskan ke server untuk divalidasi");
    const outcome = await executeMutation(toolName, { ...base, location_id: locationId }, product, conversationId, businessId);
    return { ...outcome, resolvedArgs };
  }

  const { from, to } = resolveTransferLocations(args, userMessage, locations);
  if (!from || !to || from === to) {
    return {
      message: `Pindah ${name} dari mana ke mana? Sebutkan lokasi asal dan tujuannya, misalnya "dari gudang ke toko".`,
      result: { status: "transfer_locations_missing" },
      resolvedArgs,
    };
  }
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "lokasi";
  note(`Lokasi diisi: dari ${locName(from)} ke ${locName(to)}`);
  const outcome = await executeMutation(
    toolName,
    { product_id: productId, quantity, from_location_id: from, to_location_id: to, reasoning },
    product,
    conversationId,
    businessId,
  );
  return { ...outcome, resolvedArgs };
}

/**
 * Lanjutkan transaksi yang ditahan setelah staf memilih produk atau lokasi.
 * Deterministik, tanpa LLM; hasilnya masuk alur konfirmasi PIN yang sama.
 */
export async function submitMutationChoice(
  choice: MutationChoice,
  selectedId: string,
  conversationId: string,
  businessId: string,
  onStep?: (steps: ProcessStep[]) => void,
): Promise<{
  message: string;
  pendingConfirmation?: PendingConfirmation;
  choice?: MutationChoice;
  processSteps: ProcessStep[];
}> {
  const rec = new ProcessRecorder(onStep);
  const picked = choice.options.find((o) => o.id === selectedId);
  rec.add({
    kind: "action",
    label: `Staf memilih ${choice.kind === "location" ? "lokasi" : "barang"}: ${picked?.name ?? selectedId}`,
    status: "done",
  });
  const outcome =
    choice.kind === "location"
      ? await executeMutation(choice.toolName, { ...choice.args, location_id: selectedId }, null, conversationId, businessId)
      : await advanceMutation(
          choice.toolName,
          { ...choice.args, product_id: selectedId, product_name: picked?.name },
          choice.userMessage,
          conversationId,
          businessId,
          readDevicePosition,
          (text) => rec.add({ kind: "action", label: text, status: "done" }),
          choice.originalMessage ?? choice.userMessage,
        );
  rec.add(mutationOutcomeStep(outcome.result));
  rec.add(answerStep("code"));
  return { ...outcome, processSteps: rec.steps };
}
