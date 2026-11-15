import type { APIContext } from "astro";
import type { DriveLocation } from "@/components/drive/drive-app";
import { appRoute } from "@/lib/app-routes";
import { approximateSunLocation } from "@/lib/calendar/sun";
import { t } from "@/lib/i18n/panel";
import { HttpError } from "./api";
import { adminMailboxes, isAdmin } from "./admin";
import { adminOverview } from "./analytics";
import { adminUnreadCount, adminUnreadCounts, getMailboxSettings, listAdminThreads } from "./admin-mail";
import { listAudit } from "./audit";
import { listCalendars } from "./calendar/calendars";
import { getPrefs } from "./calendar/events";
import { chatViewer } from "./chat/access";
import { listChannels } from "./chat/channels";
import { viewCounts } from "./chat/messages";
import { listContacts, listGroups } from "./contacts";
import { driveViewer } from "./drive/access";
import { getItem, listItems } from "./drive/items";
import { driveUsage } from "./drive/quota";
import { viewerMailboxes } from "./mail/access";
import { getSignatureBrand } from "./mail/admin";
import { listThreads, unreadCounts } from "./mail/store";
import { notesViewer } from "./notes/access";
import { listFolders, listNotes, notePeople } from "./notes/notes";
import { getOrgUsage, getSubscription } from "./org";
import { canManage } from "./roles";
import { settingsRedirect } from "./settings";
import { workspaceView } from "./workspace-view";

export async function appContext(ctx: APIContext) {
  const user = ctx.locals.user!;
  const role = ctx.locals.role ?? "member";
  const staff = isAdmin(user);
  const boxes = staff ? adminMailboxes() : [];
  return {
    user: { id: user.id, name: user.name, email: user.email },
    orgId: ctx.locals.orgId!, role, canManage: canManage(role), isAdmin: staff,
    view: workspaceView(ctx.cookies, user.id, role),
    locale: ctx.locals.locale,
    sidebarOpen: ctx.cookies.get("sidebar_state")?.value !== "false",
    adminMail: boxes.length ? { unread: await adminUnreadCount(boxes).catch(() => 0) } : null,
  };
}

