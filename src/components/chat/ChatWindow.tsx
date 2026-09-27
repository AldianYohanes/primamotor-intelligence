"use client";

import { useEffect, useRef, useState } from "react";
import {
  MonitorX,
  AlertTriangle,
  Send,
  Plus,
  WifiOff,
} from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";
import { useModelStore } from "@/src/lib/stores/model-store";
import { ModelSetupPanel } from "@/src/components/model/ModelSetupPanel";
import { AppHeader } from "@/src/components/nav/AppHeader";
import type { AppModule } from "@/src/lib/auth/rbac";
import {
  runAgentTurn,
  submitLocationChoice,
  type ChatMessage,
  type LocationChoice,
  type PendingConfirmation,
} from "@/src/lib/agents/orchestrator";
import {
  syncStockCache,
  queuePendingMessage,
  getPendingMessages,
  flushPendingMessages,
} from "@/src/lib/cache/indexeddb";
import { useOnlineStatus } from "@/src/lib/network/online-status";
import {
  getOrCreateActiveConversation,
  startNewConversation,
} from "@/src/lib/agents/conversation";
import { EnableNotificationsBanner } from "./EnableNotificationsBanner";
import { MessageBubble } from "./MessageBubble";
import { PinConfirmDialog } from "./PinConfirmDialog";
import { LocationChoiceCard } from "./LocationChoiceCard";

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState("");
  // Engine dikelola store global supaya unduhan model tetap jalan saat staf
  // pindah halaman (lihat model-store.ts).
  const modelStatus = useModelStore((s) => s.status);
  const engine = useModelStore((s) => s.engine);
  const engineError = useModelStore((s) => s.error);
  const prepareModel = useModelStore((s) => s.prepare);
  const retryModel = useModelStore((s) => s.retry);
  const [isThinking, setIsThinking] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [locationChoice, setLocationChoice] = useState<LocationChoice | null>(null);
  const [submittingLocation, setSubmittingLocation] = useState(false);
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
        const pending = await getPendingMessages(id);
        const pendingAsMessages: ChatMessage[] = pending.map((p) => ({
          role: p.role,
          content: p.content,
        }));
        setConversationId(id);
        setMessages([...history, ...pendingAsMessages]);
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
  }, [messages, isThinking]);

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

  async function persistMessage(
    role: "user" | "assistant",
    content: string,
    agentType?: string,
  ) {
    if (!conversationId) return;
    const { error } = await supabase.from("agent_messages").insert({
      conversation_id: conversationId,
      role,
      content,
      agent_type: agentType,
    });

    if (error) {
      // Kemungkinan besar karena offline — jangan biarkan pesan hilang begitu saja,
      // simpan ke antrean lokal untuk dikirim ulang otomatis saat online (lihat effect di atas).
      if (role === "user" || role === "assistant") {
        await queuePendingMessage({
          conversation_id: conversationId,
          role,
          content,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !engine || !conversationId || isThinking) return;

    setInput("");
    // Pesan baru berarti staf tidak memakai pilihan lokasi yang tertahan.
    setLocationChoice(null);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    persistMessage("user", text);
    setIsThinking(true);
    setDraftText("");

    try {
      const result = await runAgentTurn(
        engine,
        messages,
        text,
        conversationId,
        businessId,
        setDraftText,
      );
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.assistantText,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      persistMessage("assistant", result.assistantText, result.agentType);

      if (result.pendingConfirmation) {
        setPendingConfirmation(result.pendingConfirmation);
      }
      if (result.locationChoice) {
        setLocationChoice(result.locationChoice);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Maaf, terjadi kesalahan. Coba lagi ya.",
        },
      ]);
    } finally {
      setIsThinking(false);
      setDraftText("");
    }
  }

  function appendAssistant(content: string) {
    setMessages((prev) => [...prev, { role: "assistant", content }]);
    persistMessage("assistant", content, "transaction");
  }

  async function handleLocationSelect(locationId: string) {
    if (!locationChoice || !conversationId) return;
    const choice = locationChoice;
    const picked = choice.options.find((o) => o.id === locationId);
    setSubmittingLocation(true);
    try {
      if (picked) {
        setMessages((prev) => [...prev, { role: "user", content: `Di ${picked.name}` }]);
        persistMessage("user", `Di ${picked.name}`);
      }
      const result = await submitLocationChoice(choice, locationId, conversationId, businessId);
      setLocationChoice(null);
      appendAssistant(result.message);
      if (result.pendingConfirmation) setPendingConfirmation(result.pendingConfirmation);
    } finally {
      setSubmittingLocation(false);
    }
  }

  function handleLocationCancel() {
    setLocationChoice(null);
    appendAssistant("Oke, tidak jadi dicatat.");
  }

  async function handleNewConversation() {
    if (isThinking) return;
    try {
      // Sama seperti Batal di PinConfirmDialog — mulai percakapan baru while ada
      // pendingConfirmation yang belum diproses juga "meninggalkan" proposal itu,
      // jadi harus di-reject juga supaya reservasi stoknya dilepas (bukan cuma
      // dibersihkan dari state lokal).
      if (pendingConfirmation) {
        fetch("/api/agent/tools/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audit_log_id: pendingConfirmation.audit_log_id,
          }),
        }).catch(() => {});
      }
      const newId = await startNewConversation(
        supabase,
        businessId,
        staffId,
        conversationId,
      );
      setConversationId(newId);
      setMessages([]);
      setPendingConfirmation(null);
      setLocationChoice(null);
    } catch (err) {
      console.error(err);
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
          <button
            onClick={handleNewConversation}
            disabled={isThinking || !engine}
            className="btn btn-secondary rounded-full !text-xs !py-1.5 !px-3"
            title="Percakapan baru"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">Percakapan Baru</span>
          </button>
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
        {locationChoice && !isThinking && (
          <LocationChoiceCard
            choice={locationChoice}
            busy={submittingLocation}
            onSelect={handleLocationSelect}
            onCancel={handleLocationCancel}
          />
        )}
        {!engine && (
          <div className="py-4">
            <ModelSetupPanel shortcuts={modules.filter((m) => m.key !== "chat" && m.key !== "tenants")} />
          </div>
        )}
        {isThinking && (
          <>
            {draftText ? (
              <MessageBubble
                message={{ role: "assistant", content: draftText }}
              />
            ) : (
              <div className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
                </span>
                Asisten sedang berpikir…
              </div>
            )}
          </>
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

      {pendingConfirmation && (
        <PinConfirmDialog
          pending={pendingConfirmation}
          businessSlug={businessSlug}
          username={username}
          staffId={staffId}
          onCancel={() => setPendingConfirmation(null)}
          onResolved={({ message }) => {
            setPendingConfirmation(null);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: message },
            ]);
            persistMessage("assistant", message);
          }}
        />
      )}
    </div>
  );
}
