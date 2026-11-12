import { describe, expect, it, vi } from "vitest";
import { JmapClient } from "../src/lib/mail/jmap";

const reply = (name: string, body: unknown) => Response.json({ methodResponses: [[name, body, "0"]] });
describe("mail engine JMAP client", () => {
  it("scopes requests and preserves opaque cursors", async () => {
    const transport = vi.fn().mockResolvedValue(reply("Email/changes", { accountId: "a", newState: "opaque", destroyed: [] }));
    const client = new JmapClient("https://mail.example/jmap", "Bearer secret", "a", transport);
    expect((await client.changes("cursor")).newState).toBe("opaque");
    const request = transport.mock.calls[0][1];
    expect(JSON.parse(request.body).methodCalls[0]).toEqual(["Email/changes", { accountId: "a", sinceState: "cursor", maxChanges: 100 }, "0"]);
    expect(request.redirect).toBe("error");
  });
  it("surfaces expired cursors instead of returning an empty change set", async () => {
    const transport = vi.fn().mockResolvedValue(reply("error", { type: "cannotCalculateChanges" }));
    await expect(new JmapClient("https://mail.example/jmap", "secret", "a", transport).changes("old")).rejects.toMatchObject({ type: "cannotCalculateChanges" });
  });
  it("rejects another account's response", async () => {
    const transport = vi.fn().mockResolvedValue(reply("Mailbox/get", { accountId: "other", list: [] }));
    await expect(new JmapClient("https://mail.example/jmap", "secret", "a", transport).folders()).rejects.toMatchObject({ type: "invalid-response" });
  });
  it("reports per-message update failures", async () => {
    const transport = vi.fn().mockResolvedValue(reply("Email/set", { accountId: "a", notUpdated: { e: { type: "forbidden" } } }));
    await expect(new JmapClient("https://mail.example/jmap", "secret", "a", transport).update("e", {}, "state")).rejects.toMatchObject({ type: "forbidden" });
  });
  it("never sends credentials to a different upload origin", async () => {
    const transport = vi.fn();
    const client = new JmapClient("https://mail.example/jmap", "secret", "a", transport);
    await expect(client.importMessage("https://other.example/upload", new Uint8Array(), "inbox", new Date().toISOString())).rejects.toThrow("Cross-origin");
    expect(transport).not.toHaveBeenCalled();
  });
  it("requires encrypted transport", () => {
    expect(() => new JmapClient("http://mail.example/jmap", "secret", "a")).toThrow("HTTPS");
  });
  it("uploads original MIME before importing its blob", async () => {
    const transport = vi.fn()
      .mockResolvedValueOnce(Response.json({ accountId: "a", blobId: "blob" }))
      .mockResolvedValueOnce(reply("Email/import", { accountId: "a", created: { message: { id: "e" } } }));
    const client = new JmapClient("https://mail.example/jmap", "secret", "a", transport);
    const raw = new TextEncoder().encode("Subject: Test\r\n\r\nBody");
    expect(await client.importMessage("https://mail.example/upload/{accountId}", raw, "inbox", "2026-01-01T00:00:00Z")).toEqual({ id: "e" });
    expect(new Uint8Array(transport.mock.calls[0][1].body)).toEqual(raw);
    expect(JSON.parse(transport.mock.calls[1][1].body).methodCalls[0][1].emails.message).toEqual({
      blobId: "blob", mailboxIds: { inbox: true }, keywords: {}, receivedAt: "2026-01-01T00:00:00Z",
    });
  });
  it("sends the expected state with a flag update", async () => {
    const transport = vi.fn().mockResolvedValue(reply("Email/set", { accountId: "a", newState: "next", updated: { e: null } }));
    const client = new JmapClient("https://mail.example/jmap", "secret", "a", transport);
    expect(await client.update("e", { "keywords/$seen": true }, "before")).toBe("next");
    expect(JSON.parse(transport.mock.calls[0][1].body).methodCalls[0][1]).toEqual({
      accountId: "a", ifInState: "before", update: { e: { "keywords/$seen": true } },
    });
  });
});
