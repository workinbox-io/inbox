/**
 * The public demo: one fresh org per visitor (`/demo`), built from `content.ts` (or `content-pl.ts`) through the apps' own server functions,
 * deleted after a day (daily task `demo`). The same build makes the org the marketing screenshots are taken in.
 * Demo orgs are marked by their slug (`demo-…`); their domain ends in `.example`, which can never receive real mail.
 */
import { env } from "cloudflare:workers";
import {
  and, chatMessages, count, db, eq, gte, inArray, like, lt, mailboxAccess, mailboxes, mailDomains, mailThreads, member, organization, subscriptions, user,
} from "@/db";
import { personalCalendar } from "@/lib/server/calendar/access";
import { createEvent, rsvp } from "@/lib/server/calendar/events";
import { meetingNote } from "@/lib/server/calendar/meeting-notes";
import { createChannel, openDm, patchChannel } from "@/lib/server/chat/channels";
import { patchMessage, sendMessage } from "@/lib/server/chat/messages";
import { addRelation } from "@/lib/server/collection-relations";
import { addComment, addLink, createCollection, createRecord, type Collection } from "@/lib/server/collections";
import { importContacts } from "@/lib/server/contacts";
import { createFolder as createDriveFolder, shareItem } from "@/lib/server/drive/items";
import { putFile } from "@/lib/server/drive/uploads";
import { setSignatureBrand, updateOwnMailbox } from "@/lib/server/mail/admin";
import { viewerMailboxes, type Mailbox } from "@/lib/server/mail/access";
import { saveDraft } from "@/lib/server/mail/drafts";
import { assignLabel, saveFilter, saveLabel, saveTemplate } from "@/lib/server/mail/filters";
import { handleOrgMail } from "@/lib/server/mail/store";
import { createFolder as createNoteFolder, createNote, shareNote } from "@/lib/server/notes/notes";
import { deleteOrganization } from "@/lib/server/org";
import { refToken } from "@/lib/mentions";
import * as EN from "./content";
import * as PL from "./content-pl";
import { DEMO_SLUG, isDemoSlug } from "./guard";

/** Demo orgs live this long, then the daily task deletes them. */
export const DEMO_TTL_MS = 24 * 3_600_000;

type Role = "owner" | "member";
type PersonKey = EN.PersonKey;
/** One story per language, the same shape (a missing or different export fails the typecheck here). */
type Story = typeof EN;
export const DEMO_LOCALES = ["en", "pl"] as const;
export type DemoLocale = (typeof DEMO_LOCALES)[number];
const STORIES: Record<DemoLocale, Story> = { en: EN, pl: PL };
type Viewer = { orgId: string; userId: string; role: Role };

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/**
 * Builds a demo org and returns it with the visitor (Anna). `domain` is for the screenshots (dev only): a fixed
 * domain replaces the demo org that had it.
 */
