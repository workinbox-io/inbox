/**
 * Declarative storyboard scenes: a grid, nodes, edges and a list of steps go in, geometry comes out
 * (node rectangles, one continuous arrow path per edge, shaft-only paths for beams, label positions and
 * a viewBox per layout). Pure functions, no DOM and no GSAP, so it runs on the server.
 */
import type { IconName } from "./icons"
import { collectContent, txt, type Content, type Step, type Txt } from "./steps"

export type LayoutName = "wide" | "phone"
export const LAYOUT_NAMES: LayoutName[] = ["wide", "phone"]
export type Side = "left" | "right" | "top" | "bottom"

export interface Grid {
  cols: number
  rows: number
  /** Size of one cell. Nodes are placed in cells and may be bigger or smaller than the cell. */
  cell: [number, number]
  /** Space between cells: one number or [horizontal, vertical]. */
  gap: number | [number, number]
  /** Space around the grid: one number or [top, right, bottom, left]. */
  pad?: number | [number, number, number, number]
}

export type NodeKind = "tile" | "bucket" | "chat" | "card" | "note"

export interface NodeDef {
  kind: NodeKind
  label?: string
  /** The mono line under the label. */
  sub?: string
  /** One of our line icons, or an image (`logo`, a path in public/). */
  icon?: IconName
  logo?: string
  /** Tile only: a sheet of paper rises behind it when it sends a file. */
  paper?: boolean
  /** Chat: channel name and the older messages above the new one. */
  channel?: string
  history?: { text: string; time: string }[]
  /** Card: the title line, `METHOD /path`. */
  title?: string
  /** Card: the node it belongs to, joined to it with a dashed line when they sit side by side or one above the other. */
  attach?: string
  /** Note: the caption, `\n` starts a new line. */
  text?: Txt
  w?: number
  h?: number
}

/** Where a node goes in one layout, plus overrides of its content for that layout. */
export interface NodePlace {
  /** Grid cell [col, row]. Fractions place the node between cells. */
  at?: [number, number]
  /** Absolute position (px in the viewBox), instead of or on top of `at`. */
  x?: number
  y?: number
  dx?: number
  dy?: number
  w?: number
  h?: number
  /** Alignment of a node that is not as wide or high as its cell. Defaults: start and center. */
  align?: "start" | "center" | "end"
  valign?: "start" | "center" | "end"
  hidden?: boolean
  label?: string
  sub?: string
  text?: Txt
  /** `false` drops the card's dashed line in this layout. */
  attach?: string | false
}

export interface EdgeDef {
  id?: string
  from: string
  to: string
  /** The pill on the line. */
  label?: string
  /** `straight` (the default) runs between facing sides. `elbow` turns once or twice and can be rounded. */
  route?: "straight" | "elbow"
  fromSide?: Side
  toSide?: Side
  /** Shifts a straight edge sideways from the middle of the overlap of its two nodes (px). */
  lane?: number
  /** Which part of an elbow carries the label. Defaults to the longest segment. Use `last` on edges that fan out from one node. */
  labelAt?: "longest" | "first" | "last"
}

export interface EdgeOverride {
  route?: "straight" | "elbow"
  /** `null` drops the side the edge definition gave, so the layout can route it differently. */
  fromSide?: Side | null
  toSide?: Side | null
  lane?: number
  label?: string | false
  labelAt?: "longest" | "first" | "last"
  hidden?: boolean
}

export interface LayoutDef {
  grid?: Partial<Grid>
  nodes: Record<string, NodePlace>
  edges?: Record<string, EdgeOverride>
  /** Force the viewBox instead of deriving it from the grid. */
  size?: [number, number]
  /** Center the tiles and buckets horizontally in the viewBox. */
  center?: boolean
}

