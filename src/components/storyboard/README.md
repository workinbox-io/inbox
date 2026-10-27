# Storyboards

Animated SVG diagrams drawn straight on the page, in the style of a node editor: bordered cards on a
dotted canvas, joined by thin edges that run from handle to handle, with labels. When something
travels along an edge, a spark runs along it, the edge, its label and its handles turn blue, then go
back. You describe a scene (a grid, nodes, edges, and a list of steps) and the
framework computes the geometry, renders the SVG for a wide and a phone layout and animates it
with GSAP.

```
scene.ts      defineScene(): validates a scene and computes node rectangles, edge paths, label spots
steps.ts      step constructors (beam, pulse, addRow, ...), plain data, no GSAP
Scene.astro   <Scene scene={...} />: the figure, both SVG layouts, reduced-motion captions
Canvas.astro  one layout as SVG (Tile, Cylinder, Chat, Card, Note, Pill do the drawing)
runtime.tsx   the React island (client:visible) that runs the steps
storyboard.css  the look, all colours are CSS variables so light and dark just work
scenes/       the scenes we use: home.ts, provider.ts, use-cases.ts
```

## Define a scene

```ts
import { defineScene } from "../scene"
import { addRow, beam, pulse, sending, wp } from "../steps"

export const upload = defineScene({
  id: "upload", // unique on the page
  label: "A partner uploads a file and it lands in your bucket", // aria-label
  grid: { cols: 3, rows: 1, cell: [200, 96], gap: [284, 0], pad: [24, 0, 24, 0] },
  nodes: {
    partner: { kind: "tile", icon: "building", label: "Partner", sub: "exports files" },
    cf: { kind: "tile", logo: "/logo.svg", label: "CloudFile", sub: "managed SFTP" },
    bucket: { kind: "bucket", mono: "r2", label: "Cloudflare R2", sub: "no egress fees" },
  },
  edges: [
    { from: "partner", to: "cf", label: "SFTP :22" }, // id defaults to "partner-cf"
    { from: "cf", to: "bucket", label: "write" },
  ],
  layouts: {
    wide: { nodes: { partner: { at: [0, 0] }, cf: { at: [1, 0] }, bucket: { at: [2, 0], w: 240, align: "end" } } },
    phone: {
      grid: { cols: 1, rows: 3, cell: [130, 96], gap: [0, 54], pad: [0, 0, 0, 6] },
      size: [342, 424],
      nodes: { partner: { at: [0, 0] }, cf: { at: [0, 1] }, bucket: { at: [0, 2], w: 240, valign: "start" } },
      edges: { "cf-bucket": { lane: 0 } },
    },
  },
  steps: [
    sending("partner", "listings.xml"),
    beam("partner-cf", { caption: "A partner uploads over SFTP." }),
    pulse("cf", wp("received · 2.4 MB", "received")),
    beam("cf-bucket", { caption: "CloudFile writes the file into your bucket." }),
    addRow("bucket", { text: "listings.xml", meta: "2.4 MB" }),
  ],
})
```

Then `<Scene scene={upload} />` in any `.astro` page. Put it in a `div` with the page's usual
`reveal mx-auto mt-12 w-full` classes for the homepage look.

### Grid and nodes

