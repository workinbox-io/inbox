---
title: Mail clients (IMAP and SMTP)
description: Read and send your Work Inbox mail from Apple Mail, Outlook, Thunderbird or your phone's mail app.
section: Guides
order: 4
updated: 2026-11-17
---

Every mailbox you can open in Work Inbox, your own and the shared ones you're given, also works in a regular mail
app over IMAP (reading) and SMTP (sending).

## Connect a device

1. Open **Settings → Mail clients** and choose **Connect device**.
2. Pick the mailboxes you want on this device (your own and the shared ones) and choose **Continue**. The first time,
   Work Inbox prepares your existing messages for mail apps; a large mailbox takes a moment.
3. Finish on the device:
   - **iPhone, iPad or Mac**: choose **Install on this device** and open the downloaded profile (on a Mac: System
     Settings → Profiles; on iPhone: Settings → Profile Downloaded). Every chosen mailbox appears in Apple Mail.
   - **Anything else**: choose **Show settings and passwords**. In the mail app, add an account with the mailbox address
     and its password. Thunderbird, Outlook and most phone apps find the servers on their own.

Passwords are shown once, and each mailbox gets its own. The profile contains them, so don't share the file.

If an app asks for the servers:

| | Server | Port | Security |
|---|---|---|---|
| Incoming (IMAP) | `mail.workinbox.io` | 993 | SSL/TLS |
| Outgoing (SMTP) | `mail.workinbox.io` | 465 | SSL/TLS |

The username is the mailbox address, for both.

## Good to know

- **One password per device and mailbox.** Revoke it under the mailbox's **Devices** and that device stops syncing;
  your sign-in password is never used by mail apps.
- **Finding the servers on its own** works on your organization's own domain once its optional `autoconfig` CNAME and
  `_autodiscover._tcp` SRV records are in (Admin console → Mail lists them; "Connect Cloudflare" adds them).
- **The same mail as the web app.** Read, star and move in the app and Work Inbox follows. Manage folders and labels in
  Work Inbox. Drafts are shared too: one started in Work Inbox shows up in the Drafts folder within half a minute and
  the reverse, sending or discarding it on either side removes it on the other, and when both sides change the same
  draft at once you keep both versions. A draft edited in a mail app comes back as plain text.
- **Sending** goes through Work Inbox, so its sending limits and a 10 MB message size apply. People removed from the
  organization lose access on every device.
- **Turning it off**: Disconnect revokes every device password for that mailbox; the mailbox stays in Work Inbox.
- **Self-hosted**: IMAP and SMTP need the optional mail bridge, a small Docker server next to your Cloudflare account
  (`infra/mail` and `services/mail-bridge` in the repository). Without it, mail is read and sent in the web app.
