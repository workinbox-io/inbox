// Explicit React import: works with both the classic and automatic JSX runtimes.
import * as React from "react";
import type { ReactElement } from "react";
import { Section, Text, render, toPlainText } from "react-email";
import { siteConfig } from "@/config/site";
import { appLocale, t, tp } from "@/lib/i18n/panel";
import { DetailRows, EmailButton, EmailHeading, EmailLayout, LinkFallback, emailStyles, type DetailItem } from "./components";
import { appUrl } from "./urls";

/**
 * Transactional e-mails. Each returns { subject, html, text } for sendEmail(). Preview them by
 * rendering in a test, or send yourself one from `astro dev` (they're printed to the console).
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

async function build(subject: string, element: ReactElement): Promise<RenderedEmail> {
  const html = await render(element);
  return { subject, html, text: toPlainText(html) };
}

const formatDate = (d: Date) =>
  d.toLocaleString(appLocale(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export function verifyEmail(url: string) {
  return build(
    `${t("Confirm your email")} · ${siteConfig.name}`,
    <EmailLayout preview={t("Confirm your email to start your free trial.")} footer={t("Didn't create an account? Ignore this email and nothing will happen.")}>
      <EmailHeading muted={t("Then you're in.")} intro={t("Click the button to confirm your email address and open your dashboard. The link works for 24 hours.")}>
        {t("Confirm your email.")}
      </EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={url}>{t("Confirm email →")}</EmailButton>
      </Section>
      <LinkFallback url={url} />
    </EmailLayout>,
  );
}

export function resetPassword(url: string) {
  return build(
    `${t("Reset your password")} · ${siteConfig.name}`,
    <EmailLayout preview={t("The link works for one hour.")} footer={t("Didn't ask to reset your password? Ignore this email. Your password stays the same.")}>
      <EmailHeading muted={t("The link works for one hour.")}>{t("Reset your password.")}</EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={url}>{t("Choose a new password →")}</EmailButton>
      </Section>
      <LinkFallback url={url} />
    </EmailLayout>,
  );
}

export function invitation(p: { orgName: string; inviterName: string; url: string }) {
  return build(
    `${t("{inviter} invited you to {org}", { inviter: p.inviterName, org: p.orgName })} · ${siteConfig.name}`,
    <EmailLayout
      preview={t("Join {org} on {app}.", { org: p.orgName, app: siteConfig.name })}
      footer={t("The invitation expires in 7 days. Weren't expecting it? Ignore this email.")}
    >
      <EmailHeading muted={t("Join {org}.", { org: p.orgName })} intro={t("{inviter} invited you to work together on {app}.", { inviter: p.inviterName, app: siteConfig.name })}>
        {t("You're invited.")}
      </EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={p.url}>{t("Accept invitation →")}</EmailButton>
      </Section>
      <LinkFallback url={p.url} />
    </EmailLayout>,
  );
}

/** Sent instead of an error when someone signs up with a registered address (no account enumeration). */
export function existingAccount() {
  return build(
    `${t("You already have an account")} · ${siteConfig.name}`,
    <EmailLayout preview={t("Someone tried to sign up with your email address.")} footer={t("If this wasn't you, no action is needed. Your account is unchanged.")}>
      <EmailHeading muted={t("Sign in instead.")} intro={t("Someone just tried to create an account with this email address. If it was you, sign in or reset your password.")}>
        {t("You already have an account.")}
      </EmailHeading>
      <Section>
        <EmailButton href={appUrl("/login")}>{t("Sign in")}</EmailButton>
        <EmailButton href={appUrl("/forgot-password")} variant="secondary">
          {t("Reset password")}
        </EmailButton>
      </Section>
    </EmailLayout>,
  );
}

export function welcome({ name, trialDays }: { name: string; trialDays: number }) {
  // Self-hosted has no trial (trialDays 0).
  const note = trialDays ? t("Your {n}-day trial has started.", { n: trialDays }) : t("Your workspace is ready.");
  return build(
    t("Welcome to {app}", { app: siteConfig.name }),
    <EmailLayout preview={note}>
      <EmailHeading
        muted={note}
        intro={t("Hi {name}, your account is ready. Three steps to get going:", { name })}
      >
        {t("Welcome to {app}.", { app: siteConfig.name })}
      </EmailHeading>
      <DetailRows
        items={[
          { label: t("1. Add your domain"), value: t("Settings → Mail") },
          { label: t("2. Add your team"), value: t("Admin → Domains and mailboxes → New mailbox") },
          { label: t("3. Open your inbox"), value: t("Mail") },
        ]}
      />
      <Section style={{ margin: "0 0 20px" }}>
        <EmailButton href={appUrl("/admin/mail")}>{t("Add your domain")}</EmailButton>
        <EmailButton href={appUrl("/docs/quickstart")} variant="secondary">
          {t("Read the quickstart")}
        </EmailButton>
      </Section>
      <Text className="email-muted" style={emailStyles.muted}>
        {t("Questions? Just reply to this email.")}
      </Text>
    </EmailLayout>,
  );
}

