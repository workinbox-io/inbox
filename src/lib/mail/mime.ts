/**
 * Builds an RFC 5322 .eml for mail we sent (providers take structured mail, so there is no raw copy of it).
 * Pure: the caller loads attachments. Output is 7-bit ASCII (headers RFC 2047/2231, bodies base64).
 */
export interface EmlInput {
  from: { email: string; name?: string | null };
  to: string;
  cc?: string;
  subject: string;
  date: Date;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  text: string;
  html?: string | null;
  attachments?: { filename: string; mediaType: string; content: Uint8Array }[];
}

const enc = new TextEncoder();
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);

function base64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{76}/g, "$&\r\n");
}

/** RFC 2047 encoded words of at most 45 bytes each, never splitting a character. */
function encodeWords(value: string) {
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (enc.encode(chunk + ch).length > 45) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(enc.encode(w))}?=`).join("\r\n ");
}

const headerText = (value: string) => (ascii(value) && value.length < 900 ? value : encodeWords(value));
const clean = (value: string) => value.replace(/[\r\n]+/g, " ");

function mailbox(email: string, name?: string | null) {
  const n = clean(name ?? "").trim();
  if (!n) return email;
  return `${ascii(n) ? `"${n.replace(/["\\]/g, "\\$&")}"` : encodeWords(n)} <${email}>`;
}

function filenameParams(filename: string) {
  const name = clean(filename) || "attachment";
  return ascii(name)
    ? { type: `; name="${name.replace(/["\\]/g, "_")}"`, disposition: `; filename="${name.replace(/["\\]/g, "_")}"` }
    : { type: `; name="${encodeWords(name)}"`, disposition: `; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}` };
}

/** A MIME entity: its own headers and body; `render` is how it appears inside a multipart. */
type Entity = { header: string; body: string };
const render = (e: Entity) => `${e.header}\r\n\r\n${e.body}`;
const leaf = (headers: string[], content: Uint8Array): Entity => ({ header: [...headers, "Content-Transfer-Encoding: base64"].join("\r\n"), body: base64(content) });
const textPart = (type: string, value: string) => leaf([`Content-Type: ${type}; charset=utf-8`], enc.encode(value));
function multipart(type: string, parts: Entity[]): Entity {
  const boundary = `=_wi_${crypto.randomUUID().replace(/-/g, "")}`;
  return { header: `Content-Type: multipart/${type}; boundary="${boundary}"`, body: `${parts.map((p) => `--${boundary}\r\n${render(p)}`).join("\r\n")}\r\n--${boundary}--\r\n` };
}

export function buildEml(input: EmlInput) {
  const headers = [
    `From: ${mailbox(input.from.email, input.from.name)}`,
    `To: ${clean(input.to)}`,
    ...(input.cc ? [`Cc: ${clean(input.cc)}`] : []),
    `Subject: ${headerText(clean(input.subject))}`,
    `Date: ${input.date.toUTCString().replace("GMT", "+0000")}`,
    ...(input.messageId ? [`Message-ID: ${clean(input.messageId)}`] : []),
    ...(input.inReplyTo ? [`In-Reply-To: ${clean(input.inReplyTo)}`] : []),
    ...(input.references ? [`References: ${clean(input.references)}`] : []),
    "MIME-Version: 1.0",
  ];
  const plain = textPart("text/plain", input.text);
  const body = input.html ? multipart("alternative", [plain, textPart("text/html", input.html)]) : plain;
  const files = (input.attachments ?? []).map((a) => {
    const p = filenameParams(a.filename);
    return leaf([`Content-Type: ${clean(a.mediaType) || "application/octet-stream"}${p.type}`, `Content-Disposition: attachment${p.disposition}`], a.content);
  });
  const root = files.length ? multipart("mixed", [body, ...files]) : body;
  return `${headers.join("\r\n")}\r\n${render(root)}`;
}
