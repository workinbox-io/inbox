/** The e-mail summary of what stayed unread in the bell (lib/server/notifications.ts `sendNotificationDigests`). */
import * as React from "react";
import { Section, Text, render, toPlainText } from "react-email";
import { siteConfig } from "@/config/site";
import { t, tp } from "@/lib/i18n/panel";
import type { NotifyKind } from "@/lib/notifications";
import { EmailButton, EmailHeading, EmailLayout } from "./components";
import { appUrl } from "./urls";

const verb = (kind: NotifyKind, actor: string) =>
  ({
    share: t("{actor} shared this with you", { actor }),
    invite: t("{actor} invited you", { actor }),
    assign: t("{actor} assigned you", { actor }),
    mention: t("{actor} mentioned you", { actor }),
    comment: t("{actor} commented", { actor }),
    update: t("{actor} updated it", { actor }),
    automation: "",
  })[kind];

export async function notificationDigestEmail(p: { name: string; items: { kind: NotifyKind; title: string; body: string; actor: string | null; href: string }[] }) {
  const n = p.items.length;
  const subject = tp(n, { one: "{n} update you haven't seen in {app}", other: "{n} updates you haven't seen in {app}" }, { app: siteConfig.name });
  const html = await render(
    <EmailLayout preview={p.items.slice(0, 2).map((i) => i.title).join(" · ")} footer={t("Turn this summary off in {app}: Settings → Notifications.", { app: siteConfig.name })}>
      <EmailHeading muted={p.name ? t("Hi {name},", { name: p.name.split(" ")[0] }) : undefined}>{subject}</EmailHeading>
      <Section>
        {p.items.map((i, k) => (
          <Text key={k} style={{ margin: "0 0 12px", fontSize: 14, lineHeight: "20px" }}>
            <a href={appUrl(i.href)} style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}>{i.title}</a>
            <br />
            <span style={{ color: "#6b7280" }}>{[i.kind === "automation" ? "" : verb(i.kind, i.actor ?? t("Someone")), i.body].filter(Boolean).join(" · ")}</span>
          </Text>
        ))}
      </Section>
      <Section>
        <EmailButton href={appUrl("/app/mail")}>{t("Open {app}", { app: siteConfig.name })}</EmailButton>
      </Section>
    </EmailLayout>,
  );
  return { subject, html, text: toPlainText(html) };
}
