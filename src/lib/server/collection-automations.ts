/**
 * Collection automations (pure rules: lib/collections/automations.ts). Managed by whoever may change the collection;
 * a record write queues the rules that fire (job `collections.automation`), and the job e-mails people of the
 * organization or posts in a chat channel as the rule's creator. Imports don't trigger rules (a 5,000-row file
 * would flood the inbox).
 */
import { and, collectionAutomations, collectionRecords, collections, db, eq, inArray, isNull, member } from "@/db";
import { MAX_AUTOMATIONS, fires, recordRows, triggerText, type AutomationAction, type AutomationTrigger } from "@/lib/collections/automations";
import type { RecordValues } from "@/lib/collections/fields";
import { refToken } from "@/lib/mentions";
import { collectionAutomationEmail } from "@/emails/collections";
import { userLocale, withLocale } from "@/lib/server/i18n";
import { HttpError } from "./api";
import { requireChannel } from "./chat/access";
import { sendMessage } from "./chat/messages";
import { getCollection, type Collection, type CollectionViewer } from "./collections";
import { sendEmail } from "./email";
import { reportError } from "./errors";
import { moduleOn } from "./modules";
import { notePeople } from "./notes/notes";
import { notify } from "./notifications";
import { enqueue } from "./queue";
import { toRole } from "./roles";

export type Automation = { id: string; trigger: AutomationTrigger; action: AutomationAction; enabled: boolean; createdBy: string; createdAt: string };

const toAutomation = (r: typeof collectionAutomations.$inferSelect): Automation => ({
  id: r.id, trigger: r.trigger, action: r.action, enabled: r.enabled, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(),
});

export async function listAutomations(v: CollectionViewer, collectionId: string) {
  const c = await getCollection(v, collectionId, "manage");
  const rows = await db.select().from(collectionAutomations).where(eq(collectionAutomations.collectionId, c.id)).orderBy(collectionAutomations.createdAt);
  return rows.map(toAutomation);
}

/** The rule must name a field of the collection (and one of its choices), people of the org, a channel the creator can post in. */
async function check(v: CollectionViewer, c: Collection, trigger: AutomationTrigger, action: AutomationAction) {
  if (trigger.on === "changed") {
    const field = c.fields.find((f) => f.id === trigger.field);
    if (!field) throw new HttpError(422, "Pick a field of this collection");
    if (trigger.value !== null && field.type === "select" && !field.options?.includes(trigger.value)) throw new HttpError(422, `"${trigger.value}" isn't a choice of ${field.name}`);
    if (trigger.value !== null && field.type === "checkbox" && trigger.value !== "true" && trigger.value !== "false") throw new HttpError(422, "A checkbox is checked or unchecked");
  }
  if (action.kind === "email" || action.kind === "notify") {
    const ids = [...new Set(action.userIds)];
    const rows = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)));
    if (rows.length !== ids.length) throw new HttpError(422, "Pick people of this organization only");
  } else {
    if (!(await moduleOn(v.orgId, "chat"))) throw new HttpError(422, "Chat is turned off for this organization");
    const { channel } = await requireChannel({ orgId: v.orgId, userId: v.userId!, role: v.role }, action.channelId);
    if (channel.kind !== "channel" || channel.archivedAt) throw new HttpError(422, "Pick a channel");
  }
}

export async function createAutomation(v: CollectionViewer, collectionId: string, input: { trigger: AutomationTrigger; action: AutomationAction }) {
  if (!v.userId) throw new HttpError(403, "Automations run as a person: sign in to add one");
  const c = await getCollection(v, collectionId, "manage");
  const existing = await db.select({ id: collectionAutomations.id }).from(collectionAutomations).where(eq(collectionAutomations.collectionId, c.id));
  if (existing.length >= MAX_AUTOMATIONS) throw new HttpError(422, `Up to ${MAX_AUTOMATIONS} automations per collection`);
  await check(v, c, input.trigger, input.action);
  const [row] = await db.insert(collectionAutomations).values({ orgId: v.orgId, collectionId: c.id, trigger: input.trigger, action: input.action, createdBy: v.userId }).returning();
  return { automation: toAutomation(row!), collection: c };
}

