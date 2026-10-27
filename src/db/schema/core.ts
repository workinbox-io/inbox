/**
 * Template tables: auth, organizations, billing, API keys, audit log, errors and analytics.
 * Your product's tables go in ./app.ts, so updates from the template merge cleanly.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { PlanId } from "@/config/plans";

export const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
/** D1 stores times as integer milliseconds; Drizzle maps them to Date. */
export const time = (name: string) => integer(name, { mode: "timestamp_ms" });
export const createdAt = () => time("created_at").notNull().$defaultFn(() => new Date());
export const updatedAt = () =>
  time("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
const bool = (name: string) => integer(name, { mode: "boolean" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

// ---------------------------------------------------------------------------
// Better Auth core + organization and twoFactor plugin tables
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: bool("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: bool("two_factor_enabled").default(false),
  /** Where the sign-up came from (see lib/server/analytics.ts). Not Better Auth fields. */
  signupReferrer: text("signup_referrer"),
  signupUtmSource: text("signup_utm_source"),
  signupUtmCampaign: text("signup_utm_campaign"),
  signupLandingPath: text("signup_landing_path"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: time("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: createdAt(),
});

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("member_user_idx").on(t.userId), index("member_org_idx").on(t.organizationId)],
);

export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull(),
    expiresAt: time("expires_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_email_idx").on(t.email)],
);

/** twoFactor plugin: TOTP secret and backup codes, both encrypted with BETTER_AUTH_SECRET. */
export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: bool("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: time("locked_until"),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// OAuth server for MCP clients (jwt and @better-auth/mcp plugins, see lib/server/auth.ts).
// Better Auth writes string[] and json fields as JSON text itself, so they're plain text columns.
// ---------------------------------------------------------------------------

/** Keys that sign OAuth access tokens; private keys are encrypted with BETTER_AUTH_SECRET. */
export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  alg: text("alg"),
  crv: text("crv"),
  createdAt: createdAt(),
  expiresAt: time("expires_at"),
});

/** Apps that connect over OAuth: Claude, ChatGPT and other MCP clients register themselves. */
export const oauthClient = sqliteTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: bool("disabled").default(false),
    skipConsent: bool("skip_consent"),
    enableEndSession: bool("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes"),
    clientCredentialsScopes: text("client_credentials_scopes"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris"),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: bool("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types"),
    responseTypes: text("response_types"),
    requirePKCE: bool("require_pkce"),
    dpopBoundAccessTokens: bool("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: text("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("oauth_client_user_idx").on(t.userId)],
);

/** Protected resources tokens are issued for; the MCP endpoint is seeded on start. */
export const oauthResource = sqliteTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes"),
  customClaims: text("custom_claims"),
  dpopBoundAccessTokensRequired: bool("dpop_bound_access_tokens_required").default(false),
  disabled: bool("disabled").default(false),
  policyVersion: integer("policy_version").default(1),
  metadata: text("metadata"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const oauthClientResource = sqliteTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: text("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("oauth_client_resource_client_idx").on(t.clientId), index("oauth_client_resource_resource_idx").on(t.resourceId)],
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The organization the user connected (see the consent screen). */
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    expiresAt: time("expires_at"),
    createdAt: createdAt(),
    revoked: time("revoked"),
    rotatedAt: time("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: time("rotation_replay_expires_at"),
    authTime: time("auth_time"),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (t) => [
    index("oauth_refresh_token_client_idx").on(t.clientId),
    index("oauth_refresh_token_session_idx").on(t.sessionId),
    index("oauth_refresh_token_user_idx").on(t.userId),
    index("oauth_refresh_token_code_idx").on(t.authorizationCodeId),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: time("expires_at"),
    createdAt: createdAt(),
    revoked: time("revoked"),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (t) => [
    index("oauth_access_token_client_idx").on(t.clientId),
    index("oauth_access_token_session_idx").on(t.sessionId),
    index("oauth_access_token_user_idx").on(t.userId),
    index("oauth_access_token_code_idx").on(t.authorizationCodeId),
    index("oauth_access_token_refresh_idx").on(t.refreshId),
  ],
);

/** What a user allowed an app to do, per organization (`referenceId`). Deleting it disconnects the app. */
export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    scopes: text("scopes").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("oauth_consent_client_idx").on(t.clientId), index("oauth_consent_user_idx").on(t.userId)],
);

/** Used client assertion ids (`jti`), so a signed assertion works once. */
export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: time("expires_at").notNull(),
});

