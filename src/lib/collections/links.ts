/**
 * Links on a record (collection_record_links): what a pasted URL is and how it reads. GitHub pull requests, issues and
 * commits read "owner/repo#12" / "owner/repo@abc1234"; Figma files by their name; Linear issues by their ID; anything
 * else by host and path. A later integration (a GitHub app) only fills `state` (open, merged…) for these kinds.
 * Pure, tested in test/collections.test.ts.
 */
export const LINK_KINDS = ["url", "github_pr", "github_issue", "github_commit", "figma", "linear"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export function parseLink(raw: string): { url: string; kind: LinkKind; title: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const url = u.toString();
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "github.com" && parts.length >= 4) {
    const [owner, repo, what, ref] = parts as [string, string, string, string];
    if (what === "pull" && /^\d+$/.test(ref)) return { url, kind: "github_pr", title: `${owner}/${repo}#${ref}` };
    if (what === "issues" && /^\d+$/.test(ref)) return { url, kind: "github_issue", title: `${owner}/${repo}#${ref}` };
    if (what === "commit" && /^[0-9a-f]{7,40}$/i.test(ref)) return { url, kind: "github_commit", title: `${owner}/${repo}@${ref.slice(0, 7)}` };
  }
  if (host.endsWith("figma.com") && ["file", "design", "board", "proto"].includes(parts[0] ?? "") && parts[1]) {
    const name = parts[2] ? decodeURIComponent(parts[2]).replace(/-/g, " ").trim() : "";
    return { url, kind: "figma", title: name || "Figma" };
  }
  if (host === "linear.app" && parts[1] === "issue" && parts[2]) return { url, kind: "linear", title: parts[2].toUpperCase() };
  const path = u.pathname === "/" ? "" : decodeURIComponent(u.pathname).replace(/\/$/, "");
  return { url, kind: "url", title: `${host}${path}`.slice(0, 120) };
}
