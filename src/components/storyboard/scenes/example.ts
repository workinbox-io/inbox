/** An example scene to copy from: a customer uploads, your product stores the file and sends a signed webhook to your API. */
import { defineScene } from "../scene"
import { addRow, beam, card, cardLine, cardResult, pulse, ripple, sending, setSub, trace, wp } from "../steps"

export const example = defineScene({
  id: "example",
  label: "A customer uploads a report, your product stores it and sends a signed webhook to your API",
  grid: { cols: 3, rows: 2, cell: [200, 96], gap: [284, 112], pad: [24, 0, 32, 0] },
  nodes: {
    user: { kind: "tile", icon: "users", label: "Customer", sub: "uploads a report" },
    app: { kind: "tile", logo: "/logo.svg", label: "Your product", sub: "event received" },
    store: { kind: "bucket", icon: "database", label: "Storage", sub: "reports" },
    api: { kind: "tile", icon: "code", label: "Your API", sub: "api.example.com" },
    req: { kind: "card", title: "POST /webhooks/events", attach: "api" },
  },
  edges: [
    { from: "user", to: "app", label: "HTTPS" },
    { from: "app", to: "store", label: "save" },
    { from: "app", to: "api", label: "webhook" },
    { from: "api", to: "store", route: "elbow", fromSide: "right", toSide: "bottom", label: "GET file" },
  ],
  layouts: {
    wide: {
      nodes: {
        user: { at: [0, 0] },
        app: { at: [1, 0] },
        store: { at: [2, 0], w: 220, align: "end" },
        api: { at: [1, 1] },
        req: { x: 150, y: 214 },
      },
    },
    phone: {
      grid: { cols: 2, rows: 3, cell: [130, 96], gap: [70, 54], pad: [0, 6, 0, 6] },
      size: [342, 592],
      nodes: {
        user: { at: [0, 0], sub: "uploads" },
        app: { at: [0, 1], sub: "received" },
        store: { at: [0, 2], w: 150, valign: "start" },
        api: { at: [1, 1], sub: "/webhooks" },
        req: { x: 0, y: 446, w: 342, attach: false },
      },
      edges: {
        "app-api": { lane: 0 },
        "api-store": { fromSide: "bottom", toSide: "right", label: false },
      },
    },
  },
  steps: [
    sending("user", "q3-report.csv"),
    beam("user-app", { caption: "A customer uploads a report." }),
    pulse("app", wp("received · 1.2 MB", "received")),
    beam("app-store", { caption: "Your product stores the file." }),
    addRow("store", { text: "q3-report.csv", meta: "1.2 MB" }),
    ripple("app"),
    beam("app-api", { caption: "Your API gets a signed webhook." }),
    card("req", { sig: "X-Signature: t=…,v1=…", scramble: true }),
    pulse("api", undefined, { together: true, delay: 0.1 }),
    cardResult("req", { status: "200 OK", ms: 64 }, { delay: 0.05 }),
    setSub("api", wp("200 OK · 64 ms", "200 OK"), { together: true, delay: 0.05 }),
    trace("api-store", { caption: "It replies 200 and fetches the file." }),
    cardLine("req", "GET q3-report.csv"),
  ],
  loop: { repeatDelay: 1.3, hold: 0.95 },
})
