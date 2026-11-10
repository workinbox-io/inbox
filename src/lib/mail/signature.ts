/**
 * E-mail signatures (pure): a person's card (per mailbox) and the org's brand (Settings → Mail → Signature template),
 * rendered as plain text and as e-mail-safe HTML (a table with inline styles). prepareMailSend appends both when it
 * sends; the composer and the settings show the same HTML as a preview. Every value is escaped here.
 */
import { ATTACHMENT_KEY, ATTACHMENT_URL_PREFIX } from "@/lib/uploads";

export interface SignatureCard {
  name: string;
  role: string;
  phone: string;
  /** Free lines under the card: the plain-text signature from before the composer. */
  note: string;
  /** The mailbox's address (not stored: it's the sender). */
  email?: string;
}

export interface SignatureBrand {
  company: string;
  website: string;
  /** An uploaded image (/api/files/attachments/…). */
  logoUrl: string;
  color: string;
  /** Small print under every signature: company details, a confidentiality notice. */
  footer: string;
}

export const EMPTY_CARD: SignatureCard = { name: "", role: "", phone: "", note: "" };
export const EMPTY_BRAND: SignatureBrand = { company: "", website: "", logoUrl: "", color: "", footer: "" };
export const DEFAULT_COLOR = "#1a1a1a";

/** `#rrggbb`, or "" for anything else. */
export const brandColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim().toLowerCase() : "");

/** `https://…` for a website typed as `acme.com` or a full http(s) URL; "" when it isn't one. */
export function websiteUrl(w: string) {
  const v = w.trim();
  if (!v) return "";
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(url);
    return u.hostname.includes(".") ? u.href : "";
  } catch {
    return "";
  }
}

/** Only our own uploads can be a logo. */
export const logoPath = (url: string) => (url.startsWith(ATTACHMENT_URL_PREFIX) && ATTACHMENT_KEY.test(url.slice(ATTACHMENT_URL_PREFIX.length)) ? url : "");

/** The brand as stored: invalid values dropped, lengths capped. */
export function cleanBrand(b: Partial<SignatureBrand>): SignatureBrand {
  return {
    company: (b.company ?? "").trim().slice(0, 100),
    website: websiteUrl(b.website ?? "") ? (b.website ?? "").trim().slice(0, 200) : "",
    logoUrl: logoPath(b.logoUrl ?? ""),
    color: brandColor(b.color ?? ""),
    footer: (b.footer ?? "").trim().slice(0, 1000),
  };
}

export function cleanCard(c: Partial<SignatureCard>): SignatureCard {
  return {
    name: (c.name ?? "").trim().slice(0, 100),
    role: (c.role ?? "").trim().slice(0, 100),
    phone: (c.phone ?? "").trim().slice(0, 40),
    note: (c.note ?? "").trim().slice(0, 2000),
    email: (c.email ?? "").trim().slice(0, 254),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s: string) => esc(s).replace(/\r?\n/g, "<br>");
const FONT = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** "Anna Kowalska" → "AK", for the badge shown when there's no logo. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * The signature as text and HTML, or null when there's nothing to show. `appUrl` makes image URLs absolute (sent
 * mail; previews pass ""). The HTML is a company card in the style of signature tools, built from tables and inline
 * styles so Gmail and Outlook keep it: the logo (or an initials badge), the name, role and company in the brand
 * colour, a rule, the contacts with small icons on brand-coloured dots, the note, and the org's small-print footer.
 */
export function renderSignature(card: SignatureCard, brand: SignatureBrand, appUrl: string) {
  const c = cleanCard(card);
  const b = cleanBrand(brand);
  const site = websiteUrl(b.website);
  const siteLabel = site ? b.website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const roleLine = [c.role, b.company].filter(Boolean).join(" · ");
  const person = [c.name, roleLine, c.phone, c.email, siteLabel, c.note].filter(Boolean).join("\n");
  if (!person && !b.footer) return null;
  const text = [person, b.footer].filter(Boolean).join("\n\n");

  const color = b.color || DEFAULT_COLOR;
  const img = (path: string) => esc(appUrl ? new URL(path, appUrl).href : path);
  const badge = initials(c.name || b.company);
  const mark = b.logoUrl
    ? `<img src="${img(b.logoUrl)}" alt="${esc(b.company)}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:14px;object-fit:contain;border:0">`
    : badge
      ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="64" height="64" align="center" valign="middle" style="width:64px;height:64px;border-radius:32px;background:${color};color:#ffffff;font-size:22px;font-weight:600;${FONT}">${esc(badge)}</td></tr></table>`
      : "";
  const head = [
    c.name && `<div style="font-size:17px;font-weight:700;color:#111827;letter-spacing:-0.2px;line-height:1.3">${esc(c.name)}</div>`,
    c.role && `<div style="margin-top:2px;font-size:13px;color:#6b7280">${esc(c.role)}</div>`,
    b.company && `<div style="margin-top:6px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${color}">${esc(b.company)}</div>`,
  ].filter(Boolean);
  const contact = (icon: string, label: string, href: string) =>
    `<td valign="middle" style="padding:0 16px 6px 0;white-space:nowrap"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>` +
    `<td width="22" height="22" align="center" valign="middle" style="width:22px;height:22px;border-radius:11px;background:${color}"><img src="${img(`/email/sig-${icon}.png`)}" alt="" width="12" height="12" style="display:block;width:12px;height:12px;border:0"></td>` +
    `<td valign="middle" style="padding-left:7px;font-size:12.5px"><a href="${esc(href)}" style="color:#374151;text-decoration:none">${esc(label)}</a></td>` +
    `</tr></table></td>`;
  const contacts = [
    c.phone && contact("phone", c.phone, `tel:${c.phone.replace(/[^\d+]/g, "")}`),
    c.email && contact("mail", c.email, `mailto:${c.email}`),
    site && contact("globe", siteLabel, site),
  ].filter(Boolean);
  const rows = [
    // The head in its own table: in one with the wider rows below, the logo's column would stretch.
    head.length || mark
      ? `<tr><td style="padding-bottom:12px"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${mark ? `<td valign="middle" style="padding-right:16px">${mark}</td>` : ""}<td valign="middle">${head.join("")}</td></tr></table></td></tr>`
      : "",
    contacts.length ? `<tr><td style="padding-top:12px;border-top:1px solid #e5e7eb"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${contacts.join("")}</tr></table></td></tr>` : "",
    c.note ? `<tr><td style="padding-top:6px;font-size:12px;color:#6b7280">${lines(c.note)}</td></tr>` : "",
    b.footer ? `<tr><td style="padding-top:14px;font-size:10.5px;line-height:1.5;color:#9ca3af">${lines(b.footer)}</td></tr>` : "",
  ].filter(Boolean);
  const html = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;max-width:540px;border-collapse:collapse;${FONT};line-height:1.45;color:#374151">${rows.join("")}</table>`;
  return { text, html };
}

/** What the mail app knows of a mailbox's signature (pages/app/mail.astro): the note, the sender name, the card. */
export interface MailboxSignature {
  signature: string;
  name?: string;
  card?: { name: string; role: string; phone: string } | null;
}

/** The HTML a mailbox sends as its signature, for previews (the logo URL stays relative, same on server and page). */
export function signaturePreview(s: MailboxSignature | undefined, brand: SignatureBrand, email = "") {
  if (!s) return null;
  return renderSignature({ name: s.card?.name || s.name || "", role: s.card?.role ?? "", phone: s.card?.phone ?? "", note: s.signature, email }, brand, "")?.html ?? null;
}
