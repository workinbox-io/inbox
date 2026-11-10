/**
 * Organizations' mail: folders, addresses, sender rules, spam scoring and the DNS records a domain
 * needs. Pure module (no cloudflare:workers), used by the server, the dashboard and the tests.
 */

export const USER_MAIL_FOLDERS = ["inbox", "starred", "snoozed", "sent", "archived", "spam", "trash"] as const;
export type UserMailFolder = (typeof USER_MAIL_FOLDERS)[number];

/** Domain names: labels of letters, digits and dashes, at least one dot. */
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** The local part we allow for our own addresses: simple and unambiguous. */
const LOCAL = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;

export const normalizeDomain = (d: string) => d.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
export const isValidDomain = (d: string) => DOMAIN.test(d);
export const isValidLocalPart = (l: string) => LOCAL.test(l) && !l.includes("..");

export function splitAddress(address: string) {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  return at > 0 ? { local: a.slice(0, at), domain: a.slice(at + 1) } : null;
}

/** Plus addressing: anna+news@acme.com delivers to anna@acme.com. */
export function baseAddress(address: string) {
  const parts = splitAddress(address);
  if (!parts) return address.trim().toLowerCase();
  return `${parts.local.split("+")[0]}@${parts.domain}`;
}

/** A first suggestion for a member's address: "Anna Kowalska" → anna.kowalska. */
export function suggestLocalPart(name: string) {
  const plain = name
    .toLowerCase()
    .replace(/[łø]/g, (c) => ({ ł: "l", ø: "o" })[c]!)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
  return plain || "user";
}

export interface SenderRule {
  pattern: string;
  action: "block" | "allow";
  /** Rules of one mailbox beat the org's. */
  mailboxId: string | null;
}

/** Whether a rule pattern (an address or "@domain") matches a sender. */
export function patternMatches(pattern: string, sender: string) {
  const p = pattern.trim().toLowerCase();
  const s = sender.trim().toLowerCase();
  if (p.startsWith("@")) return s.endsWith(p) || s.endsWith(`.${p.slice(1)}`);
  return p === s;
}

/** The rule that decides a sender: the mailbox's own rules first, then the org's; allow wins a tie. */
export function senderVerdict(rules: SenderRule[], sender: string, mailboxId: string): "block" | "allow" | null {
  for (const scope of [mailboxId, null]) {
    const hits = rules.filter((r) => r.mailboxId === scope && patternMatches(r.pattern, sender));
    if (hits.some((r) => r.action === "allow")) return "allow";
    if (hits.length) return "block";
  }
  return null;
}

