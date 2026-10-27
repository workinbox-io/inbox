import * as React from "react"
import { gsap } from "gsap"
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin"
import { txt, type Step, type Txt } from "./steps"

gsap.registerPlugin(DrawSVGPlugin)

/**
 * Animation runtime for storyboard scenes (see README.md). One React island per scene: it renders
 * nothing, it finds the SVG the server drew and drives it with GSAP.
 *
 * - The one-time entrance plays when the scene first scrolls into view, then the loop plays while it
 *   is on screen and pauses when it is not.
 * - Reduced motion: nothing is animated, the markup is the final frame (with numbered captions).
 * - The wide or the phone SVG is animated depending on the viewport, and rebuilt when it changes.
 * - Development only: `?i=0.9` holds the entrance at that time, `?t=3.2` holds the loop at that time
 *   (and puts the loop timeline on the figure as `sbLoop`, to step through it from a script).
 */

type Layout = "wide" | "phone"
interface Rect {
  x: number
  y: number
  w: number
  h: number
  col?: number
}
interface SlimGeo {
  w: number
  h: number
  cols: number[]
  nodes: Record<string, Rect>
}
interface Props {
  steps: Step[]
  intro?: Step[] | false
  loop?: { repeatDelay?: number; hold?: number }
  geo: Record<Layout, SlimGeo>
}

/** Easing and timing shared by every step, so scenes move the same way. */
const EASE = { inOut: "power2.inOut", out: "power3.out", exit: "sine.inOut", pop: "back.out(1.7)", pop2: "back.out(2)", slide: "power3.inOut" }
const BEAM_DUR = 0.9
const TONE = { ok: "#10b981", bad: "#f43f5e" }
/** The tint a node gets in a tone. The default tint comes from storyboard.css. */
const TINT = { ok: "rgba(16, 185, 129, 0.14)", bad: "rgba(244, 63, 94, 0.14)" }
const SIG_CHARS = "0123456789abcdef"

const NS = "http://www.w3.org/2000/svg"
type El = SVGElement
type TL = gsap.core.Timeline

interface Sub {
  el: El
  icon: El | null
  text: string
  x: number
}

interface Ctx {
  svg: SVGSVGElement
  layout: Layout
  geo: SlimGeo
  tl: TL
  /** Restoring tweens, played together at the end of the loop. Each gets the time to start at. */
  exits: ((at: number) => void)[]
  /** Called with the total length of the loop once it is known. */
  post: ((total: number) => void)[]
  done: Set<string>
  rows: Map<string, number>
}

const all = (root: ParentNode, sel: string) => gsap.utils.toArray<El>(root.querySelectorAll(sel))
const first = (root: ParentNode, sel: string) => root.querySelector<El>(sel)
const nodeEl = (c: Ctx, id: string) => first(c.svg, `[data-node="${id}"]`)
const edgeLine = (c: Ctx, id: string) => first(c.svg, `path.line[data-edge="${id}"]`)
const edgeParts = (c: Ctx, id: string) => all(c.svg, `path.line[data-edge="${id}"], .sb-pill[data-edge="${id}"], .flowline[data-edge="${id}"], .sb-handle[data-edge="${id}"]`)
const ringOf = (n: El | null) => (n ? first(n, ":scope > .ring") : null)
const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim()
/** Computed colours of `color-mix()` come back as `color(srgb r g b / a)`, which GSAP can't tween. This turns them into rgba(). */
const tweenable = (c: string) => {
  const m = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/)
  if (!m) return c
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.round(Number(v) * 255))
  return `rgba(${r}, ${g}, ${b}, ${m[4] ?? 1})`
}
const computed = (el: El | null, prop: "fill" | "stroke") => (el ? tweenable(getComputedStyle(el)[prop]) : "")

/** Runs `fn` once per key, for the state resets every loop starts from. */
const once = (c: Ctx, key: string, fn: () => void) => {
  if (c.done.has(key)) return
  c.done.add(key)
  fn()
}

// ---------------------------------------------------------------------------------------------
// building blocks

/**
 * Lights an edge: a spark runs along it from source to target, the line, its pill outline and the handles
 * turn blue at `from` and go back at `to`, or with the loop's exit when `to` is left out.
 */
