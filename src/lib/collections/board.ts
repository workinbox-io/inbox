/**
 * Pure rules of a collection's board (components/collections/board.tsx): where a dropped card goes, which dates are
 * due. Filters are lib/collections/view-config.ts. Tested in test/collections.test.ts.
 */
import type { CollectionField } from "./fields";

/** The "empty" choice of a column, a lane or a filter. */
export const NONE = "__none__";

/**
 * A position between two neighbours (ascending order), so a drop writes one record. No neighbours: 0.
 * shortcut: ~50 drops into the same gap run out of float precision; renumber the column then if it ever shows.
 */
export function positionBetween(before: number | undefined, after: number | undefined) {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** A date field that reads as a deadline, so its past dates are overdue (a "Purchased" date never is). */
export const isDueField = (field: CollectionField) => field.type === "date" && /due|deadline|close|until|end|termin|koniec|do kiedy/i.test(field.name);

/** "overdue" before today, "soon" today and the next two days; dates are `YYYY-MM-DD`. */
export function dueState(iso: string, today: string): "overdue" | "soon" | null {
  const days = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (Number.isNaN(days)) return null;
  return days < 0 ? "overdue" : days <= 2 ? "soon" : null;
}

/** `n` positions in order between two neighbours, for several cards dropped together. */
export function spreadPositions(before: number | undefined, after: number | undefined, n: number) {
  if (before === undefined && after === undefined) return Array.from({ length: n }, (_, i) => i);
  if (before === undefined) return Array.from({ length: n }, (_, i) => after! - n + i);
  if (after === undefined) return Array.from({ length: n }, (_, i) => before + i + 1);
  return Array.from({ length: n }, (_, i) => before + ((after - before) * (i + 1)) / (n + 1));
}
