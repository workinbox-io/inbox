import type { AppPage, AppContext } from "@/lib/server/app-page";
import { appRoute } from "@/lib/app-routes";

export const context: AppContext = {
  user: { id: "person", name: "Test Person", email: "person@example.test" }, orgId: "org", role: "owner",
  canManage: true, isAdmin: true, view: "user", locale: "en", sidebarOpen: true, adminMail: { unread: 0 },
};
export const prefs = { hourCycle: "h23", timezones: ["UTC"], weekStart: 1, workStart: 540, workEnd: 1020, defaultReminder: 10 };
export const usage = { used: 0, quota: 1024 * 1024 };
export const contacts = [1, 2].map((n) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`, name: `Contact ${n}`, company: "", title: "", note: "",
  emails: [{ value: `contact${n}@example.test` }], phones: [], source: "manual", contactCount: 0,
  lastContactedAt: null, groupIds: [], updatedAt: "2026-01-01T00:00:00.000Z",
}));

export function panelFixture(path: string, view: "user" | "admin" = "user"): AppPage {
  const url = new URL(path, "http://panel.test");
  const ctx = { ...context, view };
  const route = appRoute(url.pathname);
  if (!route) return { context: ctx, screen: "not-found", title: "Page not found", props: {} };
  const common = { canManage: true, account: view === "user" ? ctx.user : undefined };
  const plan = { id: "team", name: "Team", members: 5 };
  const data = {
    overview: { userName: ctx.user.name, plan, status: "active", trialDaysLeft: null, members: 1, recent: [] },
    mail: { ...common, mailboxes: [], threads: [], hasMore: false, unread: {}, signatures: {}, signatureBrand: null, selectedId: null, outbox: false, drafts: false },
    "external-mail": { connectionId: route.id, draftScope: `org:person:${route.id}` },
    chat: { ...common, user: ctx.user, channels: [], counts: { threads: 0 }, people: [], selectedId: route.id },
    calendar: { ...common, calendars: [], prefs, approximateLocation: null, initial: { date: url.searchParams.get("date"), view: url.searchParams.get("view") } },
    notes: { ...common, user: ctx.user, notes: [], hasMore: false, folders: [], selectedId: route.id },
    contacts: { ...common, contacts, hasMore: false, groups: [], selectedId: route.id },
    drive: { ...common, location: { view: "mine" }, items: [], folder: null, fileId: null, usage },
    billing: { usage: { plan, members: 1 }, status: "active", hasCustomer: false, hasSubscription: false, justCheckedOut: false, canManage: true },
    admin: { data: { mrr: 0, paying: 0, trialing: 0, users: 1, visitors: 0, newUsers: 0, series: [], topPages: [], topReferrers: [] } },
    "admin-mail": { mailboxes: [], threads: [], hasMore: false, unread: {}, signatures: {}, selectedId: null },
    "change-password": {}, "recovery-email": { token: url.searchParams.get("token") ?? "" },
  };
  return { context: ctx, screen: route.screen, title: route.screen, props: data[route.screen] } as AppPage;
}