export interface SceneDef {
  /** Unique on the page, used for clip path ids. */
  id: string
  /** Accessible description of the whole picture. */
  label: string
  grid: Grid
  nodes: Record<string, NodeDef>
  edges: EdgeDef[]
  layouts: Record<LayoutName, LayoutDef>
  /** The loop. */
  steps: Step[]
  /** Replaces the default one-time entrance (`[enter()]`). `false` skips it. */
  intro?: Step[] | false
  defaults?: {
    /** Lane for horizontal straight edges, as an offset from the middle of the two nodes. Defaults to 0. */
    hLane?: number
    /** Corner radius of elbow edges. */
    radius?: number
    /** Space between an edge and the nodes it joins, at most. Defaults to 0: edges run into the handles on the nodes. */
    gap?: number
  }
  loop?: { repeatDelay?: number; hold?: number }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Pt {
  x: number
  y: number
}

export interface GNode {
  id: string
  def: NodeDef
  rect: Rect
  place: NodePlace
  hidden: boolean
}

export interface GEdge {
  id: string
  from: string
  to: string
  /** The path from source to target. Sparks and flows run on it. */
  shaft: string
  tip: Pt
  dir: Pt
  /** Where the edge leaves its source node and meets its target, on their borders, where the handles are drawn. */
  ends: [Pt, Pt]
  /** `beside`: the pill sits next to a short vertical leg instead of on it. */
  label?: { text: string; cx: number; cy: number; w: number; vertical: boolean; beside?: boolean }
  hidden: boolean
}

export interface Geo {
  w: number
  h: number
  /** Left edge of every grid column. */
  cols: number[]
  nodes: Record<string, GNode>
  edges: GEdge[]
}

export interface Scene extends SceneDef {
  content: Content
  geo: Record<LayoutName, Geo>
}

const MIN_SHAFT = 48
const PILL_CHAR = 7.3
export const pillWidth = (text: string) => Math.round(text.length * PILL_CHAR + 20)

const num = (n: number) => Math.round(n * 10) / 10
const pair = (v: number | [number, number]): [number, number] => (typeof v === "number" ? [v, v] : v)
const pad4 = (v: Grid["pad"]): [number, number, number, number] => (v === undefined ? [0, 0, 0, 0] : typeof v === "number" ? [v, v, v, v] : v)

/** Height of a request card, derived from the lines it shows. */
export const cardHeight = (c: Content["card"][string] | undefined) => {
  const sig = !!c?.sig
  const status = !!c?.status
  const line = c?.line !== undefined
  const pillTop = sig ? 78 : 52
  const lineY = status ? pillTop + 42 : sig ? 90 : 66
  if (line) return lineY + 20
  if (status) return pillTop + 24 + 16
  return sig ? 80 : 52
}

const defaultSize = (def: NodeDef, content: Content, id: string, cell: [number, number]): [number, number] => {
  switch (def.kind) {
    case "bucket":
      return [cell[0], 140 + 28 * Math.max(0, (content.rows[id]?.length ?? 1) - 1)]
    case "chat":
      return [cell[0], 240]
    case "card":
      return [300, cardHeight(content.card[id])]
    case "note":
      return [cell[0], 40]
    default:
      return [cell[0], 104]
  }
}

function placeNodes(scene: SceneDef, layout: LayoutName, content: Content) {
  const L = scene.layouts[layout]
  const grid = { ...scene.grid, ...L.grid }
  const [cw, ch] = grid.cell
  const [gx, gy] = pair(grid.gap)
  const [pt, pr, pb, pl] = pad4(grid.pad)
  const W = L.size?.[0] ?? pl + grid.cols * cw + (grid.cols - 1) * gx + pr
  const H = L.size?.[1] ?? pt + grid.rows * ch + (grid.rows - 1) * gy + pb
  const nodes: Record<string, GNode> = {}
  for (const [id, def0] of Object.entries(scene.nodes)) {
    const place = L.nodes[id] ?? {}
    const def: NodeDef = { ...def0 }
    for (const k of ["label", "sub", "text"] as const) if (place[k] !== undefined) Object.assign(def, { [k]: place[k] })
    if (place.attach !== undefined) def.attach = place.attach || undefined
    const [dw, dh] = defaultSize(def, content, id, [cw, ch])
    const w = place.w ?? def.w ?? dw
    // A bucket with file rows is never shorter than the rows and its label need.
    const h = Math.max(place.h ?? def.h ?? dh, def.kind === "bucket" ? dh : 0)
    let x = (W - w) / 2
    let y = 0
    if (place.at) {
      const [col, row] = place.at
      const cellX = pl + col * (cw + gx)
      const cellY = pt + row * (ch + gy)
      const al = place.align ?? "start"
      const va = place.valign ?? "center"
      x = al === "start" ? cellX : al === "center" ? cellX + (cw - w) / 2 : cellX + cw - w
      y = va === "start" ? cellY : va === "center" ? cellY + (ch - h) / 2 : cellY + ch - h
    }
    if (place.x !== undefined) x = place.x
    if (place.y !== undefined) y = place.y
    x += place.dx ?? 0
    y += place.dy ?? 0
    nodes[id] = { id, def, place, rect: { x: num(x), y: num(y), w, h }, hidden: !!place.hidden }
  }
  if (L.center) {
    const shown = Object.values(nodes).filter((n) => !n.hidden && (n.def.kind === "tile" || n.def.kind === "bucket"))
    const min = Math.min(...shown.map((n) => n.rect.x))
    const max = Math.max(...shown.map((n) => n.rect.x + n.rect.w))
    const shift = num(W / 2 - (min + max) / 2)
    for (const n of shown) n.rect.x = num(n.rect.x + shift)
  }
  const cols = Array.from({ length: grid.cols }, (_, i) => pl + i * (cw + gx))
  return { nodes, W, H, cols }
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v: Pt) => Math.hypot(v.x, v.y)
const unit = (v: Pt): Pt => {
  const l = len(v) || 1
  return { x: v.x / l, y: v.y / l }
}
const sideAnchor = (r: Rect, side: Side): Pt =>
  side === "left" ? { x: r.x, y: r.y + r.h / 2 } : side === "right" ? { x: r.x + r.w, y: r.y + r.h / 2 } : side === "top" ? { x: r.x + r.w / 2, y: r.y } : { x: r.x + r.w / 2, y: r.y + r.h }
const outward = (side: Side): Pt => (side === "left" ? { x: -1, y: 0 } : side === "right" ? { x: 1, y: 0 } : side === "top" ? { x: 0, y: -1 } : { x: 0, y: 1 })
const horizontal = (s: Side) => s === "left" || s === "right"

/** The gap at each end of an edge that spans `dist`: `max` when the shaft keeps MIN_SHAFT, less when the nodes are close. */
const gapFor = (dist: number, max: number) => Math.max(Math.min(3, max), Math.min(max, (dist - MIN_SHAFT) / 2))

/** Polyline through `pts`, corners rounded with `radius`, ending at the last point. */
function polyline(pts: Pt[], radius: number) {
  let d = `M${num(pts[0].x)} ${num(pts[0].y)}`
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]
    if (i < pts.length - 1 && radius > 0) {
      const prev = pts[i - 1]
      const next = pts[i + 1]
      const r = Math.min(radius, len(sub(cur, prev)) / 2, len(sub(next, cur)) / 2)
      const u1 = unit(sub(cur, prev))
      const u2 = unit(sub(next, cur))
      d += `L${num(cur.x - u1.x * r)} ${num(cur.y - u1.y * r)}Q${num(cur.x)} ${num(cur.y)} ${num(cur.x + u2.x * r)} ${num(cur.y + u2.y * r)}`
    } else d += `L${num(cur.x)} ${num(cur.y)}`
  }
  return d
}

