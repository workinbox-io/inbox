// Explicit React import: works with both the classic and automatic JSX runtimes.
import * as React from "react";
import type { ReactElement } from "react";
import { Section, Text, render, toPlainText } from "react-email";
import { siteConfig } from "@/config/site";
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
  d.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export function verifyEmail(url: string) {
  return build(
    `Confirm your email · ${siteConfig.name}`,
    <EmailLayout preview="Confirm your email to start your free trial." footer="Didn't create an account? Ignore this email and nothing will happen.">
      <EmailHeading muted="Then you're in." intro="Click the button to confirm your email address and open your dashboard. The link works for 24 hours.">
        Confirm your email.
      </EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={url}>Confirm email →</EmailButton>
      </Section>
      <LinkFallback url={url} />
    </EmailLayout>,
  );
}

export function resetPassword(url: string) {
  return build(
    `Reset your password · ${siteConfig.name}`,
    <EmailLayout preview="The link works for one hour." footer="Didn't ask to reset your password? Ignore this email. Your password stays the same.">
      <EmailHeading muted="The link works for one hour.">Reset your password.</EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={url}>Choose a new password →</EmailButton>
      </Section>
      <LinkFallback url={url} />
    </EmailLayout>,
  );
}

export function invitation(p: { orgName: string; inviterName: string; url: string }) {
  return build(
    `${p.inviterName} invited you to ${p.orgName} · ${siteConfig.name}`,
    <EmailLayout
      preview={`Join ${p.orgName} on ${siteConfig.name}.`}
      footer="The invitation expires in 7 days. Weren't expecting it? Ignore this email."
    >
      <EmailHeading muted={`Join ${p.orgName}.`} intro={`${p.inviterName} invited you to work together on ${siteConfig.name}.`}>
        You're invited.
      </EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={p.url}>Accept invitation →</EmailButton>
      </Section>
      <LinkFallback url={p.url} />
    </EmailLayout>,
  );
}

/** Sent instead of an error when someone signs up with a registered address (no account enumeration). */
export function existingAccount() {
  return build(
    `You already have an account · ${siteConfig.name}`,
    <EmailLayout preview="Someone tried to sign up with your email address." footer="If this wasn't you, no action is needed. Your account is unchanged.">
      <EmailHeading muted="Sign in instead." intro="Someone just tried to create an account with this email address. If it was you, sign in or reset your password.">
        You already have an account.
      </EmailHeading>
      <Section>
        <EmailButton href={appUrl("/login")}>Sign in</EmailButton>
        <EmailButton href={appUrl("/forgot-password")} variant="secondary">
          Reset password
        </EmailButton>
      </Section>
    </EmailLayout>,
  );
}

export function welcome({ name, trialDays }: { name: string; trialDays: number }) {
  return build(
    `Welcome to ${siteConfig.name}`,
    <EmailLayout preview={`Your ${trialDays}-day trial has started.`}>
      <EmailHeading
        muted={`Your ${trialDays}-day trial has started.`}
        intro={`Hi ${name}, your account is ready. Three steps to get going:`}
      >
        Welcome to {siteConfig.name}.
      </EmailHeading>
      {/* Replace with your product's first steps. */}
      <DetailRows
        items={[
          { label: "1. Create a project", value: "It takes a few seconds" },
          { label: "2. Invite your team", value: "Settings → Organization" },
          { label: "3. Connect the API", value: "Settings → API keys" },
        ]}
      />
      <Section style={{ margin: "0 0 20px" }}>
        <EmailButton href={appUrl("/app/projects")}>Create your first project</EmailButton>
        <EmailButton href={appUrl("/docs/quickstart")} variant="secondary">
          Read the quickstart
        </EmailButton>
      </Section>
      <Text className="email-muted" style={emailStyles.muted}>
        Questions? Just reply to this email.
      </Text>
    </EmailLayout>,
  );
}

/** Sent to the new address; the change only happens once this link is opened. */
export function changeEmail({ url, newEmail }: { url: string; newEmail: string }) {
  return build(
    `Confirm your new email · ${siteConfig.name}`,
    <EmailLayout preview="Confirm the address to finish the change." footer="Didn't ask for this? Ignore this email and your sign-in address stays the same.">
      <EmailHeading muted="Then you'll sign in with it." intro={`Click the button to make ${newEmail} the email address of your ${siteConfig.name} account. The link works for 24 hours.`}>
        Confirm your new email.
      </EmailHeading>
      <Section style={{ margin: "0 0 26px" }}>
        <EmailButton href={url}>Confirm new email →</EmailButton>
      </Section>
      <LinkFallback url={url} />
    </EmailLayout>,
  );
}

/** Heads-up to the current address when someone asks to move the account elsewhere. */
export function emailChangeRequested({ newEmail }: { newEmail: string }) {
  return build(
    `Email change requested · ${siteConfig.name}`,
    <EmailLayout preview={`A change to ${newEmail} was requested.`} footer={`Not you? Change your password right away and contact ${siteConfig.supportEmail}.`}>
      <EmailHeading
        muted="Nothing changes until it's confirmed."
        intro={`Someone signed in to your account asked to change its email address to ${newEmail}. It takes effect once the link sent to that address is opened.`}
      >
        Your email is about to change.
      </EmailHeading>
      <Section>
        <EmailButton href={appUrl("/app/settings/account")}>Review account</EmailButton>
      </Section>
    </EmailLayout>,
  );
}

export function trialEnding({ endsAt, planName }: { endsAt: Date; planName: string }) {
  const days = Math.max(1, Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000));
  return build(
    `Your trial ends in ${days} day${days === 1 ? "" : "s"} · ${siteConfig.name}`,
    <EmailLayout preview="Choose a plan to keep using it." footer="You're receiving this because your organization's trial is ending.">
      <EmailHeading
        muted="Keep everything running."
        intro={`Your ${planName} trial ends on ${formatDate(endsAt)}. After that, your workspace is read-only until you choose a plan. Your data is kept.`}
      >
        Your trial ends in {days} day{days === 1 ? "" : "s"}.
      </EmailHeading>
      <Section>
        <EmailButton href={appUrl("/app/billing")}>Choose a plan</EmailButton>
        <EmailButton href={appUrl("/pricing")} variant="secondary">
          Compare plans
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
        <EmailButton href={appUrl("/app/admin")}>Open analytics</EmailButton>
      </Section>
    </EmailLayout>,
  );
}
