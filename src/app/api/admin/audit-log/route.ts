import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePagination, buildPaginatedResponse } from "@/src/lib/pagination";

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, business_id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!staffRow)
    return {
      error: NextResponse.json(
        { error: "Akun staf tidak ditemukan" },
        { status: 403 },
      ),
    } as const;
  return { supabase, staffRow } as const;
}

const AUDIT_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "executed",
  "failed",
] as const;
type AuditStatus = (typeof AUDIT_STATUSES)[number];
function isAuditStatus(value: string | null): value is AuditStatus {
  return !!value && (AUDIT_STATUSES as readonly string[]).includes(value);
}

const TOOL_NAMES = ["updateStock", "transferStock"] as const;
type ToolName = (typeof TOOL_NAMES)[number];
function isToolName(value: string | null): value is ToolName {
  return !!value && (TOOL_NAMES as readonly string[]).includes(value);
}

interface UpdateStockParams {
  product_id: string;
  location_id: string;
  quantity: number;
  direction: "masuk" | "keluar";
}
interface TransferStockParams {
  product_id: string;
  quantity: number;
  from_location_id: string;
  to_location_id: string;
}

/**
 * GET: riwayat aksi agent AI yang mengubah stok (updateStock/transferStock),
 * lihat lib/agents/tool-schemas.ts & app/api/agent/tools/*. HANYA dua tool ini
 * yang menulis ke agent_audit_log (createReorderSuggestion tidak butuh HITL,
 * lihat catatan di route-nya) — kalau menambah tool state-changing baru di
 * masa depan, pastikan juga muncul di sini via TOOL_NAMES.
 *
 * input_params disimpan sebagai jsonb generik per tool, bukan kolom relasional
 * — nama produk/lokasi TIDAK bisa di-embed langsung lewat PostgREST join.
 * Di sini kita ambil satu halaman log dulu, lalu batch-fetch produk/lokasi/staf
 * yang relevan dalam 1-2 query tambahan, supaya tetap efisien (bukan N+1).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx.error;
  const { supabase, staffRow } = ctx;

  const statusParam = req.nextUrl.searchParams.get("status");
  const toolParam = req.nextUrl.searchParams.get("tool");
  const { page, pageSize, from, to } = parsePagination(req);

  let query = supabase
    .from("agent_audit_log")
    .select("*", { count: "exact" })
    .eq("business_id", staffRow.business_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (isAuditStatus(statusParam)) query = query.eq("status", statusParam);
  if (isToolName(toolParam)) query = query.eq("tool_name", toolParam);

  const { data: logs, error, count } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  if (!logs || logs.length === 0) {
    return NextResponse.json(buildPaginatedResponse([], count, page, pageSize));
  }

  // Kumpulkan id produk/lokasi/staf yang perlu di-resolve dari halaman ini saja.
  const productIds = new Set<string>();
  const locationIds = new Set<string>();
  const staffIds = new Set<string>();
  const conversationIds = new Set<string>();

  for (const log of logs) {
    const params = log.input_params as
      | UpdateStockParams
      | TransferStockParams
      | Record<string, unknown>;
    if (log.tool_name === "updateStock") {
      const p = params as UpdateStockParams;
      if (p.product_id) productIds.add(p.product_id);
      if (p.location_id) locationIds.add(p.location_id);
    } else if (log.tool_name === "transferStock") {
      const p = params as TransferStockParams;
      if (p.product_id) productIds.add(p.product_id);
      if (p.from_location_id) locationIds.add(p.from_location_id);
      if (p.to_location_id) locationIds.add(p.to_location_id);
    }
    if (log.confirmed_by) staffIds.add(log.confirmed_by);
    if (log.conversation_id) conversationIds.add(log.conversation_id);
  }

  const [productsRes, locationsRes, conversationsRes] = await Promise.all([
    productIds.size > 0
      ? supabase
          .from("products")
          .select("id, name")
          .in("id", Array.from(productIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    locationIds.size > 0
      ? supabase
          .from("locations")
          .select("id, name")
          .in("id", Array.from(locationIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    conversationIds.size > 0
      ? supabase
          .from("agent_conversations")
          .select("id, staff_id")
          .in("id", Array.from(conversationIds))
      : Promise.resolve({
          data: [] as { id: string; staff_id: string | null }[],
        }),
  ]);

  for (const c of conversationsRes.data ?? []) {
    if (c.staff_id) staffIds.add(c.staff_id);
  }

  const { data: staffRows } =
    staffIds.size > 0
      ? await supabase
          .from("staff")
          .select("id, full_name")
          .in("id", Array.from(staffIds))
      : { data: [] as { id: string; full_name: string }[] };

  const productMap = new Map(
    (productsRes.data ?? []).map((p) => [p.id, p.name]),
  );
  const locationMap = new Map(
    (locationsRes.data ?? []).map((l) => [l.id, l.name]),
  );
  const staffMap = new Map((staffRows ?? []).map((s) => [s.id, s.full_name]));
  const conversationStaffMap = new Map(
    (conversationsRes.data ?? []).map((c) => [c.id, c.staff_id]),
  );

  const enriched = logs.map((log) => {
    const params = log.input_params as
      | UpdateStockParams
      | TransferStockParams
      | Record<string, unknown>;
    const initiatorStaffId = log.conversation_id
      ? conversationStaffMap.get(log.conversation_id)
      : null;

    let productName: string | null = null;
    let locationDetail: string | null = null;

    if (log.tool_name === "updateStock") {
      const p = params as UpdateStockParams;
      productName = productMap.get(p.product_id) ?? null;
      locationDetail = locationMap.get(p.location_id) ?? null;
    } else if (log.tool_name === "transferStock") {
      const p = params as TransferStockParams;
      productName = productMap.get(p.product_id) ?? null;
      const fromName = locationMap.get(p.from_location_id) ?? "?";
      const toName = locationMap.get(p.to_location_id) ?? "?";
      locationDetail = `${fromName} → ${toName}`;
    }

    return {
      ...log,
      product_name: productName,
      location_detail: locationDetail,
      initiated_by_name: initiatorStaffId
        ? (staffMap.get(initiatorStaffId) ?? null)
        : null,
      confirmed_by_name: log.confirmed_by
        ? (staffMap.get(log.confirmed_by) ?? null)
        : null,
    };
  });

  return NextResponse.json(
    buildPaginatedResponse(enriched, count, page, pageSize),
  );
}