function route(a: Rect, b: Rect, e: EdgeDef, o: EdgeOverride, hLane: number, maxGap: number): { pts: Pt[]; g: number } {
  const mode = o.route ?? e.route ?? "straight"
  let fromSide = o.fromSide === undefined ? e.fromSide : (o.fromSide ?? undefined)
  let toSide = o.toSide === undefined ? e.toSide : (o.toSide ?? undefined)
  const lane = o.lane ?? e.lane
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
  const xOv: [number, number] = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)]
  const yOv: [number, number] = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)]

  if (mode === "straight" && !fromSide && !toSide) {
    if (gapX >= gapY && yOv[1] - yOv[0] >= 24) {
      const y = (yOv[0] + yOv[1]) / 2 + (lane ?? hLane)
      const right = b.x > a.x
      const g = gapFor(gapX, maxGap)
      const pts = [
        { x: right ? a.x + a.w + g : a.x - g, y },
        { x: right ? b.x - g : b.x + b.w + g, y },
      ]
      return { pts, g }
    }
    if (gapY > gapX && xOv[1] - xOv[0] >= 24) {
      const x = (xOv[0] + xOv[1]) / 2 + (lane ?? 0)
      const down = b.y > a.y
      const g = gapFor(gapY, maxGap)
      const pts = [
        { x, y: down ? a.y + a.h + g : a.y - g },
        { x, y: down ? b.y - g : b.y + b.h + g },
      ]
      return { pts, g }
    }
  }
  // Elbow (also the fallback when a straight line would miss one of the nodes).
  if (!fromSide || !toSide) {
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    const d = sub(bc, ac)
    if (!fromSide && !toSide) {
      if (Math.abs(d.x) >= Math.abs(d.y)) {
        fromSide = d.x > 0 ? "right" : "left"
        toSide = d.x > 0 ? "left" : "right"
      } else {
        fromSide = d.y > 0 ? "bottom" : "top"
        toSide = d.y > 0 ? "top" : "bottom"
      }
    } else if (fromSide) toSide = horizontal(fromSide) ? (d.y > 0 ? "top" : "bottom") : d.x > 0 ? "left" : "right"
    else if (toSide) fromSide = horizontal(toSide) ? (d.y > 0 ? "bottom" : "top") : d.x > 0 ? "right" : "left"
  }
  const sAnchor = sideAnchor(a, fromSide!)
  const eAnchor = sideAnchor(b, toSide!)
  const o1 = outward(fromSide!)
  const o2 = outward(toSide!)
  // An elbow's first and last legs run from a side outward, so the gap comes out of their length.
  const legs = Math.min(Math.abs(horizontal(fromSide!) ? eAnchor.x - sAnchor.x : eAnchor.y - sAnchor.y), Math.abs(horizontal(toSide!) ? sAnchor.x - eAnchor.x : sAnchor.y - eAnchor.y))
  const g = gapFor(legs, maxGap)
  const s = { x: sAnchor.x + o1.x * g, y: sAnchor.y + o1.y * g }
  const tip = { x: eAnchor.x + o2.x * g, y: eAnchor.y + o2.y * g }
  if (horizontal(fromSide!) && !horizontal(toSide!)) return { pts: [s, { x: tip.x, y: s.y }, tip], g }
  if (!horizontal(fromSide!) && horizontal(toSide!)) return { pts: [s, { x: s.x, y: tip.y }, tip], g }
  if (horizontal(fromSide!)) {
    const mx = (s.x + tip.x) / 2
    return { pts: [s, { x: mx, y: s.y }, { x: mx, y: tip.y }, tip], g }
  }
  const my = (s.y + tip.y) / 2
  return { pts: [s, { x: s.x, y: my }, { x: tip.x, y: my }, tip], g }
}

