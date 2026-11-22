# Contributing

Issues and pull requests are welcome. For larger changes, open an issue first so we can agree on the approach.

## Setup

Node 22.18+ and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # set BETTER_AUTH_SECRET; the rest is optional locally
pnpm db:migrate                  # local D1
pnpm dev                         # http://localhost:4321, e-mails are printed to `astro dev logs`
```

## Before a pull request

```sh
pnpm typecheck && pnpm test && pnpm build
```

- Every query is scoped to the organization; API routes use `handler()` and `parseBody()` (`src/lib/server/api.ts`).
- Schema changes: edit `src/db/schema`, then `pnpm db:generate` and commit the migration.
- UI text goes through `t("…")` with its Polish translation; `pnpm i18n:missing pl` lists the gaps.
- Pure logic gets a test in `test/*.test.ts`.

[CLAUDE.md](CLAUDE.md) is the map of the code (for people and coding agents alike).

## Security

Please don't report vulnerabilities in public issues; see [SECURITY.md](SECURITY.md).

By contributing you agree that your contributions are licensed under [AGPL-3.0](LICENSE).
