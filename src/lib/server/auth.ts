import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { jwt, organization, twoFactor } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { TRIAL_DAYS } from "@/config/plans";
import { siteConfig } from "@/config/site";
import { and, db, eq, mailDomains, mailboxes, member } from "@/db";
import { accountSecurity, mustChangePassword, clearPasswordRequirement } from "./mail/account-security";
import { isValidLocalPart } from "@/lib/mail/rules";
import * as schema from "@/db/schema";
import { emails } from "@/emails";
import { userLocale, withLocale } from "@/lib/server/i18n";
import { attributeSignup } from "./analytics";
import { clientIp } from "./api";
import { auditTeamChange } from "./auth-audit";
import { sendEmail } from "./email";
import { clearFactorTrust, confirmSecondFactor, notifyFactorChange, reserveFactorAttempt, resetFactorAttempts, TWO_FACTOR_MANAGEMENT_PATHS } from "./two-factor";
import { MCP_SCOPES, ORG_CLAIM, fetchClientMetadataResource, mcpResource, oauthOrgSelection } from "./oauth";
import { OrgError, createPersonalOrg, hasPendingInvitation, memberLimit, prepareAccountDeletion, seatUpsell, seatsLeft } from "./org";
import { enqueue } from "./queue";
import { isDemoAddress } from "@/lib/demo";


/** Better Auth endpoints the demo's people may call (lib/server/demo/guard.ts). */
const DEMO_AUTH_PATHS = new Set(["/sign-out", "/get-session", "/list-sessions", "/update-user", "/organization/list", "/organization/get-full-organization", "/organization/set-active", "/organization/list-members"]);
import { signUpAllowed } from "@/lib/signup";

/**
 * Better Auth signs e-mail verification tokens as JWTs; an email change carries the current address
 * in `email` and the new one in `updateTo`. Only read after Better Auth has created or verified it.
 */
function emailChange(token: string | null | undefined): { email: string; updateTo: string } | null {
  try {
    const part = (token?.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part));
    return typeof payload?.updateTo === "string" && typeof payload.email === "string" ? payload : null;
  } catch {
    return null;
  }
}