export async function createDemoOrg(opts: { domain?: string; locale?: DemoLocale } = {}) {
  const C = STORIES[opts.locale ?? "en"];
  const domain = (opts.domain ?? `acme-${hex(3)}.example`).toLowerCase();
  if (opts.domain) {
    const [old] = await db.select({ orgId: mailDomains.orgId }).from(mailDomains).where(eq(mailDomains.domain, domain));
    if (old) await deleteDemoOrg(old.orgId);
  }
  const orgId = crypto.randomUUID();
  const domainId = crypto.randomUUID();
  const supportId = crypto.randomUUID();
  const ids = Object.fromEntries(Object.keys(C.PEOPLE).map((k) => [k, crypto.randomUUID()])) as Record<PersonKey, string>;
  const people = Object.entries(C.PEOPLE) as [PersonKey, (typeof C.PEOPLE)[PersonKey]][];
  const address = (local: string) => `${local}@${domain}`;
  // Written directly: no passwords (the visitor gets a session, nobody else signs in), no Paddle (a plan row without a
  // Paddle subscription is never billed or synced), no seat jobs.
  await db.batch([
    db.insert(organization).values({ id: orgId, name: C.ORG_NAME, slug: `${DEMO_SLUG}${orgId.slice(0, 8)}` }),
    db.insert(subscriptions).values({ orgId, plan: "business", status: "active" }),
    db.insert(mailDomains).values({ id: domainId, orgId, domain, status: "active" }),
    ...people.flatMap(([key, p]) => [
      db.insert(user).values({ id: ids[key], name: p.name, email: address(p.local), emailVerified: true, locale: opts.locale === "pl" ? "pl" : null }),
      db.insert(member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: ids[key], role: p.role }),
      db.insert(mailboxes).values({
        orgId, domainId, address: address(p.local), kind: "personal", userId: ids[key], displayName: p.name,
        signatureCard: { name: p.name, role: p.title, phone: "" },
      }),
    ]),
    db.insert(mailboxes).values({ id: supportId, orgId, domainId, address: address(C.SUPPORT), kind: "shared", displayName: C.SUPPORT_NAME }),
    ...(["anna", "diana", "tomasz"] as const).map((k) => db.insert(mailboxAccess).values({ mailboxId: supportId, userId: ids[k] })),
  ]);
  const as = (key: PersonKey): Viewer => ({ orgId, userId: ids[key], role: C.PEOPLE[key].role });
  const ctx = { C, orgId, domain, ids, as, address };

  await seedMail(ctx);
  const drive = await seedDrive(ctx);
  await importContacts(orgId, C.CONTACTS.map(([name, company, title, email, phone]) => ({
    name, company, title, note: "", emails: [{ value: email, label: "work" }], phones: phone ? [{ value: phone, label: "work" }] : [], groups: [C.CONTACT_GROUP],
  })), ids.anna);
  const events = await seedCalendar(ctx);
  const tasks = await seedCollections(ctx);
  const notes = await seedNotes(ctx, { file: drive.contract, event: events.kickoff, record: tasks.copy });
  await seedChat(ctx, { file: drive.brief, note: notes.client });
  return { orgId, domain, userId: ids.anna, ownerId: ids.marek };
}

type Ctx = { C: Story; orgId: string; domain: string; ids: Record<PersonKey, string>; as: (k: PersonKey) => Viewer; address: (local: string) => string };

