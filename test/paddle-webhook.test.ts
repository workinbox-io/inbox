import { describe, expect, it } from "vitest";
import { verifyWebhook } from "@/lib/server/paddle-webhook";

async function sign(body: string, secret: string, ts: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`));
  return `ts=${ts};h1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.updated", occurred_at: "", data: { id: "sub_1" } });
const now = 1_800_000_000_000;

describe("verifyWebhook", () => {
  it("accepts a valid signature", async () => {
    const header = await sign(body, "secret", now / 1000);
    expect((await verifyWebhook(body, header, "secret", now))?.data.id).toBe("sub_1");
  });

  it("rejects a wrong secret, a changed body and an old timestamp", async () => {
    const header = await sign(body, "secret", now / 1000);
    expect(await verifyWebhook(body, header, "other", now)).toBeNull();
    expect(await verifyWebhook(body.replace("sub_1", "sub_2"), header, "secret", now)).toBeNull();
    expect(await verifyWebhook(body, header, "secret", now + 10 * 60_000)).toBeNull();
    expect(await verifyWebhook(body, null, "secret", now)).toBeNull();
  });
});