function createAuth() {
  return betterAuth({
    baseURL: env.PUBLIC_APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Cloudflare's resolved client IP, so sign-in rate limits can't be dodged with X-Forwarded-For.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // The jwt plugin's session-to-JWT endpoint; we only use JWTs as OAuth access tokens.
    disabledPaths: ["/token"],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const security = await accountSecurity(user.id);
        const to = security?.recoveryVerifiedAt && security.recoveryEmail ? security.recoveryEmail : user.email;
        await sendEmail({ to, ...(await withLocale(await userLocale({ id: user.id }), () => emails.resetPassword(url))) });
      },
      onPasswordReset: async ({ user }) => {
        await clearPasswordRequirement(user.id);
        await clearFactorTrust(user.id);
      },
      // Sign-up with a taken address looks successful; the owner gets a heads-up instead.
      onExistingUserSignUp: async ({ user }) => {
        await sendEmail({ to: user.email, ...(await withLocale(await userLocale({ id: user.id }), () => emails.existingAccount())) });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 3600,
      sendVerificationEmail: async ({ user, url, token }) => {
        // Also used for Settings → Account → Change email: then it goes to the new address.
        const change = emailChange(token);
        if (change) {
          await sendEmail({ to: change.updateTo, ...(await withLocale(await userLocale({ id: user.id }), () => emails.changeEmail({ url, newEmail: change.updateTo }))) });
          await sendEmail({ to: change.email, ...(await withLocale(await userLocale({ id: user.id }), () => emails.emailChangeRequested({ newEmail: change.updateTo }))) });
          return;
        }
        await sendEmail({ to: user.email, ...(await withLocale(await userLocale({ id: user.id }), () => emails.verifyEmail(url))) });
      },
      afterEmailVerification: async (user, request) => {
        // Confirming a new address isn't a sign-up; no welcome.
        if (emailChange(request ? new URL(request.url).searchParams.get("token") : null)) return;
        await sendEmail({ to: user.email, ...(await withLocale(await userLocale({ id: user.id }), () => emails.welcome({ name: user.name, trialDays: env.DEPLOY_MODE === "self" ? 0 : TRIAL_DAYS }))) });
      },
    },
    user: {
      // No confirmation step on the old address: the link goes to the new one, the old one gets a heads-up.
      changeEmail: { enabled: true },
      // The dashboard's language, set in Settings → Account (lib/server/i18n.ts reads only known codes).
      additionalFields: { locale: { type: "string", required: false, input: true } },
      deleteUser: {
        enabled: true,
        // Refuses while the user is the only owner of an org others use; otherwise deletes the orgs only they had.
        beforeDelete: async (user) => {
          try {
            await prepareAccountDeletion(user.id);
          } catch (e) {
            if (e instanceof OrgError) throw new APIError("BAD_REQUEST", { message: e.message });
            throw e;
          }
        },
      },
    },
    socialProviders: env.GOOGLE_CLIENT_ID
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined,
    plugins: [
      // TOTP applies to e-mail/password sign-in; Google accounts rely on Google's own 2FA.
      twoFactor({ issuer: siteConfig.name }),
      organization({
        schema: { invitation: { additionalFields: {
          mailboxAddress: { type: "string", required: false, input: true },
          mailboxDomainId: { type: "string", required: false, input: true },
        } } },
        // Workspaces are made by POST /api/app/org/workspaces (trial row, owner/admin, cap), never by the plugin.
        allowUserToCreateOrganization: false,
        // Deleting goes through DELETE /api/app/org (deleteOrganization: Paddle, R2, audit), never the plugin.
        disableOrganizationDeletion: true,
        invitationExpiresIn: 7 * 86_400,
        cancelPendingInvitationsOnReInvite: true,
        // Plan member limits (config/plans.ts `members`): checked when an invitation is created —
        // members and pending invitations both hold a seat — and again when one is accepted, in case
        // the plan went down in between. A resend reuses its seat and never reaches the hook.
        membershipLimit: async (_user, org) => memberLimit(org.id),
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation }) => {
            const [activeDomain] = await db.select().from(mailDomains).where(and(eq(mailDomains.orgId, invitation.organizationId), eq(mailDomains.status, "active"))).limit(1);
            if (activeDomain && (!invitation.mailboxAddress || !invitation.mailboxDomainId)) throw new APIError("BAD_REQUEST", { message: "Choose a mailbox address and active domain" });
            if (invitation.mailboxAddress || invitation.mailboxDomainId) {
              const [domain] = await db.select().from(mailDomains).where(and(eq(mailDomains.id, invitation.mailboxDomainId ?? ""), eq(mailDomains.orgId, invitation.organizationId), eq(mailDomains.status, "active")));
              const address = String(invitation.mailboxAddress ?? "").trim().toLowerCase();
              if (!domain || !address.endsWith("@" + domain.domain) || !isValidLocalPart(address.slice(0, -(domain.domain.length + 1)))) throw new APIError("BAD_REQUEST", { message: "Choose an address on an active organization domain" });
              invitation.mailboxAddress = address;
            }
            const { plan, left } = await seatsLeft(invitation.organizationId, invitation.email);
            if (left !== null && left < 1) throw new APIError("FORBIDDEN", { message: seatUpsell(plan) });
            return { data: invitation };
          },
          beforeAcceptInvitation: async ({ invitation, user }) => {
            if (!invitation.mailboxAddress) return;
            const [domain] = await db.select().from(mailDomains).where(and(eq(mailDomains.id, invitation.mailboxDomainId ?? ""), eq(mailDomains.orgId, invitation.organizationId), eq(mailDomains.status, "active")));
            const [existing] = await db.select().from(mailboxes).where(and(eq(mailboxes.orgId, invitation.organizationId), eq(mailboxes.userId, user.id), eq(mailboxes.kind, "personal")));
            if (!domain || existing) throw new APIError("BAD_REQUEST", { message: !domain ? "The mailbox domain is no longer active" : "You already have a personal mailbox in this organization" });
          },
        },
        sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
          const url = `${env.PUBLIC_APP_URL}/invite/${id}`;
          await sendEmail({ to: email, ...(await withLocale(await userLocale({ email }), () => emails.invitation({ orgName: org.name, inviterName: inviter.user.name, url }))) });
        },
      }),
      // Signs OAuth access tokens (keys in the jwks table). No JWT header on every get-session.
      jwt({ disableSettingJwtHeader: true }),
      // OAuth 2.1 server for AI apps connecting to /mcp (lib/server/oauth.ts, lib/server/mcp.ts).
      mcp({
        resource: mcpResource(),
        loginPage: "/login",
        consentPage: "/oauth/consent",
        postLogin: oauthOrgSelection,
        scopes: ["openid", "profile", "email", "offline_access", ...(Object.keys(MCP_SCOPES) as (keyof typeof MCP_SCOPES)[])],
        // Claude, ChatGPT and most MCP clients register themselves (RFC 7591); every new client still
        // needs a user's consent before it gets a token.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        customAccessTokenClaims: ({ referenceId }) => ({ [ORG_CLAIM]: referenceId }),
      }),
      // Apps that identify themselves with a metadata URL as client_id (MCP 2026-07-28).
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx): Promise<void> => {
        if (ctx.path === "/change-password" && ctx.body?.newPassword === ctx.body?.currentPassword) throw new APIError("BAD_REQUEST", { message: "Choose a different password" });
        const session = await getSessionFromCtx(ctx).catch(() => null);
        if (!session) return;
        // The slug marks demo orgs (deleted hourly by cleanDemoOrgs), so nobody may set it through the plugin.
        if (ctx.path === "/organization/update" && ctx.body?.data?.slug !== undefined) throw new APIError("FORBIDDEN", { message: "The organization's address can't be changed" });
        // Only the owner changes roles (org.ts canChangeRoles); the plugin's default lets admins do it too.
        if (ctx.path === "/organization/update-member-role") {
          const orgId = ctx.body?.organizationId ?? session.session.activeOrganizationId ?? "";
          const [me] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, session.user.id)));
          if (me?.role !== "owner") throw new APIError("FORBIDDEN", { message: "Only the owner can change roles" });
        }
        if (await mustChangePassword(session.user.id)) {
          const allowed = ["/change-password", "/sign-out", "/get-session", "/request-password-reset", "/reset-password"];
          if (!allowed.includes(ctx.path)) throw new APIError("FORBIDDEN", { message: "Change your temporary password first" });
        }
        // The public demo (lib/server/demo): its people keep their session and nothing else of the account.
        if (isDemoAddress(session.user.email) && !DEMO_AUTH_PATHS.has(ctx.path)) throw new APIError("FORBIDDEN", { message: "This isn't available in the demo" });
        if (ctx.path.startsWith("/two-factor/")) {
          Object.assign(ctx.context, { factorBefore: { id: session.user.id, email: session.user.email, enabled: !!session.user.twoFactorEnabled } });
        }
        if (session.user.twoFactorEnabled && (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code")) {
          await reserveFactorAttempt(session.user.id);
        }
        if (session.user.twoFactorEnabled && TWO_FACTOR_MANAGEMENT_PATHS.has(ctx.path)) {
          const { success } = await env.AUTH_RATE_LIMIT.limit({ key: `2fa-manage:${session.user.id}` });
          if (!success) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts. Wait a minute and try again." });
          if (typeof ctx.body?.password !== "string") throw new APIError("BAD_REQUEST", { message: "Enter your current password." });
          // Check password and session freshness before consuming a one-use backup code.
          await getAuth().api.verifyPassword({ headers: new Headers(ctx.headers), body: { password: ctx.body.password } });
          await confirmSecondFactor(session.user.id, new Headers(ctx.headers));
        }
      }),
      after: createAuthMiddleware(async (ctx): Promise<void> => {
        if (ctx.path === "/change-password" && ctx.context.returned && !(ctx.context.returned instanceof Error) && !(ctx.context.returned instanceof Response)) {
          const session = ctx.context.session ?? await getSessionFromCtx(ctx).catch(() => null);
          if (session) await clearPasswordRequirement(session.user.id);
        }
        const before = (ctx.context as typeof ctx.context & { factorBefore?: { id: string; email: string; enabled: boolean } }).factorBefore;
        const returned = ctx.context.returned;
        if (before && returned && !(returned instanceof Error) && !(returned instanceof Response)) {
          if (before.enabled && (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code")) await resetFactorAttempts(before.id);
          if (ctx.path === "/two-factor/disable") {
            await clearFactorTrust(before.id);
            await notifyFactorChange(before, "disabled");
          }
          if (ctx.path === "/two-factor/generate-backup-codes") await notifyFactorChange(before, "backup codes regenerated");
          if (ctx.path === "/two-factor/verify-totp" && !before.enabled) await notifyFactorChange(before, "enabled");
        }
        await auditTeamChange(ctx);
        if (ctx.path === "/organization/remove-member" || ctx.path === "/organization/leave") {
          const r = ctx.context.returned as { member?: { organizationId?: string; userId?: string }; organizationId?: string; userId?: string } | undefined;
          const gone = r && !(r instanceof Error) && !(r instanceof Response) ? (r.member ?? r) : undefined;
          if (gone?.organizationId && gone.userId) await enqueue("org.memberLeft", { orgId: gone.organizationId, userId: gone.userId });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Self-hosted: the first account, then invited people only (email and Google sign-up alike).
          before: async (user) => {
            const [any] = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
            if (!signUpAllowed(env.DEPLOY_MODE, Boolean(any), any ? await hasPendingInvitation(user.email) : false)) {
              throw new APIError("FORBIDDEN", { message: "Sign-up is closed. Ask your admin for an invitation." });
            }
          },
          // Every new account gets a personal organization on a trial, unless it was invited
          // somewhere; then it joins that org instead (see middleware for the fallback).
          after: async (user, ctx) => {
            if (!(await hasPendingInvitation(user.email))) await createPersonalOrg(user.id, user.name);
            // Never fails the sign-up: where they came from (analytics.ts) and the NOTIFY_EMAIL heads-up.
            try {
              const request = ctx?.request;
              if (request) await attributeSignup(user.id, clientIp(request), request.headers.get("user-agent"));
              await enqueue("signup", { userId: user.id });
            } catch (e) {
              console.error("[auth] sign-up follow-up failed", e);
            }
          },
        },
      },
    },
  });
}

/** Better Auth holds an initialization promise that Cloudflare Workers can't safely share across requests. */
export const getAuth = createAuth;

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