`grid.cell` is the size of one cell, `gap` is `n` or `[x, y]`, `pad` is `n` or `[top, right, bottom, left]`.
The viewBox is derived from them (or forced with a layout's `size`). A node is placed in a cell with
`at: [col, row]` (fractions are fine, `[1, 0.5]` is between two rows). It can be bigger or smaller than
its cell: `align` and `valign` say where it sits, `x`/`y` place it absolutely, `dx`/`dy` nudge it.

| kind     | draws | content |
| -------- | ----- | ------- |
| `tile`   | a bordered card with a status light in the corner (hidden until something happens) | `icon` (see `icons.ts`), `logo` (image) or `mono` (provider glyph id), `label`, `sub`, `paper` |
| `bucket` | a tile for files (`providers` glyph row, file rows from `addRow`) or, with `shape: "cylinder"`, a tall showcase card for `cycleLogos` with a strip of linked provider logos | `label`, `sub`, `providers` |
| `chat`   | a chat window (channel, older messages, the new message from `chatMessage`) | `channel`, `history` |
| `card`   | a request card: method badge, path and status light in a header, content from `card`, `cardResult` and `cardLine` | `title` (`"POST /path"`), `attach` (a node id: a dashed line to it when they sit side by side or one above the other) |
| `note`   | a caption pill | `text` |

Everything in a node can be overridden per layout (`label`, `sub`, `providers`, `text`, `attach`, size), so
the phone layout can say `sub: "listener"` where the wide one says `"event listener"`.

### Edges

An edge is one path with no arrowhead: it runs from a handle on its source to a handle on its target
(the small circles drawn where it meets a tile or bucket), and the spark of `beam` and `trace` shows
the direction. `defaults.gap` leaves space between the edge and the nodes instead (0 by default). The
label pill sits on the middle of the edge. On a short vertical leg it sits beside the line instead,
and on a horizontal edge too short for it the label is left out, so a pill never hides its edge.

- `route: "straight"` (default) runs between two facing sides and shifts by `lane` px from the middle
  of the overlap. Horizontal edges default to `defaults.hLane` (0, the middle).
- `route: "elbow"` with `fromSide` and `toSide` turns once (L shape) or twice (Z shape between
  parallel sides). Corners are rounded (`defaults.radius`, 12). `labelAt: "first" | "last"` picks the
  segment that carries the label, which keeps labels apart when several edges share a node.
- A layout can override an edge by id (`edges: { "cf-app": { lane: 0, label: false } }`). `null` for a
  side drops the side the edge definition gave.

## Steps

Steps run one after another. Every step takes `delay` (seconds added to its start, negative overlaps
the previous step), `together` (start with the previous step instead of after it) and `caption` (the
sentence for the numbered reduced-motion list, steps without one are not listed). Text can be a string
or `wp("wide text", "phone text")`.

| step | what it does |
| ---- | ------------ |
| `enter()` | tiles rise in, handles pop, every edge draws from its source, labels pop. Runs once on first view. It is the default intro, so you only write it to tune `stagger` |
| `sending(node, file)` | the status light comes on, the sublabel becomes the file name (and the node's paper rises) |
| `beam(edge)` | a spark runs along the edge, the edge, its label and handles turn blue, then go back |
| `trace(edge)` | like `beam`, but the edge stays blue until the end of the loop |
| `flow(edge)` | dashes march along the edge for the whole loop |
| `pulse(node, sub?, {tone, hold, adv})` | arrival: a tint washes over the node, the status light comes on, optional temporary sublabel. `tone: "bad"` makes both red |
| `ripple(node, {r})` | outlines of the node grow `r` px (default 24) out of it and fade |
| `setSub(node, text)` / `restoreSub(node)` | crossfade a sublabel, it returns at the end of the loop |
| `highlight(node, {hold})` | tint the node and hold it |
| `addRow(node, {text, meta})` | a file row slides into a bucket tile |
| `chatMessage(node, msg)` | older messages move up, the new one slides in with an optional file attachment |
| `card(node, {sig, scramble})`, `cardResult(node, {status, ms})`, `cardLine(node, text)` | the request card: slide in with a scrambling signature value, pending (amber light) turns into the status (green light) with a ms counter, a closing line with a check |
| `cycleLogos(node)` | big provider logos one after another in a showcase bucket |
| `moveNode(node, col or "center")`, `dim(node)`, `undim(node)` | scene changes: slide a node to a column or the middle, fade a node and its edges (handles included) |
| `confirm(node)` | green tint and check badge |
| `note(node)` | reveals a note node |
| `wait(s)` | a pause |

Content that has to be in the markup (rows, chat message, card lines) is written once, in the step, and
collected for rendering. Everything a step changes is reset at the start of every loop and put back with
a calm fade at the end, so you never write the restore yourself.

`loop: { repeatDelay, hold }` sets the pause between loops and how long the last frame stays.
`intro: false` or `intro: [...]` replaces the entrance.

## Adding things

- A new step: add a constructor and a type to `steps.ts`, then `def("name", (ctx, step, at) => ({ adv, dur }))`
  in `runtime.tsx`. `adv` is when the next sequential step may start, `dur` how long it keeps animating.
  Use `EASE`, the `bump`/`flashRing`/`swapSub` helpers and `c.exits.push(...)` for the restore.
- A new icon: add its paths to `icons.ts` (Lucide, rects and circles converted to paths).
- A new node kind: a component next to `Tile.astro`, then a branch in `Canvas.astro` and a default size in `scene.ts`.

## Built in

- The entrance plays once when the scene scrolls into view, the loop plays while it is on screen and
  pauses when it is not (IntersectionObserver).
- `prefers-reduced-motion`: nothing animates, the markup is the final frame with numbered markers and
  the captions listed below it.
- The wide or phone layout is animated depending on the viewport and rebuilt when it changes.
- Light and dark mode come from the CSS variables in `storyboard.css`.
- GSAP core and DrawSVG are always loaded, ScrambleText only for scenes with a scrambling card.
- Development only: `?i=0.9` holds the entrance at 0.9 s, `?t=3.2` holds the loop at 3.2 s. Handy
  for screenshots.
