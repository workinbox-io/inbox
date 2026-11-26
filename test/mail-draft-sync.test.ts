import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
vi.mock("@/lib/api-client", () => ({ api: vi.fn() }));
import { flushDraft, leaveDrafts, readDraft, resolveDraftConflict, syncDrafts, writeDraft } from "@/components/mailbox/drafts";
const draft = { mode: "new" as const, from: "me@test.com", to: [], cc: [], subject: "Subject", text: "Server" };
const row = (key: string, updatedAt = 1) => ({ key, draft, updatedAt, source: "ai", via: null, threadId: null, threadSubject: null });
let storage: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers(); vi.mocked(api).mockReset();
  storage = new Map();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k), key: (i: number) => [...storage.keys()][i] ?? null, get length() { return storage.size; } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("loads every page before recognizing deletions and does not autosave remote changes", async () => {
  storage.set("inbox:mail:draft:last", JSON.stringify({ ...draft, synced: true, updatedAt: 1 }));
  vi.mocked(api).mockResolvedValueOnce({ drafts: [row("first")], nextCursor: "page2" }).mockResolvedValueOnce({ drafts: [row("last", 2)], nextCursor: null });
  await syncDrafts();
  expect(readDraft("last")).toMatchObject({ updatedAt: 2, text: "Server" });
  await vi.advanceTimersByTimeAsync(2000);
  expect(vi.mocked(api).mock.calls.map(c => c[0])).toEqual(["GET", "GET"]);
});
it("keeps typed text during conflict, blocks send, and explicitly loads the server version", async () => {
  vi.mocked(api).mockResolvedValueOnce({ drafts: [row("conflict")], nextCursor: null });
  await syncDrafts();
  writeDraft("conflict", { ...draft, text: "My unsaved text" });
  vi.mocked(api).mockResolvedValueOnce({ drafts: [row("conflict", 2)], nextCursor: null });
  await syncDrafts();
  expect(readDraft("conflict")?.text).toBe("My unsaved text");
  await expect(flushDraft("conflict")).rejects.toThrow("conflict");
  vi.mocked(api).mockResolvedValueOnce(row("conflict", 2));
  await resolveDraftConflict("conflict", false);
  expect(readDraft("conflict")?.text).toBe("Server");
  expect(await flushDraft("conflict")).toBe(2);
});
it("keeps dirty text after remote deletion and requires an explicit save to recreate", async () => {
  vi.mocked(api).mockResolvedValueOnce({ drafts: [row("deleted")], nextCursor: null }); await syncDrafts();
  writeDraft("deleted", { ...draft, text: "Keep this" });
  vi.mocked(api).mockResolvedValueOnce({ drafts: [], nextCursor: null }); await syncDrafts();
  expect(readDraft("deleted")?.text).toBe("Keep this");
  await expect(flushDraft("deleted")).rejects.toThrow();
  vi.mocked(api).mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce({ updatedAt: 3 });
  await resolveDraftConflict("deleted", true);
  expect(vi.mocked(api).mock.calls.at(-1)).toMatchObject(["PUT", "/api/app/mail/drafts/deleted", { expectedUpdatedAt: null, text: "Keep this" }]);
  expect(await flushDraft("deleted")).toBe(3);
});
it("refreshes clean drafts and removes clean remotely deleted copies", async () => {
  vi.mocked(api).mockResolvedValueOnce({ drafts: [row("clean")], nextCursor: null }); await syncDrafts();
  vi.mocked(api).mockResolvedValueOnce({ drafts: [], nextCursor: null }); await syncDrafts();
  expect(readDraft("clean")).toBeNull();
});

it("does not attach a freshly loaded version to an old editor's content", async () => {
  vi.mocked(api).mockResolvedValueOnce({ drafts: [{ ...row("send-race", 2), draft: { ...draft, text: "Latest" } }], nextCursor: null });
  await syncDrafts();
  await expect(flushDraft("send-race", draft)).rejects.toThrow("Review the latest version");
  expect(vi.mocked(api).mock.calls).toHaveLength(1);
});
it("leaving a workspace saves typed drafts, then forgets every local copy", async () => {
  writeDraft("d-1", { ...draft, text: "Typed" });
  vi.mocked(api).mockResolvedValueOnce({ updatedAt: 5 });
  await leaveDrafts();
  expect(vi.mocked(api).mock.calls[0]?.[0]).toBe("PUT");
  expect(storage.size).toBe(0);
});
it("leaving a workspace keeps drafts that couldn't be saved", async () => {
  writeDraft("d-2", { ...draft, text: "Offline" });
  vi.mocked(api).mockRejectedValueOnce(new Error("offline"));
  await expect(leaveDrafts()).rejects.toThrow("couldn't be saved");
  expect(readDraft("d-2")?.text).toBe("Offline");
});
