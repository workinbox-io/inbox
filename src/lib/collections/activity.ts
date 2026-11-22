/**
 * A record's history: what changed between two versions (title, each field; the description only as "changed"),
 * and whether a change folds into the previous entry (same person, same field, within 5 minutes, like Linear).
 * Pure, tested in test/collections.test.ts.
 */
import { sameValue, type FieldValue, type RecordValues } from "./fields";

export const CREATED = "__created";
export const MERGE_MS = 5 * 60_000;

export type Change = { field: string; from: FieldValue | null; to: FieldValue | null };

export function diffRecord(before: { title: string; values: RecordValues }, after: { title: string; values: RecordValues }, extra: Change[] = []): Change[] {
  const out: Change[] = [];
  if (before.title !== after.title) out.push({ field: "title", from: before.title, to: after.title });
  for (const id of new Set([...Object.keys(before.values), ...Object.keys(after.values)])) {
    const from = before.values[id] ?? null;
    const to = after.values[id] ?? null;
    if (!sameValue(from, to)) out.push({ field: id, from, to });
  }
  return [...out, ...extra];
}

/** Whether a new change should update the last entry instead of adding one. */
export const mergesInto = (last: { actorId: string | null; field: string; at: number } | undefined, actorId: string | null, field: string, now: number) =>
  !!last && last.actorId === actorId && last.field === field && field !== CREATED && now - last.at < MERGE_MS;
