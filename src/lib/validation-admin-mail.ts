/** Request bodies of the staff mailbox API (/api/app/admin/mail). */
import { z } from "zod";

const mailAddress = z.string().trim().toLowerCase().email("Enter a valid e-mail address").max(254);

/** Staff mailbox (/app/admin-mail): a reply in a thread, a forward (`forwardOf`), or a new e-mail with `mailbox` and `subject`. */
export const adminMailSendSchema = z
  .object({
    mailbox: z.string().trim().toLowerCase().optional(),
    forwardOf: z.string().uuid().optional(),
    to: mailAddress,
    cc: z.array(mailAddress).max(20).default([]),
    subject: z.string().trim().max(300).optional(),
    text: z.string().trim().max(50_000).default(""),
    files: z.array(z.object({ url: z.string().max(500), mediaType: z.string().max(200), filename: z.string().max(200) })).max(5).default([]),
  })
  .refine((v) => !!v.text || !!v.forwardOf, { message: "Write a message", path: ["text"] });

/** Archive, trash, snooze or mark threads; several at once. */
export const adminMailUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  archived: z.boolean().optional(),
  unread: z.boolean().optional(),
  trashed: z.boolean().optional(),
  snoozedUntil: z.number().int().positive().nullable().optional(),
});

export const adminMailDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export const adminMailSignatureSchema = z.object({ mailbox: z.string().trim().toLowerCase(), signature: z.string().max(2000) });
