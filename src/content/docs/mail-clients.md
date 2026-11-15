---
title: Mail clients (IMAP and SMTP)
description: Read and send your Work Inbox mail from Apple Mail, Outlook, Thunderbird or your phone's mail app.
section: Guides
order: 4
updated: 2026-11-15
---

Every mailbox you can open in Work Inbox, your own and the shared ones you're given, also works in a regular mail
app over IMAP (reading) and SMTP (sending).

## Connect a mail app

1. Open **Settings → Mail clients**.
2. Next to the mailbox, choose **Enable mail clients**. Work Inbox prepares your existing messages for mail apps;
   this takes a moment for a large mailbox.
3. Choose **IMAP clients** and create a password for the device (for example "iPhone"). The password is shown once:
   copy it into the mail app straight away.
4. In the mail app, add an account by hand with these settings:

| | Server | Port | Security |
|---|---|---|---|
| Incoming (IMAP) | `mail.workinbox.io` | 993 | SSL/TLS |
| Outgoing (SMTP) | `mail.workinbox.io` | 465 | SSL/TLS |

Use the username shown in the dialog and the device password for both.

## Good to know

- **One password per device.** Delete a device's password in the same dialog and that device stops syncing; your
  sign-in password is never used by mail apps.
- **The same mail as the web app.** Read, star and move in the app and Work Inbox follows. Manage folders and labels in
  Work Inbox; drafts written in a mail app stay in that app's Drafts folder on the server.
- **Sending** goes through Work Inbox, so its sending limits and a 10 MB message size apply. People removed from the
  organization lose access on every device.
- **Turning it off**: Disconnect revokes every device password for that mailbox; the mailbox stays in Work Inbox.
- **Self-hosted**: IMAP and SMTP need the optional mail bridge, a small Docker server next to your Cloudflare account
  (`infra/mail` and `services/mail-bridge` in the repository). Without it, mail is read and sent in the web app.
