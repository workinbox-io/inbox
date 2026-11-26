/**
 * Automations on a collection: "when a record is added" or "when <field> changes (to <value>)", then notify people of
 * the organization in the app (the bell), e-mail them or post in a chat channel. Pure: when a rule fires and how a
 * record reads in the message. Runs in lib/server/collection-automations.ts; tested in test/collections.test.ts.
 */
import { z } from "zod";
import { valueText, type CollectionField, type FieldValue, type RecordValues } from "./fields";

export const MAX_AUTOMATIONS = 20;

export const automationTriggerSchema = z.discriminatedUnion("on", [
  z.object({ on: z.literal("created") }),
  /** `value` null: any change of the field. */
  z.object({ on: z.literal("changed"), field: z.string().min(1).max(32), value: z.string().max(60).nullable() }),
]);
export const automationActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email"), userIds: z.array(z.string().min(1).max(100)).min(1).max(50) }),
  z.object({ kind: z.literal("chat"), channelId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("notify"), userIds: z.array(z.string().min(1).max(100)).min(1).max(50) }),
]);
export const automationSchema = z.object({ trigger: automationTriggerSchema, action: automationActionSchema });
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;

/** A value as the rule compares it: checkboxes as "true"/"false", the rest as text. */
const asText = (v: FieldValue | undefined) => (v === undefined ? null : valueText(v));

/** Does the rule fire for this write? `before` is null for a new record. */
export function fires(trigger: AutomationTrigger, before: RecordValues | null, after: RecordValues): boolean {
  if (trigger.on === "created") return before === null;
  if (before === null) return false;
  const was = asText(before[trigger.field]);
  const now = asText(after[trigger.field]);
  if (was === now) return false;
  if (trigger.value === null) return true;
  // A multiselect "changes to" a label when the label is added.
  const list = (v: FieldValue | undefined) => (Array.isArray(v) ? v : []);
  if (Array.isArray(after[trigger.field])) return list(after[trigger.field]).includes(trigger.value) && !list(before[trigger.field]).includes(trigger.value);
  return now === trigger.value;
}

/** "When a record is added", "When Status changes to Done". */
export function triggerText(trigger: AutomationTrigger, fields: CollectionField[]) {
  if (trigger.on === "created") return "When a record is added";
  const field = fields.find((f) => f.id === trigger.field);
  const name = field?.name ?? trigger.field;
  if (trigger.value === null) return `When ${name} changes`;
  const value = field?.type === "checkbox" ? (trigger.value === "true" ? "checked" : "unchecked") : trigger.value;
  return `When ${name} changes to ${value}`;
}

/** The record's filled fields as label/value rows for the message; people by name. */
export function recordRows(fields: CollectionField[], values: RecordValues, people: { id: string; name: string; email: string }[]) {
  return fields.flatMap((f) => {
    const v = values[f.id];
    if (v === undefined || v === "") return [];
    const value = f.type === "person" ? (people.find((p) => p.id === v)?.name || String(v)) : f.type === "checkbox" ? (v ? "Yes" : "No") : valueText(v);
    return [{ label: f.name, value }];
  });
}
