import { handler, json, parseBody } from "@/lib/server/api";
import { shareRef } from "@/lib/server/mentions";
import { notesViewer } from "@/lib/server/notes/access";
import { mentionShareSchema } from "@/lib/validation-mentions";

/** The sender's fix for one mention: give access, or a live or snapshot link (returned as the ref's `url`). */
export const POST = handler(async (ctx) => {
  const input = await parseBody(ctx.request, mentionShareSchema);
  const ref = await shareRef(notesViewer(ctx), input);
  ctx.audit(`mention.${input.action}`, { target: input.ref.title, details: { kind: input.ref.kind, id: input.ref.id, people: input.userIds.length, outside: input.emails.length } });
  return json({ ref });
});
