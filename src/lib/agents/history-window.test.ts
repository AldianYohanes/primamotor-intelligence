import { describe, it, expect } from "vitest";
import { trimHistoryForContext } from "@/src/lib/agents/history-window";
import type { ChatMessage } from "@/src/lib/agents/orchestrator";

function turns(n: number, content = "x"): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `${content}${i}`,
  }));
}

describe("trimHistoryForContext", () => {
  it("mengembalikan riwayat utuh bila masih di bawah batas", () => {
    const history = turns(4);
    expect(trimHistoryForContext(history, 10, 4000)).toEqual(history);
  });

  it("hanya menyimpan N pesan terbaru", () => {
    const history = turns(20);
    const kept = trimHistoryForContext(history, 6, 4000);
    expect(kept).toEqual(history.slice(14));
  });

  it("berhenti saat batas karakter terlampaui", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "a".repeat(50) },
      { role: "assistant", content: "b".repeat(50) },
      { role: "user", content: "c".repeat(30) },
      { role: "assistant", content: "d".repeat(30) },
    ];
    expect(trimHistoryForContext(history, 10, 70)).toEqual(history.slice(2));
  });

  it("membuang jawaban asisten di awal jendela yang pertanyaannya terpotong", () => {
    const history = turns(6);
    // 5 pesan terakhir dimulai dari asisten (indeks 1) -> dibuang.
    const kept = trimHistoryForContext(history, 5, 4000);
    expect(kept[0].role).toBe("user");
    expect(kept).toEqual(history.slice(2));
  });

  it("mengembalikan kosong bila pesan terbaru saja sudah melebihi batas", () => {
    const history: ChatMessage[] = [{ role: "user", content: "a".repeat(100) }];
    expect(trimHistoryForContext(history, 10, 50)).toEqual([]);
  });
});