/** One message as an .eml (plain text, an optional PDF), placed by the import path: dated, flagged, no rules or pings. */
async function deliver(ctx: Ctx, mail: { fromName: string; from: string; to: string; subject: string; text: string; date: Date; messageId: string; inReplyTo?: string; attach?: string }, flags: { unread?: boolean; starred?: boolean; spam?: boolean }) {
  const C = ctx.C;
  const head = [
    `From: ${mail.fromName} <${mail.from}>`, `To: ${mail.to}`, `Subject: ${mail.subject}`, `Date: ${mail.date.toUTCString()}`,
    `Message-ID: ${mail.messageId}`, ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`] : []), "MIME-Version: 1.0",
  ];
  const utf8 = "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit";
  let body: string;
  if (mail.attach) {
    const file = C.fileBody(mail.attach);
    const b64 = btoa(String.fromCharCode(...file.bytes)).replace(/.{76}/g, "$&\r\n");
    body = [
      'Content-Type: multipart/mixed; boundary="demo"', "", "--demo", utf8, "", mail.text, "--demo",
      `Content-Type: ${file.type}; name="${mail.attach}"`, `Content-Disposition: attachment; filename="${mail.attach}"`, "Content-Transfer-Encoding: base64", "", b64, "--demo--", "",
    ].join("\r\n");
  } else body = `${utf8}\r\n\r\n${mail.text}\r\n`;
  const raw = new TextEncoder().encode(`${head.join("\r\n")}\r\n${body}`);
  const headers = new Headers({ from: mail.from, to: mail.to, subject: mail.subject, date: mail.date.toUTCString(), "message-id": mail.messageId });
  let rejected: string | null = null;
  await handleOrgMail(
    { to: mail.to.replace(/^.*<|>$/g, ""), from: mail.from, raw: new Blob([raw]).stream(), rawSize: raw.byteLength, headers, setReject: (r: string) => void (rejected = r) },
    { date: mail.date, archived: false, flags: { unread: !!flags.unread, starred: !!flags.starred, spam: !!flags.spam, archived: false, trashed: false } },
  );
  if (rejected) throw new Error(`demo mail "${mail.subject}": ${rejected}`);
}

async function seedMail(ctx: Ctx) {
  const C = ctx.C;
  const local = (s: string) => (s.includes("@") ? s : ctx.address(s));
  for (const mail of C.MAIL) {
    const to = ctx.address(mail.to);
    const messageId = `<${crypto.randomUUID()}@demo>`;
    await deliver(ctx, { ...mail, from: local(mail.from), to, date: minutesAgo(mail.ago), messageId }, mail);
    if (mail.reply) {
      const name = mail.to === C.SUPPORT ? C.SUPPORT_NAME : C.PEOPLE.anna.name;
      await deliver(ctx, {
        fromName: name, from: to, to: `${mail.fromName} <${local(mail.from)}>`, subject: mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`,
        text: mail.reply.text, date: minutesAgo(mail.reply.ago), messageId: `<${crypto.randomUUID()}@demo>`, inReplyTo: messageId,
      }, {});
    }
  }
  // The newest message of a thread with a reply is ours, but the story wants the thread at its last incoming time.
  const anna = await viewerMailboxes(ctx.as("anna"));
  const box = (address: string) => anna.find((b) => b.address === address)!;
  const annaBox = box(ctx.address("anna"));
  const supportBox = box(ctx.address(C.SUPPORT));
  const thread = async (mailbox: Mailbox, subject: string) => {
    const [row] = await db.select({ id: mailThreads.id }).from(mailThreads).where(and(eq(mailThreads.mailboxId, mailbox.id), like(mailThreads.subject, `%${subject.replace(/^Re: /, "")}`)));
    if (!row) throw new Error(`demo thread "${subject}" missing`);
    return row.id;
  };

  for (const name of C.LABELS) {
    const label = (await saveLabel(anna, { mailboxId: annaBox.id, name }))!;
    const threadIds = await Promise.all(C.MAIL.filter((m) => m.label === name).map((m) => thread(annaBox, m.subject)));
    if (threadIds.length) await assignLabel(anna, { labelId: label.id, threadIds, remove: false });
    if (name === C.LABELS[0])
      await saveFilter(anna, { mailboxId: annaBox.id, name: C.FILTER_NAME, position: 0, enabled: true, conditions: [{ field: "from", value: "brightloop.io" }], actions: { labelId: label.id } });
  }
  await saveTemplate(anna, { mailboxId: supportBox.id, ...C.TEMPLATES.support });
  await saveTemplate(anna, { mailboxId: annaBox.id, ...C.TEMPLATES.anna });
  await setSignatureBrand(ctx.orgId, { company: C.ORG_NAME, website: "https://workinbox.io", color: "#ff6b5b", footer: C.SIGNATURE_FOOTER });
  await updateOwnMailbox([annaBox.id], annaBox.id, { signatureCard: { name: C.PEOPLE.anna.name, role: C.PEOPLE.anna.title, phone: "+48 600 100 200" } });

  // Drafts: one of Anna's own, one an AI app left, and Diana answering in support@ ("Draft by Diana").
  const owner = (k: PersonKey) => viewerMailboxes(ctx.as(k)).then((boxes) => ({ orgId: ctx.orgId, userId: ctx.ids[k], boxes }));
  const base = { cc: [], mode: "new" as const };
  const { own, ai, support } = C.DRAFTS;
  await saveDraft(await owner("anna"), `d-${crypto.randomUUID()}`, { ...base, from: annaBox.address, to: [own.to], subject: own.subject, text: own.text });
  await saveDraft(await owner("anna"), `d-${crypto.randomUUID()}`, { ...base, from: annaBox.address, to: [ai.to], subject: ai.subject, text: ai.text }, { source: "ai", via: "Claude" });
  const oliver = await thread(supportBox, support.thread);
  const diana = await owner("diana");
  await saveDraft(diana, oliver, { ...base, mode: "reply", from: supportBox.address, to: [support.to], subject: `Re: ${support.thread}`, text: support.text });
}

