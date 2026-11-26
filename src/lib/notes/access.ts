/**
 * Who may open, edit and manage a note. Pure: lib/server/notes/access.ts loads the rows and calls these.
 *
 * - The owner may do everything.
 * - `team` notes: every member gets `teamRole`; owners and admins may also manage them.
 * - `people` notes: the people in note_access, with their role.
 * - `private` notes: the owner only. Unlike shared mailboxes, owners and admins don't see them.
 * - API keys (no user) see team notes only.
 */
export type NoteRole = "owner" | "edit" | "view";
export type NoteSharing = "private" | "people" | "team";

export interface NoteAccessFacts {
  ownerId: string | null;
  sharing: NoteSharing;
  teamRole: "view" | "edit";
}

export interface NoteViewerFacts {
  /** Empty for API keys. */
  userId: string;
  /** Owners and admins of the org. */
  manager: boolean;
}

const rank = { view: 1, edit: 2, owner: 3 } as const;

export const atLeast = (role: NoteRole | null, need: NoteRole) => !!role && rank[role] >= rank[need];

/** The viewer's role in a note, or null when they may not open it. `grant` is their note_access role, if any. */
export function noteRole(note: NoteAccessFacts, viewer: NoteViewerFacts, grant?: "view" | "edit" | null): NoteRole | null {
  if (viewer.userId && note.ownerId === viewer.userId) return "owner";
  if (note.sharing === "private") return null;
  // A note without an owner (made with an API key, or its owner left) is run by the managers.
  if (note.ownerId === null && note.sharing === "team" && viewer.manager && viewer.userId) return "owner";
  let role: NoteRole | null = note.sharing === "team" ? note.teamRole : null;
  if (viewer.userId && grant && (!role || rank[grant] > rank[role])) role = grant;
  return role;
}

/** Who may change sharing, archive or delete: the owner, and for team notes also owners and admins (and admin API keys). */
export function canManageNote(note: NoteAccessFacts, viewer: NoteViewerFacts, role: NoteRole | null) {
  if (role === "owner") return true;
  return note.sharing === "team" && viewer.manager;
}

/** Plain text of a Plate value: block texts joined by new lines (for search, previews and the API). */
export function plainText(value: unknown): string {
  const lines: string[] = [];
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: unknown; children?: unknown[] };
    if (typeof n.text === "string") return n.text;
    return Array.isArray(n.children) ? n.children.map(walk).join("") : "";
  };
  const block = (node: unknown) => {
    const n = node as { children?: unknown[]; type?: string };
    // Containers (tables, rows, lists of blocks) contribute one line per inner block.
    const inner = Array.isArray(n?.children) ? n.children : [];
    if (inner.some((c) => c && typeof c === "object" && Array.isArray((c as { children?: unknown }).children) && !("text" in (c as object)) && (c as { type?: string }).type !== "a" && (c as { type?: string }).type !== "mention")) {
      inner.forEach(block);
      return;
    }
    lines.push(walk(node));
  };
  if (Array.isArray(value)) value.forEach(block);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A title from the first non-empty line, for notes saved without one. */
export function titleFrom(text: string, fallback = "Untitled") {
  const line = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line || fallback;
}