/** Sent to the new address; the change only happens once this link is opened. */
export function changeEmail({ url, newEmail }: { url: string; newEmail: string }) {
  return build(
    `${t("Confirm your new email")} · ${siteConfig.name}`,
    <EmailLayout preview={t("Confirm the address to finish the change.")} footer={t("Didn't ask for this? Ignore this email and your sign-in address stays the same.")}>
      <EmailHeading muted={t("Then you'll sign in with it.")} intro={t("Click the button to make {email} the email address of your {app} account. The link works for 24 hours.", { email: newEmail, app: siteConfig.name })}>
        {t("Confirm your new email.")}
      </EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={url}>{t("Confirm new email →")}</EmailButton>
      </Section>
      <LinkFallback url={url} />
    </EmailLayout>,
  );
}

/** Heads-up to the current address when someone asks to move the account elsewhere. */
export function emailChangeRequested({ newEmail }: { newEmail: string }) {
  return build(
    `${t("Email change requested")} · ${siteConfig.name}`,
    <EmailLayout preview={t("A change to {email} was requested.", { email: newEmail })} footer={t("Not you? Change your password right away and contact {support}.", { support: siteConfig.supportEmail })}>
      <EmailHeading
        muted={t("Nothing changes until it's confirmed.")}
        intro={t("Someone signed in to your account asked to change its email address to {email}. It takes effect once the link sent to that address is opened.", { email: newEmail })}
      >
        {t("Your email is about to change.")}
      </EmailHeading>
      <Section>
        <EmailButton href={appUrl("/app/settings/account")}>{t("Review account")}</EmailButton>
      </Section>
    </EmailLayout>,
  );
}

export function trialEnding({ endsAt, planName }: { endsAt: Date; planName: string }) {
  const days = Math.max(1, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
  return build(
    `${tp(days, { one: "Your trial ends in {n} day", other: "Your trial ends in {n} days" })} · ${siteConfig.name}`,
    <EmailLayout preview={t("Choose a plan to keep using it.")} footer={t("You're receiving this because your organization's trial is ending.")}>
      <EmailHeading
        muted={t("Keep everything running.")}
        intro={t("Your {plan} trial ends on {date}. After that, your workspace is read-only until you choose a plan. Your data is kept.", { plan: planName, date: formatDate(endsAt) })}
      >
        {tp(days, { one: "Your trial ends in {n} day.", other: "Your trial ends in {n} days." })}
      </EmailHeading>
      <Section>
        <EmailButton href={appUrl("/admin/billing")}>{t("Choose a plan")}</EmailButton>
        <EmailButton href={appUrl("/pricing")} variant="secondary">
          {t("Compare plans")}
        </EmailButton>
      </Section>
    </EmailLayout>,
  );
}

export function errorAlert(p: {
  service: string;
  name: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  count: number;
  firstSeenAt: Date;
  /** First time this error was seen, as opposed to a daily reminder. */
  isNew: boolean;
}) {
  const headline = `${p.name}: ${p.message}`.slice(0, 140);
  const context = Object.entries(p.context ?? {}).filter(([, v]) => v != null && v !== "");
  return build(
    `[error] ${p.service}: ${headline} · ${siteConfig.name}`,
    <EmailLayout preview={headline} footer="Sent to ALERT_EMAIL by error tracking. Repeats at most once a day per error.">
      <EmailHeading muted={p.service}>{p.isNew ? "New error" : "Error still happening"}</EmailHeading>
      <DetailRows
        items={[
          { label: "Error", value: headline },
          { label: "Occurrences", value: String(p.count) },
          { label: "First seen", value: formatDate(p.firstSeenAt) },
          ...context.map(([k, v]) => ({ label: k, value: typeof v === "string" ? v : JSON.stringify(v) })),
        ]}
      />
      {p.stack ? (
        <Section>
          <Text style={{ ...emailStyles.muted, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {p.stack.split("\n").slice(0, 15).join("\n")}
          </Text>
        </Section>
      ) : null}
    </EmailLayout>,
  );
}

export function businessNotice(p: { subject: string; heading: string; muted?: string; rows: (DetailItem | null)[] }) {
  return build(
    `[${siteConfig.name}] ${p.subject}`,
    <EmailLayout preview={p.subject} footer="Sent to NOTIFY_EMAIL.">
      <EmailHeading muted={p.muted}>{p.heading}</EmailHeading>
      <DetailRows items={p.rows} />
      <Section>
        <EmailButton href={appUrl("/staff")}>Open analytics</EmailButton>
      </Section>
    </EmailLayout>,
  );
}

export function twoFactorChanged(change: "enabled" | "disabled" | "replaced" | "backup codes regenerated") {
  const heading = {
    enabled: t("Two-factor authentication enabled."),
    disabled: t("Two-factor authentication disabled."),
    replaced: t("Two-factor authentication replaced."),
    "backup codes regenerated": t("Your backup codes were regenerated."),
  }[change];
  return build(
    `${heading} · ${siteConfig.name}`,
    <EmailLayout preview={heading}>
      <EmailHeading intro={t("If you made this change, no action is needed. If you didn't, reset your password and review your active sessions. Resetting your password does not turn off two-factor authentication.")}>{heading}</EmailHeading>
      <Section><EmailButton href={appUrl("/app/settings/account")}>{t("Review account security")}</EmailButton></Section>
      <Text style={emailStyles.text}>{t("Need help? Contact {support}. Never send us your password, authenticator key or backup codes.", { support: siteConfig.supportEmail })}</Text>
    </EmailLayout>,
  );
}
