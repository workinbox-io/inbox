/**
 * Amazon SNS message signatures (https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html), pure:
 * the webhook (pages/api/ses/webhook.ts) fetches the signing certificate, this checks the message against it.
 */

export interface SnsSigned {
  Type?: string;
  Message?: string;
  MessageId?: string;
  Subject?: string;
  SubscribeURL?: string;
  Timestamp?: string;
  Token?: string;
  TopicArn?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
}

/** Only Amazon's own SNS hosts serve signing certificates. */
export function isSnsCertUrl(raw: string | undefined) {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname) && u.pathname.endsWith(".pem");
  } catch {
    return false;
  }
}

/** The text SNS signed: fixed keys in order, "Key\nValue\n" each, absent optional keys left out. */
export function snsStringToSign(m: SnsSigned) {
  const keys: (keyof SnsSigned)[] =
    m.Type === "Notification"
      ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.filter((k) => m[k] !== undefined).map((k) => `${k}\n${m[k]}\n`).join("");
}

/** The SubjectPublicKeyInfo of a DER X.509 certificate (enough DER to walk to it, nothing else). */
export function spkiFromCert(der: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const read = (at: number) => {
    let len = der[at + 1]!;
    let head = 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + der[at + 2 + i]!;
      head += n;
    }
    return { tag: der[at]!, start: at + head, end: at + head + len };
  };
  const cert = read(0);
  const tbs = read(cert.start);
  let at = tbs.start;
  if (read(at).tag === 0xa0) at = read(at).end; // explicit version
  for (let i = 0; i < 5; i++) at = read(at).end; // serial, signature algorithm, issuer, validity, subject
  const spki = read(at);
  if (spki.tag !== 0x30) throw new Error("No public key in the certificate");
  return der.slice(at, spki.end);
}

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const pemToDer = (pem: string) => fromBase64(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));

/** True when `certPem` (from SigningCertURL) signed this message. */
export async function verifySns(m: SnsSigned, certPem: string) {
  if (!m.Signature || (m.SignatureVersion !== "1" && m.SignatureVersion !== "2")) return false;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      spkiFromCert(pemToDer(certPem)),
      { name: "RSASSA-PKCS1-v1_5", hash: m.SignatureVersion === "2" ? "SHA-256" : "SHA-1" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64(m.Signature), new TextEncoder().encode(snsStringToSign(m)));
  } catch {
    return false;
  }
}
