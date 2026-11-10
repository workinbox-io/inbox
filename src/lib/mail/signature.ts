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

/**
 * The signature as text and HTML, or null when there's nothing to show. `appUrl` makes the logo URL absolute (sent
 * mail; previews pass ""). The HTML is minimal and built from tables with inline styles so Gmail and Outlook keep it:
 * a small logo next to the name and "role · company", one grey line of contacts (the website in the brand colour),
 * the note, and the org's small-print footer.
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
  const logo = b.logoUrl
    ? `<td valign="middle" style="padding-right:12px"><img src="${esc(appUrl ? new URL(b.logoUrl, appUrl).href : b.logoUrl)}" alt="${esc(b.company)}" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:8px;object-fit:contain;border:0"></td>`
    : "";
  const head = [
    c.name && `<div style="font-size:14px;font-weight:600;color:#111827">${esc(c.name)}</div>`,
    roleLine && `<div style="font-size:13px;color:#6b7280">${esc(roleLine)}</div>`,
  ].filter(Boolean);
  const dot = `<span style="color:#d1d5db">&nbsp;·&nbsp;</span>`;
  const contacts = [
    c.phone && `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}" style="color:#6b7280;text-decoration:none">${esc(c.phone)}</a>`,
    c.email && `<a href="mailto:${esc(c.email)}" style="color:#6b7280;text-decoration:none">${esc(c.email)}</a>`,
    site && `<a href="${esc(site)}" style="color:${color};text-decoration:none">${esc(siteLabel)}</a>`,
  ].filter(Boolean);
  const rows = [
    head.length || logo ? `<tr><td><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${logo}<td valign="middle">${head.join("")}</td></tr></table></td></tr>` : "",
    contacts.length ? `<tr><td style="padding-top:8px;font-size:12.5px">${contacts.join(dot)}</td></tr>` : "",
    c.note ? `<tr><td style="padding-top:4px;font-size:12.5px;color:#6b7280">${lines(c.note)}</td></tr>` : "",
    b.footer ? `<tr><td style="padding-top:12px;font-size:10.5px;line-height:1.5;color:#9ca3af">${lines(b.footer)}</td></tr>` : "",
  ].filter(Boolean);
  const html = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;max-width:540px;border-collapse:collapse;${FONT};line-height:1.5;color:#374151">${rows.join("")}</table>`;
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
