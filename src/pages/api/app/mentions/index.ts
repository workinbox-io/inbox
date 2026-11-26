import { handler, json } from "@/lib/server/api";
import { REF_KINDS, type MentionKind } from "@/lib/mentions";
import { searchMentionables } from "@/lib/server/mentions";
import { notesViewer } from "@/lib/server/notes/access";

const KINDS: MentionKind[] = ["person", ...REF_KINDS];

/** The @ picker: ?q= across people, files, notes, events, contacts, threads, channels and records (?kinds=file,note narrows). */
export const GET = handler(async (ctx) => {
  const q = (ctx.url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const kinds = (ctx.url.searchParams.get("kinds") ?? "").split(",").filter((k): k is MentionKind => KINDS.includes(k as MentionKind));
  return json({ results: await searchMentionables(notesViewer(ctx), q, kinds) });
});
