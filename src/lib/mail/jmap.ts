const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";

export class JmapError extends Error {
  public type: string;
  constructor(type: string) {
    super(`Mail engine: ${type}`);
    this.type = type;
  }
}

export interface EngineEmail {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  receivedAt: string;
  size: number;
}
export interface EngineMessage extends EngineEmail {
  subject: string;
  preview: string;
  from: { name: string; email: string }[] | null;
  to: { name: string; email: string }[] | null;
  cc: { name: string; email: string }[] | null;
  textBody: { partId: string; blobId: string }[];
  htmlBody: { partId: string; blobId: string }[];
  bodyValues: Record<string, { value: string; isTruncated: boolean }>;
  attachments: { partId: string; blobId: string; name: string | null; type: string; size: number }[];
}

/** One account per client; callers resolve account access before constructing it. */
export class JmapClient {
  private origin: string;
  private apiUrl: string;
  private authorization: string;
  private accountId: string;
  private transport: typeof fetch;

  constructor(
    apiUrl: string,
    authorization: string,
    accountId: string,
    transport: typeof fetch = fetch,
  ) {
    const url = new URL(apiUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("JMAP requires an HTTPS endpoint");
    this.origin = url.origin;
    this.apiUrl = apiUrl;
    this.authorization = authorization;
    this.accountId = accountId;
    this.transport = transport;
  }

  private async call<T>(method: string, args: Record<string, unknown>): Promise<T> {
    const response = await this.transport(this.apiUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: this.authorization, "content-type": "application/json" },
      body: JSON.stringify({ using: [CORE, MAIL], methodCalls: [[method, { ...args, accountId: this.accountId }, "0"]] }),
    });
    if (!response.ok) throw new JmapError(`http-${response.status}`);
    const body = await response.json() as { methodResponses?: [string, Record<string, unknown>, string][] };
    const result = body.methodResponses?.find((item) => item[2] === "0");
    if (!result) throw new JmapError("invalid-response");
    if (result[0] === "error") throw new JmapError(typeof result[1].type === "string" ? result[1].type : "unknown");
    if (result[0] !== method || result[1].accountId !== this.accountId) throw new JmapError("invalid-response");
    return result[1] as T;
  }

  changes(sinceState: string, maxChanges = 100) {
    return this.call<{ oldState: string; newState: string; hasMoreChanges: boolean; created: string[]; updated: string[]; destroyed: string[] }>(
      "Email/changes", { sinceState, maxChanges },
    );
  }

  emails(ids: string[]) {
    return this.call<{ state: string; list: EngineEmail[]; notFound: string[] }>("Email/get", {
      ids, properties: ["id", "blobId", "threadId", "mailboxIds", "keywords", "receivedAt", "size"],
    });
  }

  query(position = 0, limit = 100, filter?: Record<string, unknown>, ascending = true) {
    return this.call<{ queryState: string; position: number; ids: string[] }>("Email/query", {
      position, limit, sort: [{ property: "receivedAt", isAscending: ascending }], ...(filter ? { filter } : {}),
    });
  }

  contents(ids: string[]) {
    return this.call<{ state: string; list: EngineMessage[]; notFound: string[] }>("Email/get", {
      ids, properties: ["id", "blobId", "threadId", "mailboxIds", "keywords", "receivedAt", "size", "subject", "preview", "from", "to", "cc", "textBody", "htmlBody", "bodyValues", "attachments"],
      fetchTextBodyValues: true, fetchHTMLBodyValues: true, maxBodyValueBytes: 1_000_000,
    });
  }

  async createFolder(name: string, parentId: string | null = null) {
    const result = await this.call<{ created?: { folder?: { id: string } }; notCreated?: { folder?: { type: string } } }>("Mailbox/set", { create: { folder: { name, parentId } } });
    if (result.notCreated?.folder) throw new JmapError(result.notCreated.folder.type);
    if (!result.created?.folder?.id) throw new JmapError("invalid-response");
    return result.created.folder.id;
  }

  async remove(id: string, ifInState: string) {
    const result = await this.call<{ newState: string; destroyed?: string[]; notDestroyed?: Record<string, { type: string }> }>("Email/set", { ifInState, destroy: [id] });
    if (result.notDestroyed?.[id]) throw new JmapError(result.notDestroyed[id].type);
    if (!result.destroyed?.includes(id)) throw new JmapError("invalid-response");
    return result.newState;
  }

  async raw(downloadTemplate: string, blobId: string, filename = "message.eml", type = "message/rfc822") {
    const url = new URL(downloadTemplate.replaceAll("{accountId}", encodeURIComponent(this.accountId)).replaceAll("{blobId}", encodeURIComponent(blobId)).replaceAll("{name}", encodeURIComponent(filename)).replaceAll("{type}", encodeURIComponent(type)));
    if (url.origin !== this.origin || url.username || url.password) throw new Error("Cross-origin JMAP download refused");
    const response = await this.transport(url, { headers: { authorization: this.authorization }, redirect: "error", signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new JmapError(`download-http-${response.status}`);
    return response;
  }

  folders() {
    return this.call<{ state: string; list: { id: string; name: string; parentId: string | null; role: string | null }[] }>("Mailbox/get", {});
  }

  /** ifInState prevents a stale writer from overwriting concurrent client changes. */
  async update(id: string, patch: Record<string, unknown>, ifInState: string) {
    const result = await this.call<{ newState: string; updated?: Record<string, unknown>; notUpdated?: Record<string, { type: string }> }>(
      "Email/set", { ifInState, update: { [id]: patch } },
    );
    if (result.notUpdated?.[id]) throw new JmapError(result.notUpdated[id].type);
    if (!Object.hasOwn(result.updated ?? {}, id)) throw new JmapError("invalid-response");
    return result.newState;
  }

  /** uploadUrl comes from the authenticated session, never from user input. */
  async importMessage(uploadUrl: string, raw: Uint8Array, mailboxId: string, receivedAt: string, keywords: Record<string, boolean> = {}) {
    const url = new URL(uploadUrl.replaceAll("{accountId}", encodeURIComponent(this.accountId)));
    if (url.origin !== this.origin || url.username || url.password) throw new Error("Cross-origin JMAP upload refused");
    const response = await this.transport(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { authorization: this.authorization, "content-type": "message/rfc822" },
      body: new Uint8Array(raw).buffer,
    });
    if (!response.ok) throw new JmapError(`upload-http-${response.status}`);
    const uploaded = await response.json() as { blobId?: string; accountId?: string };
    if (!uploaded.blobId || uploaded.accountId !== this.accountId) throw new JmapError("invalid-upload-response");
    const result = await this.call<{ created?: Record<string, EngineEmail>; notCreated?: Record<string, { type: string }> }>("Email/import", {
      emails: { message: { blobId: uploaded.blobId, mailboxIds: { [mailboxId]: true }, keywords, receivedAt } },
    });
    if (result.notCreated?.message) throw new JmapError(result.notCreated.message.type);
    if (!result.created?.message) throw new JmapError("invalid-response");
    return result.created.message;
  }
}
