/** A record's description (a Plate document, components/mailbox/mail-editor.tsx): its size cap and the people @mentioned in it. Pure. */
export const MAX_DESCRIPTION = 100_000;

type Node = { type?: string; key?: unknown; children?: Node[] };

/** Ids of people @mentioned anywhere in the document (mention nodes keyed `person:<id>`). */
export function mentionedPeople(doc: unknown): string[] {
  const out = new Set<string>();
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes as Node[]) {
      if (n?.type === "mention" && typeof n.key === "string" && n.key.startsWith("person:")) out.add(n.key.slice(7));
      walk(n?.children);
    }
  };
  walk(doc);
  return [...out];
}
