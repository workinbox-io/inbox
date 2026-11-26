# Marketing site audit after the redesign

Method: Playwright at 1440 and 390 px over home, /pl, /pricing, /shared-mailbox, 6 app pages, /custom-apps, /security, /status, /self-hosted, /cloudflare-email-routing, /google-workspace-alternative, /vs, /vs/google-workspace, /docs, /privacy, /demo, 404. Full-page shots plus DOM checks (images, `///`, horizontal scroll, JS errors, tap targets, menus, focus). Shots and scripts: `/private/tmp/claude-501/-Users-kuba-Desktop-projects-apps-inbox/00dc0d4b-bdbe-4a26-9b13-524bc8b5c499/scratchpad/audit2/`.
Not checked: the legal pages other than /privacy, /pl subpages beyond home, Polish copy quality, dark mode (site is light only), real device behaviour. The Astro dev toolbar (dark pill) shows in the shots; ignore it.

Headline facts: no `///` anywhere (source and DOM), no horizontal scroll at 390 or 1440, no JS errors, all menus work and close on Esc, burger is 44 px. Main problem is screenshot overuse and the app/info pages still looking like another site from the new home.

## 1. Screenshots (public/marketing/*.webp, light only)

Every page shows exactly one full-width screen (about 1296x811 at 1440, 326x205 at 390, where it is unreadable) except the home. Mobile screens are decorative at that size.

| Page | Image | Size on screen (1440 / 390) | Meaningful? | Recommendation |
|---|---|---|---|---|
| Home hero | mail.webp | 1150x719 / 760 wide, cropped, scrolls inside window | No. Right pane is "No thread open", rail shows two full folder trees, long and noisy. | Swap for mail-thread.webp, or better a cropped faux-UI (3 thread rows + open message). At 390 show a faux card, not a shrunk shot. |
| Home Suite | mail-thread.webp (Mail tab, visible) | 964x603 / 326x205 | Yes on desktop, tiny on phone | Keep one, but crop to list + message and drop the rail |
| Home Suite | chat, notes, calendar, drive, contacts, collections (lazy, in hidden tab panels) | n/a until a tab is picked | Duplicates of the 6 app pages' hero shots | Replace by one-line faux-UI per app (3 to 4 rows of real-looking content) or by icons plus the "Replaces X" line already there. Saves 6 files, about 600 KB, from the home. |
| Home SharedInbox, Ai, Own, Switch | none (faux UI / text) | | Good: these are the persuasive parts | Keep this approach everywhere |
| /custom-domain-email | mail-thread.webp | 1296x811 / 326 | Yes, but identical to the Suite tab and to two other pages | Keep here only (it is the Mail page). |
| /google-workspace-alternative | mail-thread.webp | same | Duplicate, adds nothing to a switching guide | Delete; the Switch checklist faux UI from home fits better |
| /cloudflare-email-routing | mail-thread.webp | same | Duplicate, page is about routing, not the inbox | Delete, or a small faux "Routing -> Worker -> mailbox" diagram |
| /shared-mailbox | shared-mailbox.webp | same | Yes, shows a real customer question and sender panel | Keep |
| /team-chat | chat.webp | same | Weak: empty-ish top (welcome block, big blank), toolbar tiny | Swap for a crop of the conversation with replies and mentions |
| /shared-notes | notes.webp | same | Not viewed closely; fine in grid | Keep, crop to the editor |
| /team-calendar | calendar.webp | same | Not viewed closely | Keep, crop to the week |
| /shared-drive | drive.webp (48 KB, smallest) | same | Not viewed closely | Keep |
| /shared-contacts | contacts.webp | same | Not viewed closely | Keep |
| /custom-apps | collections.webp | same | Half-empty board columns (Review/Done blank) | Swap for list layout or a fuller board crop |
| /pricing, /security, /status, /self-hosted, /vs, /docs, legal, 404 | none | | | Correct, add nothing |
| mail-settings*.webp, mail-settings-dark, all `*-dark.webp` | unused on these pages | | | Delete dark files if the site stays light only (`Shot.astro` already loads light only) |

Totals: home 8 webp requests (2 visible), 6 app pages 1 each, mail-thread.webp used on 4 pages (home, custom-domain-email, google-workspace-alternative, cloudflare-email-routing). Target: home 1 (or 0, with faux UI), app pages 1 each cropped, the three guide pages 0.