/** The original page loaders, shared by the first document and subsequent SPA navigations. */
export async function appPage(ctx: APIContext, url: URL) {
  const path = url.pathname.replace(/\/$/, "");
  if (url.origin !== ctx.url.origin || !path.startsWith("/app")) throw new HttpError(404, "Not found");
  if (path === "/app/mail/outbox") return { redirect: "/app/mail?pane=outbox" } as const;
  const sections: Record<string, string> = { "": "account", account: "account", organization: "organization", "ai-apps": "ai-apps", mail: "mail-admin", notifications: "notifications" };
  const settings = /^\/app\/settings(?:\/([^/]+))?$/.exec(path);
  if (settings && Object.hasOwn(sections, settings[1] ?? ""))
    return { redirect: settingsRedirect(url, ctx.request.headers.get("referer"), sections[settings[1] ?? ""]!) } as const;
  const route = appRoute(path);
  if (!route) {
    const invalid = /^\/app\/(chat|calendar|notes|contacts|drive)\//.exec(path);
    if (invalid) return { redirect: `/app/${invalid[1]}` } as const;
    throw new HttpError(404, "Not found");
  }
  const { screen, id } = route;
  if ((screen === "admin" || screen === "admin-mail") && !isAdmin(ctx.locals.user)) throw new HttpError(404, "Not found");
  if (screen === "overview" && !canManage(ctx.locals.role)) return { redirect: "/app/mail" } as const;
  if (screen === "calendar" && id) return { redirect: `/app/calendar?event=${id}` } as const;
  const requestedView = url.searchParams.get("view");
  if (screen === "mail" && canManage(ctx.locals.role) && (requestedView === "mail" || requestedView === "console"))
    return { redirect: `/app/view?to=${requestedView === "mail" ? "user" : "admin"}&next=/app/mail` } as const;

  const context = await appContext(ctx);
  const { orgId, role, user } = context;
  const manager = context.canManage;
  const account = context.view === "user" ? { name: user.name, email: user.email } : undefined;
  const viewer = { orgId, userId: user.id, role };
  const common = { canManage: manager, account };
  switch (screen) {
    case "overview": {
      const [usage, sub, audit] = await Promise.all([getOrgUsage(orgId), getSubscription(orgId), listAudit(orgId, { limit: 8 })]);
      return { context, screen, title: t("Overview"), props: {
        userName: user.name, plan: usage.plan, status: sub?.status ?? "trialing",
        trialDaysLeft: sub?.trialEndsAt ? Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000) : null,
        members: usage.members, recent: audit.rows,
      } };
    }
    case "mail": {
      const boxes = await viewerMailboxes(viewer);
      const [list, unread, signatureBrand] = await Promise.all([listThreads({ boxes, folder: "inbox" }), unreadCounts(boxes), getSignatureBrand(orgId)]);
      return { context, screen, title: t("Mail"), props: {
        ...common, mailboxes: boxes.map((b) => b.address), threads: list.threads, hasMore: list.hasMore, unread,
        signatures: Object.fromEntries(boxes.map((b) => [b.address, { signature: b.signature, name: b.displayName || user.name, card: b.signatureCard }])),
        signatureBrand, selectedId: url.searchParams.get("t"), outbox: url.searchParams.get("pane") === "outbox", drafts: url.searchParams.get("pane") === "drafts",
      } };
    }
    case "external-mail":
      return { context, screen, title: t("External mail"), props: { connectionId: id!, draftScope: `${orgId}:${user.id}:${id}` } };
    case "chat": {
      const v = chatViewer({ locals: ctx.locals, orgId, role });
      const [channels, counts, people] = await Promise.all([listChannels(v), viewCounts(v), notePeople(orgId)]);
      return { context, screen, title: t("Chat"), props: { ...common, user, channels, counts, people, selectedId: id } };
    }
    case "calendar": {
      const [calendars, prefs] = await Promise.all([listCalendars(viewer), getPrefs(user.id)]);
      return { context, screen, title: t("Calendar"), props: { ...common, calendars, prefs,
        approximateLocation: approximateSunLocation(ctx.request.cf?.latitude, ctx.request.cf?.longitude),
        initial: { date: url.searchParams.get("date"), view: url.searchParams.get("view") },
      } };
    }
    case "notes": {
      const v = notesViewer({ locals: ctx.locals, orgId, role });
      const [list, folders] = await Promise.all([listNotes(v, { view: "all", limit: 50 }), listFolders(orgId)]);
      return { context, screen, title: t("Notes"), props: { ...common, user, notes: list.notes, hasMore: list.hasMore, folders, selectedId: id } };
    }
    case "contacts": {
      const [list, groups] = await Promise.all([listContacts(orgId, { view: "all", offset: 0, limit: 100 }), listGroups(orgId)]);
      return { context, screen, title: t("Contacts"), props: { ...common, contacts: list.contacts, hasMore: list.hasMore, groups, selectedId: id } };
    }
    case "drive": {
      const v = driveViewer({ locals: ctx.locals, orgId, role });
      const param = url.searchParams.get("view");
      const view = param === "shared" || param === "recent" || param === "starred" || param === "trash" ? param : "mine";
      const file = url.searchParams.get("file");
      const fileId = file && /^[0-9a-f-]{36}$/.test(file) ? file : null;
      try {
        const [list, folder, usage] = await Promise.all([listItems(v, id ? { folder: id } : { view }), id ? getItem(v, id) : null, driveUsage(orgId)]);
        const location: DriveLocation = id ? { folder: id } : { view };
        return { context, screen, title: t("Drive"), props: { ...common, location, items: list.items, folder, fileId, usage } };
      } catch (e) {
        if (e instanceof HttpError && (e.status === 404 || e.status === 422)) return { redirect: "/app/drive" } as const;
        throw e;
      }
    }
    case "billing": {
      const [usage, sub] = await Promise.all([getOrgUsage(orgId), getSubscription(orgId)]);
      return { context, screen, title: t("Billing"), props: { usage, status: sub?.status ?? "trialing", trialEndsAt: sub?.trialEndsAt?.toISOString(),
        currentPeriodEnd: sub?.currentPeriodEnd?.toISOString(), hasCustomer: Boolean(sub?.paddleCustomerId),
        hasSubscription: Boolean(sub?.paddleSubscriptionId) && sub?.status !== "canceled",
        justCheckedOut: url.searchParams.get("checkout") === "success", canManage: manager,
      } };
    }
    case "admin":
      return { context, screen, title: t("Analytics"), props: { data: await adminOverview() } };
    case "admin-mail": {
      const mailboxes = adminMailboxes();
      const [list, unread, signatures] = await Promise.all([listAdminThreads({ mailboxes, folder: "inbox" }), adminUnreadCounts(mailboxes), getMailboxSettings(mailboxes)]);
      return { context, screen, title: t("Mail"), props: { mailboxes, threads: list.threads, hasMore: list.hasMore, unread, signatures, selectedId: url.searchParams.get("t") } };
    }
    case "change-password":
      return { context, screen, title: t("Change your temporary password"), props: {} };
    case "recovery-email":
      return { context, screen, title: t("Verify recovery email"), props: { token: url.searchParams.get("token") ?? "" } };
  }
}

export type AppContext = Awaited<ReturnType<typeof appContext>>;
export async function appNotFound(ctx: APIContext) {
  return { context: await appContext(ctx), screen: "not-found" as const, title: t("Page not found"), props: {} };
}
type Json<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Json<T[K]> } : T;
export type AppPage = Json<Exclude<Awaited<ReturnType<typeof appPage>>, { redirect: string }>> | Awaited<ReturnType<typeof appNotFound>>;
