---
title: Quickstart
description: From sign-up to mail on your own domain.
section: Getting started
order: 2
updated: 2026-11-10
---

## 1. Create an account

[Sign up](/signup) with your email or Google. Every hosted account starts with a free trial, no card needed, and up to five people stay free after it.

## 2. Add your domain

No domain yet? In **Admin console → Mail**, claim a free address like `yourname.workinbox.io`: Work Inbox sets up its
records for you, you get a mailbox on it, and mail works within a few minutes. You can add your own domain later.

Open **Admin console → Mail** and add your domain, for example `yourcompany.com`. Work Inbox lists the DNS records it needs:

- an **MX** record, so mail for the domain comes to Work Inbox,
- three **DKIM** records (CNAME) and two records on `bounce.yourcompany.com`, so mail you send is signed and delivered,
- a **DMARC** record (TXT on `_dmarc`).

Add them at your DNS provider. If the domain is on Cloudflare, click **Connect Cloudflare** instead: paste an API
token with Zone Read and DNS Edit (the link creates one) and Work Inbox adds the records for you; the token is used
once and not stored. Moving from another mail provider? Tick "Replace the current MX records". Click **Check DNS**:
each record gets a tick once it's visible, and sending starts when the DKIM records are verified.

Under **Mail to unknown addresses**, choose whether mail to an address nobody has is rejected or lands in one mailbox
(a catch-all).

## 3. Add your people

In **Admin console → People → Add person**, enter a name and an address on the domain. The person gets a mailbox and a
temporary password, shown to you once; they sign in and change it. You can reset it later.

## 4. Share a mailbox

Create a shared mailbox such as `support@` and choose its members. Owners and admins see every shared mailbox, members
the ones they're given. Replies go out from the shared address.

## 5. Write your first mail

Open **Mail** and press `c`, or click **New e-mail**. Pick the mailbox to send from, write, and send. Incoming mail for
the domain now arrives in the right mailbox.

## 6. Bring your old mail

Export it from the old provider: Google Takeout (choose Mail) gives an `.mbox` file; Outlook, Zoho and most others
export messages as `.eml` files. In **Admin console → Mail → Import**, pick the mailbox and the file (or all the
`.eml` files at once). The upload runs in the browser, the import in the background: messages arrive read, with their
original dates and threads, your sent mail as sent. From Gmail, what was in the inbox stays in the inbox, the rest is
archived, spam and trash are left out. Importing the same file again adds nothing twice.

No export at hand? In **Admin console → Mail → Import** you can also give the old server's IMAP address and an app
password: the mail is copied in the background, the old mailbox stays untouched and duplicates are skipped.

Not ready to move at all? Each person can connect the mailbox they already have in **Settings → Mail clients →
External accounts** (IMAP and SMTP settings from the provider). It syncs in and they read and send from Work Inbox
while mail keeps arriving at the old provider; switch the domain's MX whenever you're ready.