async function seedDrive(ctx: Ctx) {
  const C = ctx.C;
  const anna = ctx.as("anna");
  const folders = new Map<string, string>();
  for (const name of C.FOLDERS) {
    // The shared folder is Diana's, so Anna sees "Shared with me" too.
    const v = name === C.SHARED_FOLDER ? ctx.as("diana") : anna;
    const folder = await createDriveFolder(v, { name });
    if (name === C.SHARED_FOLDER) await shareItem(v, folder.id, { sharing: "team", teamRole: "edit", people: [] });
    folders.set(name, folder.id);
  }
  const ids = new Map<string, string>();
  for (const [name, folder] of C.FILES) {
    const { bytes, type } = C.fileBody(name);
    const v = folder === C.SHARED_FOLDER ? ctx.as("diana") : anna;
    const item = await putFile(v, { name, parentId: folder ? folders.get(folder)! : null, size: bytes.byteLength, mediaType: type }, new Blob([bytes]).stream());
    ids.set(name, item.id);
  }
  return {
    brief: { id: ids.get(C.BRIEF_FILE)!, title: C.BRIEF_FILE },
    contract: { id: ids.get(C.CONTRACT_FILE)!, title: C.CONTRACT_FILE },
  };
}

type Ref = { id: string; title: string };

async function seedCalendar(ctx: Ctx) {
  const C = ctx.C;
  const timezone = "Europe/Warsaw";
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  // Warsaw is UTC+1 in winter, +2 in summer; an hour off in summer is fine for a demo week.
  const at = (day: number, hour: number) => monday.getTime() + day * 86_400_000 + (hour - 1) * 3_600_000;
  const team = (by: PersonKey) => (["anna", "diana", "tomasz"] as const).filter((k) => k !== by).map((k) => ({ email: ctx.address(k) }));
  let kickoff: Ref | null = null;
  for (const e of C.EVENTS) {
    const by = e.by ?? "anna";
    const v = ctx.as(by);
    const event = await createEvent(v, {
      calendarId: (await personalCalendar(ctx.orgId, ctx.ids[by])).id, title: e.title, start: at(e.day, e.from), end: at(e.day, e.to), timezone,
      rrule: e.rrule ?? null, location: e.location ?? "", attendees: e.team ? team(by) : [],
    });
    if (e.notes) {
      await meetingNote(v, event.id, null, true);
      kickoff = { id: event.id, title: e.title };
    }
    // Diana and Tomasz said yes to Anna's meetings; Anna still has to answer the ones she's invited to.
    if (e.team && by === "anna") for (const k of ["diana", "tomasz"] as const) await rsvp(ctx.as(k), event.id, "accepted");
  }
  return { kickoff: kickoff! };
}

