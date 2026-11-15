// Explicit React import: works with both the classic and automatic JSX runtimes.
import * as React from "react";
// E-mail building blocks: logo, a flat grey tile for the content, pill buttons, detail rows.
import type { CSSProperties, ReactNode } from "react";
import { Body, Button, Column, Container, Head, Heading, Html, Img, Preview, Row, Section, Text } from "react-email";
import { siteConfig } from "@/config/site";
import { EMAIL_COLORS } from "./colors";
import { appUrl } from "./urls";

const light = EMAIL_COLORS.light;
const dark = EMAIL_COLORS.dark;

/** Figtree loads in Apple Mail and iOS; Gmail and Outlook fall back to the system sans. */
const FONT = "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap";

const responsiveStyles = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-body, .email-body > table > tbody > tr > td { background-color: ${dark.background} !important; }
    .email-wordmark, .email-heading, .email-text, .email-strong { color: ${dark.foreground} !important; }
    .email-muted, .email-footer, .email-footer a { color: ${dark.mutedForeground} !important; }
    .email-card { background-color: ${dark.surface} !important; }
    .email-inset { background-color: ${dark.inset} !important; }
    .email-divider, .email-divider > td { border-color: ${dark.border} !important; }
    .email-link { color: ${dark.accent} !important; }
    .email-button-secondary { background-color: ${dark.inset} !important; color: ${dark.foreground} !important; }
  }
  /* Phones. react-email puts a Container's or Section's padding on its inner td, so these target that td. */
  @media only screen and (max-width: 520px) {
    .email-container > tbody > tr > td { padding: 16px 12px 28px !important; }
    .email-card > tbody > tr > td { padding: 24px 20px !important; }
    .email-header { margin-bottom: 14px !important; }
    h1.email-heading { font-size: 22px !important; margin-bottom: 18px !important; }
    .email-button, .email-button-secondary { display: block !important; margin: 0 0 8px !important; text-align: center !important; }
    .email-detail-label, .email-detail-value { display: block !important; width: auto !important; text-align: start !important; }
    .email-detail-label { border-bottom: 0 !important; padding: 11px 0 2px !important; }
    .email-detail-value { border-top: 0 !important; padding: 0 0 11px !important; }
  }
