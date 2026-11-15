/**
 * Pure mbox handling for mail imports (lib/server/mail/import.ts). An mbox file is messages one after another, each
 * starting with a "From " separator line; lines in a body that start with "From " are escaped as ">From " (mboxrd,
 * Google Takeout). A file that doesn't start with "From " is a single .eml message.
 */

const NL = 0x0a;
const FROM = [0x46, 0x72, 0x6f, 0x6d, 0x20]; // "From "

const isFromAt = (b: Uint8Array, i: number) => FROM.every((c, k) => b[i + k] === c);

/** Whether a file's first bytes look like an mbox rather than one .eml. */
export const isMbox = (head: Uint8Array) => isFromAt(head, 0);

/**
 * Splits `chunk` (read from the file at a message boundary) into whole messages, without their separator lines.
 * `ends[k]` is where message k ends in `chunk`, `consumed` where the last one does; the rest starts the next read. With `final` (the end of the file)
 * the last message is complete too.
 */
export function splitMbox(chunk: Uint8Array, final: boolean) {
  const starts: number[] = [];
  if (isFromAt(chunk, 0)) starts.push(0);
  for (let i = chunk.indexOf(NL); i !== -1; i = chunk.indexOf(NL, i + 1)) if (isFromAt(chunk, i + 1)) starts.push(i + 1);
  const ends = final ? [...starts.slice(1), chunk.length] : starts.slice(1);
  const messages = ends.map((end, k) => {
    const start = starts[k]!;
    const body = chunk.indexOf(NL, start) + 1 || end;
    return unescapeFrom(chunk.subarray(body, end));
  });
  return { messages, ends, consumed: ends.at(-1) ?? 0 };
}

/** mboxrd: a body line ">From ", ">>From " loses one ">". */
function unescapeFrom(msg: Uint8Array) {
  const out: number[] = [];
  let lineStart = true;
  for (let i = 0; i < msg.length; i++) {
    if (lineStart && msg[i] === 0x3e) {
      let j = i;
      while (msg[j] === 0x3e) j++;
      if (isFromAt(msg, j)) {
        lineStart = false; // drop only this one ">"
        continue;
      }
    }
    out.push(msg[i]!);
    lineStart = msg[i] === NL;
  }
  return out.length === msg.length ? msg : new Uint8Array(out);
}

/** Browser side: .eml files as one mbox, so a folder of exported messages (Zoho, Outlook) uploads as one file. */
export function emlToMbox(eml: Uint8Array) {
  const text = new TextDecoder("latin1").decode(eml).replace(/\r\n/g, "\n");
  const escaped = text.replace(/^(>*From )/gm, ">$1");
  const bytes = Uint8Array.from(escaped, (c) => c.charCodeAt(0));
  const head = new TextEncoder().encode("From MAILER-DAEMON Thu Jan  1 00:00:00 1970\n");
  const out = new Uint8Array(head.length + bytes.length + 1);
  out.set(head, 0);
  out.set(bytes, head.length);
  out[out.length - 1] = NL;
  return out;
}

/** Gmail's labels on a Takeout message: skip spam and trash, archive what wasn't in the inbox. */
export function importPlacement(gmailLabels: string | null) {
  if (gmailLabels === null) return { skip: false, archived: true };
  const labels = gmailLabels.split(",").map((l) => l.trim().toLowerCase());
  return { skip: labels.includes("spam") || labels.includes("trash"), archived: !labels.includes("inbox") };
}
