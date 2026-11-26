import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: { PUBLIC_APP_URL: "https://app.test" } }));
const { resetPassword } = await import("@/emails/templates");
const { withLocale } = await import("@/lib/server/i18n");

describe("system e-mails", () => {
  it("render in the recipient's language", async () => {
    expect((await withLocale("pl", () => resetPassword("https://x.test/r"))).subject).toMatch(/^Zresetuj hasło/);
    expect((await resetPassword("https://x.test/r")).subject).toMatch(/^Reset your password/);
  });
});
