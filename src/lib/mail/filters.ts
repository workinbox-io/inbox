import type { FilterCondition } from "@/db/schema/mail-storage";
export interface FilterMessage { from: string; to: string; subject: string; text: string; hasAttachment: boolean }
/** Case-insensitive literal containment; all conditions must match. */
export function matchesMailFilter(conditions: FilterCondition[], message: FilterMessage) {
  return conditions.length > 0 && conditions.every(c => c.field === "attachment"
    ? message.hasAttachment === (c.value === "true")
    : message[c.field].toLocaleLowerCase().includes(c.value.toLocaleLowerCase()));
}
