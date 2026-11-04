import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { jwt, organization, twoFactor } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { TRIAL_DAYS } from "@/config/plans";
import { siteConfig } from "@/config/site";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { emails } from "@/emails";
import { attributeSignup } from "./analytics";
import { clientIp } from "./api";
import { auditTeamChange } from "./auth-audit";
import { sendEmail } from "./email";
import { MCP_SCOPES, ORG_CLAIM, fetchClientMetadataResource, mcpResource, oauthOrgSelection } from "./oauth";
import { OrgError, createPersonalOrg, hasPendingInvitation, memberLimit, prepareAccountDeletion, seatUpsell, seatsLeft } from "./org";
import { enqueue } from "./queue";

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
        await sendEmail({ to: user.email, ...(await emails.resetPassword(url)) });
      },
      // Sign-up with a taken address looks successful; the owner gets a heads-up instead.
      onExistingUserSignUp: async ({ user }) => {
        await sendEmail({ to: user.email, ...(await emails.existingAccount()) });
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
          await sendEmail({ to: change.updateTo, ...(await emails.changeEmail({ url, newEmail: change.updateTo })) });
          await sendEmail({ to: change.email, ...(await emails.emailChangeRequested({ newEmail: change.updateTo })) });
          return;
        }
        await sendEmail({ to: user.email, ...(await emails.verifyEmail(url)) });
      },
      afterEmailVerification: async (user, request) => {
        // Confirming a new address isn't a sign-up; no welcome.
        if (emailChange(request ? new URL(request.url).searchParams.get("token") : null)) return;
        await sendEmail({ to: user.email, ...(await emails.welcome({ name: user.name, trialDays: TRIAL_DAYS })) });
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
        invitationExpiresIn: 7 * 86_400,
        cancelPendingInvitationsOnReInvite: true,
        // Plan member limits (config/plans.ts `members`): checked when an invitation is created —
        // members and pending invitations both hold a seat — and again when one is accepted, in case
        // the plan went down in between. A resend reuses its seat and never reaches the hook.
        membershipLimit: async (_user, org) => memberLimit(org.id),
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation }) => {
            const { plan, left } = await seatsLeft(invitation.organizationId, invitation.email);
            if (left !== null && left < 1) throw new APIError("FORBIDDEN", { message: seatUpsell(plan) });
          },
        },
        sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
          const url = `${env.PUBLIC_APP_URL}/invite/${id}`;
          await sendEmail({ to: email, ...(await emails.invitation({ orgName: org.name, inviterName: inviter.user.name, url })) });
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
    hooks: { after: auditTeamChange },
    databaseHooks: {
      user: {
        create: {
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

let instance: ReturnType<typeof createAuth> | undefined;

/** Created on first request so prerendering marketing pages doesn't need auth secrets. */
export const getAuth = () => (instance ??= createAuth());

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