function buildEdge(scene: SceneDef, layout: LayoutName, e: EdgeDef, nodes: Record<string, GNode>): GEdge {
  const id = e.id ?? `${e.from}-${e.to}`
  const o = scene.layouts[layout].edges?.[id] ?? {}
  const a = nodes[e.from]
  const b = nodes[e.to]
  const hidden = !!o.hidden || a.hidden || b.hidden
  const { pts, g } = route(a.rect, b.rect, e, o, scene.defaults?.hLane ?? 0, scene.defaults?.gap ?? 0)
  const radius = (o.route ?? e.route) === "elbow" ? (scene.defaults?.radius ?? 12) : 0
  const shaft = polyline(pts, radius)
  const tip = pts[pts.length - 1]
  const dir = unit(sub(tip, pts[pts.length - 2]))
  const out = unit(sub(pts[1], pts[0]))
  const ends: [Pt, Pt] = [
    { x: num(pts[0].x - out.x * g), y: num(pts[0].y - out.y * g) },
    { x: num(tip.x + dir.x * g), y: num(tip.y + dir.y * g) },
  ]
  const text = o.label === false ? undefined : (o.label ?? e.label)
  let label: GEdge["label"]
  if (text) {
    const at = o.labelAt ?? e.labelAt ?? "longest"
    let best = 0
    let bi = 1
    if (at === "last") bi = pts.length - 1
    else if (at === "longest") {
      for (let i = 1; i < pts.length; i++) {
        const l = len(sub(pts[i], pts[i - 1]))
        if (l > best + 0.5) {
          best = l
          bi = i
        }
      }
    }
    const p0 = pts[bi - 1]
    const p1 = pts[bi]
    const vertical = Math.abs(p1.x - p0.x) < 0.5
    const seg = len(sub(p1, p0))
    const w = pillWidth(text)
    // A pill must not hide its arrow: on a short vertical leg it sits beside the line, on a short horizontal one it is left out.
    if (vertical && seg < 80) label = { text, cx: num(p0.x + w / 2 + 12), cy: num((p0.y + p1.y) / 2), w, vertical, beside: true }
    else if (!vertical && w > seg - 16) label = undefined
    else label = { text, cx: num((p0.x + p1.x) / 2), cy: num((p0.y + p1.y) / 2), w, vertical }
  }
  return { id, from: e.from, to: e.to, shaft, tip, dir, ends, label, hidden }
}

