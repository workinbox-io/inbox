import { handler, HttpError } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { hostedAccountsRequest, signedProfile } from "@/lib/server/mail/bridge";
import { mobileconfig, type ProfileAccount } from "@/lib/mail/mobileconfig";
import { mailDeviceSchema } from "@/lib/validation";

interface Settings { host: string; port: number; username: string; smtp: { host: string; port: number } | null }

/** Creates a device password for each mailbox and returns them once, as JSON or a .mobileconfig. Nothing is stored here. */
export const POST = handler(async (ctx) => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(403, "Sign in to manage mail clients");
  // Safari installs a profile only from a real form submission, so the form sends the JSON in one field.
  const form = (ctx.request.headers.get("content-type") ?? "").includes("form");
  let raw: unknown;
  try { raw = form ? JSON.parse(String((await ctx.request.formData()).get("payload") ?? "")) : await ctx.request.json(); }
  catch { throw new HttpError(400, "Invalid JSON"); }
  const parsed = mailDeviceSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, "Invalid input");
  const input = parsed.data;
  const ids = [...new Set(input.mailboxIds)];
  const boxes = await viewerMailboxes(mailViewer(ctx));
  const chosen = ids.map((id) => boxes.find((box) => box.id === id));
  if (chosen.some((box) => !box)) throw new HttpError(404, "Not found");
  const bridge = await (await hostedAccountsRequest(ctx, "GET")).json() as { connections: { mailboxId: string; active: number; initialized: number }[] };
  if (ids.some((id) => !bridge.connections.some((c) => c.mailboxId === id && c.active && c.initialized))) throw new HttpError(409, "Mailboxes are still being prepared");

  const accounts: ProfileAccount[] = [];
  // shortcut: a bridge failure halfway leaves the earlier passwords in place; they show under Devices and can be revoked.
  for (const box of chosen) {
    const settings = await (await hostedAccountsRequest(ctx, "GET", `/${box!.id}/client-passwords`)).json() as Settings;
    const created = await (await hostedAccountsRequest(ctx, "POST", `/${box!.id}/client-passwords`, { description: input.description })).json() as { secret: string };
    accounts.push({ address: box!.address, name: box!.displayName || box!.address, username: settings.username, password: created.secret, host: settings.host, imapPort: settings.port, smtp: settings.smtp });
  }
  if (input.format === "json") return Response.json({ accounts }, { headers: { "cache-control": "no-store" } });
  const profile = mobileconfig({ device: input.description, accounts });
  // Signed shows as Verified on iPhone and Mac; an unsigned profile still installs if the bridge can't sign.
  return new Response((await signedProfile(ctx, profile)) ?? profile, { headers: {
    "content-type": "application/x-apple-aspen-config",
    "content-disposition": 'attachment; filename="Work-Inbox.mobileconfig"',
    "cache-control": "no-store",
  } });
});
