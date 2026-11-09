/**
 * The note document model without React: the base Plate plugins (same node types as the editor in
 * components/notes/editor) and markdown in and out. Used by the API, MCP tools and the note's Durable Object.
 */
import { BaseBasicBlocksPlugin, BaseBasicMarksPlugin } from "@platejs/basic-nodes";
import { BaseCodeBlockPlugin } from "@platejs/code-block";
import { BaseLinkPlugin } from "@platejs/link";
import { BaseListPlugin } from "@platejs/list";
import { MarkdownPlugin } from "@platejs/markdown";
import { BaseImagePlugin } from "@platejs/media";
import { BaseMentionPlugin } from "@platejs/mention";
import { BaseTablePlugin } from "@platejs/table";
import { createSlateEditor, type Value } from "platejs";
import remarkGfm from "remark-gfm";

export const EMPTY_NOTE: Value = [{ type: "p", children: [{ text: "" }] }];

const basePlugins = [
  BaseBasicBlocksPlugin,
  BaseBasicMarksPlugin,
  BaseCodeBlockPlugin,
  BaseLinkPlugin,
  BaseListPlugin,
  BaseTablePlugin,
  BaseImagePlugin,
  BaseMentionPlugin,
  MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
];

const editor = () => createSlateEditor({ plugins: basePlugins });

export function markdownToValue(markdown: string): Value {
  if (!markdown.trim()) return EMPTY_NOTE;
  const value = editor().api.markdown.deserialize(markdown);
  return value.length ? value : EMPTY_NOTE;
}

export function valueToMarkdown(value: Value | null | undefined): string {
  if (!value?.length) return "";
  return editor().api.markdown.serialize({ value }).trim();
}

/** Whether a stored value is a usable Plate document (a non-empty list of elements). */
export const isValue = (v: unknown): v is Value =>
  Array.isArray(v) && v.length > 0 && v.every((n) => n && typeof n === "object" && Array.isArray((n as { children?: unknown }).children));
