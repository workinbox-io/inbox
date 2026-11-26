/**
 * MCP tools for collections (custom modules): the same lib/server functions as /api/app/collections. Generic tools
 * that work on any collection, so a company's own "Inventory" or "Equipment" is usable from AI apps the moment an
 * admin creates it. Collections and fields are named by id or name.
 */
import { z } from "zod";
import { COLLECTION_TEMPLATES, fieldsInputSchema, TEMPLATE_IDS } from "@/lib/collections/fields";
import { addLink, batchRecords, createRecord, deleteRecord, findCollection, findRecord, listCollections, listLinks, listRecords, updateCollection, updateRecord, createCollection, type CollectionRecord } from "@/lib/server/collections";
import { addRelation, relatedOf } from "@/lib/server/collection-relations";
import type { Value } from "platejs";
import { formatId } from "@/lib/collections/ids";
import { markdownToValue, valueToMarkdown } from "@/lib/notes/plate";
import { notePeople } from "@/lib/server/notes/notes";
import { recordCreateSchema, recordListSchema, recordUpdateSchema, relationSchema } from "@/lib/validation-collections";
import { HttpError } from "@/lib/server/api";
import { triggerText, type AutomationAction, type AutomationTrigger } from "@/lib/collections/automations";
import { findField } from "@/lib/collections/fields";
import { listChannels } from "@/lib/server/chat/channels";
import { createAutomation, listAutomations, setAutomation, type Automation } from "@/lib/server/collection-automations";
import { defineTool, type McpContext, type McpModule, type Tools } from "./define";

const viewer = (ctx: McpContext) => ({ orgId: ctx.orgId, userId: ctx.userId, role: ctx.role });

const collection = z.string().min(1).describe("Collection id or name, from collections_list");
const recordId = z.string().min(1).max(64).describe("Record id from collection_records_search, or its ID like TSK-12 (the collection's prefix and the record's number)");

const description = z.string().max(20_000).nullable().optional().describe("The description in Markdown (@mentions of people stay as text); null clears it");
const fromMarkdown = (md: string | null | undefined) => (md === undefined ? undefined : md === null || !md.trim() ? null : markdownToValue(md));

/** A record as the model reads it: its ID like TSK-12 and the description as Markdown. */
const forModel = (c: { prefix: string }, r: CollectionRecord) => {
  const { description: doc, linkKinds: _kinds, position: _position, deletedAt: _deleted, createdBy: _by, ...rest } = r;
  return { ...rest, key: formatId(c.prefix, r.number), ...(doc !== undefined ? { description: doc ? valueToMarkdown(doc as Value) : "" } : {}) };
};

/** Person values come back as names and e-mails, not internal ids. */
async function withPeople<T extends { values: Record<string, unknown> }>(orgId: string, fields: { id: string; type: string }[], records: T[]) {
  const personFields = fields.filter((f) => f.type === "person").map((f) => f.id);
  if (!personFields.length) return records;
  const people = new Map((await notePeople(orgId)).map((p) => [p.id, `${p.name} <${p.email}>`]));
  return records.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, personFields.includes(k) ? (people.get(String(v)) ?? v) : v])) }));
}