/** Company details for invoices. One row per organization, created on first save. */
export const orgBillingDetails = sqliteTable("org_billing_details", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull().default(""),
  vatId: text("vat_id").notNull().default(""),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2").notNull().default(""),
  city: text("city").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  region: text("region").notNull().default(""),
  /** ISO 3166-1 alpha-2, or "" when not given. */
  country: text("country").notNull().default(""),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const subscriptions = sqliteTable("subscriptions", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: text("plan").$type<PlanId>().notNull(),
  /** Mirrors the Paddle subscription status, plus "trialing" before checkout. */
  status: text("status").notNull(),
  paddleCustomerId: text("paddle_customer_id"),
  paddleSubscriptionId: text("paddle_subscription_id").unique(),
  trialEndsAt: time("trial_ends_at"),
  /** When the "trial ends soon" e-mail went out, so it's sent once. */
  trialReminderSentAt: time("trial_reminder_sent_at"),
  currentPeriodEnd: time("current_period_end"),
  billingInterval: text("billing_interval").$type<"month" | "year">(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Organization API keys for /api/v1. Only a SHA-256 of the key is stored; it's shown once. */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters of the key, to tell keys apart in the dashboard. */
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    /** "admin" or "member"; same permissions as a team member with that role. */
    role: text("role").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: time("last_used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_uq").on(t.hash), index("api_keys_org_idx").on(t.orgId)],
);

// ---------------------------------------------------------------------------
// Audit log, errors, analytics
// ---------------------------------------------------------------------------

/** Changes made in the dashboard or through the API. Names are copied in, so entries outlive what they name. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorType: text("actor_type").$type<"user" | "api_key">().notNull(),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    actorEmail: text("actor_email"),
    /** Dotted name from AUDIT_ACTIONS (config/audit.ts). */
    action: text("action").notNull(),
    target: text("target"),
    details: json<Record<string, unknown>>("details"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_org_time_idx").on(t.orgId, t.createdAt)],
);

/** Unexpected exceptions, one row per distinct bug (see lib/server/errors.ts). */
export const appErrors = sqliteTable(
  "app_errors",
  {
    id: id(),
    fingerprint: text("fingerprint").notNull().unique(),
    /** "web", "queue" or "cron". */
    service: text("service").notNull(),
    name: text("name").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    context: json<Record<string, unknown>>("context"),
    count: integer("count").notNull().default(1),
    firstSeenAt: time("first_seen_at").notNull(),
    lastSeenAt: time("last_seen_at").notNull(),
    alertedAt: time("alerted_at"),
  },
  (t) => [index("app_errors_last_seen_idx").on(t.lastSeenAt)],
);

/**
 * Cookieless page views from the marketing site (lib/server/analytics.ts). `visitor` is a hash of
 * IP, user agent and a salt that changes daily, so visitors can't be followed across days.
 */
export const pageViews = sqliteTable(
  "page_views",
  {
    id: id(),
    day: text("day").notNull(),
    visitor: text("visitor").notNull(),
    path: text("path").notNull(),
    referrerHost: text("referrer_host"),
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    country: text("country"),
    createdAt: createdAt(),
  },
  (t) => [index("page_views_day_idx").on(t.day), index("page_views_visitor_idx").on(t.day, t.visitor)],
);

/** One random salt per UTC day for visitor hashes; deleted after a day, so old hashes can't be linked. */
export const analyticsSalts = sqliteTable("analytics_salts", {
  day: text("day").primaryKey(),
  salt: text("salt").notNull(),
});
