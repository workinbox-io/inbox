# Work Inbox home: messaging brief

Scope: the home page (`src/pages/index.astro`) only. Content strategy and section outline, no visual design.
Facts are from CLAUDE.md, `config/{site,apps,plans,compare,nav}.ts` and `public/marketing/*.webp`. Claim only what ships.

## 1. Promise and supporting messages

**Promise (one sentence):** Work Inbox is the whole team workspace (mail on your own domain, chat, notes, calendar, drive, contacts) that replaces Google Workspace for a fraction of the price, and it is open source.

Headline form: *Replace Google Workspace. Keep your domain. Pay almost nothing.* (see section `hero`).

Ranked supporting messages:
1. **It costs almost nothing.** First 5 people free, then EUR 1 per person per month (Starter). A team of 10 pays EUR 5/month; Google Business Starter is $70 for the same 10 (from `race` in config, `seatsFor(10)=5`). One price covers every app; shared mailboxes and aliases are free.
2. **It is a real suite you can try in 30 seconds.** Mail, chat, notes, calendar, drive, contacts, plus Collections (your own lists). Real screens, and a demo that builds a throwaway workspace with no signup.
3. **You own it.** AGPL-3.0, same code hosted or on your own Cloudflare account (free, every feature). Data out as .eml, IMAP, vCard/CSV, .ics, ZIP. Switching is gradual: connect the mailbox you have, move the domain last.

Tone: plain, specific, numbers over adjectives. No "revolutionary", no testimonials, no user counts we cannot show.

## 2. Audiences, what they must hear, objections

| Audience | Must hear in 5 s | Then needs |
|---|---|---|
| Small company paying per seat for Google/M365 (2 to 40 people) | "Same daily tools, EUR 5 a month for 10 people" | price race, switching steps, what you give up |
| Cloudflare Email Routing users (forward-only, want to reply as the domain) | "A real inbox on the domain you already have on Cloudflare" | Connect Cloudflare, free `<name>.workinbox.io` start, link to `/cloudflare-email-routing` |
| Self-hosters and devs | "AGPL, runs on your own Cloudflare account, no server to run, every feature free" | repo link and stars, `/docs/self-host`, MCP/API |
| Teams wanting one tool instead of Gmail + Slack + Notion + Drive | "One login, one price, mail/chat/notes/files linked by @mentions and one search" | the apps together (one ⌘K, @ anything), Collections as the Airtable/Linear bit |

| Objection | Truthful answer |
|---|---|
| Migration is a pain | No big bang: connect the existing mailbox over IMAP/SMTP (MX unchanged), copy mail later or upload a Takeout .mbox, switch MX last. Contacts CSV/vCard, Google Calendar sync-in, .ics, drop folders into Drive. |
| Deliverability | Hosted custom domains send through Amazon SES; new unpaid orgs are capped 14 days, auto-pause on bounces/complaints. Say "SES" and "DKIM/DMARC checked in setup". Do not promise inbox placement. |
| Small vendor, can I trust it? | Read the code (AGPL), run it yourself, export everything, status page `/status`, `/security` (2FA, individual sign-in, audit log on Pro+). Leaving is cheap, so trusting is cheap. |
| Data ownership / where is it | Cloudflare D1 + R2; self-hosted: your own account. |
| Missing features | Say it once, plainly: no native mobile apps (installable web app, plus IMAP/SMTP so Apple Mail/Outlook/phone mail work), no CalDAV/CardDAV, no booking pages, no Docs/Sheets/Meet equivalents beyond notes and Collections. Link `/vs` "pick them if" lists. Honesty is the trust signal here. |
| "Another tool to learn" | Gmail-like mail, Slack-like chat, shortcuts like Gmail, ⌘K everywhere; demo shows it populated. |
| AI | Claude/ChatGPT/Claude Code/Cursor via MCP; reading free, changes on Pro; mail is only ever drafted, never sent on the model's word. |

## 3. Diagnosis of the current `index.astro`

Current order: Hero, Apps cards, The real app (tabs), Teams, shader band, Switching, AI apps, Compare race + table, Pricing calculator, Own, FAQ, (footer CTA).

