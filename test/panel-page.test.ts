import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: true, role: "member", orgId: "org", passwordRequired: false }));
vi.mock("cloudflare:workers", () => ({ env: { ADMIN_EMAILS: "staff@example.test", ADMIN_MAILBOXES: "support@example.test" } }));
vi.mock("@/db", async () => ({
  ...await import("drizzle-orm"), ...await import("@/db/schema"),
  db: { select: () => ({ from: () => ({ where: async () => [{ orgId: state.orgId, role: state.role }] }) }) },
}));
vi.mock("@/lib/server/auth", () => ({ getAuth: () => ({ api: { getSession: async () => state.authenticated ? {
  session: { id: "session", activeOrganizationId: state.orgId },
  user: { id: "person", name: "Person", email: "person@example.test", emailVerified: true },
} : null } }) }));
vi.mock("@/lib/server/mail/account-security", () => ({ mustChangePassword: async () => state.passwordRequired }));
vi.mock("@/lib/server/mail/access", () => ({ viewerMailboxes: vi.fn(async () => [{ address: "person@example.test", signature: "", displayName: "Person", signatureCard: null }]) }));
vi.mock("@/lib/server/mail/store", () => ({ listThreads: vi.fn(async () => ({ threads: [{ id: "thread", createdAt: new Date("2026-01-01Z") }], hasMore: false })), unreadCounts: async () => ({}) }));
vi.mock("@/lib/server/mail/admin", () => ({ getSignatureBrand: async () => null }));
vi.mock("@/lib/server/admin-mail", () => ({ adminUnreadCount: async () => 0, adminUnreadCounts: async () => ({}), getMailboxSettings: async () => ({}), listAdminThreads: async () => ({ threads: [], hasMore: false }) }));
vi.mock("@/lib/server/analytics", () => ({ adminOverview: vi.fn(async () => ({ users: 1 })) }));
vi.mock("@/lib/server/org", async (orig) => ({ ...await orig<object>(), userOrgs: async (_u: string, orgId: string) => [{ id: orgId, name: "Org", role: state.role, active: true }] }));
vi.mock("@/lib/server/errors", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/server/notes/sync", () => ({ applyToRoom: vi.fn(), destroyRoom: vi.fn(), kickRoom: vi.fn() }));
vi.mock("@/lib/server/chat/sync", () => ({ publish: vi.fn() }));

import { appPage, appNotFound } from "@/lib/server/app-page";
import { GET } from "@/pages/api/app/page";
import { onRequest } from "@/middleware";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { adminOverview } from "@/lib/server/analytics";
import { listThreads } from "@/lib/server/mail/store";

function context(path = "/app/mail", email = "person@example.test") {
  const url = new URL(path, "https://workinbox.test");
  return {
    url, request: new Request(url), params: {}, isPrerendered: false,
    locals: { user: { id: "person", name: "Person", email, emailVerified: true }, role: state.role, orgId: state.orgId, locale: "en" },
    cookies: { get: () => undefined }, redirect: (to: string) => Response.redirect(new URL(to, url), 302),
  } as unknown as APIContext;
}
async function requestPage(path: string) {
  const ctx = context(`/api/app/page?path=${encodeURIComponent(path)}`);
  return await onRequest(ctx, async () => GET(ctx)) as Response;
}
beforeEach(() => {
  Object.assign(state, { authenticated: true, role: "member", orgId: "org", passwordRequired: false });
  vi.clearAllMocks();
});

describe("shared panel page loader", () => {
  it("can bootstrap a missing page with only the authenticated shell context", async () => {
    const page = await appNotFound(context("/app/missing"));
    expect(page).toMatchObject({ screen: "not-found", title: "Page not found", props: {}, context: { orgId: "org", role: "member", area: "app", isAdmin: false } });
    expect(viewerMailboxes).not.toHaveBeenCalled();
    // A missing console or staff page never shows those frames to people outside them.
    expect(await appNotFound(context("/admin/missing"))).toMatchObject({ context: { area: "app" } });
    state.role = "owner";
    expect(await appNotFound(context("/admin/missing"))).toMatchObject({ context: { area: "admin" } });
    expect(await appNotFound(context("/staff/missing"))).toMatchObject({ context: { area: "app" } });
  });
  it("keeps staff pages hidden, including from organization owners", async () => {
    for (const role of ["member", "admin", "owner"]) {
      state.role = role;
      for (const path of ["/staff", "/staff/mail"]) {
        const ctx = context(path);
        await expect(appPage(ctx, ctx.url)).rejects.toMatchObject({ status: 404 });
      }
    }
    expect(adminOverview).not.toHaveBeenCalled();
    for (const [from, to] of [["/app/admin", "/staff"], ["/app/admin-mail?t=x", "/staff/mail?t=x"]]) {
      const ctx = context(from); expect(await appPage(ctx, ctx.url)).toEqual({ redirect: to });
    }
    const ctx = context("/staff", "staff@example.test");
    expect(await appPage(ctx, ctx.url)).toMatchObject({ screen: "staff", context: { isAdmin: true, area: "staff" } });
  });
  it("opens the admin console to owners and admins only", async () => {
    for (const path of ["/admin", "/admin/team", "/admin/billing"]) {
      const ctx = context(path); expect(await appPage(ctx, ctx.url)).toEqual({ redirect: "/app/mail" });
    }
    for (const role of ["admin", "owner"]) {
      state.role = role;
      const ctx = context("/admin/team");
      expect(await appPage(ctx, ctx.url)).toMatchObject({ screen: "admin-settings", props: { page: "team" }, context: { area: "admin", canManage: true } });
      for (const [from, to] of [
        ["/app", "/admin"], ["/app/billing?checkout=success", "/admin/billing?checkout=success"], ["/app/view?to=admin&next=/app/notes", "/admin"],
        ["/app/view?to=user&next=/app/notes", "/app/notes"], ["/app/settings/organization#team", "/admin/organization#team"], ["/app/settings/mail", "/admin/mail"],
        ["/app/contacts?settings=team#invite", "/app/settings/team#invite"],
      ]) {
        const c = context(from); expect(await appPage(c, c.url)).toEqual({ redirect: to });
      }
    }
  });
  it("preserves member landing and canonical deep-link redirects", async () => {
    for (const [from, to] of [
      ["/app", "/app/mail"], ["/app/mail/outbox", "/app/mail?pane=outbox"],
      ["/app/notes/broken", "/app/notes"], ["/app/calendar/00000000-0000-0000-0000-000000000001", "/app/calendar?event=00000000-0000-0000-0000-000000000001"],
    ]) {
      const ctx = context(from); expect(await appPage(ctx, ctx.url)).toEqual({ redirect: to });
    }
    for (const [from, to] of [["/app/settings/mail?x=1", "/app/settings/mail-admin?x=1"], ["/app/mail?settings=mail-clients", "/app/settings/mail-clients"]]) {
      const ctx = context(from); expect(await appPage(ctx, ctx.url)).toEqual({ redirect: to });
    }
    const ctx = context("/app/settings/account?email=changed");
    expect(await appPage(ctx, ctx.url)).toMatchObject({ screen: "settings", props: { canManage: false } });
  });
  it("rejects unknown addresses and foreign origins", async () => {
    const ctx = context();
    for (const address of ["https://foreign.test/app/mail", "https://workinbox.test/api/app/mail", "https://workinbox.test/app/unknown", "https://workinbox.test/application", "https://workinbox.test/staff/unknown"])
      await expect(appPage(ctx, new URL(address))).rejects.toMatchObject({ status: 404 });
  });
});

describe("SPA page endpoint through authentication middleware", () => {
  it("does not return HTML or private data to an expired session", async () => {
    state.authenticated = false;
    const response = await requestPage("/app/mail");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(viewerMailboxes).not.toHaveBeenCalled();
  });
  it("rechecks membership and uses only the authenticated organization and role", async () => {
    for (const [orgId, role] of [["org", "member"], ["other-org", "owner"], ["other-org", "member"]]) {
      Object.assign(state, { orgId, role });
      const response = await requestPage("/app/mail?orgId=forged&role=owner");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ context: { orgId, role }, props: { threads: [{ createdAt: "2026-01-01T00:00:00.000Z" }] } });
      expect(viewerMailboxes).toHaveBeenLastCalledWith({ orgId, role, userId: "person" });
    }
  });
  it("enforces temporary-password changes without blocking the password screen's loader", async () => {
    state.passwordRequired = true;
    const denied = await requestPage("/app/mail");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ redirect: "/app/change-password" });
    expect(listThreads).not.toHaveBeenCalled();
    const allowed = await requestPage("/app/change-password");
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ screen: "change-password" });
  });
  it("rejects external and protocol-relative path parameters", async () => {
    for (const path of ["https://foreign.test/app/mail", "//foreign.test/app/mail", "/app/../../api/auth/get-session"]) {
      const response = await requestPage(path); expect(response.status).toBe(404);
    }
  });
});
