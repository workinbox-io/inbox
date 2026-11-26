/**
 * A note's Yjs document: the Plate content in the XmlText "content" (where @platejs/yjs keeps it) and the
 * title in the Text "title". Pure: used by the note's Durable Object and by tests.
 */
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import type { Value } from "platejs";
import * as Y from "yjs";
import { EMPTY_NOTE } from "./plate";

export const contentOf = (doc: Y.Doc) => doc.get("content", Y.XmlText) as Y.XmlText;
export const titleOf = (doc: Y.Doc) => doc.getText("title");

/** Replaces the content (and the title, when given) in one transaction; connected editors see the change. */
export function seedDoc(doc: Y.Doc, value: Value, title?: string, origin?: unknown) {
  doc.transact(() => {
    const content = contentOf(doc);
    if (content.length) content.delete(0, content.length);
    content.applyDelta(slateNodesToInsertDelta(value.length ? value : EMPTY_NOTE));
    if (title !== undefined) {
      const t = titleOf(doc);
      if (t.toString() !== title) {
        t.delete(0, t.length);
        t.insert(0, title);
      }
    }
  }, origin);
}

/** Appends blocks at the end of the content. */
export function appendDoc(doc: Y.Doc, value: Value, origin?: unknown) {
  doc.transact(() => {
    const content = contentOf(doc);
    const delta = slateNodesToInsertDelta(value);
    content.applyDelta([{ retain: content.length }, ...delta]);
  }, origin);
}

export function readDoc(doc: Y.Doc): { value: Value; title: string } {
  const value = yTextToSlateElement(contentOf(doc)).children as Value;
  return { value, title: titleOf(doc).toString() };
}

export const isEmptyDoc = (doc: Y.Doc) => contentOf(doc).length === 0;
