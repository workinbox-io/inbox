import { manageHandler, json, parseBody } from "@/lib/server/api";
import * as admin from "@/lib/server/mail/admin";
import { addPerson, resetPersonPassword } from "@/lib/server/mail/people";
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
    case "signature.brand": {
      const brand = await admin.setSignatureBrand(orgId, body);
      audit("mail_signature.brand", { target: brand.company || undefined });
      return json(brand);
    }
    case "domain.connectCloudflare": {
      const r = await admin.connectCloudflare(orgId, body.domainId, body.token, body.replaceMx);
      audit("mail_domain.connect_cloudflare", { target: r.domain.domain, details: { created: r.created, replaced: r.replaced } });
      return json(r);
    }
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
    case "person.add": {
      const p = await addPerson(orgId, body);
      audit("mail_person.add", { target: p.address, details: { shared: p.shared } });
      // The temporary password is shown once, to the admin who hands it over; it's never stored in clear.
      return json(p, 201);
    }
    case "person.resetPassword": {
      const p = await resetPersonPassword(orgId, body.mailboxId);
      audit("mail_person.reset_password", { target: p.address });
      return json(p);
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