- **Hero:** "Everything your team works on, in one box" says nothing a visitor can verify and names no enemy. The first screen has no product visible, no price, no "instead of Google". Three CTAs plus a ★ line compete; the demo is a muted button. The strongest fact (free for 5, EUR 1 after) is 10 px grey text. Fix: promise + number + a real screenshot above the fold, demo as primary.
- **Apps cards ("The whole workspace, per person"):** six text cards with invented terminal captions ("anna@ ben@ → 3 inboxes") and no screens. Reads as a feature list, not proof. Collections is bundled in without saying why it matters.
- **The real app (tabs):** the best proof is buried third and hidden behind tabs with a generic title "The real app". Screens should lead the page, with captions that say what the visitor sees and why it matters.
- **Teams:** "Made for small teams" with three abstract cards (agencies, support, leavers); the one audience that converts best (leaving Google) is the third, and none says "you pay X".
- **Shader band:** 480 px of decoration between persuasion sections; pure scroll cost.
- **Switching:** good content (the steps are the best answer to the migration objection) but placed after audiences, with terminal-style cards and an import list that needs hunting.
- **AI apps:** four small text boxes, no visual, no example prompt. A genuine differentiator that looks like an afterthought.
- **Compare race:** the strongest sales device (price bars) sits at 7th position, titled neutrally; the honest table below is long. Pricing calculator then repeats the same money story a second time, so cost is told twice with different framing.
- **Own:** "what you own" has the open-source/self-host message, last, in a text grid; developers/self-hosters get no snippet, no repo card.
- **FAQ:** fine, but Google-specific objections (missing features, deliverability, mobile) are not first.
- **Navigation/footer:** nav has no primary "Try the demo" / "Start free" button and the dropdown "Product" mixes seven apps with two landing pages; footer carries the closing CTA, so the page itself ends on an FAQ with no final ask.
- Overall: every section is a 12-column label/title/text block; nothing shows the software being used, and the headline never says what it replaces. The page describes itself rather than selling.

## 4. New home outline (11 sections)

Order follows the visitor's questions: What is it? Is it real? What does it cost? Can I switch? Can I trust it? Do it.

### 1. `nav` — Navigation
- **Job:** orient and always offer the next step.
- **Content:** logo; Product (the 7 apps + AI apps, Cloudflare Email Routing, Self-hosted), Compare (Google Workspace alternative, vs list), Pricing, Resources (Security, Docs, API, FAQ); language picker (EN/PL); GitHub link with stars; "Log in" text link; **"Try the demo"** (secondary button) and **"Start free"** (primary). Sticky; collapses to a menu on phones with both CTAs still visible.
- **Change vs today:** add GitHub + demo/start buttons; Product dropdown grouped "Apps" / "Use it for".

### 2. `hero` — Promise, price and product at once
- **Job:** in 5 s: "this replaces Google Workspace, it is nearly free, and it is real".
- **Message:** the promise + the number.
- **Headline (EN):** Your team's mail, chat, notes and files. *Without the Google bill.*
- **Subline (EN):** Open-source workspace on your own domain. Free for your first 5 people, then EUR 1 per person a month. Or run it yourself on Cloudflare for free.
- **PL:** Poczta, czat, notatki i pliki zespołu. *Bez rachunku od Google.* / Otwartoźródłowe środowisko pracy na Twojej domenie. Pierwsze 5 osób za darmo, potem 1 EUR miesięcznie za osobę. Albo uruchom je u siebie na Cloudflare za darmo.
- **Proof:** `mail.webp` (or `shared-mailbox.webp`) large, below/beside the text; trust row: AGPL-3.0, GitHub stars (build-time `stars`), "Runs on Cloudflare", "14-day trial, no card".
- **CTA:** primary **Try the demo** (no signup, 30 s, throwaway workspace); secondary **Start free**; tertiary link "Self-host for free".

### 3. `suite` — One workspace, seven apps, shown not listed
- **Job:** "it really does what Gmail + Slack + Notion + Drive do".
- **Message:** apps are connected: one login, one search (⌘K), @mention anything, files attach to mail.
- **Headline:** Gmail, Slack, Notion and Drive. *One login, one price.*
- **Subline:** Mail, chat, notes, calendar, drive, contacts, and your own lists. They know about each other.
- **Proof:** all of `APPS` (`config/apps.ts`) with their real shots (`mail-thread`, `chat`, `notes`, `calendar`, `drive`, `contacts`, `collections`); a one-line "what it replaces" per app (Gmail, Slack, Notion, Google Calendar, Google Drive, Google Contacts, Airtable/Linear-lite); 3 connection facts: "@ anything" picker, one ⌘K, "Attach from Drive / Save to Drive".
- **CTA:** each app links to its page; secondary "Try it in the demo".

### 4. `price` — The money, in one chart
- **Job:** "I would save real money; I understand how it is calculated".
- **Message:** EUR 5 vs $70 for ten people; shared mailboxes and aliases are free.
- **Headline:** *Ten people, EUR 5 a month.* The same team on Google pays $70.
- **Subline:** One price per person covers every app. First 5 free, shared mailboxes and aliases free, 14-day trial, no card.
- **Proof:** merge today's `race` bars (config-driven: Work Inbox from `PLANS.starter` and `seatsFor`, competitors from `compare.ts` `entry`, with `checked` date and "annual billing, as listed by each vendor") with a small people slider (today's calculator, 1 to 100) that updates ours and the Google/M365 bar together; plan chips Starter EUR 1 / Pro EUR 2.50 / Business EUR 5 with drive GB per person (10/30/100) and what Pro adds (API, AI changes, audit log). Drop the duplicate second pricing block.
- **CTA:** primary Start free; secondary "Full pricing" (`/pricing`), "Compare with Google Workspace".

