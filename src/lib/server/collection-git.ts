/**
 * Git activity on collection records (lib/collections/git.ts has the rules): a collection's GitHub webhook and the
 * generic `…/git-events` API queue job `collections.git`, which links the branch, commit or PR on every record whose ID
 * it mentions and moves the record's status by the collection's map. Every step is idempotent (a URL is kept once per
 * record, statuses only move forward), so GitHub's redeliveries are harmless. A PR naming no record finds the one it's
 * already linked to, or makes one when the collection's map has `create` on; a PR's description fills an empty record
 * description, so whoever opens the PR (person, any agent, any tool) writes the record's description too.
 */
import { and, collectionGitHooks, collectionRecordLinks, collectionRecords, db, eq, isNull, sql } from "@/db";
import { appUrl } from "@/emails/urls";
import { statusFieldOf } from "@/lib/collections/fields";
import { extractKeys, shouldMove, targetStatus, type GitEvent } from "@/lib/collections/git";
import { markdownToValue } from "@/lib/notes/plate";
import { addLink, createRecord, findRecord, getCollection, systemCollection, updateRecord, type Collection, type CollectionViewer } from "./collections";

const newSecret = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");

export type GitHookInfo = { url: string; secret: string; lastEventAt: number | null };

/** The collection's webhook (made on first ask); `rotate` gives it a new secret. Managers only. */
export async function gitHook(v: CollectionViewer, collectionId: string, opts: { rotate?: boolean } = {}): Promise<GitHookInfo> {
  const c = await getCollection(v, collectionId, "manage");
  let [row] = await db.select().from(collectionGitHooks).where(and(eq(collectionGitHooks.orgId, v.orgId), eq(collectionGitHooks.collectionId, c.id)));
  if (!row) [row] = await db.insert(collectionGitHooks).values({ orgId: v.orgId, collectionId: c.id, secret: newSecret(), createdBy: v.userId }).returning();
  else if (opts.rotate) [row] = await db.update(collectionGitHooks).set({ secret: newSecret() }).where(eq(collectionGitHooks.id, row.id)).returning();
  return { url: appUrl(`/api/hooks/github/${row!.id}`), secret: row!.secret, lastEventAt: row!.lastEventAt?.getTime() ?? null };
}

/** The hook behind a webhook URL, for the endpoint to check the signature. */
export async function hookById(id: string) {
  const [row] = await db.select().from(collectionGitHooks).where(eq(collectionGitHooks.id, id));
  return row ?? null;
}

export const touchHook = (id: string) => db.update(collectionGitHooks).set({ lastEventAt: new Date() }).where(eq(collectionGitHooks.id, id));

/** Job `collections.git`. */
export async function applyGitEvents(job: { orgId: string; collectionId: string; events: GitEvent[] }) {
  const c = await systemCollection(job.orgId, job.collectionId);
  if (!c) return;
  for (const ev of job.events) {
    if (ev.kind === "deploy") {
      await applyDeploy(job.orgId, c, ev);
      continue;
    }
    const keys = extractKeys(ev.texts, c.prefix);
    if (keys.length) {
      for (const n of keys) {
        const record = await findRecord(job.orgId, c, `${c.prefix}-${n}`).catch(() => null);
        if (record) await applyToRecord(job.orgId, c, record, ev);
      }
    } else if (ev.kind === "pr" && ev.url) {
      const record = (await recordByLink(job.orgId, c, ev.url)) ?? (await createFromPr(job.orgId, c, ev));
      if (record) await applyToRecord(job.orgId, c, record, ev);
    }
  }
}

type Rec = Awaited<ReturnType<typeof findRecord>>;
const fromMarkdown = (md: string | undefined) => (md?.trim() ? markdownToValue(md) : undefined);

