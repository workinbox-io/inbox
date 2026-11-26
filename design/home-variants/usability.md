# Work Inbox marketing site: usability audit (Navy theme)

Method: Playwright at 1440 and 390 px against the running dev server (home, /pricing, /team-chat, /vs, /pl, /docs, /demo),
plus hover, keyboard and touch runs on the menus, mobile menu, tour tabs, pricing calculator, FAQ, anchors and focus states.
Contrast numbers are sampled from screenshots (text colour vs the pixel behind it). Screenshots and scripts:
`/private/tmp/claude-501/-Users-kuba-Desktop-projects-apps-inbox/00dc0d4b-bdbe-4a26-9b13-524bc8b5c499/scratchpad/audit/`.
Files: `src/components/navy/global/Navigation.astro` (Nav), `.../Footer.astro` (Footer), `src/layouts/MarketingLayout.astro`,
`src/components/site/*`, `src/config/site.ts`.
No horizontal overflow at 390 px on any page tested. The pill at the bottom of every screenshot is the Astro dev toolbar, ignore it.

## Ranked issues

### P0 (broken or clearly wrong)

1. **Language is two bare text links, not a dropdown.** Nav (desktop): a lone "Polski" link between the menus and GitHub, no
   globe, no code, no indication of the current language (it only shows the *other* one, so on /pl it reads "English").
   Mobile: "Polski" is a 14 px grey word in the middle of a row with GitHub and "Try the demo". Footer: "English Polski" in
   12 px, 2.7:1 contrast on the gradient, inside a column labelled STATUS, as a `<p aria-label>` (aria-label on a `p` is ignored).
   On untranslated pages (e.g. /security, most /docs/*) there is no language control at all, so the user cannot tell it is English-only.
   Fix: a compact dropdown (globe icon + "EN"/"PL" + chevron) in the Nav and the Footer, current language checked, other
   languages listed by their own name, a disabled "Polski (not translated yet)" row when the page has no translation. See spec.
   Files: Navigation.astro lines ~100-103 and ~176-180, Footer.astro `versions` block.

2. **Header is transparent over the dark footer and collides with its content.** At 390 px scrolled into the footer, the WORK INBOX
   logo and the hamburger sit directly on top of the "Drive / Contacts / vs Microsoft 365" links (screenshot `m-footer.png`).
   Same mechanism on desktop (`data-nav-clear` on the whole footer). Fix: the bar must always have a surface when anything scrolls
   under it. Make it solid (or blurred translucent, `bg-background/80 backdrop-blur`) as soon as `scrollY > 8`; stay transparent
   only at scroll 0 on a hero. Drop `data-nav-clear`/`data-nav-dark` on the footer.

3. **Missing spaces in copy (the `Text` + inline text rendering).** "this afternoon.Up to 5 people free" (footer CTA),
   "© 2026Swift Apps. Open source" (footer legal line), "Write tosupport@workinbox.io." (FAQ). Looks like a typo on a marketing site.
   Cause: whitespace between the expression and the neighbouring text/link is trimmed by the template. Fix: add `{" "}` or put
   the pieces in one `t()` string with a `{n}` placeholder. Check Footer.astro (two places) and Faq.astro and any other
   `... {x}` + `<a>` combinations (`grep -n "}<a\|</a>{" src/components/site`).

4. **Menu dropdowns can't be dismissed and have no state.** The Product/Compare/Resources panels are pure CSS
   (`group-hover` + `group-focus-within`):
   - Click a trigger, move the mouse away: the panel stays open (the button keeps focus). Escape does nothing (tested: open after
     Escape, both after hover and after Tab). The only way out is to click elsewhere.
   - Trigger has `aria-haspopup="true"` but no `aria-expanded`/`aria-controls`; Enter on the trigger toggles nothing
     (`aria-expanded` stays absent). Screen reader users get no open/closed state.
   - Tabbing past "Product" walks through all 12 panel links (then 7 for Compare) before reaching the next top-level item, with
     no way to skip. Fix with a real disclosure: click toggles, hover opens with a ~150 ms delay and closes with a ~200 ms
     grace period, Escape closes and returns focus to the trigger, ArrowDown moves into the panel, click outside closes.
   - Hover has no bridge-gap tolerance beyond `pt-4`: moving diagonally to a far item can close it. Keep the invisible padding and add the grace timer.

5. **Nav "Start free" is unreadable as a button on the dark hero.** On `/`, `/pricing`, `/pl` the primary CTA is a navy button on a
   navy gradient with a faint border (screenshots `d-_-top.png`, `d-_pricing-top.png`): it reads as plain text, and it's the
   one conversion control in the bar. Fix: on dark tone use the inverse button (white fill, ink text) like the hero's "Try the demo",
   or the ultramarine accent fill. Primary CTA must differ clearly from "Sign in" in both tones.

### P1 (hurts usability)

6. **Mobile menu is a 1746 px scroll of every link, CTAs at the very bottom.** 11 Product rows + 7 Compare rows + Pricing +
   4 Resources, all at 28 px display size, `///` section labels not interactive. "Sign in" / "Start free" only appear after
   scrolling ~900 px (`#mobile-menu` scrollHeight 1746 vs 844). Language, GitHub and demo are tiny afterthoughts.
   Fix: accordion groups (collapsed by default, one open at a time), 17-18 px rows with 48 px height, CTAs pinned to the bottom of the
   panel (`sticky bottom-0` with a hairline), language row with a label. Body scroll should be locked while open (it is not:
   `body overflow: visible`). Target: whole menu fits one screen collapsed (4 groups + Pricing + CTAs).

7. **Mobile header has no CTA.** At 390 px the bar is logo + hamburger only. Linear, Vercel and Stripe keep the primary button
   visible on phones. Fix: put a compact "Start free" (36 px high, becomes "Dashboard" when signed in) left of the hamburger.

8. **Contrast on the gradient.** Measured:
   - Hero fine print ("Free for up to 5 people ... on GitHub"): 1.7:1 to 2.6:1 on the pale part of the gradient (white at ~75% on #a5b4fb).
     Move it above the light band, make it fully white on the dark/blue part, or place it below the gradient on the ground colour.
   - Footer: link columns 3.3:1 (Mail), status 2.9:1, languages 2.7:1; they sit where the gradient is bright blue. Raise to
     `text-inverse-foreground` (>= 4.5:1) or push the link area into the dark half (`pt-56` / stronger `arch-gradient-flip`).
   - Hero sub text is 5.0:1 at best (ok); the eyebrow "OPEN SOURCE · AGPL-3.0" is fine.

9. **Header has no separation from content when scrolled.** Solid background identical to the page, no hairline or shadow, so
   headings slide under it and are cut mid-glyph ("What a team of 10 pays", screenshot `d-scroll-strip.png`). Add
   `border-b border-border` (or shadow) once `scrollY > 8`; this is also the hook for issue 2.

10. **/demo is a dead-end page in a different design.** "Try the demo" (hero, header link on mobile) leads to `/demo`, a grey
    rounded card in the old app style with no header, footer, back link or language switch, and then a second button "Open the demo".
    Two clicks to the same intent, and a visual jump out of the Navy theme. Fix: the hero button submits straight away
    (it is already a POST form; show "Creating your demo ..." on the button, disable it on submit), and the fallback GET page
    uses MarketingLayout (nav + footer) with a back link. (I did not submit the POST, it creates an org.)

11. **Docs pages are out of the new design and have no footer.** `/docs` keeps the old rounded sidebar, the rounded blue
    "Start free trial" pill and the unlabelled square arrow button next to the title (no aria-label/tooltip). Footer hidden
    (`footer={false}`), so docs readers lose language, status, legal and support links. Fix: keep the reading column clean but
    render a slim footer (language, status, GitHub, Support, Privacy/Terms) under the article; restyle the side CTA with the
    Navy `Button`; label the arrow button.

12. **Footer is a wall of links without the small essentials.** 4 columns, 34 links; "Switch" lists 6 competitors that
    duplicate the Compare menu. Language and status are crammed into the side column at 12 px and the status line only shows
    "Status" until the fetch resolves (no colour dot). Missing: GitHub icon/stars link in the footer bottom bar (it is in "Company" as
    "Source code" only), a theme-neutral place for language. Fix per spec below.

13. **No skip link.** First Tab on every page lands on the logo; keyboard users must pass the whole bar (and, with open
    dropdowns, dozens of links) to reach content. Add `<a href="#main" class="sr-only focus:not-sr-only">` and `id="main"` on `<main>`.

### P2 (polish)

14. **Focus styles are inconsistent.** Nav and hero buttons have `outline: none` with only a 50 % transparent ring (visible
    against white, nearly invisible on the dark/blue gradient). Dropdown links and `Sign in` use the browser's default `auto`
    outline. Define one `:focus-visible` style site-wide: 2 px solid ultramarine with 2 px offset, and white on `nav-dark` / footer.

15. **Tour tabs** (home, 7 tabs): ArrowLeft/Right work (roving tabindex, `aria-selected`), but Home/End do nothing
    (End stayed on Notes). Tab list has `aria-label`. On 390 px the tabs wrap to two rows and the screenshot is 325 px wide,
    too small to read any UI; allow horizontal scroll with the image enlarged (tap to zoom) or show a caption of what to look at.

16. **Pricing calculator.** Works by keyboard (arrows change 10 -> 15 and the sum updates) and it has a visible label, but: the
    range input is 16 px high (small tap target; make the thumb 24 px+ and the track tap-friendly), 1-100 only (no way to type 150),
    and the result is not an `aria-live` region, so a screen reader hears no change. Add a number field next to the slider.

17. **/pricing hero is 600 px tall and shows no price above the fold**, and has no CTA. 250 px of empty dark space above the
    heading (also on `/` where the first content starts at y=290). Reduce top padding (`pt-24` to ~`pt-12`) and put a primary
    "Start free" under the heading so the plan cards start within the first 700 px. "Most popular" is a 12 px blue label; make it a
    badge. Card gap between plan name and price is ~100 px of nothing at 1440.

18. **Nav "Pricing" sits ~2 px lower than the other items** (plain `<a>` vs flex buttons for the menu items): use the same
    `inline-flex items-center h-9` on all top-level entries.

19. **Tap targets (mobile).** Measured below 44 px: footer links 16-18 px high (rows are 24 px apart, so give links `py-2` for 40 px+),
    footer language links 16 px, status link 15 px, hero "Self-host for free" 20 px, the inline mobile-menu GitHub/language/demo links 18 px,
    hamburger/close buttons 36x36 (go 44x44). Docs mobile breadcrumbs row and its "Menu" are fine (~40).
    Desktop nav links are 20 px high but the row is 52 px; make the whole item `h-9` clickable.

20. **Anchors are fine** (`#faq`, `#pricing` land at 80 px below the viewport top, header 52 px, via `scroll-margin-top`), but the
    mobile menu closes and then scrolls with no highlight; OK to leave. `/#faq` from another page works.

21. **FAQ uses `<details>/<summary>`**: keyboard and screen reader friendly, plus icon rotates, good. Question rows are 64 px, good.
    Only gap: the "Something else? Write to ..." line (issue 3).

22. **Footer logo/brand line** duplicates the nav logo and the legal line says "© 2026Swift Apps": legal entity differs from the
    brand "Work Inbox" with no explanation. Say "Work Inbox is made by Swift Apps".

23. **Nav carries GitHub as plain text** between language and Sign in: reads like clutter. Linear/Vercel use an icon with the star count
    or push it to the footer. Icon button (24 px glyph, 40 px target, `aria-label="GitHub"`).

24. **Nav is not marking the current page** (`aria-current="page"` and an active style are absent), including inside dropdowns.

## What works (keep)

- Bar logic: solid light bar on normal sections, anchor offsets, `Esc` closes the mobile menu, menu is `inert` when closed, focus moves to close/toggle.
- Language switch preserves the path (`/pricing` to `/pl/pricing`), sets the locale cookie, and hreflang is emitted.
- Session swap: `Sign in` removed and `Start free` becomes `Dashboard` after `/api/auth/get-session` (does flash the logged-out state for a moment; hide the pair until resolved, or render both at the same width to avoid layout shift).
- Tour tab roles, FAQ details, calculator keyboard support, `scroll-margin-top`.

---

# Spec: navigation and footer as they should be

## Desktop navigation (>= 1024 px)

Layout, left to right: **Logo** | **Product v**, **Compare v**, **Pricing**, **Resources v** | (flex space) | **[globe EN v]**, **GitHub icon**, **Sign in**, **Start free**.

- Height 56 px, container as today. All top-level items 14 px / medium, `h-9`, `px-3`, same baseline; current page gets `aria-current="page"` and ink colour, others muted ink.
- Surface: at scroll 0 on a hero, transparent with white items; after 8 px of scroll, always solid (`bg-background/90 backdrop-blur`) with a 1 px bottom hairline, ink items. No transparent state over the footer or any other section.
- **Menus (Product, Compare, Resources):** trigger is a `<button aria-expanded aria-controls>`.
  - Click toggles; hover opens after 100-150 ms and closes 200 ms after the pointer leaves trigger and panel; moving between triggers switches panels without delay.
  - Escape closes and returns focus to the trigger; click outside closes; Tab out closes. ArrowDown on the trigger opens and focuses the first link; ArrowUp/Down move within the panel; Home/End jump.
  - Panel: today's two-column grid (icon, label, one-line description) is fine, add a subtle shadow (`shadow-lg`), a footer row ("Get started", "All comparisons"). Chevron rotates only when `aria-expanded="true"`.
  - Compare's panel (7 links, no descriptions) becomes a 2-column list of logos + names to stay compact.
- **Language dropdown:** button with a globe icon + the current code ("EN"/"PL") + chevron, `aria-label="Language: English"`, `aria-haspopup="menu"` and `aria-expanded`. Click opens a small right-aligned menu (min 160 px): each row is `Native name` (English, Polski) with a check on the current one; rows are links to the same page in that language (`hreflang`, `lang`, cookie on click). If the current page has no translation: show the other language as a disabled row with "not translated yet" text, never hide the control. Escape/click outside closes; same keyboard model as menus. The footer instance behaves identically (opens upward).
- **GitHub:** icon only (24 px glyph in a 40 px target, `aria-label`), optional star count; opens in a new tab with `rel="noopener"`.
- **Auth swap:** logged out shows `Sign in` (text) + `Start free` (primary filled). Logged in shows only `Dashboard` (primary). Render the logged-in state from a cookie hint or reserve the width so nothing shifts when the session check returns; never show both `Sign in` and `Dashboard`.
- **CTA contrast:** primary button is the ultramarine accent (or white on dark tone), never ink-on-ink. Same label/size on every page, `Start free` goes to `/signup`.
- Skip link first in the tab order, visible on focus.
- Focus ring: 2 px ultramarine, 2 px offset (white on dark tone).

## Mobile navigation (< 1024 px)

- Bar (56 px): Logo left; right side `Start free` (compact, 36 px, becomes `Dashboard`) and a 44x44 hamburger. (Sign in lives in the menu.)
- Menu: full-screen panel, `inert` when closed, body scroll locked while open, Escape and the close button dismiss it, focus trapped inside while open and restored to the toggle on close, closes on link click.
- Content, collapsed on open:
  1. Accordion rows **Product**, **Compare**, **Resources** (48 px, 18 px text, chevron, one open at a time, `aria-expanded`); **Pricing** is a plain row. Links inside an accordion are 44 px rows with the description in small grey text where there is one.
  2. A row "Language" showing the current language, opening an inline list of the languages (same rules as desktop).
  3. Secondary links as a row of text buttons: GitHub, Try the demo.
- Footer of the panel (sticky, always visible): `Sign in` (secondary) and `Start free` (primary), 48 px high, equal width. Logged in: one full-width `Dashboard`.
- Whole collapsed menu fits one 844 px screen without scrolling.

## Footer (all breakpoints)

- Top: the closing call to action as now (headline, `Start free`, `Self-host for free`), copy fixed for the missing spaces. Keep it on the light part of the gradient.
- Links: 4 columns on desktop (Product, Switch, Docs, Company), 2 columns on phones; links 14 px, >= 4.5:1 contrast on their background, `py-2` so rows are >= 40 px on touch. Keep "Switch" to the three non-competitor links plus "All comparisons" (the competitors are in the Compare menu and `/vs`).
- **Bottom bar** (hairline above): left `Work Inbox` logo + "© 2026 Swift Apps. Open source, AGPL-3.0."; right: **language dropdown (globe + code, opens upward)**, a status dot link ("All systems operational", green/amber/red dot, text from `/api/status`, "Status" while unknown), GitHub icon. On phones these stack: language dropdown and status on one row, legal below.
- Remove language and status from the side column; the side column stays empty or carries only the section label.
- Docs pages get the same footer in a slim version (bottom bar plus Privacy/Terms/Support), not no footer.
- Logo in the footer is not a second "Go to homepage" duplicate in the tab order unless needed (fine to keep, but the nav logo should be the single landmark with `aria-label`).

## Shared behaviours

- One `:focus-visible` rule; one `aria-current` rule for the active page (and `aria-current="true"` replaced with the correct `"page"`).
- Tap targets >= 44 px on touch (>= 32 px on desktop), applied through padding on the link, not the visible box.
- All menus close on route change and on resize across the 1024 px breakpoint.
- `prefers-reduced-motion`: no panel slide or chevron animation, instant open.