### 5. `demo` — Try it now
- **Job:** remove all risk: "I can click around a populated workspace before I sign up".
- **Message:** no signup, no card, a real workspace in about 30 seconds.
- **Headline:** *Open a workspace* with a full inbox, chat and calendar.
- **Subline:** We build a private demo company for you (Brightloop at Acme Studio, in English or Polish). It deletes itself after 24 hours.
- **Proof:** the demo's own story (campaign mail threads, @mentions in chat, meeting note from the calendar, Tasks/Deals/Equipment collections); the build-progress steps already in `data-demo-steps`; screenshot crop of the bell/chat; note: "sending is switched off in the demo".
- **CTA:** primary **Try the demo** (POST `/demo?lang=`); secondary "Start free instead".

### 6. `switch` — Leaving Google without a big bang
- **Job:** kill the migration fear: "it is an afternoon, and I can stop any time".
- **Message:** connect the mailbox you have first; move the domain last; nothing is lost.
- **Headline:** Switch in an afternoon. *Move the domain last.*
- **Subline:** Connect your current mailbox, bring the team, then point MX when you are ready.
- **Proof:** the three steps already written (today: connect over IMAP/SMTP, MX unchanged; same afternoon: add people; when ready: copy old mail from the old server or a Takeout .mbox, Connect Cloudflare or add MX/DKIM/DMARC, "Check DNS"); what comes along: contacts (Google/Outlook CSV, vCard, merged), calendars (Google sync-in, .ics), files (drop folders), Apple Mail/Outlook/phones (IMAP/SMTP, device profile); free `<name>.workinbox.io` address to start without a domain; screenshot `mail-settings.webp`.
- **CTA:** primary "Read the quickstart" (`/docs/quickstart`); secondary "Google Workspace alternative guide".

### 7. `shared-inbox` — The feature Google does worse (optional proof of depth)
- **Job:** "this is better than Groups for support@ and hello@".
- **Message:** shared mailboxes are real mailboxes, free, with each person signing in as themselves; drafts, templates, out of office, a chat thread to ask a colleague.
- **Headline:** support@ *answered by the whole team.*
- **Subline:** A real shared inbox for everyone with access, free on every plan, no extra seats.
- **Proof:** `shared-mailbox.webp`; facts: "Draft by Anna" shown to colleagues and "Take over", colleague drafts, templates, auto-reply, assign via chat; aliases and catch-all free.
- **CTA:** "See shared mailboxes" (`/shared-mailbox`).

### 8. `ai` — AI that works across the workspace
- **Job:** "the workspace is ready for the AI tools I already use".
- **Message:** Claude, ChatGPT, Claude Code and Cursor connect once; reading is free; mail is only drafted, never sent without you.
- **Headline:** Ask Claude about your *whole workspace.*
- **Subline:** Search mail, chat, notes and files, plan the week, draft replies you review. With your access and nothing more.
- **Proof:** an example prompt and result ("Find the Brightloop contract and draft a reply to Marek" returns a draft card with a Send button, `mail_draft` widget); tools list (search, read threads, find free time, create notes/contacts, post to chat; writes on Pro); badge row of supported clients.
- **CTA:** "Connect an AI app" (`/docs/mcp`).

### 9. `own` — Open source and yours to take
- **Job:** "I can trust a small vendor because I can leave, inspect and self-host".
- **Message:** AGPL code, same app hosted or self-hosted free, everything exportable.
- **Headline:** Read the code. *Run it. Take your data and leave.*
- **Subline:** The hosted service runs the same open-source code you can put on your own Cloudflare account, with every feature and no fee to us.
- **Proof:** repo card with stars (`siteConfig.repoUrl`); export list (mail via IMAP and original .eml, contacts vCard/CSV, calendars .ics, files ZIP); security facts (2FA, individual sign-in, password per mail app, audit log on Pro+, `/security`, `/status`); where it runs (D1 + R2 on Cloudflare); "no mail server to run" with a 3-line deploy outline.
- **CTA:** primary "Self-host for free" (`/docs/self-host`); secondary "View on GitHub".

