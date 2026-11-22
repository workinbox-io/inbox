import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { createLink, listLinks } from "@/lib/server/drive/links";
import { driveLinkSchema } from "@/lib/validation-drive";

/** The item's public links (people who may share it only). */
export const GET = handler(async (ctx) => json({ links: await listLinks(driveViewer(ctx), ctx.params.id!) }));

/** A new public link, optionally with a password and an expiry (ms). */
export const POST = handler(async (ctx) => {
  const input = await parseBody(ctx.request, driveLinkSchema);
  const { item, link } = await createLink(driveViewer(ctx), ctx.params.id!, input);
  ctx.audit("drive.link_create", { target: item.name, details: { password: !!input.password, expires: !!input.expiresAt } });
  return json(link, 201);
});
