/**
 * Step constructors for a scene's loop. They only build plain data (so a scene can be rendered on the
 * server and handed to the browser as JSON), the animation lives in runtime.tsx.
 *
 * Steps run one after another. `delay` shifts a step's start (negative overlaps the previous one),
 * `together` starts it with the previous step instead of after it, and `caption` is the sentence shown
 * with a numbered marker for people who prefer reduced motion.
 */

/** Text that can differ between the wide and the phone layout. */
export type Txt = string | { wide?: string; phone?: string }
export const wp = (wide: string, phone: string): Txt => ({ wide, phone })
export const txt = (t: Txt | undefined, layout: "wide" | "phone"): string => (t === undefined ? "" : typeof t === "string" ? t : (t[layout] ?? t.wide ?? t.phone ?? ""))

export interface StepOpts {
  /** Seconds added to the step's start. Negative values overlap it with the previous step. */
  delay?: number
  /** Start together with the previous step instead of after it. */
  together?: boolean
  /** Sentence for the numbered reduced-motion captions. Steps without one are not listed. */
  caption?: string
}

export type Tone = "ok" | "bad"

export interface ChatMessage {
  from?: string
  time: string
  text: string
  file?: { name: string; meta: string; action?: string }
}

export type Step = StepOpts &
  (
    | { t: "enter"; stagger?: number }
    | { t: "wait"; s: number }
    | { t: "sending"; node: string; file: Txt }
    | { t: "beam"; edge: string; dur?: number }
    | { t: "trace"; edge: string }
    | { t: "flow"; edge: string }
    | { t: "pulse"; node: string; sub?: Txt; tone?: Tone; adv?: number; hold?: number }
    | { t: "ripple"; node: string; r?: number }
    | { t: "setSub"; node: string; text: Txt; icon?: boolean; tone?: Tone }
    | { t: "restoreSub"; node: string }
    | { t: "highlight"; node: string; hold?: number; tone?: Tone }
    | { t: "addRow"; node: string; text: Txt; meta?: string }
    | { t: "chatMessage"; node: string; msg: ChatMessage }
    | { t: "card"; node: string; sig?: string; scramble?: boolean }
    | { t: "cardResult"; node: string; status: string; ms?: number }
    | { t: "cardLine"; node: string; text: Txt }
    | { t: "moveNode"; node: string; to: number | "center" }
    | { t: "dim"; node: string; slide?: number }
    | { t: "undim"; node: string }
    | { t: "confirm"; node: string }
    | { t: "note"; node: string }
  )

type O = StepOpts

/** Tiles rise in one after another, every connector draws in as one gesture, the labels pop. Runs once, when the scene first scrolls into view. */
export const enter = (o: O & { stagger?: number } = {}): Step => ({ t: "enter", ...o })
/** Do nothing for a while. */
export const wait = (s: number, o: O = {}): Step => ({ t: "wait", s, ...o })
/** A node starts sending a file: its sublabel turns into the file name (and a sheet of paper rises if the node has one) and it gets highlighted. */
export const sending = (node: string, file: Txt, o: O = {}): Step => ({ t: "sending", node, file, ...o })
/** A bright packet travels along an edge from its source to its target. */
export const beam = (edge: string, o: O & { dur?: number } = {}): Step => ({ t: "beam", edge, ...o })
/** Draws a highlighted line along an edge and leaves it there until the loop ends. */
export const trace = (edge: string, o: O = {}): Step => ({ t: "trace", edge, ...o })
/** Dashes marching along an edge for the whole loop, for a connection that is always carrying data. */
export const flow = (edge: string, o: O = {}): Step => ({ t: "flow", edge, ...o })
/** Something arrives at a node: it bumps, its ring flashes and, if `sub` is given, its sublabel shows it for a moment. */
export const pulse = (node: string, sub?: Txt, o: O & { tone?: Tone; adv?: number; hold?: number } = {}): Step => ({ t: "pulse", node, sub, ...o })
/** Rings expand from a node, like a signal going out. */
export const ripple = (node: string, o: O & { r?: number } = {}): Step => ({ t: "ripple", node, ...o })
/** Crossfades a node's sublabel to new text. It stays until `restoreSub` or the end of the loop. */
export const setSub = (node: string, text: Txt, o: O & { icon?: boolean; tone?: Tone } = {}): Step => ({ t: "setSub", node, text, ...o })
export const restoreSub = (node: string, o: O = {}): Step => ({ t: "restoreSub", node, ...o })
/** Flashes a node's ring and holds it. */
export const highlight = (node: string, o: O & { hold?: number; tone?: Tone } = {}): Step => ({ t: "highlight", node, ...o })
/** A file row slides into a bucket node. */
export const addRow = (node: string, row: { text: Txt; meta?: string }, o: O = {}): Step => ({ t: "addRow", node, ...row, ...o })
/** A chat window shifts its old messages up and the new message slides in. */
export const chatMessage = (node: string, msg: ChatMessage, o: O = {}): Step => ({ t: "chatMessage", node, msg, ...o })
/** A request card slides in. With `scramble` the signature line decodes like a hash being computed. */
export const card = (node: string, c: { sig?: string; scramble?: boolean } = {}, o: O = {}): Step => ({ t: "card", node, ...c, ...o })
/** The card's status pill goes from pending to the result, with a counter for the milliseconds. */
export const cardResult = (node: string, r: { status: string; ms?: number }, o: O = {}): Step => ({ t: "cardResult", node, ...r, ...o })
/** A last line on the card with a drawn check mark. */
export const cardLine = (node: string, text: Txt, o: O = {}): Step => ({ t: "cardLine", node, text, ...o })
/** Moves a node to another grid column, or to the middle of the picture. It returns at the end of the loop. */
export const moveNode = (node: string, to: number | "center", o: O = {}): Step => ({ t: "moveNode", node, to, ...o })
/** Fades a node out (sliding it `slide` px sideways) together with the edges attached to it. */
export const dim = (node: string, o: O & { slide?: number } = {}): Step => ({ t: "dim", node, ...o })
export const undim = (node: string, o: O = {}): Step => ({ t: "undim", node, ...o })
/** A green ring and a check mark on a node. */
export const confirm = (node: string, o: O = {}): Step => ({ t: "confirm", node, ...o })
/** Reveals a `note` node (a caption pill). */
export const note = (node: string, o: O = {}): Step => ({ t: "note", node, ...o })

/** What the markup needs to render, collected from the steps so the content is only written once. */
export interface Content {
  rows: Record<string, { text: Txt; meta?: string }[]>
  chat: Record<string, ChatMessage>
  card: Record<string, { sig?: string; scramble?: boolean; status?: string; ms?: number; line?: Txt }>
  confirm: Set<string>
}

export const collectContent = (steps: Step[]): Content => {
  const c: Content = { rows: {}, chat: {}, card: {}, confirm: new Set() }
  for (const s of steps) {
    if (s.t === "addRow") (c.rows[s.node] ??= []).push({ text: s.text, meta: s.meta })
    else if (s.t === "chatMessage") c.chat[s.node] = s.msg
    else if (s.t === "card") c.card[s.node] = { ...c.card[s.node], sig: s.sig, scramble: s.scramble }
    else if (s.t === "cardResult") c.card[s.node] = { ...c.card[s.node], status: s.status, ms: s.ms }
    else if (s.t === "cardLine") c.card[s.node] = { ...c.card[s.node], line: s.text }
    else if (s.t === "confirm") c.confirm.add(s.node)
  }
  return c
}
