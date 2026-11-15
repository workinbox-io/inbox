---
title: AI apps (MCP)
description: Use your data from Claude, ChatGPT, Claude Code and Cursor.
section: Guides
order: 2
updated: 2026-11-14
---

Connect an AI app and ask it to search your mail, read a thread, draft a reply, or find, write and update
notes and contacts, manage drive folders and text files, or read and manage calendar events. The app talks to the MCP server at `https://workinbox.io/mcp` (self-hosted: your own address plus `/mcp`). You'll find the URL and short setup
steps in **Settings → AI apps**.

## Claude

In Claude, open **Settings → Connectors**, choose **Add custom connector**, paste the server URL
and click **Connect**. Sign in, pick an organization if you're in several, and allow access.

## ChatGPT

In ChatGPT, open **Settings → Apps → Advanced settings** and turn on developer mode. Choose
**Create app**, paste the server URL, pick OAuth, then sign in and allow access.

## Claude Code, Cursor and other tools

```sh
claude mcp add --transport http workinbox https://workinbox.io/mcp
```

Then run `/mcp` in Claude Code to sign in. Tools without a sign-in flow can send an organization
API key instead, as `Authorization: Bearer sk_…` (see [API](/docs/api)).

## What an app can do

An app works in one organization, with your role there. It sees what you'd see and can only
change data if you allowed **Create, change and delete data**. Every change shows up in the audit
log under your name, with the app it came through.

Reading works on every plan. Changes (notes, contacts, sending mail) need the Pro or Business plan.
Disconnect an app in **Settings → AI apps**; it loses access right away.

## Sending mail

Saved drafts can be listed with `mail_list_drafts` and read with `mail_get_draft`.
Use `mail_update_draft` to edit an existing draft in place, or `mail_delete_draft` to discard it.
Both require write access and the latest `updatedAt` value as `expectedUpdatedAt`, so changes
made since the draft was read are protected. Updates preserve fields you omit; recipient lists
replace the existing lists. Deleting a draft is permanent. These tools only access your own drafts
in mailboxes you can still open; organization API keys have no personal drafts.

Claude and ChatGPT never send mail on their own. When you ask for a reply, the app shows a draft
card: check it, change it if you like, and click **Send**. You have 10 seconds to undo. Instructions
hidden in an e-mail can't make the AI send anything, because only your click sends. Scripts using an
API key call `mail_send` directly.


## Mail search and synchronization

`mail_search` accepts an optional `mailbox` address and `folder` (`inbox`, `sent`, `archived`,
`trash`, `spam`, `starred`, `snoozed`). An explicit folder restricts search results too. Without a
folder, a nonempty `q` searches all non-deleted threads; an empty query lists Inbox.

`mail_list_drafts` accepts `q`, `limit` (50 by default, up to 200) and an opaque `cursor`.
Follow `nextCursor` while `hasMore` is true. The browser fetches every page before detecting
remote deletions and synchronizes on focus and every 30 seconds while mail is visible.
Clean editors load remote changes without autosaving them. Conflicts keep your text and let you
load the server version or explicitly save your version. Both the app and draft card check the
saved version before sending; use **Load latest saved draft** when a card is out of date.

The app draft API uses `expectedUpdatedAt: null` for creation and a numeric version for edits.
Deletion requires that numeric version too. Stale edits, deletes and sends return `409`.
After deploying this contract, refresh already open browser clients.

## Draft attachments

Use `mail_attach_draft` with a draft key, its latest `expectedUpdatedAt`, and `source`:
`{ driveId }` for an accessible Drive file, or `{ messageId, attachmentIndex }` for an attachment
listed by `mail_read_thread`. It accepts source identifiers, never arbitrary URLs.
`mail_remove_draft_attachment` removes an attachment by its zero-based index. Attachments remain
in drafts through editing and synchronization. The app and card show names and removal controls.
Up to 5 files of 10 MB are allowed; source access and availability are checked again when saving
and sending. Removing a draft attachment keeps the original file.

## Calendar changes

`calendar_get_event`, `calendar_update_event` and `calendar_delete_event` work on accessible events.
Results identify `id`, `seriesId` and the original `occurrence` time. For a recurring event, explicitly
choose `scope: "this"`, `"following"` or `"all"`; the first two also require an ISO `occurrence`.
Updates accept `changes` using calendar API fields (`start` and `end` in milliseconds).
External attendees or organizers anywhere in a series, including exceptions or proposed attendees,
cause a link to the app to be returned **without changing data or sending notifications**.

## Drive changes

`drive_create_folder` accepts `name` and optional `parentId`. `drive_create_text_file` also accepts
`content`, up to 50,000 characters, saved as UTF-8 plain text. Duplicate names get a free name;
existing files are never overwritten. `drive_update_item` accepts an `id` and `changes` containing
`name`, `parentId` (null for My drive), or `trashed` (true to trash, false to restore).
Existing permissions, storage quotas and audit apply. These tools do not permanently delete files,
create public links, extract binary documents or perform OCR.