### 10. `faq` — Honest answers, objections first
- **Job:** clear the last doubts, including what we do not do.
- **Message:** we say plainly what is missing.
- **Headline:** *Questions* before you switch
- **Order:** (1) What will I miss compared to Google Workspace? (no native phone apps, no CalDAV/CardDAV, no Docs/Sheets/Meet; IMAP/SMTP and the installable web app instead; link `/vs`), (2) Will my mail be delivered? (SES, DKIM/DMARC checks), (3) Do I have to move my domain/mailboxes first?, (4) Really open source?, (5) Can I use Apple Mail/Outlook/phone?, (6) Cost of shared mailboxes, (7) Where is data stored?, (8) Can it replace Slack and Notion?, (9) Do I need my own domain?, (10) Trial. Keep FAQPage JSON-LD.
- **CTA:** "Ask us" link to `support@workinbox.io`.

### 11. `footer` — Last ask and the map
- **Job:** a final call to action, then every important link is findable.
- **Closing band (above the link columns):** headline *Try it with your own team in 30 seconds.* / subline "Free for 5 people. No card. Or self-host." / primary Try the demo, secondary Start free.
- **Columns:** Product (7 apps, AI apps), Use it for (Cloudflare Email Routing, Self-hosted email, Shared mailbox, Google Workspace alternative), Compare (`/vs` list), Company (Pricing, Security, Status, Docs, API reference, MCP, GitHub), Legal (Terms, Privacy, Refunds, company name from `siteConfig.legal`, supportEmail); language picker; status dot (`/api/status`); "Made on Cloudflare, AGPL-3.0".

Drop: the shader band spacer and the separate "Teams" audience grid. Fold audiences into hero chips ("For: small teams leaving Google, Cloudflare Email Routing users, self-hosters") or into `suite`/`own`; never as a stand-alone section.

## 5. Directions per section (three variants each)

Different approach, not colour.

| Section | A | B | C |
|---|---|---|---|
| `nav` | classic bar with mega-menu dropdown (apps with icons and one-line descriptions) | minimal bar (logo, 4 links, buttons) with ⌘K-style search that jumps to apps/docs | floating pill bar that condenses on scroll, CTA always docked right |
| `hero` | screenshot-led: big `mail.webp` below a short headline, trust row beneath | price-led: huge "EUR 5 vs $70" comparison next to the headline and demo button | interactive: headline plus a live "type your domain" box that shows your addresses (anna@yourdomain) and starts the demo |
| `suite` | app switcher: tabs/rail on the left, big real screenshot on the right with a "replaces X" caption | bento grid: unequal tiles, each with a cropped real screen | scroll story: one screen per app sticking while captions change, ending on the "@ anything" and ⌘K connections |
| `price` | bar race (per vendor) with a people slider, the chart is the content | receipt-style: "your team" slider produces an itemised monthly bill vs Google and M365 | cost-over-a-year calculator with annual saving as a big number and a fine-print row of sources |
| `demo` | big card with the CTA, the demo's story listed as seven "what you will find" bullets | looping cropped screenshots (mail → chat → calendar) behind a single button | a live mini-form: choose language and company size, see the build steps animate |
| `switch` | horizontal three-step timeline with real commands/screens per step | checklist "what comes along" with before/after (Google item → where it lands) | animated "migration board": cards from Google (mail, contacts, calendar, drive) sliding into the matching apps |
| `shared-inbox` | one large `shared-mailbox.webp` with numbered callouts | side-by-side "Google Groups setup" vs "Work Inbox shared mailbox" | short step list (support@ arrives, Anna drafts, Ben sees the draft, takes over) with cropped screens |
| `ai` | chat-transcript mock: prompt, tool calls, draft card | tool matrix (what AI can read / write / never does) with client logos | demo clip (looping screen of Claude drafting a reply) with the three guarantees underneath |
| `own` | code-led: repo card, 3-line self-host snippet, license badge | grid of "you can leave" proofs, each with the exact export format | numbers/trust strip: AGPL, stars, 0 EUR self-hosted, 7 export formats, link to `/status` and `/security` |
| `faq` | accordion, objections first, with an "What we don't do" callout on top | two columns: "Before you switch" and "After you switch" | searchable list with category chips (price, migration, security, features) |
| `footer` | big closing CTA band above link columns | sitemap-first with the CTA as one row | footer with a live status dot, GitHub stars and language picker prominent, CTA as a form (type your domain) |

## Notes for builders
- Numbers must come from config (`FREE_PEOPLE`, `PLANS`, `seatsFor`, `TRIAL_DAYS`, `COMPETITORS[].entry` and `checked`), never typed. Today: free for 5, EUR 1/2.50/5 per person, trial 14 days, 10 people on Starter = EUR 5.
- Competitor figures show the `checked` date (2026-11-09) and the "as listed" wording.
- Do not add: testimonials, customer counts, native-app badges, CalDAV/CardDAV, booking pages, SOC2-type claims.
- Polish copy lives in `src/i18n/site/pl.ts`; new strings need keys there (the English text is the key).
- Both CTAs everywhere are Try the demo (no commitment) and Start free; self-host is a link, not a button.