function lightEdge(c: Ctx, id: string, from: number, to?: number) {
  const line = edgeLine(c, id)
  if (!line) return
  const pill = first(c.svg, `.sb-pill[data-edge="${id}"]`)
  const bg = pill && first(pill, "rect")
  const text = pill && first(pill, "text")
  const parts = [line, bg, text].filter((e): e is El => !!e)
  const P = cssVar(c.svg, "--primary")
  const base = { line: computed(line, "stroke"), bg: computed(bg, "fill"), edge: computed(bg, "stroke"), text: computed(text, "fill") }
  const tl = c.tl
  once(c, `edge:${id}`, () => tl.set(parts, { clearProps: "stroke,fill" }, 0))
  // Edges can share a trunk, so the lit one goes on top of the others.
  tl.call(() => all(c.svg, "path.line[data-edge]").pop()?.after(line as unknown as Node), undefined, from)
  tl.to(line, { stroke: P, duration: 0.5, ease: "sine.inOut" }, from)
  if (bg) tl.to(bg, { stroke: P, duration: 0.5, ease: "sine.inOut" }, from)
  if (text) tl.to(text, { fill: P, duration: 0.18, ease: "none" }, from + 0.2)
  const off = (at: number) => {
    tl.to(line, { stroke: base.line, duration: 0.8, ease: "sine.inOut" }, at)
    if (bg) tl.to(bg, { fill: base.bg, stroke: base.edge, duration: 0.8, ease: "sine.inOut" }, at)
    if (text) tl.to(text, { fill: base.text, duration: 0.2, ease: "none" }, at + 0.2)
    // hand the colours back to the stylesheet, so a theme switch in the meantime takes effect
    tl.set(parts, { clearProps: "stroke,fill" }, at + 0.85)
  }
  if (to === undefined) c.exits.push(off)
  else off(to)
  spark(c, id, line, from, to)
}

/** A short bright segment runs along the edge from source to target, then the target handle lights up. */
function spark(c: Ctx, id: string, line: El, from: number, to?: number) {
  const tl = c.tl
  const d = line.getAttribute("data-shaft")
  if (d) {
    const el = document.createElementNS(NS, "path") as unknown as El
    el.setAttribute("d", d)
    el.setAttribute("class", "spark")
    el.setAttribute("data-edge", id)
    line.insertAdjacentElement("afterend", el as unknown as Element)
    tl.set(el, { opacity: 0, drawSVG: "0% 0%" }, 0)
    tl.set(el, { opacity: 1 }, from)
    tl.to(el, { keyframes: [{ drawSVG: "0% 28%", duration: 0.3, ease: "power1.in" }, { drawSVG: "72% 100%", duration: 0.45, ease: "none" }, { drawSVG: "100% 100%", duration: 0.25, ease: "power1.out" }] }, from)
    tl.set(el, { opacity: 0 }, from + 1)
  }
  const handles = all(c.svg, `.sb-handle[data-edge="${id}"]`)
  const target = handles.find((h) => h.getAttribute("data-end") === "1")
  const source = handles.find((h) => h.getAttribute("data-end") === "0")
  const P = cssVar(c.svg, "--primary")
  once(c, `handles:${id}`, () => tl.set(handles, { clearProps: "fill,stroke" }, 0))
  if (source) tl.to(source, { fill: P, stroke: P, duration: 0.25, ease: "sine.inOut" }, from)
  if (target) tl.to(target, { fill: P, stroke: P, duration: 0.25, ease: "sine.inOut" }, from + 0.85)
  const off = (at: number) => tl.set(handles, { clearProps: "fill,stroke" }, at + 0.85)
  if (to === undefined) c.exits.push(off)
  else off(to)
}

const subOf = (c: Ctx, id: string): Sub | null => {
  const tile = nodeEl(c, id)
  const el = tile && first(tile, ".sb-sub")
  if (!tile || !el) return null
  return { el, icon: first(tile, ".sb-subicon"), text: el.textContent ?? "", x: Number(el.getAttribute("x")) }
}