/** The record a PR is already linked to (e.g. one it made earlier), for PR updates that still name no ID. */
async function recordByLink(orgId: string, c: Collection, url: string): Promise<Rec | null> {
  const [row] = await db
    .select({ id: collectionRecords.id })
    .from(collectionRecordLinks)
    .innerJoin(collectionRecords, eq(collectionRecords.id, collectionRecordLinks.recordId))
    .where(and(eq(collectionRecords.orgId, orgId), eq(collectionRecords.collectionId, c.id), isNull(collectionRecords.deletedAt), eq(collectionRecordLinks.url, url)))
    .limit(1);
  return row ? findRecord(orgId, c, row.id).catch(() => null) : null;
}

/**
 * shortcut: two deliveries for the same new PR handled at the same moment can each make a record; fine at GitHub's pace,
 * add a unique (collection, url) claim if duplicates show up.
 */
async function createFromPr(orgId: string, c: Collection, ev: GitEvent): Promise<Rec | null> {
  if (!c.settings.git?.create || ev.state === "closed") return null;
  return createRecord(orgId, c, null, { title: (ev.title || ev.url!).slice(0, 300), values: {}, description: fromMarkdown(ev.body) }, { triage: true });
}

async function applyToRecord(orgId: string, c: Collection, record: Rec, ev: GitEvent) {
  if (ev.url) {
    const link = await addLink(orgId, c, record.id, ev.url, null).catch(() => null);
    // The event already says how the PR stands; no need to ask GitHub again.
    // Merged is final: a late or redelivered "opened" mustn't take the badge back.
    if (link && ev.kind === "pr" && ev.state && link.state?.state !== "merged") {
      const state = { state: ev.state === "review" ? "open" : ev.state, checkedAt: Date.now(), ...(ev.mergedAt ? { mergedAt: ev.mergedAt } : {}) };
      await db.update(collectionRecordLinks).set({ state }).where(eq(collectionRecordLinks.id, link.id));
    }
  }
  // Only an empty description: what people wrote on the record is never overwritten.
  const description = ev.kind === "pr" && !record.description ? fromMarkdown(ev.body) : undefined;
  if (description) await updateRecord(orgId, c, record.id, { description }, null).catch(() => null);
  await moveStatus(orgId, c, record.id, record.values, targetStatus(c.settings.git, ev));
}

async function moveStatus(orgId: string, c: Collection, recordId: string, values: Record<string, unknown>, target: string | undefined) {
  const field = statusFieldOf(c.fields);
  if (field && shouldMove(field, values[field.id], target)) await updateRecord(orgId, c, recordId, { values: { [field.id]: target } }, null);
}

/**
 * A successful deploy of the mapped environment moves records whose PR to that repo was merged before it, and which
 * still sit in the "merged" status, to "deployed".
 * shortcut: a merged PR counts as shipped by any later successful deploy of its repo, so this assumes deploys come from
 * the default branch. Upgrade to GitHub's compare API (base…sha) if a repo deploys other branches.
 */
async function applyDeploy(orgId: string, c: Collection, ev: GitEvent) {
  const map = c.settings.git;
  const field = statusFieldOf(c.fields);
  const target = targetStatus(map, ev);
  if (!map?.merged || !field || !target) return;
  const rows = await db
    .selectDistinct({ id: collectionRecords.id, values: collectionRecords.values })
    .from(collectionRecordLinks)
    .innerJoin(collectionRecords, eq(collectionRecords.id, collectionRecordLinks.recordId))
    .where(
      and(
        eq(collectionRecords.orgId, orgId),
        eq(collectionRecords.collectionId, c.id),
        isNull(collectionRecords.deletedAt),
        eq(collectionRecordLinks.kind, "github_pr"),
        sql`${collectionRecordLinks.url} LIKE ${`https://github.com/${ev.repo}/pull/%`}`,
        sql`json_extract(${collectionRecordLinks.state}, '$.mergedAt') <= ${ev.at}`,
        sql`json_extract(${collectionRecords.values}, ${`$."${field.id}"`}) = ${map.merged}`,
      ),
    )
    .limit(200);
  for (const r of rows) await moveStatus(orgId, c, r.id, r.values, target);
}

