import { handler } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { getRawMessage } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";

/** The original message as .eml ("Show original" / download). Plain text, never rendered. */
export const GET = handler(async (ctx) => {
  const object = await getRawMessage(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)));
  return new Response(object.body, {
    headers: {
      "Content-Type": ctx.url.searchParams.has("download") ? "message/rfc822" : "text/plain; charset=utf-8",
      "Content-Disposition": ctx.url.searchParams.has("download") ? `attachment; filename="message.eml"` : "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
