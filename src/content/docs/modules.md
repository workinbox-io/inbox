---
title: Apps and your own modules
description: Turn apps on or off, build your own lists without code, or add a module in code to a self-hosted Work Inbox.
section: Guides
order: 5
updated: 2026-11-16
---

Work Inbox is a set of apps (Mail, Chat, Notes, Calendar, Drive, Contacts and Collections) that share the same people,
sign-in, search, @mentions and AI apps. You can shape it three ways, from no code to code.

## Turn apps on or off

Owners and admins choose the apps in **Admin console → Apps**. Mail is always on. A turned-off app disappears
from the app rail, the sidebar and ⌘K, its pages and API answer 404, its tools leave the [MCP server](/docs/mcp), and
links to it (public file and note links, the calendar feed, @mentions) stop working. Its data is kept: turn it back on
and everything is where it was. AI apps can do the same with `workspace_apps_list` and `workspace_app_set`.

## Build your own lists (no code)

Most "missing modules" are lists with fields: an equipment tracker, inventory, a simple CRM, a task board, suppliers,
job candidates. Make them in **Collections**, on every plan, hosted or self-hosted:

- **Start** from a template (Deals, Equipment, Inventory, Tasks), from scratch, or from a spreadsheet: a CSV from Excel
  or Google Sheets becomes a collection, with field types guessed from its columns.
- **Fields**: text, number, date, choice, checkbox, person, link and e-mail. A choice field turns the list into a
  board you can drag cards across.
- **Sharing**: each collection is for you only, chosen people (view or edit), or the whole team.
- **Automations**: when a record is added or a field changes (to a value), e-mail people of the organization or post
  in a chat channel.
- **Everywhere else**: @mention records in chat and mail, import and export CSV, and work with records from Claude or
  ChatGPT (`collections_list`, `collection_records_search`, `collection_record_create` and more, see
  [AI apps](/docs/mcp)) or the [API](/docs/api) (`/api/v1/collections`).

## Add a module in code (self-hosted)

When a list isn't enough (its own screens, rules or integrations), a self-hosted Work Inbox can grow a module in code.
The source is open ([github.com/workinbox-io/inbox](https://github.com/workinbox-io/inbox)) and every app is built
the same way, so a new one follows the existing ones. **Contacts** is the smallest complete example to copy; the
repository's `CLAUDE.md` describes each app and works as a brief for coding agents.

A module named `assets` (pick your own) touches these places:

1. **Register it**: add `"assets"` to `OPTIONAL_MODULES` in `src/config/modules.ts`. That alone gives it the on/off
   switch in Settings, and 404s on `/app/assets`, `/api/app/assets` and `/api/v1/assets` while it's off.
2. **Navigation**: an entry in `WORKSPACE_NAV` in `src/config/nav.ts`, with a Lucide icon.
3. **Tables**: `src/db/schema/assets.ts`, exported from `src/db/schema/app.ts`; every table has an `org_id`. Run
   `pnpm db:generate` for the migration and `pnpm db:migrate` to apply it locally.
4. **Logic**: rules that need no database in `src/lib/assets/*` with tests in `test/assets.test.ts`; queries in
   `src/lib/server/assets.ts`, always scoped to the organization (and to the person, if items are shared).
5. **API**: routes under `src/pages/api/app/assets/` wrapped in `handler()` or `manageHandler()`
   (`src/lib/server/api.ts`), bodies checked with `parseBody()` and a zod schema, changes recorded with `audit()`
   (add the action to `src/config/audit.ts`). Re-export the routes you want public from `src/pages/api/v1/assets/`.
6. **Screen**: add `"assets"` to `APP_SCREENS` and `WORKSPACE` in `src/lib/app-routes.ts`, a loader case (and the id in the
   redirect for unknown addresses) in `src/lib/server/app-page.ts`, and the screen in `src/components/app/panel-router.tsx`. Build the component from the
   workspace kit in `src/components/workspace/` (rail, list, split view, row menus) so it looks like the other apps.
7. **AI apps**: `src/mcp/assets.ts` exporting an `McpModule` whose `name` is the module id (`"assets"`), added to
   `appModules` in `src/mcp/app.ts`. Tools are `defineTool()` wrappers over your `lib/server` functions; changes use
   `scope: "write"`. With the same `name`, turning the module off removes its tools.
8. **Optional**: a section on the settings page (`src/components/settings/settings-page.tsx`), a kind for
   @mentions (`src/lib/mentions.ts`), queued jobs (`src/jobs/app.ts`).

Check it with `pnpm typecheck`, `pnpm test` and `pnpm dev`, then deploy as in [Self-hosting](/docs/self-host). Keep
your module in its own files where you can: updates from the main repository then merge with few conflicts.

Hosted at workinbox.io, code modules aren't available: use Collections, the [API](/docs/api) or an AI app instead.