const resetSub = (c: Ctx, id: string) =>
  once(c, `sub:${id}`, () => {
    const s = subOf(c, id)
    if (!s) return
    c.tl.set(s.el, { textContent: s.text, opacity: 1, attr: { x: s.x }, clearProps: "fill" }, 0)
    if (s.icon) c.tl.set(s.icon, { opacity: 0 }, 0)
    c.exits.push((at) => swapSub(c, id, null, at))
  })

/** Crossfades a sublabel to new text (or back to the original), optionally with the small file icon in front. */
function swapSub(c: Ctx, id: string, text: string | null, at: number, icon = false, tone?: "ok" | "bad") {
  const s = subOf(c, id)
  if (!s) return
  const tl = c.tl
  tl.to(s.el, { opacity: 0, duration: 0.14 }, at)
  tl.set(s.el, { textContent: text ?? s.text, attr: { x: s.x + (icon ? 18 : 0) }, ...(tone ? { fill: tone === "bad" ? "#f43f5e" : "#10b981" } : { clearProps: "fill" }) }, at + 0.14)
  tl.to(s.el, { opacity: 1, duration: 0.22 }, at + 0.14)
  if (s.icon) tl.to(s.icon, { opacity: icon ? 1 : 0, duration: 0.22 }, at + 0.14)
}

/** The tint of a node (or the outline of a chat window) in a tone, or back to the stylesheet's. */
const tint = (ring: El, tone?: "ok" | "bad") =>
  ring.closest(".sb-chat") ? (tone ? { stroke: TONE[tone] } : { clearProps: "stroke" }) : tone ? { fill: TINT[tone], stroke: TONE[tone] } : { clearProps: "fill,stroke" }

