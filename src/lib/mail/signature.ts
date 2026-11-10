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
}

export interface SignatureBrand {
  company: string;
  website: string;
  /** An uploaded image (/api/files/attachments/…). */
  logoUrl: string;
  color: string;
}

export const EMPTY_CARD: SignatureCard = { name: "", role: "", phone: "", note: "" };
export const EMPTY_BRAND: SignatureBrand = { company: "", website: "", logoUrl: "", color: "" };
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
  };
}

export function cleanCard(c: Partial<SignatureCard>): SignatureCard {
  return {
    name: (c.name ?? "").trim().slice(0, 100),
    role: (c.role ?? "").trim().slice(0, 100),
    phone: (c.phone ?? "").trim().slice(0, 40),
    note: (c.note ?? "").trim().slice(0, 2000),
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
 * The signature as text and HTML, or null when there's nothing to show. `appUrl` makes the logo URL absolute (sent
 * mail). The HTML is a modern card built from tables and inline styles, so Gmail and Outlook keep it: the logo (or an
 * initials badge in the brand colour), a thin brand-coloured rule, the name, the role and company, and one line of
 * contacts.
 */
export function renderSignature(card: SignatureCard, brand: SignatureBrand, appUrl: string) {
  const c = cleanCard(card);
  const b = cleanBrand(brand);
  const site = websiteUrl(b.website);
  const siteLabel = site ? b.website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const roleLine = [c.role, b.company].filter(Boolean).join(" · ");
  const text = [c.name, roleLine, c.phone, siteLabel, c.note].filter(Boolean).join("\n");
  if (!text) return null;

  const color = b.color || DEFAULT_COLOR;
  const badge = initials(c.name || b.company);
  const mark = b.logoUrl
    ? `<img src="${esc(appUrl ? new URL(b.logoUrl, appUrl).href : b.logoUrl)}" alt="${esc(b.company)}" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:12px;object-fit:contain;border:0">`
    : badge
      ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:26px;background:${color};color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;${FONT}">${esc(badge)}</td></tr></table>`
      : "";
  const role = [c.role && `<span style="color:#6b7280">${esc(c.role)}</span>`, b.company && `<span style="color:#111827;font-weight:500">${esc(b.company)}</span>`]
    .filter(Boolean)
    .join(`<span style="color:#d1d5db">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);
  const contacts = [
    c.phone && `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}" style="color:#374151;text-decoration:none">${esc(c.phone)}</a>`,
    site && `<a href="${esc(site)}" style="color:${color};text-decoration:none;font-weight:500">${esc(siteLabel)}</a>`,
  ]
    .filter(Boolean)
    .join(`<span style="color:#d1d5db">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`);
  const rows = [
    c.name && `<div style="font-size:15px;font-weight:600;color:#111827;letter-spacing:-0.1px">${esc(c.name)}</div>`,
    role && `<div style="margin-top:2px;font-size:13px">${role}</div>`,
    contacts && `<div style="margin-top:8px;font-size:12.5px">${contacts}</div>`,
    c.note && `<div style="margin-top:8px;font-size:12px;color:#9ca3af">${lines(c.note)}</div>`,
  ].filter(Boolean);
  const markCell = mark ? `<td valign="top" style="padding-right:14px">${mark}</td>` : "";
  const html = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-collapse:collapse;${FONT};line-height:1.45;color:#374151"><tr>${markCell}<td valign="top" style="border-left:2px solid ${color};padding-left:14px">${rows.join("")}</td></tr></table>`;
  return { text, html };
}

/** What the mail app knows of a mailbox's signature (pages/app/mail.astro): the note, the sender name, the card. */
export interface MailboxSignature {
  signature: string;
  name?: string;
  card?: { name: string; role: string; phone: string } | null;
}

/** The HTML a mailbox sends as its signature, for previews (the logo URL stays relative, same on server and page). */
export function signaturePreview(s: MailboxSignature | undefined, brand: SignatureBrand) {
  if (!s) return null;
  return renderSignature({ name: s.card?.name || s.name || "", role: s.card?.role ?? "", phone: s.card?.phone ?? "", note: s.signature }, brand, "")?.html ?? null;
}
