/** Request bodies of the mail API (/api/app/mail). */
import { z } from "zod";

const mailAddress = z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254);
const ids = z.array(z.string().uuid()).min(1).max(200);

/** A reply in a thread, a forward (`forwardOf`), or a new e-mail with `mailbox` and `subject`. */
export const mailSendSchema = z
  .object({
    sendAt: z.number().int().positive().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    mailbox: z.string().trim().toLowerCase().optional(),
    forwardOf: z.string().uuid().optional(),
    to: mailAddress,
    cc: z.array(mailAddress).max(20).default([]),
    subject: z.string().trim().max(300).optional(),
    text: z.string().trim().max(50_000).default(""),
    /** Append the sender's signature (lib/mail/signature.ts). */
    signature: z.boolean().default(true),
    files: z.array(z.object({ url: z.string().max(500), mediaType: z.string().max(200), filename: z.string().max(200) })).max(5).default([]),
  })
  .refine((v) => !!v.text || !!v.forwardOf, { message: "Write a message", path: ["text"] });

export const mailUpdateSchema = z.object({
  ids,
  archived: z.boolean().optional(),
  unread: z.boolean().optional(),
  trashed: z.boolean().optional(),
  starred: z.boolean().optional(),
  spam: z.boolean().optional(),
  snoozedUntil: z.number().int().positive().nullable().optional(),
});

export const mailDeleteSchema = z.object({ ids });

export const ownMailboxSchema = z.object({
  mailbox: z.string().trim().toLowerCase(),
  signature: z.string().max(2000).optional(),
  signatureCard: z.object({ name: z.string().max(100), role: z.string().max(100), phone: z.string().max(40) }).partial().optional(),
  displayName: z.string().trim().max(100).optional(),
});

/** Settings → Mail (owners and admins): one action per request. */
export const mailSetupSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("domain.add"), domain: z.string().trim().max(253) }),
  z.object({ action: z.literal("domain.check"), domainId: z.string().uuid() }),
  z.object({ action: z.literal("signature.brand"), company: z.string().max(100), website: z.string().max(200), logoUrl: z.string().max(300), color: z.string().max(7) }),
  z.object({ action: z.literal("domain.connectCloudflare"), domainId: z.string().uuid(), token: z.string().trim().min(20).max(200), replaceMx: z.boolean().default(false) }),
  z.object({ action: z.literal("domain.remove"), domainId: z.string().uuid() }),
  z.object({ action: z.literal("domain.catchAll"), domainId: z.string().uuid(), mailboxId: z.string().uuid().nullable() }),
  z.object({
    action: z.literal("mailbox.create"),
    domainId: z.string().uuid(),
    local: z.string().trim().min(1, "Enter the address").max(64),
    kind: z.enum(["personal", "shared"]),
    userId: z.string().max(64).optional(),
    displayName: z.string().trim().max(100).optional(),
  }),
  z.object({
    action: z.literal("mailbox.update"),
    mailboxId: z.string().uuid(),
    displayName: z.string().trim().max(100).optional(),
    kind: z.enum(["personal", "shared"]).optional(),
    userId: z.string().max(64).nullable().optional(),
  }),
  z.object({
    action: z.literal("person.add"),
    name: z.string().trim().min(1, "Enter their name").max(100),
    domainId: z.string().uuid(),
    local: z.string().trim().min(1, "Enter the address").max(64),
    sharedMailboxIds: z.array(z.string().uuid()).max(100).default([]),
  }),
  z.object({ action: z.literal("person.resetPassword"), mailboxId: z.string().uuid() }),
  z.object({ action: z.literal("mailbox.delete"), mailboxId: z.string().uuid(), force: z.boolean().default(false) }),
  z.object({ action: z.literal("mailbox.access"), mailboxId: z.string().uuid(), userIds: z.array(z.string().max(64)).max(500) }),
  z.object({ action: z.literal("alias.add"), domainId: z.string().uuid(), local: z.string().trim().min(1).max(64), mailboxId: z.string().uuid() }),
  z.object({ action: z.literal("alias.remove"), aliasId: z.string().uuid() }),
  z.object({ action: z.literal("sender.add"), pattern: z.string().trim().toLowerCase().min(3).max(254), rule: z.enum(["block", "allow"]) }),
]);