/** Fades a node's tint in at `from` and out at `to`. */
function ringHold(c: Ctx, id: string, from: number, to: number, tone?: "ok" | "bad") {
  const ring = ringOf(nodeEl(c, id))
  if (!ring) return
  c.tl.set(ring, tint(ring, tone), from)
  c.tl.fromTo(ring, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.inOut" }, from)
  c.tl.to(ring, { opacity: 0, duration: 0.6, ease: "sine.inOut" }, to)
  ledOn(c, id, from, tone)
}
const resetRing = (c: Ctx, id: string) =>
  once(c, `ring:${id}`, () => {
    const ring = ringOf(nodeEl(c, id))
    if (ring) c.tl.set(ring, { opacity: 0, clearProps: "stroke,fill" }, 0)
  })

/** Something arrived: the tint washes over the node and fades, the status light comes on. */
const flashRing = (c: Ctx, id: string, at: number, tone?: "ok" | "bad") => {
  const ring = ringOf(nodeEl(c, id))
  if (!ring) return
  c.tl.set(ring, tint(ring, tone), at)
  c.tl.fromTo(ring, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.inOut" }, at)
  c.tl.to(ring, { opacity: 0, duration: 0.8, ease: "sine.inOut" }, at + 0.4)
  ledOn(c, id, at, tone)
}

/** Turns a tile's status light on (green, or red for `bad`) with a soft glow. It stays on until the loop's exit. */
function ledOn(c: Ctx, id: string, at: number, tone?: "ok" | "bad") {
  const tile = nodeEl(c, id)
  const led = tile && first(tile, ":scope > .led-on")
  const glow = tile && first(tile, ":scope > .led-glow")
  if (!led || !glow) return
  const origin = `${glow.getAttribute("cx")} ${glow.getAttribute("cy")}`
  once(c, `led:${id}`, () => {
    c.tl.set([led, glow], { opacity: 0, clearProps: "fill" }, 0)
    c.exits.push((x) => c.tl.to([led, glow], { opacity: 0, duration: 0.5, ease: EASE.exit }, x))
  })
  c.tl.set([led, glow], { fill: TONE[tone ?? "ok"] }, at)
  c.tl.to(led, { opacity: 1, duration: 0.3, ease: "sine.inOut" }, at)
  c.tl.fromTo(glow, { opacity: 0, scale: 0.6, svgOrigin: origin }, { opacity: 0.35, scale: 1.5, duration: 0.4, ease: "sine.out" }, at)
  c.tl.to(glow, { opacity: 0.2, scale: 1, duration: 0.6, ease: "sine.inOut" }, at + 0.4)
}

/** Hides `el` at the start of every loop and fades it out again at the end. */
const transient = (c: Ctx, el: El | El[] | null, from: gsap.TweenVars = { opacity: 0 }, exitDur = 0.5) => {
  if (!el || (Array.isArray(el) && !el.length)) return
  c.tl.set(el, from, 0)
  c.exits.push((at) => c.tl.to(el, { opacity: 0, duration: exitDur, ease: EASE.exit }, at))
}

// ---------------------------------------------------------------------------------------------
// steps. Each returns how long the step lasts (`dur`) and when the next sequential step may start (`adv`).

type Run = (c: Ctx, s: never, at: number) => { adv: number; dur: number }
const RUN: Record<Step["t"], Run> = {} as never
const def = <T extends Step["t"]>(t: T, fn: (c: Ctx, s: Extract<Step, { t: T }>, at: number) => { adv: number; dur: number }) => {
  RUN[t] = fn as unknown as Run
}
/** Default start offset per step type, so the usual sequences line up without writing delays. */
const LEAD: Partial<Record<Step["t"], number>> = { pulse: -0.05, addRow: -0.05, card: -0.15, chatMessage: -0.1 }

def("enter", (c, s) => {
  const tiles = all(c.svg, ".sb-tile")
  const pills = all(c.svg, ".sb-pill")
  const lines = all(c.svg, "path.line[data-edge]")
  const handles = all(c.svg, ".sb-handle")
  gsap.set(tiles, { opacity: 0, y: 16 })
  gsap.set([...pills, ...handles], { opacity: 0, scale: 0.85, transformOrigin: "50% 50%" })
  gsap.set(lines, { drawSVG: "0%" })
  const tl = c.tl
  const st = s.stagger ?? 0.1
  tl.to(tiles, { opacity: 1, y: 0, duration: 0.7, ease: EASE.out, stagger: st })
  const from = tl.duration() - 0.55
  tl.to(lines, { drawSVG: "100%", duration: 0.9, ease: EASE.inOut, stagger: 0.08 }, from)
  tl.to(handles, { opacity: 1, scale: 1, duration: 0.35, ease: EASE.pop, stagger: 0.03 }, from - 0.1)
  tl.to(pills, { opacity: 1, scale: 1, duration: 0.45, ease: EASE.pop, stagger: 0.07 }, from + 0.3)
  return { adv: tl.duration(), dur: tl.duration() }
})

def("wait", (_c, s) => ({ adv: s.s, dur: s.s }))

def("sending", (c, s, at) => {
  const file = txt(s.file as Txt, c.layout)
  resetSub(c, s.node)
  resetRing(c, s.node)
  const paper = first(c.svg, `[data-node="${s.node}"] .sb-paper`)
  if (paper) {
    transient(c, paper)
    c.tl.fromTo(paper, { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.8, ease: EASE.out }, at)
  }
  const t = at + (paper ? 0.4 : 0)
  swapSub(c, s.node, file, t, true)
  ledOn(c, s.node, t + 0.1)
  // The sublabel goes back after the file has left.
  swapSub(c, s.node, null, t + 2.3)
  return { adv: paper ? 1.1 : 0.7, dur: paper ? 3 : 2.6 }
})

def("beam", (c, s, at) => {
  const dur = s.dur ?? BEAM_DUR
  lightEdge(c, s.edge, at, at + dur + 0.3)
  return { adv: dur, dur: dur + 1.1 }
})

def("trace", (c, s, at) => {
  lightEdge(c, s.edge, at)
  return { adv: 0.6, dur: 0.5 }
})

def("flow", (c, s) => {
  const line = edgeLine(c, s.edge)
  const d = line?.getAttribute("data-shaft")
  if (!line || !d) return { adv: 0, dur: 0 }
  const p = document.createElementNS(NS, "path") as unknown as El
  p.setAttribute("d", d)
  p.setAttribute("class", "flowline")
  p.setAttribute("data-edge", s.edge)
  line.insertAdjacentElement("afterend", p as unknown as Element)
  c.tl.set(p, { strokeDashoffset: 0 }, 0)
  c.tl.set(p, { opacity: 1 }, 0.1)
  c.post.push((total) => c.tl.to(p, { strokeDashoffset: -43 * total, duration: total, ease: "none" }, 0))
  return { adv: 0, dur: 0 }
})

def("pulse", (c, s, at) => {
  const hold = s.hold ?? 1.05
  const sub = s.sub !== undefined ? txt(s.sub, c.layout) : null
  resetRing(c, s.node)
  flashRing(c, s.node, at, s.tone)
  if (sub !== null) {
    resetSub(c, s.node)
    swapSub(c, s.node, sub, at, false, s.tone)
    swapSub(c, s.node, null, at + hold)
  }
  return { adv: s.adv ?? 0.2, dur: sub !== null ? hold + 0.4 : 0.9 }
})

def("ripple", (c, s, at) => {
  const el = nodeEl(c, s.node)
  const r = c.geo.nodes[s.node]
  if (!el || !r) return { adv: 0.1, dur: 1.6 }
  // Outlines of the tile that grow out of it and fade. `r` is how far the outer one reaches (px).
  const rx = 14
  const rings = [0, 1].map(() => {
    const e = document.createElementNS(NS, "rect") as unknown as El
    e.setAttribute("class", "ripple")
    for (const [k, v] of Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, rx })) e.setAttribute(k, String(v))
    el.insertAdjacentElement("beforebegin", e as unknown as Element)
    return e
  })
  const d = Math.min(s.r ?? 24, 40)
  c.tl.set(rings, { opacity: 0 }, 0)
  rings.forEach((e, i) =>
    c.tl.fromTo(
      e,
      { opacity: 0.5, attr: { x: r.x, y: r.y, width: r.w, height: r.h, rx } },
      { opacity: 0, attr: { x: r.x - d, y: r.y - d, width: r.w + 2 * d, height: r.h + 2 * d, rx: rx + d }, duration: 1.2, ease: "power2.out" },
      at + i * 0.25,
    ),
  )
  return { adv: 0.1, dur: 1.6 }
})