export const collectionsTools: Tools = {
  collections_list: defineTool({
    title: "List collections",
    description:
      "The collections the user may open (the organization's own lists such as Deals, Equipment, Inventory or Tasks), each with the user's role (view, edit or owner), its fields (id, name, type, choices of select fields) and record count. Call it before reading or writing records.",
    async run(_input, ctx) {
      return { collections: (await listCollections(viewer(ctx))).map(({ people: _p, ownerId: _o, ...c }) => c), templates: Object.fromEntries(TEMPLATE_IDS.map((id) => [id, COLLECTION_TEMPLATES[id].description])) };
    },
  }),

  collection_create: defineTool({
    title: "Create collection",
    description:
      "Adds a collection everyone in the organization can use: from a template (crm, equipment, inventory, projects = tasks, roadmap = projects) or with its own fields. Field types: text, number, date, select (with options; `style` status makes it the workflow, priority shows bars), multiselect (labels, with options), checkbox, person, url, email, relation (`target` = another collection's id, e.g. tasks pointing at a project), file.",
    input: z.object({
      name: z.string().trim().min(1).max(80).optional(),
      template: z.enum(TEMPLATE_IDS).optional(),
      fields: fieldsInputSchema.optional(),
    }),
    scope: "write",
    manage: true,
    async run(input, ctx) {
      if (!input.name && !input.template) throw new HttpError(422, "Give a name or a template");
      const created = await createCollection(viewer(ctx), input);
      ctx.audit("collection.create", { target: created.name });
      return created;
    },
  }),

  collection_update: defineTool({
    title: "Change collection",
    description:
      "Renames a collection or replaces its field list (its owner; owners and admins for collections shared with the whole team). `fields` is the full list in order: keep each existing field's `id` so its values stay; a field left out is removed from every record.",
    input: z.object({ collection, name: z.string().trim().min(1).max(80).optional(), fields: fieldsInputSchema.optional() }),
    scope: "write",
    destructive: true,
    async run({ collection: ref, ...input }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "manage");
      const updated = await updateCollection(viewer(ctx), c.id, input);
      ctx.audit("collection.update", { target: updated.name });
      return updated;
    },
  }),

  collection_records_search: defineTool({
    title: "Search records",
    description:
      "Records of one collection, newest change first. `q` matches the title and any value; `filter` keeps records whose fields equal the given values, e.g. { \"Status\": \"In stock\" } (a multiselect matches when it has the label). `scope`: triage (waiting to be accepted) or trash; `parent`: the sub-records of a record; `cycle`: a cycle number. Person values come back as `Name <email>`.",
    input: z.object({ collection, q: recordListSchema.shape.q, filter: recordListSchema.shape.filter, scope: z.enum(["all", "triage", "trash"]).optional(), parent: recordListSchema.shape.parent, cycle: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(200).optional() }),
    async run({ collection: ref, q, filter, scope, parent, cycle, limit }, ctx) {
      const c = await findCollection(viewer(ctx), ref);
      const res = await listRecords(ctx.orgId, c, { q, filter, scope, parent, cycle, limit: limit ?? 50, offset: 0 });
      return { collection: { id: c.id, name: c.name, fields: c.fields }, records: await withPeople(ctx.orgId, c.fields, res.records.map((r) => forModel(c, r))), hasMore: res.hasMore };
    },
  }),

  collection_record_get: defineTool({
    title: "Read record",
    description: "One record with its description (Markdown), links (pull requests, designs, documents), parent and sub-records, relations (blocks, blocked by, related, duplicate) and the records of other collections linking to it.",
    input: z.object({ collection, id: recordId }),
    async run({ collection: ref, id }, ctx) {
      const c = await findCollection(viewer(ctx), ref);
      const record = await findRecord(ctx.orgId, c, id);
      const [withNames] = await withPeople(ctx.orgId, c.fields, [forModel(c, record)]);
      const related = await relatedOf(viewer(ctx), c, record.id);
      const brief = (r: { key: string | null; title: string; collection: string; status: string | null }) => ({ key: r.key, title: r.title, collection: r.collection, status: r.status });
      return {
        ...withNames,
        links: (await listLinks(ctx.orgId, record.id)).map(({ url, kind, title, state }) => ({ url, kind, title, state })),
        parent: related.parent ? brief(related.parent) : null,
        subRecords: related.children.map(brief),
        relations: related.relations.map((r) => ({ kind: r.kind, record: brief(r.record) })),
        linkedFrom: related.linkedFrom.map((g) => ({ collection: g.collection, field: g.field, records: g.records.map(brief) })),
      };
    },
  }),

  collection_record_create: defineTool({
    title: "Add record",
    description: "Adds a record to a collection. `values` maps field ids or names to values; a person field takes the e-mail of someone in the organization, a multiselect a list of labels, a relation the other record's ID (PRJ-3). `parentId` makes it a sub-record. In a collection with triage on, it waits in Triage until someone accepts it.",
    input: z.object({ collection, ...recordCreateSchema.shape, parentId: z.string().max(64).optional().describe("The parent record's id or ID (TSK-12)"), description }),
    scope: "write",
    async run({ collection: ref, description: md, parentId, ...input }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "edit");
      const parent = parentId ? (await findRecord(ctx.orgId, c, parentId)).id : undefined;
      const record = await createRecord(ctx.orgId, c, ctx.userId, { ...input, parentId: parent, description: fromMarkdown(md) }, { triage: true });
      ctx.audit("collection_record.create", { target: record.title, details: { collection: c.name } });
      return forModel(c, record);
    },
  }),

  collection_record_update: defineTool({
    title: "Change record",
    description: "Changes a record's title or some of its values (fields not given stay as they are; null clears a value), e.g. moving a task to Done or lowering a stock quantity. Also its cycle, its parent (null = no longer a sub-record), or `accept` to take it out of triage.",
    input: z.object({ collection, id: recordId, title: recordUpdateSchema.shape.title, values: recordUpdateSchema.shape.values, cycle: recordUpdateSchema.shape.cycle, parentId: z.string().max(64).nullable().optional().describe("The parent record's id or ID (TSK-12); null takes it out"), accept: z.boolean().optional(), description }),
    scope: "write",
    async run({ collection: ref, id, description: md, parentId, accept, ...input }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "edit");
      const parent = parentId ? (await findRecord(ctx.orgId, c, parentId)).id : parentId;
      const record = await updateRecord(ctx.orgId, c, (await findRecord(ctx.orgId, c, id)).id, { ...input, parentId: parent, ...(accept ? { triage: false as const } : {}), description: fromMarkdown(md) }, ctx.userId);
      ctx.audit("collection_record.update", { target: record.title, details: { collection: c.name } });
      return forModel(c, record);
    },
  }),

  collection_record_delete: defineTool({
    title: "Delete record",
    description: "Moves one record to the trash; it can be restored for 30 days (collection_record_restore).",
    input: z.object({ collection, id: recordId }),
    scope: "write",
    destructive: true,
    async run({ collection: ref, id }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "edit");
      const record = await deleteRecord(ctx.orgId, c, (await findRecord(ctx.orgId, c, id)).id, ctx.userId);
      ctx.audit("collection_record.delete", { target: record.title, details: { collection: c.name } });
      return { deleted: true, title: record.title };
    },
  }),

  collection_record_restore: defineTool({
    title: "Restore record",
    description: "Brings a record back from the trash (find it with collection_records_search, scope trash).",
    input: z.object({ collection, id: z.string().min(1).max(64).describe("Record id from a trash search") }),
    scope: "write",
    async run({ collection: ref, id }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "edit");
      const res = await batchRecords(ctx.orgId, c, ctx.userId, { ids: [id], restore: true });
      if (!res.records.length) throw new HttpError(404, "No such record in the trash");
      ctx.audit("collection_record.restore", { target: res.records[0]!.title, details: { collection: c.name } });
      return { restored: true, record: forModel(c, res.records[0]!) };
    },
  }),

  collection_record_link: defineTool({
    title: "Link to record",
    description: "Adds a link to a record: a GitHub pull request, issue or commit, a Figma file, a Linear issue or any web page (the kind and title are read from the URL; the same URL is kept once). Use it to attach the pull request or commit you made for a task.",
    input: z.object({ collection, id: recordId, url: z.string().trim().url().max(2000).describe("https://… address") }),
    scope: "write",
    async run({ collection: ref, id, url }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "edit");
      const record = await findRecord(ctx.orgId, c, id);
      const { kind, title, state } = await addLink(ctx.orgId, c, record.id, url, ctx.userId);
      ctx.audit("collection_record.update", { target: record.title, details: { collection: c.name, link: title } });
      return { key: formatId(c.prefix, record.number), link: { url, kind, title, state } };
    },
  }),

  collection_record_relate: defineTool({
    title: "Relate records",
    description: "Links two records: this one blocks the other, is blocked by it, is related to it, or duplicates it. Either may be in another collection.",
    input: z.object({ collection, id: recordId, otherCollection: collection.describe("The other record's collection"), other: recordId, kind: relationSchema.shape.kind }),
    scope: "write",
    async run({ collection: ref, id, otherCollection, other, kind }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "edit");
      const record = await findRecord(ctx.orgId, c, id);
      const target = await findRecord(ctx.orgId, await findCollection(viewer(ctx), otherCollection), other);
      await addRelation(viewer(ctx), c, record.id, { to: target.id, kind });
      return { related: true, record: record.title, kind, other: target.title };
    },
  }),
};

