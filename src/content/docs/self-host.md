---
title: Self-hosting
description: Run WorkInbox on your own Cloudflare account, with every feature and no fee to us.
section: Getting started
order: 3
updated: 2026-11-09
---

WorkInbox is open source. Self-hosted, it runs for one company on its own Cloudflare account: mail, attachments and
notes stay there, and you pay Cloudflare for what you use. Every feature is on; there are no plans or billing.

## What you need

- A Cloudflare account on the **Workers Paid** plan (queues and password hashing need it).
- Your mail domain on Cloudflare, or the ability to set its MX and TXT records.
- Node 22.18 or newer and pnpm.

## 1. Get the code

```sh
git clone https://github.com/jakub-kalamarz/inbox.git workinbox
cd workinbox
pnpm install
```

## 2. Create the Cloudflare resources

```sh
pnpm setup
```

Choose "create resources": it creates the D1 database, the R2 bucket and the queues and writes their ids to
`wrangler.jsonc`. Then, in `wrangler.jsonc` `vars`, set `DEPLOY_MODE` to `"self"`: it turns billing off and every
feature on (the repository ships with `"cloud"`, the hosted workinbox.io).

## 3. Secrets and settings

```sh
wrangler secret put BETTER_AUTH_SECRET
```

In `wrangler.jsonc` `vars`, set `PUBLIC_APP_URL` to the address you'll use (for example `https://mail.yourcompany.com`)
and `ADMIN_EMAILS` to your own address. Optional: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google sign-in.

## 4. Sending mail

Onboard each mail domain in **Cloudflare Email Service** so WorkInbox can send from it, and set `EMAIL_FROM_ADDRESS`
for the app's own messages (sign-in links, password resets).

## 5. Deploy

```sh
pnpm deploy
```

It builds the app, applies the database migrations and deploys the Worker. Add your custom domain to the Worker in the
Cloudflare dashboard.

## 6. Receiving mail

For each mail domain, turn on **Email Routing** and add a **catch-all rule** with the action **Send to a Worker**,
pointing at your WorkInbox Worker. Then sign up in your WorkInbox, add the domain in **Settings → Mail** and click
**Check DNS**. The [Quickstart](/docs/quickstart) covers the rest.

## Updating

Pull the latest code and run `pnpm deploy` again; migrations are applied as part of it.
