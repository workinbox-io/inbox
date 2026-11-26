/** Text of a parsed e-mail (postal-mime). Pure module. */

/** Plain text of a mail; falls back to the HTML part with tags stripped. */
export function mailBodyText(parsed: { text?: string; html?: string }) {
  if (parsed.text?.trim()) return parsed.text;
  return (parsed.html ?? "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
