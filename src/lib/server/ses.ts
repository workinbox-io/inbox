/**
 * Amazon SES v2 for the orgs' own domains in hosted mode: Cloudflare Email Routing and Email Service only work for
 * zones in our own Cloudflare account, SES works for any domain. Plain fetch signed with aws4fetch (copied from
 * Luxivo, ../support-chat/src/lib/server/ses.ts). One tenant per org keeps reputations apart. Every send uses the
 * configuration set, whose events go through SNS to /api/hooks/ses; received mail lands in S3 and its SNS
 * notification comes to the same hook. Setup: docs/ses.md.
 */
import { AwsClient } from "aws4fetch";
import { env } from "cloudflare:workers";
import { parseS3List } from "@/lib/mail/ses-events";

/** The configuration set with the SNS event destination (docs/ses.md). */
export const SES_CONFIGURATION_SET = "workinbox";

export const sesConfigured = () =>
  env.DEPLOY_MODE !== "self" && Boolean(env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY && env.AWS_SES_REGION && env.AWS_ACCOUNT_ID);

export const sesRegion = () => env.AWS_SES_REGION ?? "eu-west-1";

export const sesTenant = (orgId: string) => `org-${orgId}`;

export class SesError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: string,
  ) {
    super(message);
  }
}

let client: AwsClient | null = null;
let s3client: AwsClient | null = null;
const aws = (service: "ses" | "s3") =>
  service === "ses"
    ? (client ??= new AwsClient({ accessKeyId: env.AWS_SES_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!, service: "ses", region: sesRegion() }))
    : (s3client ??= new AwsClient({ accessKeyId: env.AWS_SES_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!, service: "s3", region: sesRegion() }));

