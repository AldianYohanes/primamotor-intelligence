"use client";

import { useEffect, useRef, useState } from "react";
import {
  MonitorX,
  AlertTriangle,
  Send,
  Plus,
  History,
  WifiOff,
} from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";
import type { Json } from "@/src/lib/db/types";
import { useModelStore } from "@/src/lib/stores/model-store";
import { MODEL_OPTIONS } from "@/src/lib/agents/model-options";
import { ModelSetupPanel } from "@/src/components/model/ModelSetupPanel";
import { AppHeader } from "@/src/components/nav/AppHeader";
import type { AppModule } from "@/src/lib/auth/rbac";
import {
  runAgentTurn,
  submitMutationChoice,
  type ChatMessage,
  type MutationChoice,
  type PendingConfirmation,
  type ProcessStep,
} from "@/src/lib/agents/orchestrator";
import { liveStatusLabel } from "@/src/lib/agents/process-trace";
import {
  syncStockCache,
  queuePendingMessage,
  getPendingMessages,
  flushPendingMessages,
} from "@/src/lib/cache/indexeddb";
import { holdWakeLock } from "@/src/lib/pwa/wake-lock";
import { useOnlineStatus } from "@/src/lib/network/online-status";
import {
  getOrCreateActiveConversation,
  listConversations,
  resumeConversation,
  startNewConversation,
  type StoredChatMessage,
} from "@/src/lib/agents/conversation";
import { ConversationHistoryPanel } from "./ConversationHistoryPanel";
import { EnableNotificationsBanner } from "./EnableNotificationsBanner";
import { MessageBubble } from "./MessageBubble";
import { CANCELLED_MESSAGE, PinConfirmDialog } from "./PinConfirmDialog";
import { MutationChoiceCard } from "./MutationChoiceCard";
import { ProcessDetails } from "./ProcessDetails";

interface Props {
  /** Tenant aktif (bagi super admin bisa tenant lain). */
  businessId: string;
  tenantName: string;
  /** Slug tenant tempat akun terdaftar, dipakai untuk re-konfirmasi PIN. */
  businessSlug: string;
  staffId: string;
  username: string;
  fullName: string;
  modules: AppModule[];
}

