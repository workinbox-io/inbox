---
title: Self-hosting
description: Run Work Inbox on your own Cloudflare account, with every feature and no fee to us.
section: Getting started
order: 3
updated: 2026-11-15
---

Work Inbox is open source. Self-hosted, it runs for one company on its own Cloudflare account: mail, attachments and
notes stay there, and you pay Cloudflare for what you use. Every feature is on; there are no plans or billing.

## Self-hosted or hosted?

|                       | Self-hosted                                         | Hosted (workinbox.io)                              |
| --------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Where your data lives | Your Cloudflare account                             | Our Cloudflare account                             |
| Cost                  | What Cloudflare bills you (Workers Paid and usage)  | The first 5 people free, then per person ([Pricing](/pricing)) |
| Features              | Every app and feature, no plans                     | By plan                                            |
| Mail domains          | Your own domains, on Cloudflare Email Routing       | Your own domains, or a free `<name>.workinbox.io`  |
| IMAP and SMTP         | Run the mail bridge yourself (`infra/mail`)         | Included, at `mail.workinbox.io`                   |
| Sign-up               | The first account, then invited people only         | Open                                               |
| Updates and upkeep    | You pull and deploy                                 | Ours                                               |

Pick self-hosted when your mail must stay in your own account or you'd rather pay Cloudflare than us; pick hosted when
you want it running without looking after servers or updates. Moving between them works through
[mail import](/docs/quickstart) (.mbox).

## What you need

- A Cloudflare account on the **Workers Paid** plan (queues and password hashing need it).
- Your mail domain on Cloudflare, or the ability to set its MX and TXT records.
- Node 22.18 or newer and pnpm.

## 1. Get the code

```sh
git clone https://github.com/workinbox-io/inbox.git workinbox
cd workinbox
pnpm install
```

## 2. Create the Cloudflare resources

```sh
pnpm run setup
```

(`pnpm run setup`, not `pnpm setup`, which is pnpm's own command.) It asks for your Work Inbox address, the sender
address and your e-mail, and writes them to `wrangler.jsonc`. It also sets `DEPLOY_MODE` to `"self"`, which turns
billing off and every feature on, and removes workinbox.io's own route and settings. Answer "y" to "create resources"
and it creates the D1 database, the R2 bucket and the four queues and writes the database id to `wrangler.jsonc`.

## 3. Secrets and settings

```sh
wrangler secret put BETTER_AUTH_SECRET
```

`BETTER_AUTH_SECRET` is the only required secret (`openssl rand -hex 32`). Optional:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google sign-in.
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (from `npx web-push generate-vapid-keys`) for push notifications.

Skip everything for Paddle, AWS/SES and `MAIL_ZONE_TOKEN`: those are for the hosted service only.

## 4. Sending mail

Onboard each mail domain in **Cloudflare Email Service** so Work Inbox can send from it, and set `EMAIL_FROM_ADDRESS`
for the app's own messages (sign-in links, password resets). It is required: without it the verification e-mail never
arrives and nobody can finish signing up.

## 5. Deploy

```sh
pnpm run deploy
```

It builds the app, applies the database migrations and deploys the Worker. Add your custom domain to the Worker in the
Cloudflare dashboard.

## 6. Receiving mail

For each mail domain, turn on **Email Routing** and add a **catch-all rule** with the action **Send to a Worker**,
pointing at your Work Inbox Worker. Then sign up in your Work Inbox: the first account becomes the admin, and after it sign-up is closed. Add your
team in **Admin console → Domains and mailboxes → Add person**, or invite people to the organization. Add the domain in **Admin console → Domains and mailboxes** and click
**Check DNS**. The [Quickstart](/docs/quickstart) covers the rest.

## Updating

Pull the latest code and run `pnpm run deploy` again; migrations are applied as part of it.
