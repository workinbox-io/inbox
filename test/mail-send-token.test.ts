import { describe, expect, it } from "vitest";
import { signSendToken, verifySendToken } from "@/lib/mail/send-token";

describe("mail send tokens", () => {
  const secret = "s3cret";
  const now = 1_000_000;
  const sign = (exp = now + 60_000) => signSendToken({ userId: "u1", orgId: "o1", exp }, secret);

  it("accepts the card's token for the same user and org", async () => {
    expect(await verifySendToken(await sign(), "u1", "o1", secret, now)).toBe(true);
  });

  it("rejects other users, orgs, secrets, expired, missing and tampered tokens", async () => {
    const t = await sign();
    expect(await verifySendToken(t, "u2", "o1", secret, now)).toBe(false);
    expect(await verifySendToken(t, "u1", "o2", secret, now)).toBe(false);
    expect(await verifySendToken(t, "u1", "o1", "other", now)).toBe(false);
    expect(await verifySendToken(await sign(now - 1), "u1", "o1", secret, now)).toBe(false);
    expect(await verifySendToken(undefined, "u1", "o1", secret, now)).toBe(false);
    expect(await verifySendToken("x.y", "u1", "o1", secret, now)).toBe(false);
    const [body, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ userId: "u1", orgId: "o1", exp: now * 10 })).replace(/=+$/, "");
    expect(await verifySendToken(`${forged}.${sig}`, "u1", "o1", secret, now)).toBe(false);
    expect(body).toBeTruthy();
  });
});
