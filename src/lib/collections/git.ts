/**
 * Git activity on records: GitHub webhooks (api/hooks/github/[id].ts) and the generic API (`…/git-events`) become
 * events; record IDs ("TAS-12") found in branch names, PR titles and bodies and commit messages pick the records, and the
 * collection's map (`settings.git`) says which status each step moves them to. Statuses only move forward. Pure, tested
 * in test/collections-git.test.ts.
 */
import { z } from "zod";
import { statusKind, type CollectionField } from "./fields";

export type GitMap = { started?: string; review?: string; merged?: string; deployed?: string; environment?: string };
export const GIT_STEPS = ["started", "review", "merged", "deployed"] as const;

export const gitMapSchema = z.object({
  started: z.string().max(60).optional(),
  review: z.string().max(60).optional(),
  merged: z.string().max(60).optional(),
  deployed: z.string().max(60).optional(),
  environment: z.string().trim().max(60).optional(),
});

export const gitEventSchema = z.object({
  kind: z.enum(["branch", "commit", "pr", "deploy"]),
  repo: z.string().trim().min(1).max(200).describe("owner/name"),
  url: z.string().url().max(2000).optional().describe("The branch, commit or pull request page; becomes a link on the record"),
  title: z.string().max(300).optional(),
  texts: z.array(z.string().max(10_000)).max(50).default([]).describe("Branch names, titles, commit messages: record IDs are read from them"),
  state: z.enum(["open", "draft", "review", "merged", "closed"]).optional().describe("A pull request's state"),
  mergedAt: z.number().int().optional(),
  environment: z.string().max(60).optional().describe("A deploy's environment, e.g. production"),
  at: z.number().int().optional(),
});
export type GitEvent = z.infer<typeof gitEventSchema> & { at: number };

export const MAX_KEYS = 20;

/** Record numbers of `prefix` mentioned in the texts ("tas-12", "feature/TAS-12-login"), unique, at most 20. */
export function extractKeys(texts: string[], prefix: string): number[] {
  const re = new RegExp(`(?<![A-Za-z0-9])${prefix}-(\\d{1,9})(?![A-Za-z0-9])`, "gi");
  const found = new Set<number>();
  for (const t of texts) for (const m of t.matchAll(re)) if (found.size < MAX_KEYS) found.add(Number(m[1]));
  return [...found];
}

type Gh = Record<string, any>;
const ms = (iso: unknown) => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? Date.parse(iso) : undefined);

/** GitHub's webhook payloads (pull_request, push, deployment_status) as events; anything else none. */
export function parseGithub(event: string, p: Gh, now = Date.now()): GitEvent[] {
  const repo: string | undefined = p.repository?.full_name;
  if (!repo) return [];
  if (event === "pull_request") {
    const pr = p.pull_request;
    if (!pr || !["opened", "reopened", "ready_for_review", "converted_to_draft", "closed", "edited", "synchronize"].includes(p.action)) return [];
    const mergedAt = ms(pr.merged_at);
    const state = mergedAt ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : p.action === "ready_for_review" ? "review" : "open";
    return [{ kind: "pr", repo, url: pr.html_url, title: pr.title, texts: [pr.head?.ref ?? "", pr.title ?? "", pr.body ?? ""], state, mergedAt, at: mergedAt ?? now }];
  }
  if (event === "push") {
    const ref: string = p.ref ?? "";
    if (!ref.startsWith("refs/heads/") || p.deleted) return [];
    const branch = ref.slice("refs/heads/".length);
    const out: GitEvent[] = [];
    // A branch named after a record (from ⌘⇧.) starts it; pushes to the default branch don't.
    if (branch !== p.repository?.default_branch) out.push({ kind: "branch", repo, url: `https://github.com/${repo}/tree/${branch}`, title: branch, texts: [branch], at: now });
    for (const c of (p.commits ?? []) as Gh[]) if (c.id && c.message) out.push({ kind: "commit", repo, url: c.url, title: String(c.message).split("\n")[0]!.slice(0, 300), texts: [c.message], at: ms(c.timestamp) ?? now });
    return out;
  }
  if (event === "deployment_status") {
    if (p.deployment_status?.state !== "success") return [];
    const environment: string = p.deployment_status.environment ?? p.deployment?.environment ?? "";
    return [{ kind: "deploy", repo, title: environment, texts: [], environment, at: ms(p.deployment_status.created_at) ?? now }];
  }
  return [];
}

/** The status an event asks for, from the collection's map; undefined = leave it. */
export function targetStatus(map: GitMap | null | undefined, ev: Pick<GitEvent, "kind" | "state" | "environment">): string | undefined {
  if (!map) return undefined;
  if (ev.kind === "branch") return map.started;
  if (ev.kind === "pr") {
    if (ev.state === "merged") return map.merged;
    if (ev.state === "review") return map.review ?? map.started;
    if (ev.state === "open" || ev.state === "draft") return map.started;
    return undefined;
  }
  if (ev.kind === "deploy") return (ev.environment ?? "") === (map.environment || "production") ? map.deployed : undefined;
  return undefined;
}

/** Only forward along the field's options, never out of a cancelled status, never to an option that's gone. */
export function shouldMove(field: CollectionField, current: unknown, target: string | undefined): target is string {
  const options = field.options ?? [];
  if (!target || !options.includes(target) || current === target) return false;
  const cur = typeof current === "string" ? current : undefined;
  if (cur === undefined || !options.includes(cur)) return true;
  if (statusKind(field, cur) === "canceled") return false;
  return options.indexOf(target) > options.indexOf(cur);
}