## 2. Consistency (ranked)

1. **Two looks.** Home sections use blue (`text-primary`) sentence-case-ish labels ("THE WORKSPACE", "SWITCHING") and card styles of the new `site/home/*`; every other page (`components/site/Section.astro`, `Features.astro`, `Faq.astro`, `PricingCards.astro`, `AppPage.astro`) still uses tiny black uppercase side-column labels (CHAT, APPS, FAQ, ACCESS), "01..06" numbered hairline cells and a left-hand FAQ title. Fix: Section label -> same blue style as home (one class), or drop the side label on pages where the title is enough (it only repeats the page name: "CHAT / What it does", "APPS / Part of one workspace"). That also removes the empty 1/4-width side column that makes titles float far right of the content at 1440.
2. **Hero to content gap.** On sub-page heroes (`Hero.astro` in site/, used by AppPage and all info pages) the gradient ends and then about 150 px of blank lavender before the shot or first section (see /team-chat, /security). Home hero has none. Reduce `pt-24` on the first Wrapper (`AppPage.astro` line ~69) and the Hero bottom padding.
3. **Hero eyebrow on sub-pages** "WORK INBOX · CHAT" is 12 px, 70% white on mid-blue: low contrast and redundant with the h1. Remove or use the pill style from the home hero ("Open source · AGPL-3.0 ...").
4. **Coloured step blocks** (dark navy / ultramarine / lilac / pale) on /security, /self-hosted, /team-chat "Part of one workspace" are a third card style, and the pale fourth cell nearly disappears; /custom-apps shows an orphan 4th cell alone on a row. Use the hairline cards of the home or make the grid 2x2 / 4 columns.
5. **Feature grids on app pages** have large empty cells (text sits at the bottom of 150 px tall boxes, numbers at the top). Tighten to content height.
6. **/demo** is the old look (AuthLayout, rounded shadcn card, black button, no header or footer), 900 px of mostly white. Acceptable as a utility page, but the black rounded button is the only one on the site; use the site Button or move demo to MarketingLayout.
7. **404** (`NotFoundPage.astro` / `ErrorPage.astro`): hero fills the viewport, title tiny relative to it, links at the far bottom right. Compact it and show 4 useful links (home, pricing, docs, demo).
8. **Missing spaces** in copy: "Something else? Write tosupport@workinbox.io." on every FAQ block (all app pages, pricing, security, self-hosted; `Faq.astro` in site/). /google-workspace-alternative has "s.Ch" (a missing space after a full stop; grep its source). Also the `/pricing` page FAQ "Questions" title has no key-word `<em>` while home FAQ does.
9. **Mixed icon style**: the home uses stroke icons plus real brand logos (good); sub-pages have no icons at all. The Product menu shows icons. Optional: use the same app icons in the app pages' "Part of one workspace" cards.
10. **Hero decimals**: top bar says "EUR 1" while hero and pricing use "€1". Pick one (`formatMoney`).
11. **Home Own band** has "`.eml · vCard ·` / `CSV · .ics · ZIP`" wrapping badly at 1440 (dot left dangling at end of line 1). Use `whitespace-nowrap` per token or a smaller size.
12. **/pl**: nav is translated, but /pl nav links to `/security`, `/custom-apps`, `/status`, `/cloudflare-email-routing` (English, no /pl wrapper), and home footer "Cloudflare Email Routing inbox". Remaining English in the Polish home is the faux mail content ("Re: Contract and kickoff", folder names in the screenshot), which is expected (screenshot); the AI mock in Ai.astro should be translated or at least consistent. No other English UI strings found on /pl home. Add /pl/security, /pl/custom-apps to `TRANSLATED_PAGES` or make `lp()` leave those links explicit about language.

## 3. Usability and accessibility

Works: two-level header (utility bar + main), 4 mega menus (aria-expanded/controls, Esc closes and returns focus), language dropdown, mobile menu (accordions, 44 px close and burger, sticky Sign in / Start free), skip link ("Skip to content", translated on /pl), visible focus ring (2 px solid) on every stop, no JS errors, no horizontal overflow.