async function seedCollections(ctx: Ctx) {
  const C = ctx.C;
  const marek = ctx.as("marek");
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const tasks = await createCollection(marek, { name: C.TASKS, fields: C.TASK_FIELDS });
  const records = new Map<string, string>();
  // Oldest first: the board puts new records on top.
  for (const [title, status, who, due, priority, labels] of [...C.TASK_ROWS].reverse()) {
    const r = await createRecord(ctx.orgId, tasks, ctx.ids.tomasz, { title, values: byOrder(C.TASK_FIELDS, [status, ctx.ids[who], day(due), priority, labels]) });
    records.set(title, r.id);
  }
  const id = (title: string) => records.get(title)!;
  for (const [title, status] of C.SUBTASKS)
    await createRecord(ctx.orgId, tasks, ctx.ids.anna, { title, values: byOrder(C.TASK_FIELDS, [status, ctx.ids.anna]), parentId: id(C.COPY_TASK) });
  await addRelation(ctx.as("tomasz"), tasks, id(C.BLOCKED[0]), { to: id(C.BLOCKED[1]), kind: "blockedBy" });
  await addLink(ctx.orgId, tasks, id(C.COPY_TASK), "https://github.com/acme/web/pull/482", ctx.ids.diana);
  for (const [who, text] of C.TASK_COMMENTS) await comment(ctx, tasks, id(C.COPY_TASK), who, mention(ctx, text));

  const deals = await createCollection(marek, { name: C.DEALS, fields: C.DEAL_FIELDS });
  for (const [title, stage, company, value, owner, contact] of C.DEAL_ROWS)
    await createRecord(ctx.orgId, deals, ctx.ids.marek, { title, values: byOrder(C.DEAL_FIELDS, [stage, company, value, ctx.ids[owner], contact, day(14)]) });

  const rentals = await createCollection(marek, { name: C.RENTALS, fields: C.RENTAL_FIELDS, icon: "package", color: "#d97706" });
  for (const [title, status, category, who, customer, back, rate, serial] of [...C.RENTAL_ROWS].reverse())
    await createRecord(ctx.orgId, rentals, ctx.ids.marek, {
      title,
      values: byOrder(C.RENTAL_FIELDS, [status, category, who ? ctx.ids[who] : null, customer, back === null ? null : day(back), rate, serial]),
    });
  return { copy: { id: id(C.COPY_TASK), title: C.COPY_TASK } };
}

/** Values in the fields' order, keyed by field name (the stories' field names differ by language). */
const byOrder = (fields: { name: string }[], values: unknown[]) => Object.fromEntries(values.map((v, i) => [fields[i]!.name, v]));
/** "@anna" in story text → a mention of Anna. */
const mention = (ctx: Ctx, text: string) => text.replaceAll("@anna", `<@${ctx.ids.anna}>`);

const comment = (ctx: Ctx, c: Collection, recordId: string, who: PersonKey, text: string) => addComment(ctx.as(who), c, recordId, text);

async function seedNotes(ctx: Ctx, refs: { file: Ref; event: Ref; record: Ref }) {
  const C = ctx.C;
  const anna = ctx.as("anna");
  const clients = (await createNoteFolder(ctx.orgId, C.NOTES.find((n) => n.folder)!.folder!))!;
  let client: Ref | null = null;
  const L = C.NOTE_LINKS;
  for (const n of [...C.NOTES].reverse()) {
    // The client call links the contract, the kickoff and the task it led to (notes only @mention people, so links).
    const link = (kind: string, r: Ref) => `[${r.title}](/app/open/${kind}/${r.id})`;
    const markdown = n.title === C.CLIENT_NOTE
      ? `${n.markdown}\n\n## ${L.heading}\n- ${L.contract}: ${link("file", refs.file)}\n- ${L.kickoff}: ${link("event", refs.event)}\n- ${L.task}: ${link("record", refs.record)}`
      : n.markdown;
    const by = n.title === C.CLIENT_NOTE ? ctx.as("tomasz") : anna;
    const note = await createNote(by, { title: n.title, markdown, folderId: n.folder ? clients.id : null, sharing: "team", teamRole: "edit" });
    if (n.title === C.CLIENT_NOTE) client = { id: note.id, title: n.title };
  }
  // A private note Diana shares with Anna alone: the bell shows the share.
  const brief = await createNote(ctx.as("diana"), { ...C.DIANA_NOTE, sharing: "private" });
  await shareNote(ctx.as("diana"), brief.id, { sharing: "people", teamRole: "edit", people: [{ userId: ctx.ids.anna, role: "edit" }] });
  return { client: client! };
}

