/**
 * The state of GitHub pull requests and issues linked on records (collection_record_links.state): open, draft,
 * merged, closed. Read from GitHub's API when a link is added and then hourly while it's open; public repositories work
 * without setup, private ones need GITHUB_TOKEN. Never throws: a link without state just shows no badge.
 */
import { env } from "cloudflare:workers";
import { and, collectionRecordLinks, db, eq, gt, inArray, or, sql } from "@/db";

/** `mergedAt` lets a deploy find the PRs it shipped (lib/server/collection-git.ts). */
export type GithubState = { state: "open" | "draft" | "merged" | "closed"; checkedAt: number; mergedAt?: number };

export async function githubState(url: string): Promise<GithubState | null> {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/.exec(url);
  if (!m) return null;
  const [, owner, repo, what, n] = m;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${what === "pull" ? "pulls" : "issues"}/${n}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "workinbox-links", ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { state?: string; merged_at?: string | null; draft?: boolean };
    const state = j.merged_at ? "merged" : j.state === "closed" ? "closed" : j.draft ? "draft" : "open";
    return { state, checkedAt: Date.now(), ...(j.merged_at ? { mergedAt: Date.parse(j.merged_at) } : {}) };
  } catch {
    return null;
  }
}

/** Hourly: links still open (or never read) from the last 90 days, 30 a run to stay inside GitHub's anonymous limit. */
export async function refreshGithubLinks() {
  const rows = await db
    .select({ id: collectionRecordLinks.id, url: collectionRecordLinks.url })
    .from(collectionRecordLinks)
    .where(
      and(
        inArray(collectionRecordLinks.kind, ["github_pr", "github_issue"]),
        gt(collectionRecordLinks.createdAt, new Date(Date.now() - 90 * 86_400_000)),
        or(sql`${collectionRecordLinks.state} IS NULL`, sql`json_extract(${collectionRecordLinks.state}, '$.state') IN ('open', 'draft')`),
      ),
    )
    .orderBy(sql`coalesce(json_extract(${collectionRecordLinks.state}, '$.checkedAt'), 0)`)
    .limit(30);
  for (const r of rows) {
    const state = await githubState(r.url);
    if (state) await db.update(collectionRecordLinks).set({ state }).where(eq(collectionRecordLinks.id, r.id));
  }
}