def("setSub", (c, s, at) => {
  resetSub(c, s.node)
  swapSub(c, s.node, txt(s.text, c.layout), at, !!s.icon, s.tone)
  return { adv: 0, dur: 0.4 }
})
def("restoreSub", (c, s, at) => {
  resetSub(c, s.node)
  swapSub(c, s.node, null, at)
  return { adv: 0, dur: 0.4 }
})

def("highlight", (c, s, at) => {
  resetRing(c, s.node)
  ringHold(c, s.node, at, at + (s.hold ?? 1.5), s.tone)
  return { adv: 0.1, dur: (s.hold ?? 1.5) + 0.3 }
})

def("addRow", (c, s, at) => {
  const i = c.rows.get(s.node) ?? 0
  c.rows.set(s.node, i + 1)
  const row = all(c.svg, `[data-node="${s.node}"] .sb-row`)[i]
  resetRing(c, s.node)
  flashRing(c, s.node, at)
  if (row) {
    transient(c, row, { opacity: 0 })
    c.tl.fromTo(row, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: EASE.out }, at + 0.1)
  }
  return { adv: 0.65, dur: 1 }
})

def("chatMessage", (c, s, at) => {
  const root = nodeEl(c, s.node)
  if (!root) return { adv: 0, dur: 0 }
  const old1 = first(root, ".sb-old1")
  const old2 = first(root, ".sb-old2")
  const fresh = first(root, ".sb-new")
  const line = first(root, ".sb-bl")
  const attach = first(root, ".sb-attach")
  const SHIFT = 56
  const tl = c.tl
  // The window starts with its older messages and room for the new one.
  if (old1) tl.set(old1, { opacity: 1, y: 0 }, 0)
  if (old2) tl.set(old2, { opacity: 1, y: SHIFT }, 0)
  if (fresh) tl.set(fresh, { opacity: 0, y: 26 }, 0)
  if (line) tl.set(line, { opacity: 0, y: 6 }, 0)
  if (attach) tl.set(attach, { opacity: 0, scale: 0.9, transformOrigin: "0% 50%" }, 0)
  if (old1) tl.to(old1, { y: -SHIFT, opacity: 0, duration: 0.7, ease: EASE.slide }, at)
  if (old2) tl.to(old2, { y: 0, duration: 0.7, ease: EASE.slide }, at)
  if (fresh) tl.to(fresh, { opacity: 1, y: 0, duration: 0.7, ease: "back.out(1.4)" }, at + 0.15)
  if (line) tl.to(line, { opacity: 1, y: 0, duration: 0.45, ease: EASE.out }, at + 0.7)
  if (attach) tl.to(attach, { opacity: 1, scale: 1, duration: 0.55, ease: EASE.pop2 }, at + 1.4)
  c.exits.push((x) => {
    if (fresh) tl.to(fresh, { opacity: 0, y: 26, duration: 0.5, ease: EASE.exit }, x)
    if (old2) tl.to(old2, { y: SHIFT, duration: 0.6, ease: EASE.slide }, x + 0.2)
    if (old1) tl.fromTo(old1, { y: -SHIFT, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: EASE.slide }, x + 0.2)
  })
  return { adv: 1.4, dur: 2 }
})

