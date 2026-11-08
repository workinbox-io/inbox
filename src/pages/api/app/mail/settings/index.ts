import { manageHandler, json, parseBody } from "@/lib/server/api";
import * as admin from "@/lib/server/mail/admin";
import { addSenderRule } from "@/lib/server/mail/store";
import { mailSetupSchema } from "@/lib/validation-mail";

/** Settings → Mail: domains, mailboxes, aliases and access (owners and admins). */
export const GET = manageHandler(async ({ orgId }) => json(await admin.listMailSetup(orgId)));

export const POST = manageHandler(async ({ orgId, request, audit }) => {
  const body = await parseBody(request, mailSetupSchema);
  switch (body.action) {
    case "domain.add": {
      const d = await admin.addDomain(orgId, body.domain);
      audit("mail_domain.add", { target: d.domain });
      return json(d, 201);
    }
    case "domain.check":
      return json(await admin.checkDomain(orgId, body.domainId));
    case "domain.remove": {
      const d = await admin.removeDomain(orgId, body.domainId);
      audit("mail_domain.remove", { target: d.domain });
      return json({ ok: true });
    }
    case "domain.catchAll": {
      const d = await admin.setCatchAll(orgId, body.domainId, body.mailboxId);
      audit("mail_domain.catch_all", { target: d.domain });
      return json({ ok: true });
    }
    case "mailbox.create": {
      const mb = await admin.createMailbox(orgId, body);
      audit("mailbox.create", { target: mb.address, details: { kind: mb.kind } });
      return json(mb, 201);
    }
    case "mailbox.update": {
      const mb = await admin.updateMailbox(orgId, body.mailboxId, body);
      audit("mailbox.update", { target: mb.address });
      return json(mb);
    }
    case "mailbox.delete": {
      const mb = await admin.deleteMailbox(orgId, body.mailboxId, body.force);
      audit("mailbox.delete", { target: mb.address });
      return json({ ok: true });
    }
    case "mailbox.access": {
      const mb = await admin.setMailboxAccess(orgId, body.mailboxId, body.userIds);
      audit("mailbox.access", { target: mb.address, details: { members: body.userIds.length } });
      return json({ ok: true });
    }
    case "alias.add": {
      const a = await admin.addAlias(orgId, body);
      audit("mail_alias.add", { target: a.address });
      return json(a, 201);
    }
    case "alias.remove": {
      const a = await admin.removeAlias(orgId, body.aliasId);
      audit("mail_alias.remove", { target: a.address });
      return json({ ok: true });
    }
    case "sender.add":
      await addSenderRule(orgId, { pattern: body.pattern, action: body.rule, mailboxId: null });
      return json({ ok: true }, 201);
  }
});
