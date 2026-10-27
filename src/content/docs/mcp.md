---
title: AI apps (MCP)
description: Use your data from Claude, ChatGPT, Claude Code and Cursor.
section: Guides
order: 2
updated: 2026-10-27
---

Connect an AI app and ask it about your projects, or let it create and change them for you. The
app talks to our MCP server at `https://example.com/mcp`. You'll find the URL and short setup
steps in **Settings → AI apps**.

## Claude

In Claude, open **Settings → Connectors**, choose **Add custom connector**, paste the server URL
and click **Connect**. Sign in, pick an organization if you're in several, and allow access.

## ChatGPT

In ChatGPT, open **Settings → Apps → Advanced settings** and turn on developer mode. Choose
**Create app**, paste the server URL, pick OAuth, then sign in and allow access. Project lists show
up as an interactive card you can add projects from.

## Claude Code, Cursor and other tools

```sh
claude mcp add --transport http example https://example.com/mcp
```

Then run `/mcp` in Claude Code to sign in. Tools without a sign-in flow can send an organization
API key instead, as `Authorization: Bearer sk_…` (see [API](/docs/api)).

## What an app can do

An app works in one organization, with your role there. It sees what you'd see and can only
change data if you allowed **Create, change and delete data**. Every change shows up in the audit
log under your name, with the app it came through.

Available on the Pro and Business plans. Disconnect an app in **Settings → AI apps**; it loses
access right away.
