import { describe, it, expect } from "vitest";
import { pendingForStaff, type CachedConversationMessage } from "@/src/lib/cache/indexeddb";
import { formatSyncAge } from "@/src/lib/stores/stock-sync-store";

const msg = (id: string, created_at: string, staff_id?: string, pending_sync = true): CachedConversationMessage => ({
  id,
  conversation_id: "c1",
  role: "user",
  content: id,
  created_at,
  pending_sync,
  ...(staff_id && { staff_id }),
});

describe("pendingForStaff", () => {
  it("hanya mengirim antrean staf yang login, diurutkan menurut waktu dibuat", () => {
    const rows = [
      msg("b", "2026-10-09T10:02:00Z", "s1"),
      msg("x", "2026-10-09T10:00:30Z", "s2"),
      msg("a", "2026-10-09T10:01:00Z", "s1"),
      msg("done", "2026-10-09T09:00:00Z", "s1", false),
    ];
    expect(pendingForStaff(rows, "s1").map((m) => m.id)).toEqual(["a", "b"]);
    expect(pendingForStaff(rows, "s2").map((m) => m.id)).toEqual(["x"]);
  });

  it("baris lama tanpa staff_id tetap dikirim supaya tidak hilang", () => {
    expect(pendingForStaff([msg("lama", "2026-10-01T00:00:00Z")], "s9").map((m) => m.id)).toEqual(["lama"]);
  });
});

describe("formatSyncAge", () => {
  const now = Date.UTC(2026, 9, 9, 10, 0, 0);
  it("menyebut umur sinkron dengan bahasa sehari-hari", () => {
    expect(formatSyncAge(null, now)).toBe("belum pernah");
    expect(formatSyncAge(new Date(now - 20_000).toISOString(), now)).toBe("baru saja");
    expect(formatSyncAge(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5 mnt lalu");
    expect(formatSyncAge(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3 jam lalu");
  });
});
