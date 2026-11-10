# Maintaining the template and the products built on it

The template is a git repository that every product is cloned from, with shared history. A product
pulls improvements with an ordinary `git merge`; the template never depends on any product.

```
saas-template (main, tags v1.0.0 …)
   │  git clone, remote "template"
   ├──► product-a   ── pnpm template:update ──► merges template/main
   └──► product-b
```

## Why clone and not "Use this template"

GitHub's template button creates a repository with a fresh, unrelated history. The first merge from
the template then sees every file as added on both sides and conflicts everywhere. Cloning keeps the
shared history, so later merges only contain what changed. The repository can still be marked as a
template on GitHub; just create products with `git clone`.

## Rules that keep merges painless

1. **Product code goes in product files.** The template doesn't edit these after the first commit:
   - `src/db/schema/app.ts`, `src/jobs/app.ts`, `src/jobs/app-cron.ts`, `src/app-worker.ts`, `src/mcp/app.ts`, `src/mcp/widgets/*`
   - `src/config/*` (brand, plans, nav, audit actions, the icons `components/ui` draws in `icons.tsx`): you change
     them, the template rarely does
   - `src/content/docs/*`, `src/pages/index.astro`, `public/*`
   - new files you add (pages, components, `lib/server/<feature>.ts`)
2. **Template files are edited in the template first.** If a product needs a change in `auth.ts`,
   `api.ts`, a settings panel or a `components/ui` file, make it in the template, tag a release and
   merge it into the product. A quick fix made in a product goes back with
   `git cherry-pick` onto a template branch.
3. **Each product owns its migrations.** `template:update` keeps the product's `migrations/` as
   they are and ignores the template's. After the merge, `pnpm db:generate` turns the template's
   change to `schema/core.ts` into the product's next migration, so numbering never collides.
4. **Tag template releases** (`v1.2.0`) and keep a short `CHANGELOG.md` saying what needs a manual
   step (a new secret, a new binding, a new migration).

## Updating a product

```sh
git switch -c template-update
pnpm template:update          # or: pnpm template:update v1.2.0
pnpm install
pnpm db:generate              # if src/db/schema changed
pnpm typecheck && pnpm test && pnpm build
```

Set `TEMPLATE_REPO` (or edit the URL in `scripts/template-update.sh`) to your template's address.

## What belongs in the template

Something goes into the template when the second product needs it. Until then it stays in the
product that has it. Good candidates are things with no product vocabulary: auth flows, billing,
settings panels, UI components, job infrastructure, e-mail layout. Product names, copy and domain
tables stay out.
