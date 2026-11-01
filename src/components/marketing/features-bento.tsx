import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Check as CheckIcon, ChevronDown, X } from "lucide-react"
import { Avatar, Badge, Bar, Check, Collapse, Count, Stage, States, useReducedMotion, type Act } from "@/components/stageshow/kit"
import { useSiteTheme } from "./site-theme"
import "./look.css"
import "./features-bento.css"

// The features section as one bento grid (stageshow references/bento.md), built from the
// template's real features. Written before any tile was built:
//
//   Tile        Span  Kind       The one thing                      Moves
//   Teams       2     Hero UI    an invite becoming a member row     Invite settles to Sent, the row opens
//   Fast        1     Stat       "330+ cities", the one blue tile    the count rolls up
//   Sign-in     1     Object     a two-factor code                   digits fill, then Verified
//   API         1     Code       a POST and its 201                  the response opens
//   Jobs        1     Diagram    a retry, as a timeline              attempt 2 checks off
//   Audit log   2     List       who did what, and when              holds still
//
// No window chrome (the hero above has the one window); every neighbor is a different kind; no real
// string repeats across tiles. Each picture is its own Stage at 1:1, sized to its slot and cropped
// by the tile; the copy is page text. Each plays one beat, once, as the grid scrolls in, 110ms
// after the tile before it. Placeholder copy like the rest of the homepage.

const STEP = 110
const LEAD = 350

type Beat = { on: boolean }
const before: Beat = { on: false }
const after: Beat = { on: true }
const beat = (i: number) => async (a: Act<Beat>) => {
  await a.wait(LEAD + i * STEP)
  await a.set({ on: true })
}

/** The tile owns the crop: a Stage drawn at its slot's own size, so it never scales or slices early. */
function usePictureSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 320, height: 220 })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const r = node.getBoundingClientRect()
      setSize({ width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

function Tile({ area, lead, text, children }: { area: string; lead: string; text: string; children: ReactNode }) {
  return (
    <section className={`fb-tile fb-tile--${area}`}>
      <p className="fb-copy">
        <b>{lead}</b> {text}
      </p>
      {children}
    </section>
  )
}

function Picture<S extends Beat>({ index, children }: { index: number; children: (s: S, width: number) => ReactNode }) {
  const theme = useSiteTheme()
  const [ref, size] = usePictureSize()
  return (
    <div ref={ref} className="fb-picture">
      <Stage<Beat>
        width={size.width}
        height={size.height}
        theme={theme}
        initial={before}
        poster={after}
        play="once"
        script={beat(index)}
        className="look-acme fb-stage"
      >
        {(s) => children(s as S, size.width)}
      </Stage>
    </div>
  )
}

/* ---------------- Teams (hero) ---------------- */

function Teams() {
  return (
    <Tile area="teams" lead="Teams built in." text="Organizations, invitations and roles from day one.">
      <Picture index={0}>
        {(s, width) => (
          <div className="fb-card fb-team">
            <div className="fb-invite">
              <span className="fb-input">priya@lumen.dev</span>
              {width > 420 && (
                <span className="fb-select">
                  Admin <ChevronDown size={14} strokeWidth={1.8} />
                </span>
              )}
              <span className="fb-btn" data-on={s.on || undefined}>
                <States
                  value={s.on ? "sent" : "invite"}
                  states={{
                    invite: "Invite",
                    sent: (
                      <>
                        <CheckIcon size={14} strokeWidth={2.2} /> Sent
                      </>
                    ),
                  }}
                />
              </span>
            </div>
            <div className="fb-members">
              <Collapse open={s.on}>
                <div className="fb-member">
                  <Avatar name="Priya" size={32} />
                  <span className="fb-member__text">
                    <span className="fb-member__name">priya@lumen.dev</span>
                    <span className="fb-member__sub">Invited just now</span>
                  </span>
                  <Badge tone="accent">Admin</Badge>
                </div>
              </Collapse>
              <div className="fb-member">
                <Avatar name="Alex" size={32} tone="accent" />
                <span className="fb-member__text">
                  <span className="fb-member__name">Alex Morgan</span>
                  <span className="fb-member__sub">alex@acme.com</span>
                </span>
                <Badge>Owner</Badge>
              </div>
              <div className="fb-member">
                <Avatar name="Sam" size={32} />
                <span className="fb-member__text">
                  <span className="fb-member__name">Sam Lee</span>
                  <span className="fb-member__sub">sam@acme.com</span>
                </span>
                <Badge>Member</Badge>
              </div>
              <div className="fb-member">
                <Avatar size={32} plain />
                <span className="fb-member__text">
                  <Bar w={96} h={6} tone={3} />
                  <Bar w={128} h={5} tone={2} />
                </span>
                <Bar w={58} h={20} r={10} tone={1} />
              </div>
            </div>
          </div>
        )}
      </Picture>
    </Tile>
  )
}

/* ---------------- Fast (stat) ---------------- */

function useInView<T extends Element>(delay: number) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let t = 0
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        io.disconnect()
        t = window.setTimeout(() => setSeen(true), delay)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [delay])
  return [ref, seen] as const
}