export async function setAutomation(v: CollectionViewer, collectionId: string, id: string, input: { enabled?: boolean; remove?: boolean }) {
  const c = await getCollection(v, collectionId, "manage");
  const where = and(eq(collectionAutomations.id, id), eq(collectionAutomations.collectionId, c.id));
  const [row] = await db.select().from(collectionAutomations).where(where);
  if (!row) throw new HttpError(404, "Automation not found");
  if (input.remove) await db.delete(collectionAutomations).where(where);
  else if (input.enabled !== undefined) await db.update(collectionAutomations).set({ enabled: input.enabled }).where(where);
  return { automation: toAutomation({ ...row, enabled: input.enabled ?? row.enabled }), collection: c };
}

/** After a record write: queue the rules that fire. Never fails the write. */
export async function queueAutomations(orgId: string, collectionId: string, recordId: string, before: RecordValues | null, after: RecordValues) {
  try {
    const rules = await db
      .select()
      .from(collectionAutomations)
      .where(and(eq(collectionAutomations.collectionId, collectionId), eq(collectionAutomations.enabled, true)));
    for (const r of rules) if (fires(r.trigger, before, after)) await enqueue("collections.automation", { orgId, automationId: r.id, recordId });
  } catch (e) {
    await reportError("web", e, { route: "collection automations", orgId });
  }
}

/** The job: runs one rule for one record, as the rule's creator (skipped if they left or the record is gone). */
export async function runAutomation({ orgId, automationId, recordId }: { orgId: string; automationId: string; recordId: string }) {
  const [rule] = await db.select().from(collectionAutomations).where(and(eq(collectionAutomations.id, automationId), eq(collectionAutomations.orgId, orgId)));
  const [record] = await db.select().from(collectionRecords).where(and(eq(collectionRecords.id, recordId), eq(collectionRecords.orgId, orgId), isNull(collectionRecords.deletedAt)));
  const [collection] = rule ? await db.select().from(collections).where(eq(collections.id, rule.collectionId)) : [];
  if (!rule?.enabled || !record || !collection || !(await moduleOn(orgId, "collections"))) return;
  const [creator] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, rule.createdBy)));
  if (!creator) return;
  const people = await notePeople(orgId);
  const event = triggerText(rule.trigger, collection.fields).replace(/^When /, "").replace(/^a record is added$/, "New record");
  const rows = recordRows(collection.fields, record.values, people);
  const action = rule.action;
  if (action.kind === "email") {
    for (const p of people.filter((p) => action.userIds.includes(p.id))) {
      const mail = await withLocale(await userLocale({ id: p.id }), () => collectionAutomationEmail({ collection: collection.name, title: record.title, event: event[0]!.toUpperCase() + event.slice(1), rows, recordId: record.id }));
      await sendEmail({ to: p.email, ...mail });
    }
  } else if (action.kind === "notify") {
    // No actor: the rule's creator may want to hear about it too.
    await notify(orgId, action.userIds, { kind: "automation", app: "collections", actorId: null, title: record.title, body: `${event[0]!.toUpperCase()}${event.slice(1)} in ${collection.name}`, href: `/app/open/record/${record.id}`, groupKey: `record:${record.id}` });
  } else if (await moduleOn(orgId, "chat")) {
    const details = rows.slice(0, 4).map((r) => `${r.label}: ${r.value}`).join(" · ");
    const text = `${refToken({ kind: "record", id: record.id, title: record.title })} in ${collection.name}: ${event}${details ? `\n${details}` : ""}`;
    // A channel the creator can no longer post in (left, archived) just skips the message.
    await sendMessage({ orgId, userId: rule.createdBy, role: toRole(creator.role) }, { channelId: action.channelId, text }).catch((e) => {
      if (!(e instanceof HttpError)) throw e;
    });
  }
}
