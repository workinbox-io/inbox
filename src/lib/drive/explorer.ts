/** The drive explorer's pure rules: sorting, click and Shift/⌘ selection, the selection rectangle. */

export type SortKey = "name" | "owner" | "updated" | "size";
export type SortDir = "asc" | "desc";

interface Sortable {
  kind: "folder" | "file";
  name: string;
  ownerName: string | null;
  updatedAt: string;
  size: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Folders first (as in Finder and Drive), then by the key; ties by name. */
export function sortItems<T extends Sortable>(items: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const by = (a: T, b: T) => {
    if (key === "size") return a.size - b.size;
    if (key === "updated") return a.updatedAt.localeCompare(b.updatedAt);
    if (key === "owner") return collator.compare(a.ownerName ?? "", b.ownerName ?? "");
    return collator.compare(a.name, b.name);
  };
  return [...items].sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : sign * (by(a, b) || collator.compare(a.name, b.name))));
}

export interface Selection {
  ids: Set<string>;
  /** Where Shift-click ranges start. */
  anchor: string | null;
}

/**
 * A click on `id` in the list order `order`: plain = only it, ⌘/Ctrl = toggle it, Shift = the range from the anchor
 * (added to the selection with ⌘ too).
 */
export function clickSelect(sel: Selection, order: string[], id: string, mods: { shift?: boolean; meta?: boolean }): Selection {
  if (mods.shift && sel.anchor && order.includes(sel.anchor)) {
    const [a, b] = [order.indexOf(sel.anchor), order.indexOf(id)].sort((x, y) => x - y);
    const range = order.slice(a, b + 1);
    return { ids: new Set(mods.meta ? [...sel.ids, ...range] : range), anchor: sel.anchor };
  }
  if (mods.meta) {
    const ids = new Set(sel.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id };
  }
  return { ids: new Set([id]), anchor: id };
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const boxFrom = (x1: number, y1: number, x2: number, y2: number): Box => ({ left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) });

/** The items whose boxes the selection rectangle touches. */
export function marqueeHits(rect: Box, boxes: { id: string; box: Box }[]) {
  return boxes.filter(({ box }) => box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top).map((b) => b.id);
}

/** The next item for arrow keys in a list (cols = 1) or a grid of `cols` columns. */
export function moveFocus(order: string[], current: string | null, key: string, cols = 1) {
  if (!order.length) return null;
  const i = current ? order.indexOf(current) : -1;
  const step = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: cols > 1 ? 1 : 0, ArrowLeft: cols > 1 ? -1 : 0, Home: -Infinity, End: Infinity }[key];
  if (step === undefined || step === 0) return current;
  if (i < 0) return step < 0 ? order[order.length - 1]! : order[0]!;
  return order[Math.max(0, Math.min(order.length - 1, i + step))]!;
}