/** A rule as the model reads it: names instead of ids. */
async function describeRule(orgId: string, fields: { id: string; name: string; type: string; options?: string[] }[], r: Automation) {
  const people = r.action.kind !== "chat" ? await notePeople(orgId) : [];
  return {
    id: r.id,
    enabled: r.enabled,
    when: triggerText(r.trigger, fields as never),
    then: r.action.kind === "chat" ? { postInChannelId: r.action.channelId } : { [r.action.kind === "email" ? "email" : "notify"]: r.action.userIds.map((id) => people.find((p) => p.id === id)?.email ?? "someone who left") },
  };
}

const automationId = z.string().uuid().describe("Automation id from collection_automations_list");

export const automationTools: Tools = {
  collection_automations_list: defineTool({
    title: "List collection automations",
    description: "The rules of one collection (\"When Status changes to Low\" → e-mail people or post in a chat channel), with their ids and whether they're on. For its owner (and owners and admins for collections shared with the team).",
    input: z.object({ collection }),
    async run({ collection: ref }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "manage");
      const rules = await listAutomations(viewer(ctx), c.id);
      return { collection: c.name, automations: await Promise.all(rules.map((r) => describeRule(ctx.orgId, c.fields, r))) };
    },
  }),

  collection_automation_create: defineTool({
    title: "Add collection automation",
    description:
      "Adds a rule to a collection: `when` a record is added (`field` left out) or a field changes (`field` by name, optional `to` value; for a checkbox `true`/`false`), then notify people in the app (`notifyPeople`), e-mail them (`emailPeople`; e-mails or names of people of the organization) or post in a chat channel (`postInChannel`: its name). Messages go out as the user, only to people of the organization.",
    input: z.object({
      collection,
      field: z.string().min(1).max(60).optional().describe("The field whose change fires the rule; leave out for \"when a record is added\""),
      to: z.string().max(60).optional().describe("Fire only when the field changes to this value"),
      emailPeople: z.array(z.string().min(1).max(320)).max(50).optional(),
      notifyPeople: z.array(z.string().min(1).max(320)).max(50).optional().describe("Notify these people in the app (the bell): their e-mails or names"),
      postInChannel: z.string().min(1).max(80).optional().describe("Channel name, with or without #"),
    }),
    scope: "write",
    persists: true,
    async run({ collection: ref, field, to, emailPeople, notifyPeople, postInChannel }, ctx) {
      const v = viewer(ctx);
      const c = await findCollection(v, ref, "manage");
      if ([emailPeople?.length, notifyPeople?.length, postInChannel].filter(Boolean).length !== 1) throw new HttpError(422, "Give one of emailPeople, notifyPeople or postInChannel");
      const who = emailPeople?.length ? emailPeople : notifyPeople;
      const f = field ? findField(c.fields, field) : null;
      if (field && !f) throw new HttpError(422, `No field "${field}". Fields: ${c.fields.map((x) => x.name).join(", ")}`);
      const value = to === undefined ? null : f?.type === "select" ? (f.options?.find((o) => o.toLowerCase() === to.trim().toLowerCase()) ?? to) : f?.type === "checkbox" ? to.trim().toLowerCase() : to.trim();
      const trigger: AutomationTrigger = f ? { on: "changed", field: f.id, value } : { on: "created" };
      let action: AutomationAction;
      if (who?.length) {
        const people = await notePeople(ctx.orgId);
        const userIds = who.map((one) => {
          const w = one.trim().toLowerCase();
          const p = people.find((x) => x.email.toLowerCase() === w) ?? people.find((x) => x.name.toLowerCase() === w);
          if (!p) throw new HttpError(422, `No one in the organization matches ${one}`);
          return p.id;
        });
        action = { kind: emailPeople?.length ? "email" : "notify", userIds };
      } else {
        if (!ctx.userId) throw new HttpError(403, "Automations run as a person: connect as a user, not an API key");
        const name = postInChannel!.replace(/^#/, "").trim().toLowerCase();
        const channel = (await listChannels({ orgId: ctx.orgId, userId: ctx.userId, role: ctx.role })).find((x) => x.kind === "channel" && x.name.toLowerCase() === name);
        if (!channel) throw new HttpError(422, `No channel #${name}`);
        action = { kind: "chat", channelId: channel.id };
      }
      const { automation } = await createAutomation(v, c.id, { trigger, action });
      ctx.audit("collection.automation", { target: c.name, details: { added: triggerText(trigger, c.fields), action: action.kind } });
      return await describeRule(ctx.orgId, c.fields, automation);
    },
  }),

  collection_automation_update: defineTool({
    title: "Turn an automation on, off or delete it",
    description: "Turns one rule of a collection on or off, or deletes it (`delete: true`).",
    input: z.object({ collection, id: automationId, enabled: z.boolean().optional(), delete: z.boolean().optional() }),
    scope: "write",
    destructive: true,
    async run({ collection: ref, id, enabled, delete: remove }, ctx) {
      const c = await findCollection(viewer(ctx), ref, "manage");
      if (enabled === undefined && !remove) throw new HttpError(422, "Give enabled or delete");
      const { automation } = await setAutomation(viewer(ctx), c.id, id, { enabled, remove });
      ctx.audit("collection.automation", { target: c.name, details: { [remove ? "removed" : enabled ? "on" : "off"]: triggerText(automation.trigger, c.fields) } });
      return remove ? { deleted: true } : await describeRule(ctx.orgId, c.fields, automation);
    },
  }),
};

export const collectionsModule: McpModule = {
  name: "collections",
  instructions:
    "Collections: the organization's own lists (deals, equipment, inventory, tasks…) with fields it defined; call collections_list first, then search or change records by collection name. Rules (automations) e-mail people or post in chat when records are added or change.",
  tools: { ...collectionsTools, ...automationTools },
};
