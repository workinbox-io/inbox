---
title: Quickstart
description: From sign-up to mail on your own domain.
section: Getting started
order: 2
updated: 2026-11-09
---

## 1. Create an account

[Sign up](/signup) with your email or Google. Every hosted account starts with a free trial, no card needed.

## 2. Add your domain

Open **Settings → Mail** and add your domain, for example `yourcompany.com`. Work Inbox lists the DNS records it needs:

- **MX** records pointing at Cloudflare Email Routing,
- an **SPF** record (TXT) and a **DMARC** record (TXT on `_dmarc`).

If the domain is on Cloudflare, turning on **Email Routing** for it adds the MX and SPF records for you. Anywhere else,
add them at your DNS provider. Click **Check DNS**: each record gets a tick once it's visible.

Under **Mail to unknown addresses**, choose whether mail to an address nobody has is rejected or lands in one mailbox
(a catch-all).

## 3. Add your people

In **Settings → Mail → Add person**, enter a name and an address on the domain. The person gets a mailbox and a
temporary password, shown to you once; they sign in and change it. You can reset it later.

## 4. Share a mailbox

Create a shared mailbox such as `support@` and choose its members. Owners and admins see every shared mailbox, members
the ones they're given. Replies go out from the shared address.

## 5. Write your first mail

Open **Mail** and press `c`, or click **New e-mail**. Pick the mailbox to send from, write, and send. Incoming mail for
the domain now arrives in the right mailbox.
