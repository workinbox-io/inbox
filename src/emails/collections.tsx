/** A collection automation's e-mail (lib/server/collection-automations.ts): what happened, the record, a button to it. */
import * as React from "react";
import { Section, render, toPlainText } from "react-email";
import { siteConfig } from "@/config/site";
import { t } from "@/lib/i18n/panel";
import { DetailRows, EmailButton, EmailHeading, EmailLayout } from "./components";
import { appUrl } from "./urls";

export async function collectionAutomationEmail(p: { collection: string; title: string; event: string; rows: { label: string; value: string }[]; recordId: string }) {
  const subject = `${p.collection}: ${p.title}`;
  const html = await render(
    <EmailLayout preview={`${p.event}: ${p.title}`} footer={t("An automation on {collection} in {app} sent this.", { collection: p.collection, app: siteConfig.name })}>
      <EmailHeading muted={p.event}>{p.title}</EmailHeading>
      <DetailRows items={p.rows} />
      <Section>
        <EmailButton href={appUrl(`/app/open/record/${p.recordId}`)}>{t("Open in {collection}", { collection: p.collection })}</EmailButton>
      </Section>
    </EmailLayout>,
  );
  return { subject, html, text: toPlainText(html) };
}