def("card", (c, s, at) => {
  const root = nodeEl(c, s.node)
  if (!root) return { adv: 0, dur: 0 }
  const tl = c.tl
  const sig = first(root, ".sb-sig")
  const pending = first(root, ".sb-pending")
  const ok = first(root, ".sb-ok")
  const get = first(root, ".sb-get")
  const ms = first(root, ".sb-ms")
  const mark = first(root, ".sb-checkmark")
  const dot = first(root, ".cdot")
  tl.set(root, { opacity: 0, x: -36 }, 0)
  if (dot) tl.set(dot, { clearProps: "fill" }, 0)
  c.exits.push((x) => tl.to(root, { opacity: 0, duration: 0.5, ease: EASE.exit }, x))
  if (pending) tl.set(pending, { opacity: 0 }, 0)
  if (ok) tl.set(ok, { opacity: 0 }, 0)
  if (get) tl.set(get, { opacity: 0 }, 0)
  if (ms) tl.set(ms, { textContent: "0" }, 0)
  if (mark) tl.set(mark, { drawSVG: "0%" }, 0)
  if (sig) {
    const full = sig.textContent ?? ""
    if (s.scramble) {
      tl.set(sig, { textContent: "" }, 0)
      tl.to(sig, { duration: 1, ease: "none", scrambleText: { text: full, chars: SIG_CHARS, speed: 0.8, revealDelay: 0.1 } }, at + 0.4)
    } else {
      tl.set(sig, { opacity: 0 }, 0)
      tl.to(sig, { opacity: 1, duration: 0.4 }, at + 0.4)
    }
  }
  tl.fromTo(root, { opacity: 0, x: -36 }, { opacity: 1, x: 0, duration: 0.75, ease: "back.out(1.6)" }, at)
  if (pending) {
    tl.fromTo(pending, { opacity: 0, scale: 0.8, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, ease: EASE.pop2 }, at + 0.7)
    if (dot) tl.to(dot, { fill: "#f59e0b", duration: 0.3 }, at + 0.7)
    tl.to(pending, { opacity: 0, scale: 0.9, duration: 0.15 }, at + 1.6)
  }
  return { adv: pending ? 1.6 : 0.8, dur: 1.75 }
})

def("cardResult", (c, s, at) => {
  const root = nodeEl(c, s.node)
  const ok = root && first(root, ".sb-ok")
  const ms = root && first(root, ".sb-ms")
  const dot = root && first(root, ".cdot")
  if (dot) c.tl.to(dot, { fill: TONE.ok, duration: 0.3 }, at)
  if (ok) c.tl.fromTo(ok, { opacity: 0, scale: 0.8, transformOrigin: "20% 50%" }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" }, at)
  if (ms && s.ms !== undefined) c.tl.fromTo(ms, { textContent: 0 }, { textContent: s.ms, duration: 0.7, ease: "power1.out", snap: { textContent: 1 } }, at)
  return { adv: 0.5, dur: 0.7 }
})

def("cardLine", (c, s, at) => {
  const root = nodeEl(c, s.node)
  const get = root && first(root, ".sb-get")
  const mark = root && first(root, ".sb-checkmark")
  if (get) c.tl.fromTo(get, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, ease: EASE.out }, at)
  if (mark) c.tl.to(mark, { drawSVG: "100%", duration: 0.35, ease: "power2.out" }, at + 0.2)
  return { adv: 0.4, dur: 0.6 }
})