Issues:
1. **Tab order**: the utility bar (Self-host, Docs, Security, GitHub, EN, Sign in) comes before the logo, so 7 stops before the main nav. Put the utility `<nav>` after the main one in DOM (visually keep it on top with flex order) in `Navigation.astro`.
2. **Mobile hero image** (mail.webp at 760 px wide inside a 326 px window, clipped, with a visible dev-toolbar-like floating overlay inside the shot) is unreadable. See section 1.
3. **Tap targets under 24 px** at 390: inline text links ("Self-host for free" 18 to 24 px, "Read about this app" 20, "Live status page" 18, "See account security", "Pricing details" 20, footer inline mail link 21), home Switch checkboxes are 16 px (the whole row looks clickable; make the label cover the row with a 44 px height). Footer link lists are fine (about 28 px spacing). Give inline CTA links `py-2`/`min-h-10` on mobile.
4. **Contrast**: hero lead and eyebrow are white at 70 to 75% over the lighter blue band (about 3.5:1 at the brightest part of the gradient); raise to 90% or darken the gradient under the text. Footer "Status" dot is grey (probably not loaded in dev). Blue labels `text-primary` on lavender are about 5:1, fine.
5. **Mobile menu Esc**: after Esc the `#mobile-menu` still computed as visible in my check; verify it actually closes (not confirmed visually).
6. **Suite tabs on mobile** overflow horizontally (scrollable, fine) but the 7th tabs are cut with no cue; add a fade edge or wrap.
7. Home "Switch" box "What you give up" is good honesty, but sits under the CTA in 90% muted text; fine.
8. Header turns light when the language menu is opened after scrolling while hero is dark (state flip is visible in the shot); minor.

## 4. Messaging

Home passes the brief: the h1 "Your team's mail, chat, notes and files. Without the Google bill.", lead with price, two CTAs, facts strip. Gaps:
1. Hero shows an empty app and no price proof. Put "Google Business Starter $70 vs Work Inbox EUR 5 for 10 people" (brief message 1) as a line or faux card; it is the strongest claim and nowhere on the home.
2. Sub-page leads are fine, but the first screen of each app page never says "inside Work Inbox, one login, one price"; that appears 3 screens down ("Part of one workspace"). Add it to the lead sentence of each app page.
3. /google-workspace-alternative and /cloudflare-email-routing h1s ("Leave Google, keep your addresses.", "Email Routing forwards. Work Inbox answers.") are clear; but their hero lacks the price/trial line. Add the pricing sentence to the CTA row like the home.
4. /status h1 "System status." and /security "Protect access to your team's email." (reads like a how-to, not "how we protect it"): rename /security to "How we protect your team's mail" and lead with 2FA, per-person logins, audit log, open code.
5. FAQ closing line "Something else? Write to support@..." needs the space fix; and the home FAQ "Not in the list? A person reads support@" is a nice voice, reuse it on the other FAQs.

## Ranked fixes (impact first)

1. Replace the home hero shot with a meaningful crop or faux-UI, and show the price comparison. File: `src/components/site/home/Hero.astro` (line ~57). 
2. Remove the 6 lazy shots from the home Suite; use faux-UI or the logo/"Replaces" row only. `src/components/site/home/Suite.astro` (line ~63).
3. Drop mail-thread.webp from `/google-workspace-alternative` (page line ~92) and `/cloudflare-email-routing` (line ~73); crop chat and collections shots in `scripts/marketing-shots.ts`, then `pnpm shots chat` and `collections`. Delete unused `*-dark.webp` and `mail-settings*.webp`.
4. Restyle `Section.astro` label (blue, or removed), `Features.astro` cells, step blocks and `Faq.astro` to the home look; fix the hero to content gap in `AppPage.astro` and `site/Hero.astro`.
5. Fix the missing space in the FAQ footer line (`site/Faq.astro` or home/Faq.astro) and in /google-workspace-alternative.
6. Reorder the utility nav in `navy/global/Navigation.astro` so the main nav comes first in tab order.
7. Tap targets: inline links and Switch checkbox rows in `home/Switch.astro`.
8. /pl nav links to untranslated pages (`config/languages.ts` `TRANSLATED_PAGES`, `navy/global/menus.ts`).
9. Move /demo and 404 to the new look.
10. Unify "EUR 1" / "€1" and the Own band wrapping.
