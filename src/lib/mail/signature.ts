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
  /** The person's photo or their own logo (an upload); shown instead of the org's logo. */
  photoUrl?: string;
  /** Crop the photo to a circle (default); false keeps its shape in a rounded square, for a logo. */
  photoRound?: boolean;
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
export const DEFAULT_COLOR = "#595959";

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
    photoUrl: logoPath(c.photoUrl ?? ""),
    photoRound: c.photoRound !== false,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s: string) => esc(s).replace(/\r?\n/g, "<br>");
const GREY = DEFAULT_COLOR;
const FONT = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The signature as text and HTML, or null when there's nothing to show. `appUrl` makes the logo URL absolute (sent
 * mail; previews pass ""). The HTML is minimal and built from tables with inline styles so Gmail and Outlook keep it.
 * An explicitly configured brand colour adds a short rule above the signature.
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

  // The person's own picture wins over the org's logo. A round photo is cropped to a circle; a logo keeps its shape.
  const picture = c.photoUrl || b.logoUrl;
  const round = !!c.photoUrl && c.photoRound;
  const size = round
    ? `width="40" height="40" style="display:block;width:40px;height:40px;border-radius:20px;object-fit:cover;border:0"`
    : `width="100" style="display:block;width:100px;max-width:100%;height:auto;border:0"`;
  const logo = picture
    ? `<tr><td style="padding-bottom:16px"><img src="${esc(appUrl ? new URL(picture, appUrl).href : picture)}" alt="${esc(c.photoUrl ? c.name : b.company)}" ${size}></td></tr>`
    : "";
  const contacts = [
    c.phone && `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}" style="color:${GREY};text-decoration:underline">${esc(c.phone)}</a>`,
    c.email && `<a href="mailto:${esc(c.email)}" style="color:${GREY};text-decoration:underline">${esc(c.email)}</a>`,
    site && `<a href="${esc(site)}" style="color:${GREY};text-decoration:underline">${esc(siteLabel)}</a>`,
  ].filter(Boolean);
  const rows = [
    logo,
    c.name ? `<tr><td style="font-weight:600">${esc(c.name)}</td></tr>` : "",
    roleLine ? `<tr><td>${esc(roleLine)}</td></tr>` : "",
    ...contacts.map((contact) => `<tr><td>${contact}</td></tr>`),
    c.note ? `<tr><td>${lines(c.note)}</td></tr>` : "",
    b.footer ? `<tr><td style="padding-top:${person ? "8px" : "0"}">${lines(b.footer)}</td></tr>` : "",
  ].filter(Boolean);
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;max-width:540px;${FONT};font-size:13px;line-height:1.5;color:${GREY};text-align:left;letter-spacing:-0.01em;overflow-wrap:anywhere">${b.color ? `<tr><td><div style="width:32px;border-top:1px solid ${b.color}"></div></td></tr>` : ""}${rows.join("")}</table>`;
  return { text, html };
}

/** What the mail app knows of a mailbox's signature (pages/app/mail.astro): the note, the sender name, the card. */
export interface MailboxSignature {
  signature: string;
  name?: string;
  card?: { name: string; role: string; phone: string; photoUrl?: string; photoRound?: boolean } | null;
}

/** The HTML a mailbox sends as its signature, for previews (the logo URL stays relative, same on server and page). */
export function signaturePreview(s: MailboxSignature | undefined, brand: SignatureBrand, email = "") {
  if (!s) return null;
  return renderSignature({ name: s.card?.name || s.name || "", role: s.card?.role ?? "", phone: s.card?.phone ?? "", note: s.signature, email, photoUrl: s.card?.photoUrl, photoRound: s.card?.photoRound }, brand, "")?.html ?? null;
}
