/**
 * The data each section of the settings dialog opens with: what the old /app/settings pages loaded on the server,
 * now fetched when a section opens (`/api/app/settings/<data key>`). Same functions, same permissions.
 */
import { env } from "cloudflare:workers";
import { featureUpsell, hasFeature, planById } from "@/config/plans";
import { loadAccount } from "@/lib/server/account";
import { HttpError } from "@/lib/server/api";
import { listApiKeys } from "@/lib/server/api-keys";
import { listAudit } from "@/lib/server/audit";
import { getPrefs } from "@/lib/server/calendar/events";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { getSignatureBrand, listMailSetup } from "@/lib/server/mail/admin";
import { listConnectedApps, mcpResource } from "@/lib/server/oauth";
import { getBillingDetails, getOrg, getSubscription, loadTeam } from "@/lib/server/org";
import { canManage, type OrgRole } from "@/lib/server/roles";
import { listModules } from "@/lib/server/modules";

export const SETTINGS_DATA = ["mailbox", "calendar", "account", "organization", "team", "api-keys", "audit", "mail-admin", "mail-clients", "ai-apps", "modules"] as const;
export type SettingsData = (typeof SETTINGS_DATA)[number];

/** Owners and admins only, like the pages they replace. */
const MANAGERS: SettingsData[] = ["api-keys", "audit", "mail-admin", "modules"];

export interface SettingsViewer {
  orgId: string
  role: OrgRole
  userId: string
  userName: string
  sessionId?: string
  /** The account section's profile (as the old account page passed it). */
  user: { name: string; email: string; twoFactorEnabled: boolean; locale: string | null }
  locale: string
}

export async function settingsData(key: SettingsData, v: SettingsViewer) {
  if (MANAGERS.includes(key) && !canManage(v.role)) throw new HttpError(403, "Only owners and admins");
  switch (key) {
    case "mailbox": {
      const boxes = await viewerMailboxes({ orgId: v.orgId, userId: v.userId, role: v.role });
      return {
        mailboxes: boxes.map((b) => b.address),
        // The name each mailbox sends under: its sender name, else the viewer's (as the mail page does).
        signatures: Object.fromEntries(boxes.map((b) => [b.address, { signature: b.signature, name: b.displayName || v.userName, card: b.signatureCard }])),
        signatureBrand: await getSignatureBrand(v.orgId),
      };
    }
    case "calendar":
      return { prefs: await getPrefs(v.userId) };
    case "account":
      return { ...(await loadAccount(v.userId, v.sessionId)), user: v.user, locale: v.locale };
    case "organization": {
      const [org, team, billingDetails] = await Promise.all([getOrg(v.orgId), loadTeam(v.orgId, v.userId), getBillingDetails(v.orgId)]);
      const others = team.members.filter((m) => !m.isMe).map(({ id, name, email, role }) => ({ id, name, email, role }));
      return { orgId: v.orgId, name: org?.name ?? "", role: v.role, canManage: canManage(v.role), billingDetails, others, orgs: team.orgs };
    }
    case "team":
      return loadTeam(v.orgId, v.userId);
    case "api-keys":
      return { keys: await listApiKeys(v.orgId) };
    case "audit":
      return { initial: await listAudit(v.orgId, { limit: 20 }) };
    case "mail-admin":
      return { setup: await listMailSetup(v.orgId) };
    case "modules":
      return { modules: await listModules(v.orgId) };
    case "mail-clients":
      return { configured: !!(env.MAIL_BRIDGE_URL && env.MAIL_BRIDGE_TOKEN) };
    case "ai-apps": {
      const [apps, sub] = await Promise.all([listConnectedApps(v.userId), getSubscription(v.orgId)]);
      return { apps, mcpUrl: mcpResource(), upsell: env.DEPLOY_MODE === "self" || hasFeature(planById(sub?.plan), "mcpAccess") ? null : featureUpsell("mcpAccess") };
    }
  }
}
