import { handler, json, parseBody } from "@/lib/server/api";
import { missingAccess } from "@/lib/server/mentions";
import { notesViewer } from "@/lib/server/notes/access";
import { mentionAccessSchema } from "@/lib/validation-mentions";

/** Before sending: which mentioned things someone in the channel or among the recipients can't open. */
export const POST = handler(async (ctx) => {
  const { refs, audience } = await parseBody(ctx.request, mentionAccessSchema);
  return json({ gaps: await missingAccess(notesViewer(ctx), refs, audience) });
});
