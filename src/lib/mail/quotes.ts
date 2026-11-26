/**
 * The new part of an e-mail versus its quoted history and signature. Mail clients mark quotes
 * differently, so this cuts at the first line that looks like the start of one. Pure module.
 */

const QUOTE_HEADERS = [
  // Gmail, Apple Mail, Thunderbird: "On Mon, 3 Jun 2026 at 10:00, Jane <jane@x.com> wrote:"
  /^On .+wrote:\s*$/i,
  // Polish Gmail: "W dniu 3.06.2026 o 10:00 Jane <jane@x.com> napisał(a):"
  /^W dniu .+napisał(\(a\))?:\s*$/i,
  /^Am .+schrieb .+:\s*$/i,
  /^Le .+a écrit\s*:\s*$/i,
  // Outlook
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
  /^From:\s.+/i,
  /^_{10,}\s*$/,
];

const SIGNATURES = [/^--\s*$/, /^Sent from my /i, /^Wysłane z /i, /^Get Outlook for /i];

export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) break;
    if (QUOTE_HEADERS.some((re) => re.test(trimmed))) break;
    // Gmail wraps long "On … wrote:" headers over two lines.
    if (/^On .+/i.test(trimmed) && /wrote:\s*$/i.test(lines[i + 1]?.trim() ?? "")) break;
    if (SIGNATURES.some((re) => re.test(trimmed))) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

/**
 * The new part of an e-mail and the quoted history below it, for showing a mail with the history
 * folded ("…") instead of dropped. Unlike stripQuotedReply the signature stays in the body.
 */
export function splitQuotedReply(text: string): { body: string; quoted: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const start =
      trimmed.startsWith(">") ||
      QUOTE_HEADERS.some((re) => re.test(trimmed)) ||
      (/^On .+/i.test(trimmed) && /wrote:\s*$/i.test(lines[i + 1]?.trim() ?? ""));
    // A quote right at the top is the whole mail (a forward), not history to hide.
    if (start && lines.slice(0, i).some((l) => l.trim())) return { body: lines.slice(0, i).join("\n").trim(), quoted: lines.slice(i).join("\n").trim() };
  }
  return { body: text.trim(), quoted: "" };
}

