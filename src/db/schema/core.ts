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