async function seedChat(ctx: Ctx, refs: { file: Ref; note: Ref }) {
  const C = ctx.C;
  const p = { anna: ctx.as("anna"), diana: ctx.as("diana"), tomasz: ctx.as("tomasz"), marek: ctx.as("marek") };
  const T = C.CHAT;
  const channel = await createChannel(p.tomasz, { name: C.CHANNEL, topic: T.topic, memberIds: [ctx.ids.anna, ctx.ids.diana] });
  const general = await createChannel(p.marek, { name: "general", topic: T.generalTopic, memberIds: [ctx.ids.anna, ctx.ids.diana, ctx.ids.tomasz] });
  const stamps: [string, number][] = [];
  const say = async (v: Viewer, channelId: string, text: string, ago: number, parentId?: string) => {
    const m = await sendMessage(v, { channelId, text: mention(ctx, text), parentId });
    stamps.push([m.id, ago]);
    return m;
  };
  await say(p.marek, general.id, T.welcome, 3000);
  await say(p.diana, general.id, T.closed, 1500);
  const m1 = await say(p.anna, channel.id, T.signed.replace("{note}", refToken({ kind: "note", ...refs.note })), 95);
  await say(p.diana, channel.id, T.assets, 80);
  await say(p.anna, channel.id, T.friday, 74);
  const m4 = await say(p.tomasz, channel.id, T.questions, 41);
  await say(p.diana, channel.id, T.german, 35, m4.id);
  await say(p.tomasz, channel.id, T.approver, 30, m4.id);
  const m5 = await say(p.diana, channel.id, T.brief.replace("{file}", refToken({ kind: "file", ...refs.file })), 12);
  await patchMessage(p.tomasz, m1.id, { action: "react", emoji: "🎉" });
  await patchMessage(p.diana, m1.id, { action: "react", emoji: "🎉" });
  await patchMessage(p.marek, m1.id, { action: "react", emoji: "🙌" });
  await patchMessage(p.tomasz, m5.id, { action: "react", emoji: "👀" });
  await patchMessage(p.tomasz, m1.id, { action: "pin", pinned: true });
  const dm = await openDm(p.diana, [ctx.ids.anna]);
  await say(p.diana, dm.id, T.dm, 8);
  // Messages carry their arrival time; put them back at story time. Anna has read the older ones.
  for (const [id, ago] of stamps) await db.update(chatMessages).set({ createdAt: minutesAgo(ago) }).where(eq(chatMessages.id, id));
  await patchChannel(p.anna, general.id, { action: "read" });
}

/** Deletes a demo org with its people and files. Refuses anything that isn't a demo org. */
export async function deleteDemoOrg(orgId: string) {
  const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, orgId));
  if (!org) return;
  if (!isDemoSlug(org.slug)) throw new Error(`Not a demo org: ${orgId}`);
  const people = await db.select({ id: member.userId }).from(member).where(eq(member.organizationId, orgId));
  for (const prefix of ["mail-raw", "mail-html", "attachments", "drive", "drive-snapshots"]) {
    let cursor: string | undefined;
    do {
      const page = await env.FILES.list({ prefix: `${prefix}/${orgId}/`, cursor });
      if (page.objects.length) await env.FILES.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  await deleteOrganization(orgId);
  // Demo people belong to this org only (their address is on its .example domain); sessions and accounts cascade.
  if (people.length) await db.delete(user).where(and(inArray(user.id, people.map((p) => p.id)), like(user.email, "%.example")));
}

/** Hourly: demo orgs older than a day go, 50 per run (1,200 a day, above the 500 a day /demo allows). */
export async function cleanDemoOrgs() {
  const old = await db
    .select({ id: organization.id })
    .from(organization)
    .where(and(like(organization.slug, `${DEMO_SLUG}%`), lt(organization.createdAt, new Date(Date.now() - DEMO_TTL_MS))))
    .limit(50);
  for (const o of old) await deleteDemoOrg(o.id);
  return { deleted: old.length };
}

/** Demo orgs made since `since`, for the daily ceiling on /demo. */
export async function demoOrgsSince(since: Date) {
  const [row] = await db.select({ n: count() }).from(organization).where(and(like(organization.slug, `${DEMO_SLUG}%`), gte(organization.createdAt, since)));
  return row?.n ?? 0;
}