export function ChatWindow({
  businessId,
  businessSlug,
  staffId,
  username,
  fullName,
  tenantName,
  modules,
}: Props) {
  const supabase = createClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState("");
  // Engine dikelola store global supaya unduhan model tetap jalan saat staf
  // pindah halaman (lihat model-store.ts).
  const modelStatus = useModelStore((s) => s.status);
  const engine = useModelStore((s) => s.engine);
  const engineError = useModelStore((s) => s.error);
  const modelId = useModelStore((s) => s.modelId);
  const prepareModel = useModelStore((s) => s.prepare);
  const retryModel = useModelStore((s) => s.retry);
  const setModelId = useModelStore((s) => s.setModelId);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [draftText, setDraftText] = useState("");
  // Langkah "Lihat proses" giliran yang sedang berjalan (live).
  const [liveSteps, setLiveSteps] = useState<ProcessStep[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [mutationChoice, setMutationChoice] = useState<MutationChoice | null>(null);
  const [submittingChoice, setSubmittingChoice] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const isOnline = useOnlineStatus();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Inisialisasi: ambil/buat percakapan aktif + muat riwayatnya, cek model, sync cache offline
  useEffect(() => {
    let cancelled = false;

    getOrCreateActiveConversation(supabase, businessId, staffId)
      .then(async ({ conversationId: id, history }) => {
        if (cancelled) return;
        // Pesan yang sempat gagal terkirim saat offline (masih tersimpan di IndexedDB,
        // belum ter-flush ke agent_messages) tetap harus tampil di riwayat, supaya
        // staf tidak merasa pesannya "hilang" walau sebenarnya cuma tertunda kirim.
        const withPending = await appendPendingMessages(id, history);
        setConversationId(id);
        setMessages(withPending);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error("Gagal memuat percakapan:", err);
        if (!cancelled) setLoadingHistory(false);
      });

    syncStockCache(supabase, businessId);

    // Hanya memeriksa apakah model sudah tersimpan. Kalau belum, unduhan
    // (bisa beberapa GB) baru mulai setelah staf menekan tombol di panel.
    prepareModel();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isThinking, liveSteps.length]);

  // Begitu koneksi kembali: sinkron ulang cache stok (biar tidak makin basi) dan
  // kirim ulang semua pesan yang sempat tertunda.
  useEffect(() => {
    if (!isOnline) return;
    syncStockCache(supabase, businessId).catch((err) =>
      console.error("Gagal sinkron cache stok:", err),
    );
    flushPendingMessages(supabase).catch((err) =>
      console.error("Gagal sinkron pesan tertunda:", err),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  /** Balasan kode (bukan model) sesudah dialog PIN: hasil, batal, atau akun terkunci. */
  function appendSystemReply(message: string) {
    setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    persistMessage("assistant", message);
  }

  async function persistMessage(
    role: "user" | "assistant",
    content: string,
    agentType?: string,
    trace?: ProcessStep[],
  ) {
    if (!conversationId) return;
    const row = { conversation_id: conversationId, role, content, agent_type: agentType };
    let { error } = await supabase
      .from("agent_messages")
      .insert(trace ? { ...row, trace: trace as unknown as Json } : row);
    // Kolom trace belum ada (migrasi 0036 belum jalan): simpan pesannya tanpa trace.
    if (error && trace) ({ error } = await supabase.from("agent_messages").insert(row));

    if (error) {
      // Kemungkinan besar karena offline — jangan biarkan pesan hilang begitu saja,
      // simpan ke antrean lokal untuk dikirim ulang otomatis saat online (lihat effect di atas).
      if (role === "user" || role === "assistant") {
        await queuePendingMessage({
          conversation_id: conversationId,
          role,
          content,
          created_at: new Date().toISOString(),
          ...(trace && { trace }),
        });
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !engine || !conversationId || isThinking) return;

    setInput("");
    // Pesan baru berarti staf tidak memakai pilihan yang tertahan.
    setMutationChoice(null);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    persistMessage("user", text);
    setIsThinking(true);
    const releaseWake = holdWakeLock();
    setDraftText("");
    setLiveSteps([]);
    // Salinan terakhir dari onStep, dipakai bila giliran gagal di tengah jalan.
    let lastSteps: ProcessStep[] = [];

    try {
      const result = await runAgentTurn(
        engine,
        messages,
        text,
        conversationId,
        businessId,
        setDraftText,
        {
          onStep: (steps) => {
            lastSteps = steps;
            setLiveSteps(steps);
          },
        },
      );
      const trace = result.processSteps ?? [];
      const assistantMsg: StoredChatMessage = {
        role: "assistant",
        content: result.assistantText,
        trace,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      persistMessage("assistant", result.assistantText, result.agentType, trace);

      if (result.pendingConfirmation) {
        setPendingConfirmation(result.pendingConfirmation);
      }
      if (result.choice) {
        setMutationChoice(result.choice);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Maaf, terjadi kesalahan. Coba lagi ya.",
          // runAgentTurn menandai langkah yang terputus sebagai gagal sebelum melempar error.
          trace: lastSteps,
        },
      ]);
    } finally {
      releaseWake();
      setIsThinking(false);
      setDraftText("");
      setLiveSteps([]);
    }
  }

  function appendAssistant(content: string, trace?: ProcessStep[]) {
    setMessages((prev) => [...prev, { role: "assistant", content, ...(trace && { trace }) }]);
    persistMessage("assistant", content, "transaction", trace);
  }

  async function handleChoiceSelect(selectedId: string) {
    if (!mutationChoice || !conversationId) return;
    const choice = mutationChoice;
    const picked = choice.options.find((o) => o.id === selectedId);
    setSubmittingChoice(true);
    try {
      if (picked) {
        const echo = choice.kind === "location" ? `Di ${picked.name}` : picked.name;
        setMessages((prev) => [...prev, { role: "user", content: echo }]);
        persistMessage("user", echo);
      }
      const result = await submitMutationChoice(choice, selectedId, conversationId, businessId);
      setMutationChoice(result.choice ?? null);
      appendAssistant(result.message, result.processSteps);
      if (result.pendingConfirmation) setPendingConfirmation(result.pendingConfirmation);
    } finally {
      setSubmittingChoice(false);
    }
  }

  function handleChoiceCancel() {
    setMutationChoice(null);
    appendAssistant("Oke, tidak jadi dicatat.");
  }

  /**
   * Pesan yang sempat gagal terkirim saat offline (masih tersimpan di IndexedDB,
   * belum ter-flush ke agent_messages) tetap harus tampil di riwayat, supaya
   * staf tidak merasa pesannya "hilang" walau sebenarnya cuma tertunda kirim.
   */
  async function appendPendingMessages(
    id: string,
    history: StoredChatMessage[],
  ): Promise<StoredChatMessage[]> {
    const pending = await getPendingMessages(id);
    return [
      ...history,
      ...pending.map((p) => ({ role: p.role, content: p.content, ...(p.trace && { trace: p.trace }) })),
    ];
  }

  /**
   * Sama seperti Batal di PinConfirmDialog — pindah percakapan (baru atau dari
   * riwayat) while ada pendingConfirmation yang belum diproses juga
   * "meninggalkan" proposal itu, jadi harus di-reject juga supaya reservasi
   * stoknya dilepas (bukan cuma dibersihkan dari state lokal).
   */
  function abandonPendingActions() {
    if (pendingConfirmation) {
      fetch("/api/agent/tools/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audit_log_id: pendingConfirmation.audit_log_id,
        }),
      }).catch(() => {});
    }
    setPendingConfirmation(null);
    setMutationChoice(null);
  }

  async function handleNewConversation() {
    if (isThinking) return;
    try {
      abandonPendingActions();
      const newId = await startNewConversation(
        supabase,
        businessId,
        staffId,
        conversationId,
      );
      setConversationId(newId);
      setMessages([]);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleResumeConversation(id: string) {
    if (isThinking || resuming || id === conversationId) return;
    setResuming(true);
    try {
      const history = await resumeConversation(supabase, id, conversationId);
      abandonPendingActions();
      setConversationId(id);
      setMessages(await appendPendingMessages(id, history));
      setHistoryOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setResuming(false);
    }
  }

  if (modelStatus === "unsupported") {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#f7f8fa] p-6 text-center">
        <div className="card max-w-sm space-y-2.5 p-6">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <MonitorX size={20} />
          </div>
          <p className="text-sm font-semibold text-slate-900">
            Perangkat ini belum bisa menjalankan Asisten AI
          </p>
          <p className="text-sm text-slate-600">
            Asisten AI berjalan langsung di perangkat (tidak lewat server)
            supaya gratis dan data toko tidak keluar dari perangkat ini — tapi
            itu butuh dukungan WebGPU yang belum tersedia di browser/perangkat
            ini.
          </p>
          <p className="text-xs text-slate-500">
            Coba: (1) update browser ke versi terbaru, (2) pakai Chrome/Edge
            kalau belum, atau (3) coba dari laptop/HP lain. Kalau masalah
            berlanjut, sampaikan ke owner/admin toko.
          </p>
        </div>
      </div>
    );
  }

  if (modelStatus === "error" && engineError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#f7f8fa] p-6 text-center">
        <div className="card max-w-sm space-y-2.5 p-6">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <p className="text-sm font-semibold text-slate-900">
            Asisten AI gagal dimuat
          </p>
          <p className="text-sm text-slate-600">{engineError}</p>
          {/(f16|WGSL|GPU)/i.test(engineError) && (
            <p className="text-xs text-slate-500">
              Ini biasanya error dukungan GPU/browser terhadap model saat ini.
              Coba ganti ke model lain di bawah (varian &ldquo;tanpa f16&rdquo;
              biasanya lebih kompatibel).
            </p>
          )}
          <div className="mt-1 flex justify-center gap-2">
            <button onClick={retryModel} className="btn btn-primary">
              Coba Lagi
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-secondary"
            >
              Muat Ulang Halaman
            </button>
          </div>

          <div className="mt-2 border-t border-slate-100 pt-3 text-left">
            <label htmlFor="model-switch" className="mb-1 block text-xs font-medium text-slate-600">
              Atau ganti model AI
            </label>
            <select
              id="model-switch"
              value={modelId}
              disabled={switchingModel}
              onChange={async (e) => {
                setSwitchingModel(true);
                await setModelId(e.target.value).catch(() => {});
                setSwitchingModel(false);
              }}
              className="field-input w-full !py-1.5 text-xs disabled:opacity-60"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              {switchingModel
                ? "Menyiapkan model baru…"
                : "Model baru perlu diunduh (~1–5 GB) sebelum bisa dipakai."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#f7f8fa]">
      <AppHeader
        title="Asisten Stok"
        subtitle={`${fullName} · ${tenantName}`}
        actions={
          <>
            <button
              onClick={() => setHistoryOpen(true)}
              disabled={isThinking || loadingHistory}
              className="btn btn-secondary rounded-full !text-xs !py-1.5 !px-3"
              title="Riwayat percakapan"
            >
              <History size={13} />
              <span className="hidden sm:inline">Riwayat</span>
            </button>
            <button
              onClick={handleNewConversation}
              disabled={isThinking || !engine}
              className="btn btn-secondary rounded-full !text-xs !py-1.5 !px-3"
              title="Percakapan baru"
            >
              <Plus size={13} />
              <span className="hidden sm:inline">Percakapan Baru</span>
            </button>
          </>
        }
      />

      <EnableNotificationsBanner />

      {!isOnline && (
        <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-600">
          <WifiOff size={14} className="mt-0.5 shrink-0" />
          <span>
            Sedang offline — cari stok masih bisa pakai data terakhir yang
            tersimpan, tapi catat barang masuk/keluar/transfer butuh koneksi
            untuk verifikasi PIN. Pesan tetap tersimpan dan otomatis terkirim
            begitu sinyal kembali.
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {loadingHistory && (
          <p className="mt-8 text-center text-sm text-slate-400">
            Memuat riwayat percakapan…
          </p>
        )}
        {engine && !loadingHistory && messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-xs text-center">
            <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Send size={15} />
            </div>
            <p className="text-sm text-slate-400">
              Coba tanya: &quot;ada radiator 240 gak?&quot; atau &quot;masuk
              barang 10 pcs filter oli&quot;
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {mutationChoice && !isThinking && (
          <MutationChoiceCard
            choice={mutationChoice}
            busy={submittingChoice}
            onSelect={handleChoiceSelect}
            onCancel={handleChoiceCancel}
          />
        )}
        {!engine && (
          <div className="py-4">
            <ModelSetupPanel shortcuts={modules.filter((m) => m.key !== "chat" && m.key !== "tenants")} />
          </div>
        )}
        {isThinking && (
          <div>
            {draftText && (
              <MessageBubble
                message={{ role: "assistant", content: draftText }}
              />
            )}
            <div className="mt-1 flex items-center gap-1.5 px-1 text-xs text-slate-400">
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
              </span>
              {liveStatusLabel(liveSteps)}
            </div>
            <ProcessDetails steps={liveSteps} live />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={engine ? "Ketik pesan…" : "Asisten AI belum siap…"}
            disabled={!engine}
            className="field-input flex-1 rounded-full"
          />
          <button
            onClick={handleSend}
            disabled={isThinking || !engine}
            className="btn btn-primary rounded-full px-5"
          >
            <Send size={14} />
            Kirim
          </button>
        </div>
      </div>

      {historyOpen && (
        <ConversationHistoryPanel
          currentConversationId={conversationId}
          load={() => listConversations(supabase, businessId, staffId)}
          onSelect={handleResumeConversation}
          onClose={() => setHistoryOpen(false)}
          busy={resuming}
        />
      )}

      {pendingConfirmation && (
        <PinConfirmDialog
          pending={pendingConfirmation}
          businessSlug={businessSlug}
          username={username}
          staffId={staffId}
          onCancel={() => {
            setPendingConfirmation(null);
            appendSystemReply(CANCELLED_MESSAGE);
          }}
          onResolved={({ message }) => {
            setPendingConfirmation(null);
            appendSystemReply(message);
          }}
        />
      )}
    </div>
  );
}
