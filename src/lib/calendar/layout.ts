/** Side-by-side placement of overlapping blocks in one day column. */

export interface Block {
  id: string;
  start: number;
  end: number;
}

export interface Placed {
  id: string;
  /** Column index within its overlapping group. */
  col: number;
  /** Columns in that group; the block is 1/cols wide. */
  cols: number;
}

export function layoutDay(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed[] = [];
  let group: Placed[] = [];
  let colEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const p of group) p.cols = colEnds.length;
    out.push(...group);
    group = [];
    colEnds = [];
  };
  for (const b of sorted) {
    if (b.start >= groupEnd) close();
    // Zero-length blocks still take a slot.
    const end = Math.max(b.end, b.start + 1);
    let col = colEnds.findIndex((e) => e <= b.start);
    if (col < 0) col = colEnds.push(end) - 1;
    else colEnds[col] = end;
    group.push({ id: b.id, col, cols: 0 });
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return out;
}
