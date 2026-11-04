"use client";

import { useEffect, useRef, useState } from "react";
import {
  MonitorX,
  AlertTriangle,
  Send,
  Plus,
  History,
  WifiOff,
  Square,
} from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";
import type { Database, Json } from "@/src/lib/db/types";
import { useModelStore } from "@/src/lib/stores/model-store";
import { ModelPicker } from "@/src/components/model/ModelPicker";
import { ModelSetupPanel } from "@/src/components/model/ModelSetupPanel";
import { AppHeader } from "@/src/components/nav/AppHeader";
import type { AppModule } from "@/src/lib/auth/rbac";
import {
  runAgentTurn,
  TurnStoppedError,
  submitMutationChoice,
  type ChatMessage,
  type MutationChoice,
  type PendingConfirmation,
  type ProcessStep,
} from "@/src/lib/agents/orchestrator";
import { liveStatusLabel } from "@/src/lib/agents/process-trace";
import {
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
import { InterruptedDivider } from "./InterruptedDivider";
import { MessageBubble } from "./MessageBubble";
import { InferenceStatsButton, LiveInferenceLine, type TurnRecord } from "./InferenceStats";
import type { InferenceSnapshot } from "@/src/lib/agents/inference-stats";
import { CANCELLED_MESSAGE, PinConfirmDialog } from "./PinConfirmDialog";
import { StockSyncIndicator } from "./StockSyncIndicator";
import { useStockSyncStore } from "@/src/lib/stores/stock-sync-store";
import { MutationChoiceCard } from "./MutationChoiceCard";
import { ProcessDetails } from "./ProcessDetails";
import { EXAMPLE_QUESTIONS, MAX_CHAT_MESSAGE_LENGTH, interruptionReason, shouldSubmitOnEnter, turnErrorMessage, unansweredQuestion } from "./chat-ui";

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

type AgentMessageInsert = Database["public"]["Tables"]["agent_messages"]["Insert"];

const OFFLINE_HINT = "Butuh koneksi internet";

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
  const compatNotice = useModelStore((s) => s.compatNotice);
  const modelId = useModelStore((s) => s.modelId);
  const prepareModel = useModelStore((s) => s.prepare);
  const retryModel = useModelStore((s) => s.retry);
  const setModelId = useModelStore((s) => s.setModelId);
  const [switchingModel, setSwitchingModel] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [draftText, setDraftText] = useState("");
  // Langkah "Lihat proses" giliran yang sedang berjalan (live).
  const [liveSteps, setLiveSteps] = useState<ProcessStep[]>([]);
  // Stopwatch dan statistik model giliran yang sedang berjalan.
  const [turnStartedAt, setTurnStartedAt] = useState(0);
  const [liveInference, setLiveInference] = useState<InferenceSnapshot | null>(null);
  // Riwayat statistik giliran di sesi ini, untuk tombol dan modal statistik.
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [mutationChoice, setMutationChoice] = useState<MutationChoice | null>(null);
  const [submittingChoice, setSubmittingChoice] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  // Pertanyaan terakhir yang tidak sempat dijawab, untuk pembatas "jawaban terputus".
  const [interrupted, setInterrupted] = useState<{ reason: string; text: string } | null>(null);
  const isOnline = useOnlineStatus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<AbortController | null>(null);

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
        const lost = unansweredQuestion(withPending);
        if (lost) setInterrupted({ reason: interruptionReason("unknown"), text: lost });
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error("Gagal memuat percakapan:", err);
        if (!cancelled) setLoadingHistory(false);
      });

    // Waktu sinkron terakhir dari perangkat (tetap tampil walau dibuka offline);
    // sinkron ulangnya dijalankan effect isOnline di bawah.
    useStockSyncStore.getState().load(businessId);

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
    syncStock();
    flushPendingMessages(supabase, staffId).catch((err) =>
      console.error("Gagal sinkron pesan tertunda:", err),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  /** Sinkron ulang cache stok offline; status & waktunya tampil di header. */
  function syncStock() {
    return useStockSyncStore.getState().sync(supabase, businessId);
  }

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
    const row: AgentMessageInsert = { conversation_id: conversationId, role, content, agent_type: agentType ?? null };
    const withTrace: AgentMessageInsert = trace ? { ...row, trace: trace as unknown as Json } : row;
    let { error } = await supabase.from("agent_messages").insert(withTrace);
    // Kolom trace belum ada (migrasi 0036 belum jalan): simpan pesannya tanpa trace.
    if (error && trace) ({ error } = await supabase.from("agent_messages").insert(row));

    if (error) {
      // Kemungkinan besar karena offline — jangan biarkan pesan hilang begitu saja,
      // simpan ke antrean lokal untuk dikirim ulang otomatis saat online (lihat effect di atas).
      if (role === "user" || role === "assistant") {
        await queuePendingMessage({
          staff_id: staffId,
          conversation_id: conversationId,
          role,
          content,
          created_at: new Date().toISOString(),
          ...(trace && { trace }),
        });
      }
    }
  }

  function handleStop() {
    stopRef.current?.abort();
  }

  // Esc menghentikan balasan hanya saat asisten sedang berpikir.
  useEffect(() => {
    if (!isThinking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopRef.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isThinking]);

  async function handleSend(override?: string) {
    const text = (override ?? input).trim();
    if (!text || !engine || !conversationId || isThinking) return;

    setInput("");
    setInterrupted(null);
    // Pesan baru berarti staf tidak memakai pilihan yang tertahan.
    setMutationChoice(null);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    persistMessage("user", text);
    setIsThinking(true);
    const releaseWake = holdWakeLock();
    const controller = new AbortController();
    stopRef.current = controller;
    setDraftText("");
    setLiveSteps([]);
    const startedAt = Date.now();
    setTurnStartedAt(startedAt);
    setLiveInference(null);
    const turnId = `${startedAt}`;
    const updateTurn = (patch: Partial<TurnRecord>) =>
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
    setTurns((prev) => [...prev, { id: turnId, title: text, startedAt, snapshot: null }]);
    // Salinan terakhir dari onStep, dipakai bila giliran gagal di tengah jalan.
    let lastSteps: ProcessStep[] = [];
    let lastInference: InferenceSnapshot | null = null;
    let finalAnswer: string | undefined;
    const inferenceOf = () => (lastInference ? { inference: { totalMs: Date.now() - startedAt } } : {});

    try {
      const result = await runAgentTurn(
        engine,
        messages,
        text,
        conversationId,
        businessId,
        setDraftText,
        {
          signal: controller.signal,
          onStep: (steps) => {
            lastSteps = steps;
            setLiveSteps(steps);
          },
          onInference: (snapshot) => {
            lastInference = snapshot;
            setLiveInference(snapshot);
            updateTurn({ snapshot });
          },
        },
      );
      lastInference = result.inferenceStats ?? lastInference;
      const trace = result.processSteps ?? [];
      const assistantMsg: StoredChatMessage = {
        role: "assistant",
        content: result.assistantText,
        trace,
        ...inferenceOf(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      persistMessage("assistant", result.assistantText, result.agentType, trace);
      finalAnswer = result.assistantText;

      if (result.pendingConfirmation) {
        setPendingConfirmation(result.pendingConfirmation);
      }
      if (result.choice) {
        setMutationChoice(result.choice);
      }
    } catch (err) {
      if (err instanceof TurnStoppedError) {
        const partial = err.partialText.trim();
        const content = partial ? `${partial}\n\n(dihentikan)` : "Dihentikan.";
        setMessages((prev) => [...prev, { role: "assistant", content, trace: lastSteps, ...inferenceOf() }]);
        persistMessage("assistant", content, undefined, lastSteps);
        return;
      }
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: turnErrorMessage(isOnline),
          // runAgentTurn menandai langkah yang terputus sebagai gagal sebelum melempar error.
          trace: lastSteps,
        },
      ]);
      setInterrupted({ reason: interruptionReason(isOnline ? "error" : "offline"), text });
    } finally {
      stopRef.current = null;
      releaseWake();
      setIsThinking(false);
      setDraftText("");
      setLiveSteps([]);
      setLiveInference(null);
      updateTurn({ snapshot: lastInference, totalMs: Date.now() - startedAt, answer: finalAnswer });
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
      setInterrupted(null);
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
      const resumed = await appendPendingMessages(id, history);
      setMessages(resumed);
      const lost = unansweredQuestion(resumed);
      setInterrupted(lost ? { reason: interruptionReason("unknown"), text: lost } : null);
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
            Asisten AI butuh WebGPU, dan browser atau perangkat ini belum
            mendukungnya.
          </p>
          <p className="text-xs text-slate-500">
            Coba update browser, pakai Chrome atau Edge, atau buka dari
            perangkat lain. Kalau tetap gagal, hubungi owner toko.
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
              Coba pilih model lain, misalnya varian &ldquo;tanpa f16&rdquo;.
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
            <ModelPicker
              id="model-switch"
              modelId={modelId}
              disabled={switchingModel || !isOnline}
              title={isOnline ? undefined : OFFLINE_HINT}
              onChange={async (next) => {
                setSwitchingModel(true);
                await setModelId(next).catch(() => {});
                setSwitchingModel(false);
              }}
              className="field-input w-full !py-1.5 text-xs disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-slate-500">
              {!isOnline
                ? "Ganti model butuh koneksi internet untuk mengunduh model."
                : switchingModel
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
        meta={<StockSyncIndicator isOnline={isOnline} onSync={syncStock} />}
        actions={
          <>
            {/* Tombol disabled tidak memunculkan tooltip, jadi petunjuk offline ada di pembungkusnya. */}
            <span title={isOnline ? undefined : OFFLINE_HINT} className="inline-flex">
              <button
                onClick={() => setHistoryOpen(true)}
                disabled={isThinking || loadingHistory || !isOnline}
                className="btn btn-secondary min-h-10 min-w-10 rounded-full !text-xs !py-1.5 !px-3"
                title={isOnline ? "Riwayat percakapan" : undefined}
                aria-label="Riwayat percakapan"
              >
                <History size={13} />
                <span className="hidden sm:inline">Riwayat</span>
              </button>
            </span>
            <span title={isOnline ? undefined : OFFLINE_HINT} className="inline-flex">
              <button
                onClick={handleNewConversation}
                disabled={isThinking || !engine || !isOnline}
                className="btn btn-secondary min-h-10 min-w-10 rounded-full !text-xs !py-1.5 !px-3"
                title={isOnline ? "Percakapan baru" : undefined}
                aria-label="Percakapan baru"
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Percakapan Baru</span>
              </button>
            </span>
          </>
        }
      />

      <EnableNotificationsBanner />

      {compatNotice && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">{compatNotice}</div>
      )}

      {!isOnline && (
        <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs text-slate-600">
          <WifiOff size={14} className="mt-0.5 shrink-0" />
          <span>
            Sedang offline. Cari stok memakai data tersimpan terakhir; mencatat barang masuk, keluar, atau
            transfer butuh koneksi untuk verifikasi PIN. Pesan baru menunggu sinyal kembali.
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Percakapan dengan asisten"
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {loadingHistory && (
          <p className="mt-8 text-center text-sm text-slate-500">
            Memuat riwayat percakapan…
          </p>
        )}
        {engine && !loadingHistory && messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-xs text-center">
            <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Send size={15} />
            </div>
            <p className="text-sm font-medium text-slate-600">Mau cek atau catat apa?</p>
            <p className="mt-1 text-xs text-slate-500">Ketuk salah satu contoh, atau ketik sendiri.</p>
            <div className="mt-3 flex flex-col gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSend(q)}
                  disabled={isThinking || !conversationId}
                  className="btn btn-secondary min-h-11 justify-start !whitespace-normal rounded-xl text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {interrupted && !isThinking && (
          <InterruptedDivider
            reason={interrupted.reason}
            disabled={!engine || !conversationId}
            onRetry={() => handleSend(interrupted.text)}
          />
        )}
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
            <div role="status" className="mt-1 flex items-center gap-1.5 px-1 text-xs text-slate-500">
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
              </span>
              {liveStatusLabel(liveSteps)}
            </div>
            <LiveInferenceLine snapshot={liveInference} startedAt={turnStartedAt} />
            <ProcessDetails steps={liveSteps} live />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => shouldSubmitOnEnter(e.nativeEvent) && handleSend()}
            placeholder={engine ? "Ketik pesan…" : "Asisten AI belum siap…"}
            aria-label="Pesan untuk asisten"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            disabled={!engine}
            className="field-input min-h-11 flex-1 rounded-full !text-base sm:!text-sm"
          />
          <InferenceStatsButton turns={turns} className="min-h-11 rounded-full px-4" />
          {isThinking ? (
            <button
              onClick={handleStop}
              className="btn btn-secondary min-h-11 rounded-full px-5"
              title="Hentikan (Esc)"
              aria-label="Hentikan jawaban"
            >
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!engine || !input.trim()}
              aria-label="Kirim pesan"
              className="btn btn-primary min-h-11 rounded-full px-5"
            >
              <Send size={14} />
              Kirim
            </button>
          )}
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
          onResolved={({ ok, message }) => {
            setPendingConfirmation(null);
            appendSystemReply(message);
            // Stok baru saja berubah di server: cache offline ikut diperbarui.
            if (ok) syncStock();
          }}
        />
      )}
    </div>
  );
}
