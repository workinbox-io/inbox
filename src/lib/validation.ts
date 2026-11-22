/** Request body schemas, shared by API routes and forms. */
import { z } from "zod";
import { OPTIONAL_MODULES } from "@/config/modules";

export const orgNameSchema = z.string().trim().min(1, "Enter a name").max(64, "Up to 64 characters");

export const renameOrgSchema = z.object({ name: orgNameSchema });
export const createWorkspaceSchema = z.object({ name: orgNameSchema });
export const orgModuleSchema = z.object({ module: z.enum(OPTIONAL_MODULES), enabled: z.boolean() });

const detail = (max: number) => z.string().trim().max(max, `Up to ${max} characters`).default("");

/** Company details for invoices. All optional; the country is required once an address is given. */
export const billingDetailsSchema = z
  .object({
    legalName: detail(128),
    vatId: detail(32).transform((v) => v.replace(/[\s.-]/g, "").toUpperCase()),
    addressLine1: detail(128),
    addressLine2: detail(128),
    city: detail(64),
    postalCode: detail(16),
    region: detail(64),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .refine((c) => c === "" || /^[A-Z]{2}$/.test(c), "Pick a country")
      .default(""),
  })
  .superRefine((d, ctx) => {
    if (d.vatId && !/^[A-Z]{2}[A-Z0-9]{2,18}$/.test(d.vatId)) {
      ctx.addIssue({ code: "custom", path: ["vatId"], message: "Enter a VAT ID with its country prefix, e.g. DE123456789" });
    }
    if ((d.addressLine1 || d.city || d.postalCode) && !d.country) {
      ctx.addIssue({ code: "custom", path: ["country"], message: "Pick the country of the address" });
    }
  });

export type BillingDetails = z.output<typeof billingDetailsSchema>;

export const transferOwnershipSchema = z.object({ memberId: z.string().min(1) });

/** The owner types the organization's name to confirm. */
export const deleteOrgSchema = z.object({ confirmName: z.string() });

export const apiKeySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(64),
  role: z.enum(["admin", "member"]),
});


/** "Connect device": one device password per mailbox, as JSON or an Apple profile. */
export const mailDeviceSchema = z.object({
  description: z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/),
  mailboxIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).min(1).max(20),
  format: z.enum(["json", "mobileconfig"]),
}).strict();