def("moveNode", (c, s, at) => {
  const el = nodeEl(c, s.node)
  const r = c.geo.nodes[s.node]
  if (!el || !r) return { adv: 0, dur: 0 }
  const dx = s.to === "center" ? c.geo.w / 2 - (r.x + r.w / 2) : (c.geo.cols[s.to] ?? 0) - (c.geo.cols[r.col ?? 0] ?? 0)
  c.tl.set(el, { x: 0 }, 0)
  c.tl.to(el, { x: dx, duration: 0.9, ease: EASE.slide }, at)
  c.exits.push((x) => c.tl.to(el, { x: 0, duration: 0.8, ease: EASE.slide }, x + 0.4))
  return { adv: 0.1, dur: 0.9 }
})

const attached = (c: Ctx, id: string) => all(c.svg, `path.line[data-from="${id}"], path.line[data-to="${id}"]`).flatMap((l) => edgeParts(c, l.getAttribute("data-edge")!))

def("dim", (c, s, at) => {
  const el = nodeEl(c, s.node)
  if (!el) return { adv: 0, dur: 0 }
  const edges = attached(c, s.node)
  const slide = s.slide ?? -60
  c.tl.set(el, { opacity: 1, x: 0 }, 0)
  c.tl.set(edges, { opacity: 1 }, 0)
  c.tl.to(el, { x: slide, opacity: 0, duration: 0.8, ease: EASE.slide }, at)
  c.tl.to(edges, { opacity: 0, duration: 0.5 }, at)
  c.exits.push((x) => {
    c.tl.to(el, { x: 0, opacity: 1, duration: 0.8, ease: EASE.out }, x + 0.4)
    c.tl.to(edges, { opacity: 1, duration: 0.6 }, x + 0.8)
  })
  return { adv: 0.1, dur: 0.9 }
})
def("undim", (c, s, at) => {
  const el = nodeEl(c, s.node)
  if (el) {
    c.tl.to(el, { x: 0, opacity: 1, duration: 0.8, ease: EASE.out }, at)
    c.tl.to(attached(c, s.node), { opacity: 1, duration: 0.6 }, at + 0.2)
  }
  return { adv: 0.1, dur: 0.8 }
})

def("confirm", (c, s, at) => {
  const root = nodeEl(c, s.node)
  if (!root) return { adv: 0, dur: 0 }
  const ring = ringOf(root)
  const check = first(root, ".sb-check")
  const mark = check && first(check, "path")
  if (ring) {
    c.tl.set(ring, { opacity: 0, ...tint(ring, "ok") }, 0)
    c.tl.to(ring, { opacity: 1, duration: 0.5 }, at + 0.2)
    c.exits.push((x) => c.tl.to(ring, { opacity: 0, duration: 0.5, ease: EASE.exit }, x))
  }
  if (check) {
    c.tl.set(check, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, 0)
    c.tl.to(check, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, at + 0.3)
    c.exits.push((x) => c.tl.to(check, { opacity: 0, duration: 0.5, ease: EASE.exit }, x))
  }
  if (mark) {
    c.tl.set(mark, { drawSVG: "0%" }, 0)
    c.tl.to(mark, { drawSVG: "100%", duration: 0.5, ease: "power2.out" }, at + 0.5)
  }
  return { adv: 0.5, dur: 1.1 }
})

def("note", (c, s, at) => {
  const el = nodeEl(c, s.node)
  if (!el) return { adv: 0, dur: 0 }
  c.tl.set(el, { opacity: 0, y: 12 }, 0)
  c.tl.to(el, { opacity: 1, y: 0, duration: 0.7, ease: EASE.out }, at)
  c.exits.push((x) => c.tl.to(el, { opacity: 0, duration: 0.5, ease: EASE.exit }, x))
  return { adv: 0.1, dur: 0.7 }
})