async function ses<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await aws("ses").fetch(`https://email.${sesRegion()}.amazonaws.com/v2/email${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const type = (res.headers.get("x-amzn-errortype") ?? String(data.__type ?? "")).split(":")[0]!.split("#").pop() || `HTTP ${res.status}`;
    throw new SesError(`SES: ${String(data.message ?? data.Message ?? type)}`, res.status, type);
  }
  return data as T;
}

const ignore = (type: string) => (e: unknown) => {
  if (!(e instanceof SesError && e.type === type)) throw e;
};

const identityArn = (domain: string) => `arn:aws:ses:${sesRegion()}:${env.AWS_ACCOUNT_ID}:identity/${domain}`;
const configSetArn = () => `arn:aws:ses:${sesRegion()}:${env.AWS_ACCOUNT_ID}:configuration-set/${SES_CONFIGURATION_SET}`;

async function associate(tenant: string, resourceArn: string) {
  await ses("POST", "/tenants/resources", { TenantName: tenant, ResourceArn: resourceArn }).catch(ignore("AlreadyExistsException"));
}

/** Starts verification: Easy DKIM tokens and the custom MAIL FROM, tied to the org's tenant. Returns the tokens. */
export async function createIdentity(domain: string, tenant: string, mailFrom: string) {
  await ses("POST", "/tenants", { TenantName: tenant }).catch(ignore("AlreadyExistsException"));
  await associate(tenant, configSetArn());
  let tokens: string[];
  try {
    const created = await ses<{ DkimAttributes?: { Tokens?: string[] } }>("POST", "/identities", { EmailIdentity: domain, ConfigurationSetName: SES_CONFIGURATION_SET });
    tokens = created.DkimAttributes?.Tokens ?? [];
  } catch (e) {
    // Added before (a removed domain whose identity stayed): read its tokens.
    ignore("AlreadyExistsException")(e);
    tokens = (await getIdentity(domain)).DkimAttributes?.Tokens ?? [];
  }
  await ses("PUT", `/identities/${encodeURIComponent(domain)}/mail-from`, { MailFromDomain: mailFrom, BehaviorOnMxFailure: "USE_DEFAULT_VALUE" });
  await associate(tenant, identityArn(domain));
  return tokens;
}

export interface SesIdentity {
  VerifiedForSendingStatus?: boolean;
  DkimAttributes?: { Status?: string; Tokens?: string[] };
  MailFromAttributes?: { MailFromDomainStatus?: string };
}

export function getIdentity(domain: string) {
  return ses<SesIdentity>("GET", `/identities/${encodeURIComponent(domain)}`);
}

/** Detaches the domain from its tenants first: SES refuses to delete an identity that still has tenant associations. */
export async function deleteIdentity(domain: string) {
  const arn = identityArn(domain);
  try {
    const { ResourceTenants = [] } = await ses<{ ResourceTenants?: { TenantName: string }[] }>("POST", "/resources/tenants/list", { ResourceArn: arn });
    for (const t of ResourceTenants) await ses("POST", "/tenants/resources/delete", { TenantName: t.TenantName, ResourceArn: arn }).catch(ignore("NotFoundException"));
  } catch (e) {
    ignore("NotFoundException")(e);
  }
  await ses("DELETE", `/identities/${encodeURIComponent(domain)}`).catch(ignore("NotFoundException"));
}

export interface SesMessage {
  from: string;
  to: string;
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  attachments: { disposition: "inline" | "attachment"; contentId?: string; filename: string; type: string; content: ArrayBuffer }[];
}

function base64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sends one e-mail; returns SES's MessageId, which its delivery events refer to. */
export async function sendSes(msg: SesMessage, tenant: string): Promise<string> {
  const res = await ses<{ MessageId: string }>("POST", "/outbound-emails", {
    FromEmailAddress: msg.from,
    Destination: { ToAddresses: [msg.to], CcAddresses: msg.cc },
    ReplyToAddresses: msg.replyTo ? [msg.replyTo] : undefined,
    ConfigurationSetName: SES_CONFIGURATION_SET,
    TenantName: tenant,
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: "UTF-8" },
        Body: { Html: { Data: msg.html, Charset: "UTF-8" }, Text: { Data: msg.text, Charset: "UTF-8" } },
        Headers: msg.headers ? Object.entries(msg.headers).map(([Name, Value]) => ({ Name, Value })) : undefined,
        Attachments: msg.attachments.length
          ? msg.attachments.map((a) => ({
              RawContent: base64(a.content),
              ContentDisposition: a.disposition === "inline" ? "INLINE" : "ATTACHMENT",
              FileName: a.filename,
              ContentId: a.contentId,
              ContentType: a.type,
              ContentTransferEncoding: "BASE64",
            }))
          : undefined,
      },
    },
  });
  return res.MessageId;
}

/** Sends a ready MIME message (invitations need a text/calendar alternative, which Simple content can't carry). */
export async function sendSesRaw(from: string, to: string | string[], raw: string | Uint8Array, tenant: string): Promise<string> {
  const res = await ses<{ MessageId: string }>("POST", "/outbound-emails", {
    FromEmailAddress: from,
    Destination: { ToAddresses: typeof to === "string" ? [to] : to },
    ConfigurationSetName: SES_CONFIGURATION_SET,
    TenantName: tenant,
    Content: { Raw: { Data: typeof raw === "string" ? Buffer.from(raw).toString("base64") : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("base64") } },
  });
  return res.MessageId;
}

/** SES receiving (rule set `workinbox`) stores each mail in this bucket under `mail/` (docs/ses.md). */
export const inboundBucket = () => `workinbox-inbound-mail-${env.AWS_ACCOUNT_ID}`;

function s3(method: "GET" | "DELETE", bucket: string, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return aws("s3").fetch(`https://${bucket}.s3.${sesRegion()}.amazonaws.com/${path}`, { method });
}

/** The raw mail SES stored; null when it's gone (handled before: jobs can run twice). */
export async function getInboundMail(bucket: string, key: string): Promise<ArrayBuffer | null> {
  const res = await s3("GET", bucket, key);
  if (res.status === 404) return null;
  if (!res.ok) throw new SesError(`S3: GET ${res.status} ${(await res.text()).slice(0, 200)}`, res.status, `HTTP ${res.status}`);
  return res.arrayBuffer();
}

/** One page (up to 1000) of the mail SES stored and we haven't handled yet (deleted after handling). */
export async function listInboundMail(bucket: string, continuation?: string) {
  const q = new URLSearchParams({ "list-type": "2", prefix: "mail/", ...(continuation ? { "continuation-token": continuation } : {}) });
  const res = await aws("s3").fetch(`https://${bucket}.s3.${sesRegion()}.amazonaws.com/?${q}`);
  if (!res.ok) throw new SesError(`S3: LIST ${res.status} ${(await res.text()).slice(0, 200)}`, res.status, `HTTP ${res.status}`);
  return parseS3List(await res.text());
}

export async function deleteInboundMail(bucket: string, key: string) {
  const res = await s3("DELETE", bucket, key);
  if (!res.ok && res.status !== 404) throw new SesError(`S3: DELETE ${res.status}`, res.status, `HTTP ${res.status}`);
}
