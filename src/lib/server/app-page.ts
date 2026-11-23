import type { APIContext, AstroGlobal } from "astro";
import type { DriveLocation } from "@/components/drive/drive-app";
import { adminPageOf, appRoute, panelArea, type PanelArea } from "@/lib/app-routes";
import { openHref } from "./open";
import { approximateSunLocation } from "@/lib/calendar/sun";
import { msg, t } from "@/lib/i18n/panel";
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
import { listViews } from "./collection-views";
import { listCollections, listRecords } from "./collections";
import { driveViewer } from "./drive/access";
import { getItem, listItems } from "./drive/items";
import { driveUsage } from "./drive/quota";
import { viewerMailboxes } from "./mail/access";
import { getSignatureBrand } from "./mail/admin";
import { listThreads, unreadCounts } from "./mail/store";
import { notesViewer } from "./notes/access";
import { listFolders, listNotes, notePeople } from "./notes/notes";
import { getOrgUsage, getSubscription, userOrgs } from "./org";
import { canCreateWorkspace } from "@/lib/workspaces";
import { env } from "cloudflare:workers";
import { canManage } from "./roles";
import { disabledModules } from "./modules";
import { moduleOfPath } from "@/config/modules";

export async function appContext(ctx: APIContext, area: PanelArea = "app") {
  const user = ctx.locals.user!;
  const role = ctx.locals.role ?? "member";
  const staff = isAdmin(user);
  const boxes = staff && area === "staff" ? adminMailboxes() : [];
  const orgs = await userOrgs(user.id, ctx.locals.orgId!);
  return {
    /** Which frame the page sits in: the apps' rail, or the admin console's or staff sidebar. */
    area,
    user: { id: user.id, name: user.name, email: user.email },
    orgId: ctx.locals.orgId!, role, canManage: canManage(role), isAdmin: staff,
    locale: ctx.locals.locale,
    sidebarOpen: ctx.cookies.get("sidebar_state")?.value !== "false",
    /** Staff mailboxes' unread threads, for the staff sidebar's badge. */
    adminMail: boxes.length ? { unread: await adminUnreadCount(boxes).catch(() => 0) } : null,
    /** Apps the organization turned off (config/modules.ts). */
    disabled: await disabledModules(ctx.locals.orgId!),
    /** Workspaces to switch between (account menus) and whether "New workspace" shows. */
    orgs: orgs.map(({ id, name, active }) => ({ id, name, active })),
    canCreateOrg: canCreateWorkspace({ mode: env.DEPLOY_MODE, role, owned: orgs.filter((o) => o.role === "owner").length }),
  };
}

/** Addresses from before the apps, the admin console and the staff tools were split (and old bookmarks). */
function legacyRedirect(ctx: APIContext, url: URL, path: string) {
  const manager = canManage(ctx.locals.role);
  const search = url.search;
  if (path === "/app") return manager ? "/admin" : "/app/mail";
  if (path === "/admin/team") return `/admin/people${search}`;
  if (path === "/app/billing") return `/admin/billing${search}`;
  if (path === "/app/admin") return `/staff${search}`;
  if (path === "/app/admin-mail") return `/staff/mail${search}`;
  if (path === "/app/mail/outbox") return "/app/mail?pane=outbox";
  if (path === "/app/view") {
    const next = url.searchParams.get("next");
    if (url.searchParams.get("to") === "admin" && manager) return "/admin";
    return next && /^\/app\/[a-z]/.test(next) ? next : "/app/mail";
  }
  if (path === "/app/mail" && /^(mail|console)$/.test(url.searchParams.get("view") ?? "")) return url.searchParams.get("view") === "console" && manager ? "/admin" : "/app/mail";
  // Settings links from before the settings page: ?settings=<section> on any app address.
  const asked = url.searchParams.get("settings");
  if (asked !== null && path.startsWith("/app")) return `/app/settings${asked ? `/${asked}` : ""}${url.hash}`;
  const settings = /^\/app\/settings(?:\/([^/]+))?$/.exec(path);
  if (settings) {
    const section = settings[1] === "mail" ? "mail-admin" : settings[1] === "team" && manager ? "people" : settings[1];
    const page = manager ? adminPageOf(section) : null;
    if (page) return `/admin/${page}${url.hash}`;
    if (section !== settings[1]) return `/app/settings/${section}${search}${url.hash}`;
  }
  return null;
}