`;

export const emailStyles = {
  heading: { color: light.foreground, fontSize: "26px", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: "1.15", margin: "0 0 24px" },
  text: { color: light.foreground, fontSize: "15px", lineHeight: "1.6", margin: 0 },
  muted: { color: light.mutedForeground, fontSize: "14px", lineHeight: "1.6", margin: 0 },
  link: { color: light.accent, textDecoration: "underline" },
} as const satisfies Record<string, CSSProperties>;

/** Shell of every e-mail: logo on white, content on a flat grey tile, footer below. */
export function EmailLayout({ preview, children, footer }: { preview: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <link href={FONT_CSS} rel="stylesheet" />
        <style>{responsiveStyles}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="email-body" style={{ backgroundColor: light.background, margin: 0, padding: 0, fontFamily: FONT }}>
        <Container
          className="email-container"
          style={{ boxSizing: "border-box", margin: "0 auto", maxWidth: "576px", padding: "36px 16px", width: "100%" }}
        >
          <Row className="email-header" style={{ margin: "0 0 20px", padding: "0 4px" }}>
            <Column style={{ width: "35px", verticalAlign: "middle" }}>
              {/* Absolute PNG: many clients don't load SVG or relative URLs. 48 px file (public/email/logo.png) shown at 24 px. */}
              <Img src={appUrl("/email/logo.png")} width="24" height="24" alt="" style={{ display: "block" }} />
            </Column>
            <Column style={{ verticalAlign: "middle" }}>
              <Text
                className="email-wordmark"
                style={{ color: light.foreground, fontSize: "18px", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: "26px", margin: 0 }}
              >
                {siteConfig.name}
              </Text>
            </Column>
          </Row>

          <Section className="email-card" style={{ backgroundColor: light.surface, borderRadius: "18px", boxSizing: "border-box", padding: "32px" }}>
            {children}
          </Section>

          <Section style={{ padding: "24px 4px 0" }}>
            {footer ? (
              <Text className="email-footer" style={{ color: light.mutedForeground, fontSize: "12.5px", lineHeight: "1.6", margin: "0 0 4px" }}>
                {footer}
              </Text>
            ) : null}
            <Text className="email-footer" style={{ color: light.mutedForeground, fontSize: "12.5px", lineHeight: "1.6", margin: 0 }}>
              {`${siteConfig.name} · ${siteConfig.supportEmail}`}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Two-tone heading, the site's signature: statement in ink, continuation muted. */
export function EmailHeading({ children, muted, intro }: { children: ReactNode; muted?: ReactNode; intro?: ReactNode }) {
  return (
    <>
      <Heading as="h1" className="email-heading" style={{ ...emailStyles.heading, margin: intro ? "0 0 12px" : "0 0 24px" }}>
        {children}
        {muted ? (
          <>
            {" "}
            <span className="email-muted" style={{ color: light.mutedForeground }}>
              {muted}
            </span>
          </>
        ) : null}
      </Heading>
      {intro ? (
        <Text className="email-muted" style={{ ...emailStyles.muted, fontSize: "15px", margin: "0 0 24px" }}>
          {intro}
        </Text>
      ) : null}
    </>
  );
}

/** Pill button: solid brand blue, or a white pill on the grey tile. */
export function EmailButton({ href, children, variant = "primary" }: { href: string; children: string; variant?: "primary" | "secondary" }) {
  const primary = variant === "primary";
  return (
    <Button
      className={primary ? "email-button" : "email-button-secondary"}
      href={href}
      style={{
        backgroundColor: primary ? light.primary : light.inset,
        borderRadius: "9999px",
        color: primary ? light.primaryForeground : light.foreground,
        fontSize: "15px",
        fontWeight: 500,
        lineHeight: "1.2",
        // Inline-block: when two buttons wrap, the second needs space above it.
        margin: "0 6px 8px 0",
        padding: "12px 22px",
        textDecoration: "none",
      }}
    >
      {children}
    </Button>
  );
}

export type DetailItem = { label: string; value: ReactNode };

/** Receipt-style rows: label left, value right, hairlines between. On phones the value goes under its label. */
export function DetailRows({ items }: { items: (DetailItem | null | false | undefined)[] }) {
  const rows = items.filter((item): item is DetailItem => Boolean(item));
  if (!rows.length) return null;
  const cell = (index: number): CSSProperties => ({
    borderBottom: `1px solid ${light.border}`,
    borderTop: index === 0 ? `1px solid ${light.border}` : undefined,
    fontSize: "14px",
    lineHeight: "1.45",
    verticalAlign: "top",
  });
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse", margin: "0 0 24px", width: "100%" }}>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.label} className="email-divider">
            <td className="email-muted email-divider email-detail-label" style={{ ...cell(index), color: light.mutedForeground, padding: "11px 16px 11px 0", width: "38%" }}>
              {row.label}
              {/* Hidden in HTML; separates label and value in the plain-text version. */}
              <span style={{ display: "none", msoHide: "all" } as CSSProperties}>: </span>
            </td>
            <td className="email-text email-divider email-detail-value" style={{ ...cell(index), color: light.foreground, padding: "11px 0", textAlign: "right", overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {row.value}
              <span style={{ display: "none", msoHide: "all" } as CSSProperties}>
                <br />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Button not working?" fallback with the raw URL. */
export function LinkFallback({ url }: { url: string }) {
  return (
    <Text className="email-muted" style={{ ...emailStyles.muted, fontSize: "13px" }}>
      Button not working? Paste this address into your browser:
      <br />
      <a className="email-link" href={url} style={{ ...emailStyles.link, wordBreak: "break-all" }}>
        {url}
      </a>
    </Text>
  );
}