export function computeGeo(scene: SceneDef, layout: LayoutName, content: Content): Geo {
  const { nodes, W, H, cols } = placeNodes(scene, layout, content)
  const edges = scene.edges.map((e) => buildEdge(scene, layout, e, nodes))
  return { w: W, h: H, cols, nodes, edges }
}

/** Validates a scene (ids used by edges, layouts and steps exist) and computes the geometry of both layouts. */
export function defineScene(def: SceneDef): Scene {
  const ids = new Set(Object.keys(def.nodes))
  const edgeIds = new Set(def.edges.map((e) => e.id ?? `${e.from}-${e.to}`))
  const fail = (m: string): never => {
    throw new Error(`Storyboard "${def.id}": ${m}`)
  }
  for (const e of def.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) fail(`edge ${e.from} -> ${e.to} points at an unknown node`)
  }
  for (const l of ["wide", "phone"] as const) {
    for (const id of ids) if (!def.layouts[l].nodes[id]) fail(`layout "${l}" does not place node "${id}"`)
    for (const id of Object.keys(def.layouts[l].nodes)) if (!ids.has(id)) fail(`layout "${l}" places unknown node "${id}"`)
  }
  for (const s of [...def.steps, ...(def.intro || [])]) {
    const st = s as { node?: string; edge?: string }
    if (st.node && !ids.has(st.node)) fail(`step ${s.t} uses unknown node "${st.node}"`)
    if (st.edge && !edgeIds.has(st.edge)) fail(`step ${s.t} uses unknown edge "${st.edge}"`)
  }
  const content = collectContent(def.steps)
  return { ...def, content, geo: { wide: computeGeo(def, "wide", content), phone: computeGeo(def, "phone", content) } }
}

export { txt }
