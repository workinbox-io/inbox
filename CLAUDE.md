# CLAUDE.md

Micro SaaS on Cloudflare Workers, built from the shared template (see TEMPLATE.md for how template
updates are merged). Astro 7 SSR + React islands, D1 + Drizzle, Better Auth with organizations,
Paddle billing, Queues + Cron, Cloudflare Email Service. pnpm, Node 22.18+.

## Commands

```sh
pnpm dev                 # astro dev (workerd, local D1/queues); manage with astro dev stop|status|logs
pnpm typecheck           # wrangler types + astro sync + tsc
pnpm test                # vitest, test/*.test.ts (pure modules only: no cloudflare:workers imports)
pnpm build
pnpm db:generate         # drizzle-kit: SQL migration from src/db/schema changes
pnpm db:migrate          # apply migrations to local D1
```

E-mails in dev are printed to the dev server log (`astro dev logs`), including verification links.
Trigger the cron locally: `curl "localhost:4321/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"`.

## Architecture

- `src/worker.ts` is the Worker entry: Astro's `handle()` for HTTP, plus `queue()` (jobs from
  `src/jobs`) and `scheduled()` (daily tasks in `src/jobs/cron.ts`).
- Bindings and secrets: `import { env } from "cloudflare:workers"`. Types come from
  `worker-configuration.d.ts` (generated, `pnpm cf-types`) plus secrets declared in `src/env.d.ts`.
- Domain logic lives in `src/lib/server`; API routes and pages call it. `projects.ts` is the
  example resource showing the full pattern (limit check, audit, queue job, API route).
- API routes wrap logic in `handler()`/`manageHandler()` (`lib/server/api.ts`): throw `HttpError`,
  validate with `parseBody(request, schema)` (schemas in `lib/validation.ts`), call `audit()`.
- `src/middleware.ts` guards `/app` and `/api/app` (session) and `/api/v1` (API keys, rate limit,
  plan feature), and sets `locals.orgId`/`locals.role`. Every query must be scoped to the org.
- Languages (v1.11.0): `config/languages.ts` lists them (template: English only). UI text goes through `t("English
  text")` / `tp()` / `appLocale()` from `lib/i18n/panel.ts`, which works in Astro, islands and `/api/app` (the middleware
  runs each request in `withLocale()`, `lib/server/i18n.ts`; the browser loads `/i18n/<code>.js`). Dictionaries:
  `src/i18n/app/<area>/<code>.ts`, keyed by the English text. `user.locale` is the user's pick (Settings → Account).
- Dashboard navigation: `AppLayout` uses Astro's ClientRouter. The sidebar, command palette and toasts are one
  persisted island (`app-shell.tsx`, `transition:persist`); the header and page render next to it. Pages that change
  the address in place use `replaceUrl`/`pushUrl` (`lib/panel-history.ts`), never `history.*State(null, …)`;
  unsaved-change guards use `guardLeaving`; GET links to `/api` need `data-astro-reload`. Islands' module code runs
  once per tab: per-page work listens to `astro:after-swap`.
- D1 has no interactive transactions: use `db.batch([...])`. Times are integer ms (`timestamp_ms`).
- Async work goes through `enqueue()` (`lib/server/queue.ts`); handlers must be idempotent.
  `sendEmail()` also goes through the queue; `deliverEmail()` does the actual send.
- AI apps: `/mcp` (`lib/server/mcp.ts`) serves the tools in `src/mcp` (`core.ts` template, `app.ts`
  product) to Claude, ChatGPT and CLIs. Tools are `defineTool()` wrappers over `lib/server` with a
  zod `input`, `scope: "write"` for changes and `ctx.audit()`. Auth is an OAuth token from our own
  server (Better Auth `mcp` plugin, `lib/server/oauth.ts`: org picked at `/oauth/organization`,
  stored as the token's `org_id` claim, consent re-checked per request) or an org API key.
  Widgets: `src/mcp/widgets/*.tsx` imported with `?widget` become one HTML file (MCP Apps).
  Test with `npx @modelcontextprotocol/inspector` against `localhost:4321/mcp`.
- Billing: `lib/server/paddle.ts` (plain fetch, no SDK). Paddle prices carry
  `custom_data: { plan, interval }` (set by `pnpm paddle:sync`); webhooks re-fetch the subscription
  and mirror it into `subscriptions`. Plans, limits and features: `src/config/plans.ts`.

- Staff mailboxes (`ADMIN_MAILBOXES`, e.g. support@ and legal@ on your domain; off while empty): Email Routing "Send
  to Worker" → `email()` in `src/worker.ts` → `handleAdminMail` (`lib/server/admin-mail.ts`, pure rules in
  `lib/admin-mail/rules.ts`, tables in `db/schema/admin-mail.ts`) stores and threads the mail and forwards a copy to
  `ADMIN_MAIL_FORWARD`. Staff (`ADMIN_EMAILS`) work at `/app/admin-mail` (`components/admin-mail/*`), laid out like Gmail:
  folders, search, bulk actions, shortcuts, reply / reply all / forward, a docked compose window, drafts and "Undo send"
  in the browser, a signature per mailbox. Incoming HTML renders in a sandboxed iframe whose CSP blocks remote images until
  "Show images". Mail goes out right away via `sendNow` (`lib/server/email.ts`) from the mailbox address.
- Uploads: `POST /api/app/attachments` stores a file in R2 as `attachments/<orgId>/<random>/<safe-name>`
  (`lib/server/uploads.ts`, rules in `lib/uploads.ts`), served by `/api/files`; the composer UI is
  `components/uploads/attachments.tsx`. E-mail helpers (threading, quoted text, body text): `lib/mail/*`.
- UI: pickers use `components/ui/segmented-control.tsx` (`PeriodTabs` wraps it); custom toasts use
  `toastCard` from `components/ui/sonner.tsx`; small caps labels use the `eyebrow` utility.
  Animated marketing diagrams: `components/storyboard` (`defineScene()` + `<Scene />`, see its README).
  Faux product UI on marketing pages (homepage hero demo, features bento): `components/marketing/*` on the
  Stageshow kit in `components/stageshow` (see its README); stage colours read the site's variables (`look.css`).

## Template vs product files

Product code goes in `src/db/schema/app.ts`, `src/jobs/app*.ts`, `src/mcp/app.ts`, `src/config/*`,
content, and new files. Changes to template files (auth, api, settings panels, `components/ui`)
should be made in the template repo and merged, so products don't drift.
