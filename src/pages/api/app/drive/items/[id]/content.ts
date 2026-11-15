import { handler } from "@/lib/server/api";
import { driveViewer, requireItem } from "@/lib/server/drive/access";
import { serveFile } from "@/lib/server/drive/serve";

/** The file's bytes: inline when the browser can show it, ?download=1 to save it. Supports Range. */
export const GET = handler(async (ctx) => {
  const { item } = await requireItem(driveViewer(ctx), ctx.params.id!);
  return serveFile(item, ctx.request, { download: ctx.url.searchParams.has("download") });
});
