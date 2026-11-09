import { handler, json } from "@/lib/server/api";
import { notesViewer } from "@/lib/server/notes/access";
import { noteTicket } from "@/lib/server/notes/notes";

/** A short-lived ticket for the note's WebSocket (/notes-sync/:id), asked for on every (re)connect. */
export const POST = handler(async (ctx) =>
  json(await noteTicket(notesViewer(ctx), ctx.params.id!, ctx.locals.user?.name || ctx.locals.user?.email || "")),
);