export interface AuthResults {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

/** spf=, dkim= and dmarc= results from Authentication-Results headers (Cloudflare Email Routing adds one). */
export function parseAuthResults(header: string | null | undefined): AuthResults {
  const h = (header ?? "").toLowerCase();
  const pick = (k: string) => h.match(new RegExp(`\\b${k}=([a-z]+)`))?.[1] ?? null;
  return { spf: pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc") };
}

export interface SpamInput {
  auth: AuthResults;
  /** Values of headers we look at, lower-cased names. */
  headers: Record<string, string | null | undefined>;
  subject: string;
  text: string;
  fromEmail: string;
}

const SPAM_WORDS = /\b(viagra|cialis|casino|lottery|crypto ?giveaway|you have won|bitcoin doubl|wire transfer urgent|act now|100% free|click here to claim)\b/i;

/**
 * A simple spam score: failed sender authentication counts most, then shouting, spammy words and
 * spam flags set by upstream filters. 5 or more goes to Spam. Reasons are kept with the message.
 */
export function spamScore(input: SpamInput) {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (input.auth.dmarc === "fail") add(5, "DMARC failed");
  if (input.auth.spf === "fail") add(2, "SPF failed");
  else if (input.auth.spf === "softfail") add(1, "SPF soft-failed");
  if (input.auth.dkim === "fail") add(2, "DKIM failed");
  if (!input.auth.spf && !input.auth.dkim) add(1, "No sender authentication");
  if ((input.headers["x-spam-flag"] ?? "").toLowerCase().startsWith("yes")) add(5, "Marked as spam upstream");
  const letters = input.subject.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) add(1, "Subject in capitals");
  if (SPAM_WORDS.test(`${input.subject}\n${input.text.slice(0, 5000)}`)) add(3, "Spam phrases");
  if (!input.fromEmail.includes("@")) add(2, "Invalid sender");
  return { score, spam: score >= 5, reasons };
}

export interface DnsRecord {
  /** What the record is for, shown in the setup checklist (a key of mail_domains.checks). */
  purpose: "mx" | "spf" | "dmarc" | "dkim" | "mailfrom";
  type: "MX" | "TXT" | "CNAME";
  name: string;
  value: string;
  priority?: number;
}

/** Amazon SES (hosted mode, the org's own domains): its region and the domain's Easy DKIM tokens. */
export interface SesSetup {
  region: string;
  tokens: string[];
}

/** The custom MAIL FROM subdomain (Return-Path) of a domain sending through SES. */
export const mailFromDomain = (domain: string) => `bounce.${domain}`;

const DMARC = "v=DMARC1; p=quarantine; adkim=r; aspf=r";

/**
 * Records a domain needs. Cloudflare (self-hosted, and our own subdomains): Email Routing receives, Email Service
 * sends; its DKIM records come from Cloudflare when the domain is onboarded, so they are checked, not listed.
 * SES (hosted, the org's own domain): SES receives (MX) and sends (Easy DKIM CNAMEs, MAIL FROM on bounce.<domain>).
 */
/** MX priorities don't matter (Email Routing picks its own); any DMARC policy passes the check. */
export function requiredDnsRecords(domain: string, ses?: SesSetup | null): DnsRecord[] {
  if (ses) {
    const bounce = mailFromDomain(domain);
    return [
      { purpose: "mx", type: "MX", name: domain, value: `inbound-smtp.${ses.region}.amazonaws.com`, priority: 10 },
      ...ses.tokens.map((t): DnsRecord => ({ purpose: "dkim", type: "CNAME", name: `${t}._domainkey.${domain}`, value: `${t}.dkim.amazonses.com` })),
      { purpose: "mailfrom", type: "MX", name: bounce, value: `feedback-smtp.${ses.region}.amazonses.com`, priority: 10 },
      { purpose: "mailfrom", type: "TXT", name: bounce, value: "v=spf1 include:amazonses.com ~all" },
      { purpose: "dmarc", type: "TXT", name: `_dmarc.${domain}`, value: DMARC },
    ];
  }
  return [
    { purpose: "mx", type: "MX", name: domain, value: "route1.mx.cloudflare.net" },
    { purpose: "mx", type: "MX", name: domain, value: "route2.mx.cloudflare.net" },
    { purpose: "mx", type: "MX", name: domain, value: "route3.mx.cloudflare.net" },
    { purpose: "spf", type: "TXT", name: domain, value: "v=spf1 include:_spf.mx.cloudflare.net ~all" },
    { purpose: "dmarc", type: "TXT", name: `_dmarc.${domain}`, value: DMARC },
  ];
}

/** What a DNS check found, from the MX and TXT answers (DNS-over-HTTPS). With `sesRegion`, MX must point at SES. */
export function evaluateDns(answers: { mx: string[]; txt: string[]; dmarc: string[] }, sesRegion?: string) {
  const mxHost = sesRegion ? new RegExp(`\\sinbound-smtp\\.${sesRegion.replace(/\W/g, "\\$&")}\\.amazonaws\\.com\\.?$`, "i") : /\.mx\.cloudflare\.net\.?$/i;
  const mx = answers.mx.some((r) => mxHost.test(` ${r.trim()}`));
  const spf = !sesRegion && answers.txt.some((r) => /^"?v=spf1\b/i.test(r.trim()) && /_spf\.mx\.cloudflare\.net/i.test(r));
  const dmarc = answers.dmarc.some((r) => /^"?v=DMARC1/i.test(r.trim()));
  return { mx, spf, dmarc, active: mx };
}

/** Search operators: from:, to:, subject:, has:attachment, is:unread, is:starred; the rest is free text. */
export function parseQuery(q: string) {
  const out = { labels: [] as string[], text: [] as string[], from: [] as string[], to: [] as string[], subject: [] as string[], hasAttachment: false, unread: false, starred: false };
  for (const token of q.match(/\S+:"[^"]*"|\S+/g) ?? []) {
    const [, key, value] = token.match(/^(\w+):"?([^"]*)"?$/) ?? [];
    const v = value?.toLowerCase() ?? "";
    if (key === "label" && v) out.labels.push(v);
    else if (key === "from" && v) out.from.push(v);
    else if (key === "to" && v) out.to.push(v);
    else if (key === "subject" && v) out.subject.push(v);
    else if (key === "has" && v === "attachment") out.hasAttachment = true;
    else if (key === "is" && v === "unread") out.unread = true;
    else if (key === "is" && v === "starred") out.starred = true;
    else out.text.push(token.toLowerCase());
  }
  return out;
}