/** The original page loaders, shared by the first document and subsequent SPA navigations. */
export async function appPage(ctx: APIContext, url: URL) {
  const path = url.pathname.replace(/\/$/, "");
  const area = panelArea(path);
  if (url.origin !== ctx.url.origin || !area) throw new HttpError(404, "Not found");
  const legacy = legacyRedirect(ctx, url, path);
  if (legacy) return { redirect: legacy } as const;
  // Mention chips and ⌘K results opened inside the app (the router asks here, not the /app/open route).
  const open = /^\/app\/open\/([^/]+)\/([^/]+)$/.exec(path);
  if (open) return { redirect: await openHref(ctx.locals.orgId!, open[1]!, decodeURIComponent(open[2]!)) } as const;
  if (area === "staff" && !isAdmin(ctx.locals.user)) throw new HttpError(404, "Not found");
  if (area === "admin" && !canManage(ctx.locals.role)) return { redirect: "/app/mail" } as const;
  const route = appRoute(path);
  if (!route) {
    const invalid = /^\/app\/(chat|calendar|notes|contacts|drive|collections)\//.exec(path);
    if (invalid) return { redirect: `/app/${invalid[1]}` } as const;
    throw new HttpError(404, "Not found");
  }
  const { screen, id } = route;
  if (screen === "calendar" && id) return { redirect: `/app/calendar?event=${id}` } as const;

  const context = await appContext(ctx, area);
  const { orgId, role, user } = context;
  const off = moduleOfPath(path);
  if (off && context.disabled.includes(off)) throw new HttpError(404, "Not found");
  const manager = context.canManage;
  const account = { name: user.name, email: user.email };
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
      const [list, unread, signatureBrand] = await Promise.all([listThreads({ boxes: boxes.filter((b) => b.followed), folder: "inbox" }), unreadCounts(boxes), getSignatureBrand(orgId)]);
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
    case "collections": {
      const collections = await listCollections(viewer);
      const current = collections.find((c) => c.id === id) ?? (id ? null : collections[0]);
      if (id && !current) throw new HttpError(404, "Not found");
      const [list, people, views] = await Promise.all([
        current ? listRecords(orgId, current, { limit: 500, offset: 0 }) : { records: [], hasMore: false },
        notePeople(orgId),
        current ? listViews(viewer, current) : [],
      ]);
      return { context, screen, title: current?.name ?? t("Collections"), props: { ...common, collections, collectionId: current?.id ?? null, records: list.records, hasMore: list.hasMore, views, userId: user.id,
        people: people.map(({ id, name, email }) => ({ id, name, email })) } };
    }
    case "billing": {
      const [usage, sub] = await Promise.all([getOrgUsage(orgId), getSubscription(orgId)]);
      return { context, screen, title: t("Billing"), props: { usage, status: sub?.status ?? "trialing", trialEndsAt: sub?.trialEndsAt?.toISOString(),
        currentPeriodEnd: sub?.currentPeriodEnd?.toISOString(), hasCustomer: Boolean(sub?.paddleCustomerId),
        hasSubscription: Boolean(sub?.paddleSubscriptionId) && sub?.status !== "canceled",
        justCheckedOut: url.searchParams.get("checkout") === "success", canManage: manager,
      } };
    }
    case "admin-settings":
      return { context, screen, title: t(ADMIN_TITLES[id as keyof typeof ADMIN_TITLES]), props: { page: id as keyof typeof ADMIN_TITLES } };
    case "settings":
      return { context, screen, title: t("Settings"), props: { canManage: manager } };
    case "staff":
      return { context, screen, title: t("Analytics"), props: { data: await adminOverview() } };
    case "staff-mail": {
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

const ADMIN_TITLES = { people: msg("People"), mail: msg("Mail"), apps: msg("Apps"), "api-keys": msg("API keys"), audit: msg("Audit log"), organization: msg("Organization") };

export type AppContext = Awaited<ReturnType<typeof appContext>>;
export async function appNotFound(ctx: APIContext, url = ctx.url) {
  // A missing page shows inside its area's frame, but only to people who may see that frame.
  const asked = panelArea(url.pathname);
  const area = asked === "staff" ? (isAdmin(ctx.locals.user) ? asked : "app") : asked === "admin" ? (canManage(ctx.locals.role) ? asked : "app") : "app";
  return { context: await appContext(ctx, area), screen: "not-found" as const, title: t("Page not found"), props: {} };
}
type Json<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Json<T[K]> } : T;
export type AppPage = Json<Exclude<Awaited<ReturnType<typeof appPage>>, { redirect: string }>> | Awaited<ReturnType<typeof appNotFound>>;

/** The first document of /app, /admin and /staff (pages/<area>/[...path].astro). */
export async function panelDocument(ctx: AstroGlobal): Promise<{ redirect: string } | { initial: AppPage }> {
  ctx.response.headers.set("Cache-Control", "no-store");
  ctx.response.headers.set("Referrer-Policy", "no-referrer");
  try {
    const page = await appPage(ctx, ctx.url);
    if ("redirect" in page) return { redirect: page.redirect! };
    // The document and JSON endpoint use exactly the same wire representation.
    return { initial: JSON.parse(JSON.stringify(page)) };
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) throw error;
    ctx.response.status = 404;
    return { initial: await appNotFound(ctx) };
  }
}
