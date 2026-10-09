import { describe, it, expect } from "vitest";
import { routerContext } from "@/src/lib/agents/router-context";
import { OFF_TOPIC_AUTOMOTIVE_REPLY, OFF_TOPIC_REPLY } from "@/src/lib/agents/off-topic";
import type { ChatMessage } from "@/src/lib/agents/orchestrator";

const user = (content: string): ChatMessage => ({ role: "user", content });
const bot = (content: string): ChatMessage => ({ role: "assistant", content });

describe("routerContext", () => {
  it("memakai jawaban model terakhir sebagai konteks pertanyaan lanjutan", () => {
    const history = [user("stok radiator 240?"), bot("Radiator Volvo 240: Toko 2, Gudang 3.")];
    expect(routerContext(history)).toBe("Radiator Volvo 240: Toko 2, Gudang 3.");
  });

  it("membuang balasan off-topic supaya penolakan tidak berantai", () => {
    expect(routerContext([user("cara ganti busi?"), bot(OFF_TOPIC_AUTOMOTIVE_REPLY)])).toBeUndefined();
    expect(routerContext([user("halo"), bot(OFF_TOPIC_REPLY)])).toBeUndefined();
  });

  it("membuang balasan kode lain yang diberikan pemanggil dan hasil dialog PIN", () => {
    const offline = "Sedang offline — perubahan stok butuh koneksi internet untuk verifikasi PIN.";
    expect(routerContext([bot(offline)], [offline])).toBeUndefined();
    expect(routerContext([bot("Transaksi dibatalkan. Stok tidak berubah.")])).toBeUndefined();
  });

  it("tidak memakai balasan yang lebih lama bila yang terakhir balasan kode", () => {
    const history = [bot("Filter Oli Mahle: Toko 25."), user("cuaca hari ini?"), bot(OFF_TOPIC_REPLY)];
    expect(routerContext(history)).toBeUndefined();
  });

  it("tanpa riwayat tidak ada konteks", () => {
    expect(routerContext([])).toBeUndefined();
  });
});
