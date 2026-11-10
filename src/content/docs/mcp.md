---
title: AI apps (MCP)
description: Use your data from Claude, ChatGPT, Claude Code and Cursor.
section: Guides
order: 2
updated: 2026-11-10
---

Connect an AI app and ask it to search your mail, read a thread, draft a reply, or find, write and update
notes and contacts, or find and read files on the drive. The app talks to the MCP server at `https://workinbox.io/mcp` (self-hosted: your own address plus `/mcp`). You'll find the URL and short setup
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

Claude and ChatGPT never send mail on their own. When you ask for a reply, the app shows a draft
card: check it, change it if you like, and click **Send**. You have 10 seconds to undo. Instructions
hidden in an e-mail can't make the AI send anything, because only your click sends. Scripts using an
API key call `mail_send` directly.
