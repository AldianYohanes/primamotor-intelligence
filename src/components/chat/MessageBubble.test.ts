import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { StoredChatMessage } from "@/src/lib/agents/conversation";

const message = {
  role: "assistant",
  content: "Stok radiator 240 ada 3 pcs",
  inference: { totalMs: 4200 },
  trace: [{ kind: "tool", status: "done", label: "Cari stok" }],
} as unknown as StoredChatMessage;

const html = (showDetails?: boolean) =>
  renderToStaticMarkup(createElement(MessageBubble, { message, showDetails }));

describe("MessageBubble detail teknis", () => {
  it("menyembunyikan waktu dan detail proses secara default", () => {
    const out = html();
    expect(out).toContain("Stok radiator 240 ada 3 pcs");
    expect(out).not.toContain("Selesai dalam");
    expect(out).not.toContain("Detail proses");
  });

  it("menampilkannya saat saklar menyala", () => {
    const out = html(true);
    expect(out).toContain("Selesai dalam");
    expect(out).toContain("langkah");
  });
});
