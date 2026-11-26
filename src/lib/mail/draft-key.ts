/** Draft keys in mail apps' copies of drafts. No imports: the mail bridge (Node) imports this file directly. */
export const DRAFT_KEY = /^(new|d-[0-9a-f-]{36}|[0-9a-f-]{36})$/;
export const draftMessageId = (key: string) => `<wi-draft-${key}@workinbox.invalid>`;

/** The draft key an app kept when it re-saved our copy (header or Message-ID), if any. */
export function draftKeyOfRaw(raw: Uint8Array | string) {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw.subarray(0, 64 * 1024));
  const end = text.search(/\r?\n\r?\n/);
  const head = (end < 0 ? text : text.slice(0, end)).replace(/\r?\n[ \t]+/g, " ");
  const key = /^x-workinbox-draft:\s*(\S+)/im.exec(head)?.[1] ?? /^message-id:\s*<wi-draft-([^@>\s]+)@workinbox\.invalid>/im.exec(head)?.[1];
  return key && DRAFT_KEY.test(key) ? key : null;
}
