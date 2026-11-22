/** A collection's icon (one of these keys, drawn by components/collections/collection-icon.tsx) and colour (#rrggbb). */
export const COLLECTION_ICONS = [
  "list", "check", "bug", "rocket", "target", "flag", "star", "heart", "users", "briefcase", "handshake", "box",
  "package", "truck", "wrench", "laptop", "book", "calendar", "lightbulb", "megaphone", "folder", "database",
] as const
export type CollectionIconKey = (typeof COLLECTION_ICONS)[number]
export const HEX_COLOR = /^#[0-9a-f]{6}$/i