function Fast() {
  const reduced = useReducedMotion()
  const [ref, seen] = useInView<HTMLDivElement>(LEAD + STEP)
  return (
    <section className="fb-tile fb-tile--fast" data-dark>
      <div ref={ref} className="fb-stat">
        <span className="fb-stat__lead">Fast everywhere.</span>
        <span className="fb-stat__number">
          <Count value={seen || reduced ? 330 : 300} duration={1100} />+
        </span>
        <span className="fb-stat__label">cities on Cloudflare's network serve your app, close to every user.</span>
      </div>
    </section>
  )
}

/* ---------------- Secure sign-in (object) ---------------- */

const CODE = "482913"

/** Google's "G", as the sign-in page draws it (components/auth). */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  )
}

function SignIn() {
  return (
    <Tile area="signin" lead="Secure sign-in." text="Email verification, Google and two-factor codes.">
      <Picture index={2}>
        {(s) => (
          <div className="fb-card fb-otp" data-on={s.on || undefined}>
            <div className="fb-otp__title">Two-factor code</div>
            <div className="fb-otp__cells">
              {CODE.split("").map((d, i) => (
                <span key={i} className="fb-otp__cell" style={{ "--i": i } as React.CSSProperties}>
                  <span className="fb-otp__digit">{d}</span>
                </span>
              ))}
            </div>
            <span className="fb-otp__status">
              <Badge tone="success" icon={<CheckIcon size={12} strokeWidth={2.4} />}>
                Verified
              </Badge>
            </span>
            <div className="fb-otp__or">or</div>
            <div className="fb-google">
              <GoogleMark />
              Continue with Google
            </div>
          </div>
        )}
      </Picture>
    </Tile>
  )
}

/* ---------------- REST API (code) ---------------- */

function Api() {
  return (
    <Tile area="api" lead="REST API." text="Organization keys and an OpenAPI 3.1 spec.">
      <Picture index={3}>
        {(s) => (
          <div className="fb-card fb-code">
            <div className="fb-code__line">
              <span className="fb-code__verb">POST</span> /api/v1/projects
            </div>
            <div className="fb-code__line fb-code__faint">Authorization: Bearer sk_…</div>
            <div className="fb-code__line fb-code__body">{'{ "name": "Q1 roadmap" }'}</div>
            <Collapse open={s.on}>
              <div className="fb-code__response">
                <Badge tone="success">201 Created</Badge>
                <div>
                  <div className="fb-code__line fb-code__faint">{'"id": "prj_8f2k",'}</div>
                  <div className="fb-code__line fb-code__faint">{'"status": "active"'}</div>
                </div>
              </div>
            </Collapse>
          </div>
        )}
      </Picture>
    </Tile>
  )
}

/* ---------------- Background jobs (diagram) ---------------- */

function Jobs() {
  return (
    <Tile area="jobs" lead="Background jobs." text="Queues and scheduled tasks that retry on their own.">
      <Picture index={4}>
        {(s) => (
          <div className="fb-timeline" data-on={s.on || undefined}>
            <div className="fb-step">
              <span className="fb-step__mark fb-step__mark--queued" />
              <span className="fb-step__text">
                <span className="fb-step__title fb-mono">send-invoice</span>
                <span className="fb-step__sub">queued 03:17</span>
              </span>
            </div>
            <div className="fb-step">
              <span className="fb-step__mark fb-step__mark--failed">
                <X size={10} strokeWidth={3} />
              </span>
              <span className="fb-step__text">
                <span className="fb-step__title">Attempt 1 failed</span>
                <span className="fb-step__sub">timeout, retrying</span>
              </span>
            </div>
            <div className="fb-step">
              <Check on={s.on} pending={!s.on} size={16} className="fb-step__check" />
              <span className="fb-step__text">
                <span className="fb-step__title">Attempt 2 done</span>
                <span className="fb-step__sub">in 1.2s</span>
              </span>
            </div>
            <span className="fb-timeline__rail" />
          </div>
        )}
      </Picture>
    </Tile>
  )
}

/* ---------------- Audit log (list) ---------------- */

const AUDIT = [
  { who: "Jordan Lee", what: "created API key", value: "CI", when: "12m ago" },
  { who: "Mia Chen", what: "changed plan to", value: "Pro yearly", when: "1h ago" },
  { who: "Noah Park", what: "renamed organization", value: "Northwind", when: "3h ago" },
]

function Audit() {
  return (
    <Tile area="audit" lead="Audit log." text="Who changed what, and when, for every organization.">
      <Picture index={5}>
        {(_s, width) => (
          <div className="fb-card fb-audit">
            {AUDIT.map((r) => (
              <div key={r.who} className="fb-audit__row">
                <span className="fb-audit__text">
                  <b>{r.who}</b> {r.what} <code>{r.value}</code>
                </span>
                {width > 380 && <span className="fb-audit__when">{r.when}</span>}
              </div>
            ))}
            {[
              [74, 110, 40],
              [62, 132, 34],
              [80, 96, 44],
            ].map(([a, b, c], i) => (
              <div key={i} className="fb-audit__row">
                <span className="fb-audit__text">
                  <Bar w={a!} h={6} tone={3} /> <Bar w={b!} h={6} tone={2} />
                </span>
                {width > 380 && <Bar w={c!} h={5} tone={2} />}
              </div>
            ))}
          </div>
        )}
      </Picture>
    </Tile>
  )
}

export default function FeaturesBento() {
  return (
    <div className="fb-grid">
      <Teams />
      <Fast />
      <SignIn />
      <Api />
      <Jobs />
      <Audit />
    </div>
  )
}
