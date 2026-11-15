import { BookOpen, Check, ChevronsUpDown, CreditCard, FolderKanban, LayoutDashboard, PanelLeft, Plus, Search, Settings } from "lucide-react"
import { Collapse, Field, Popover, Stage, Toast, Window, type Act, type Layout } from "@/components/stageshow/kit"
import { useSiteTheme } from "./site-theme"
import "./look.css"
import "./hero-demo.css"

// The homepage hero: the product's own Projects screen (components/app/projects-panel.tsx), as it
// looks in the app. One gesture: New project, a name typed, Create, and the row lands at the top of
// the list with the app's toast. Plays once when it scrolls into view; the poster is the result.
//
// Real strings: the nav, the page title and its button, the dialog, what is typed, the rows, the
// toast. Placeholder copy like the rest of the homepage: replace the rows with your product's.

type S = { dialog: boolean; name: string; created: boolean; toast: boolean }

const initial: S = { dialog: false, name: "", created: false, toast: false }
const NAME = "Launch plan"
const POSTER: S = { dialog: false, name: NAME, created: true, toast: true }

const ROWS = [
  { name: "Website redesign", sub: "New marketing site and docs · created 1d ago" },
  { name: "Mobile onboarding", sub: "Shorter sign-up on iOS and Android · created 4d ago" },
  { name: "Billing migration", sub: "Move customers to yearly plans · created Oct 18" },
  { name: "Q4 analytics", sub: "Dashboards for the board meeting · created Oct 15" },
  { name: "Partner API", sub: "Public endpoints for integrations · created Oct 12" },
]

const NAV = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderKanban, active: true },
  { label: "Billing", icon: CreditCard },
  { label: "Settings", icon: Settings },
]

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark("open")
  await a.move({ at: "new", x: 0.84, y: 0.66 })
  await a.wait(250)
  await a.click()
  await a.set({ dialog: true })
  await a.wait(650)
  a.mark("type")
  await a.type("name", NAME, { interval: 80 })
  await a.wait(500)
  a.mark("create")
  await a.move({ at: "create", x: 0.82, y: 0.66 })
  await a.wait(200)
  await a.click()
  await a.set({ dialog: false })
  await a.wait(180)
  a.mark("result")
  await a.set({ created: true })
  await a.wait(260)
  await a.set({ toast: true })
  // Step off the button the dialog left behind, onto empty panel
  await a.move("rest")
  await a.wait(2400)
}

function Row({ name, sub, compact }: { name: string; sub: string; compact: boolean }) {
  return (
    <div className="hd-row">
      <div className="hd-row__text">
        <div className="hd-row__name">{name}</div>
        <div className="hd-row__sub">{sub}</div>
      </div>
      {!compact && (
        <div className="hd-row__actions">
          <span className="hd-btn hd-btn--outline">Edit</span>
          <span className="hd-btn hd-btn--danger">Delete</span>
        </div>
      )}
    </div>
  )
}

function Scene({ s, layout }: { s: S; layout: Layout }) {
  const compact = layout === "compact"
  const rows = compact ? ROWS.slice(0, 4) : ROWS
  return (
    <>
      <Window url="acme.com/app/projects" urlShape="pill" className="hd-window" body={{ className: "hd-body" }}>
        <div className="hd-app">
          {!compact && (
            <nav className="hd-side">
              <div className="hd-org">
                <img src="/logo.svg" alt="" width={24} height={24} />
                <span>Acme</span>
              </div>
              <div className="hd-search">
                <Search size={14} strokeWidth={1.8} />
                <span>Search…</span>
                <kbd>⌘K</kbd>
              </div>
              {NAV.map((n) => (
                <div key={n.label} className="hd-nav" data-active={n.active || undefined}>
                  <n.icon size={15} strokeWidth={1.7} />
                  <span>{n.label}</span>
                </div>
              ))}
              <div className="hd-side__foot">
                <div className="hd-nav">
                  <BookOpen size={15} strokeWidth={1.7} />
                  <span>Documentation</span>
                </div>
                <div className="hd-user">
                  <span className="hd-user__avatar">A</span>
                  <span className="hd-user__name">Alex Morgan</span>
                  <ChevronsUpDown size={14} strokeWidth={1.7} />
                </div>
              </div>
            </nav>
          )}
          <main className="hd-panel">
            <div className="hd-bar">
              <PanelLeft size={15} strokeWidth={1.7} />
              <span className="hd-bar__rule" />
              <span>Projects</span>
            </div>
            <div className="hd-page">
              <div className="hd-head">
                <div>
                  <div className="hd-title">Projects</div>
                  {!compact && <div className="hd-desc">Everything your team is working on.</div>}
                </div>
                <span className="hd-btn hd-btn--primary hd-new" data-target="new" data-open={s.dialog || undefined}>
                  <Plus size={14} strokeWidth={2} />
                  {compact ? "New" : "New project"}
                </span>
              </div>
              <div className="hd-list">
                <Collapse open={s.created}>
                  <Row name={NAME} sub={compact ? "created just now" : "First milestones for the launch · created just now"} compact={compact} />
                </Collapse>
                {rows.map((r) => (
                  <Row key={r.name} name={r.name} sub={compact ? r.sub.split(" · ")[1]! : r.sub} compact={compact} />
                ))}
              </div>
              <span className="hd-rest" data-target="rest" />
            </div>
            <Toast show={s.toast} className="hd-toast" icon={<Check size={14} strokeWidth={2.4} />}>
              {NAME} created
            </Toast>
          </main>
          <div className="hd-scrim" data-show={s.dialog || undefined} />
        </div>
      </Window>

      <Popover show={s.dialog} origin="center" className="hd-dialog">
        <div className="hd-dialog__title">New project</div>
        <div className="hd-dialog__desc">Give it a name. You can change it later.</div>
        <Field label="Name" value={s.name} placeholder="Website redesign" focused={s.dialog} className="hd-field" />
        <div className="hd-dialog__label">Description</div>
        <div className="hd-textarea" />
        <div className="hd-dialog__foot">
          <span className="hd-btn hd-btn--outline">Cancel</span>
          <span className="hd-btn hd-btn--primary" data-target="create">
            {compact ? "Create" : "Create project"}
          </span>
        </div>
      </Popover>
    </>
  )
}

export default function HeroDemo() {
  const theme = useSiteTheme()
  return (
    <Stage
      width={1104}
      height={540}
      compact={{ below: 720, width: 358, height: 338 }}
      theme={theme}
      fidelity="realistic"
      initial={initial}
      poster={POSTER}
      script={script}
      play="once"
      cursor={{ at: { wide: { x: 760, y: 150 }, compact: { x: 236, y: 64 } } }}
      className="look-acme hd"
    >
      {(s, _rect, layout) => <Scene s={s} layout={layout} />}
    </Stage>
  )
}