/** Lays the steps out on the timeline one after another, honouring `delay` and `together`. Returns where the last one ends. */
function schedule(c: Ctx, steps: Step[], start: number) {
  let cursor = start
  let prevStart = start
  let end = start
  for (const s of steps) {
    const run = RUN[s.t]
    if (!run) continue
    const at = Math.max(0, (s.together ? prevStart : cursor) + (s.delay ?? 0) + (s.together ? 0 : (LEAD[s.t] ?? 0)))
    const r = run(c, s as never, at)
    // A step that runs together with the previous one never pushes the sequence back.
    if (s.together) cursor = Math.max(cursor, at + r.adv)
    else {
      prevStart = at
      cursor = at + r.adv
    }
    end = Math.max(end, at + r.dur)
  }
  return end
}

function buildIntro(svg: SVGSVGElement, layout: Layout, geo: SlimGeo, steps: Step[]) {
  const tl = gsap.timeline({ paused: true })
  const c: Ctx = { svg, layout, geo, tl, exits: [], post: [], done: new Set(), rows: new Map() }
  schedule(c, steps, 0)
  return tl
}

function buildLoop(svg: SVGSVGElement, layout: Layout, geo: SlimGeo, steps: Step[], loop: Props["loop"]) {
  const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: loop?.repeatDelay ?? 1.2 })
  const c: Ctx = { svg, layout, geo, tl, exits: [], post: [], done: new Set(), rows: new Map() }
  const end = schedule(c, steps, 0.3)
  // A calm exit puts everything back before the loop starts again.
  const exitAt = end + (loop?.hold ?? 0.9)
  ;[...c.exits].reverse().forEach((fn) => fn(exitAt))
  const total = exitAt + 1.3
  tl.set({}, {}, total)
  c.post.forEach((fn) => fn(total))
  return tl
}

export function StoryboardMotion({ steps, intro, loop, geo }: Props) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const fig = ref.current?.closest<HTMLElement>(".sb")
    if (!fig) return
    let disposed = false
    const mm = gsap.matchMedia()

    const start = () => {
      mm.add({ wide: "(min-width: 640px)", phone: "(max-width: 639px)", motion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
        const cond = ctx.conditions as { wide: boolean; phone: boolean; motion: boolean }
        fig.removeAttribute("data-pending")
        if (!cond.motion) return
        const layout: Layout = cond.wide ? "wide" : "phone"
        const svg = fig.querySelector<SVGSVGElement>(`svg[data-layout="${layout}"]`)
        if (!svg) return

        const introTl = intro === false ? null : buildIntro(svg, layout, geo[layout], intro ?? [{ t: "enter" }])
        const loopTl = buildLoop(svg, layout, geo[layout], steps, loop)
        // Show the loop's starting state (rows and cards hidden) behind the entrance.
        loopTl.time(0.05)
        const cleanup = () => {
          introTl?.kill()
          loopTl.kill()
          svg.querySelectorAll(".ripple, path.flowline, path.spark").forEach((n) => n.remove())
        }

        const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null
        const seekIntro = params?.get("i") ?? null
        const seek = params?.get("t") ?? null
        if (seekIntro !== null) {
          introTl?.time(Number(seekIntro)).pause()
          return cleanup
        }
        if (seek !== null) {
          introTl?.progress(1)
          loopTl.time(Number(seek)).pause()
          // lets a script step through the loop frame by frame
          Object.assign(fig, { sbLoop: loopTl })
          return cleanup
        }

        let introDone = !introTl
        let active = false
        introTl?.eventCallback("onComplete", () => {
          introDone = true
          if (active) loopTl.play(0)
        })
        const io = new IntersectionObserver(
          ([e]) => {
            active = e.isIntersecting
            if (active) {
              if (introDone) loopTl.play()
              else introTl?.play()
            } else {
              introTl?.pause()
              loopTl.pause()
            }
          },
          { rootMargin: "-5% 0px -10% 0px" },
        )
        io.observe(fig)
        return () => {
          io.disconnect()
          cleanup()
        }
      })
    }

    // Only scenes with a scrambling card need the ScrambleText plugin, so it is loaded on demand.
    if (steps.some((s) => s.t === "card" && s.scramble)) {
      void import("gsap/ScrambleTextPlugin").then((m) => {
        if (disposed) return
        gsap.registerPlugin(m.ScrambleTextPlugin)
        start()
      })
    } else start()

    return () => {
      disposed = true
      mm.revert()
    }
  }, [steps, intro, loop, geo])

  return <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0" />
}
