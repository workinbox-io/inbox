import type { APIRoute } from "astro";
import { siteConfig } from "@/config/site";

export const prerender = true;

const error = { type: "object", properties: { error: { type: "string" } }, required: ["error"] };
const errors = Object.fromEntries(
  [
    ["401", "Missing or invalid API key"],
    ["402", "Plan limit reached or subscription inactive"],
    ["404", "Not found"],
    ["422", "Invalid input"],
    ["429", "Rate limited (300 requests a minute per key)"],
  ].map(([code, description]) => [code, { description, content: { "application/json": { schema: error } } }]),
);
const project = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};
const projectInput = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string", maxLength: 80 }, description: { type: "string", maxLength: 500 } },
};
const json = (schema: object) => ({ content: { "application/json": { schema } } });
const idParam = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];

/** OpenAPI 3.1 description of /api/v1. Add your endpoints next to `projects`. */
const spec = {
  openapi: "3.1.0",
  info: { title: `${siteConfig.name} API`, version: "1" },
  servers: [{ url: `${siteConfig.url}/api/v1` }],
  security: [{ bearer: [] }],
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "API key from Settings → API keys" } } },
  paths: {
    "/mail/mailboxes": {
      get: { summary: "List mailboxes explicitly granted to this API key", responses: { 200: { description: "Accessible mailboxes" }, ...errors } },
    },
    "/mail/threads": {
      get: { summary: "Search mail threads", parameters: [
        { name: "q", in: "query", schema: { type: "string" }, description: "Free text; from:, to:, subject:, has:attachment, is:unread, is:starred" },
        { name: "mailbox", in: "query", schema: { type: "string" }, description: "Mailbox address or all" },
        { name: "folder", in: "query", schema: { type: "string" } },
        { name: "before", in: "query", schema: { type: "integer" }, description: "Pagination timestamp in milliseconds" },
      ], responses: { 200: { description: "Threads and pagination flag" }, ...errors } },
    },
    "/mail/threads/{id}": {
      parameters: idParam,
      get: { summary: "Read a thread without changing its read status", responses: { 200: { description: "Thread and messages" }, ...errors } },
    },
    "/mail/send": {
      post: { summary: "Queue mail with a 10-second undo window", parameters: [
        { name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 200 } },
      ], requestBody: { required: true, ...json({ type: "object", required: ["mailbox", "to", "subject", "text"], properties: {
        mailbox: { type: "string", format: "email" }, to: { type: "string", format: "email" },
        cc: { type: "array", maxItems: 20, items: { type: "string", format: "email" } },
        subject: { type: "string", maxLength: 300 }, text: { type: "string", maxLength: 50000 },
        forwardOf: { type: "string", format: "uuid" }, sendAt: { type: "integer", description: "UTC Unix timestamp in milliseconds, within one year" },
        files: { type: "array", maxItems: 5, items: { type: "object", required: ["url", "mediaType", "filename"], properties: { url: { type: "string" }, mediaType: { type: "string" }, filename: { type: "string" } } } },
      } }) }, responses: { 202: { description: "Durable send job: id, outboxId, sendAt, status" }, ...errors } },
    },
    "/mail/outbox/{id}": {
      parameters: idParam,
      get: { summary: "Get a send job", responses: { 200: { description: "Send job" }, ...errors } },
      delete: { summary: "Cancel before sending starts", responses: { 200: { description: "Cancelled job" }, 409: { description: "Sending has already started" }, ...errors } },
    },
    "/notes": {
      get: { summary: "List or search team notes (API keys see notes shared with the whole organization)", parameters: [
        { name: "q", in: "query", schema: { type: "string", maxLength: 200 }, description: "Searches titles and text" },
        { name: "view", in: "query", schema: { type: "string", enum: ["all", "pinned", "archived"] } },
        { name: "folderId", in: "query", schema: { type: "string", format: "uuid" } },
        { name: "before", in: "query", schema: { type: "integer" }, description: "Pagination: updatedAt of the last note, in milliseconds" },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
      ], responses: { 200: { description: "Notes (id, title, preview, sharing, role, updatedAt) and hasMore" }, ...errors } },
      post: { summary: "Create a team note from markdown", requestBody: json({ type: "object", properties: {
        title: { type: "string", maxLength: 200 }, markdown: { type: "string", maxLength: 500000 }, folderId: { type: "string", format: "uuid" },
        teamRole: { type: "string", enum: ["view", "edit"], description: "What members may do with it" },
      } }), responses: { 201: { description: "The note with its content as markdown" }, ...errors } },
    },
    "/notes/{id}": {
      parameters: idParam,
      get: { summary: "Read a note (content as markdown)", responses: { 200: { description: "Note" }, ...errors } },
      patch: { summary: "Change a note; people editing it see the change at once", requestBody: json({ type: "object", properties: {
        markdown: { type: "string", maxLength: 500000 }, mode: { type: "string", enum: ["replace", "append"], default: "replace" },
        title: { type: "string", maxLength: 200 }, pinned: { type: "boolean" }, archived: { type: "boolean" },
        folderId: { type: ["string", "null"], format: "uuid" },
      } }), responses: { 200: { description: "Updated note" }, 409: { description: "Archived: restore it first" }, ...errors } },
      delete: { summary: "Delete an archived note for good", responses: { 200: { description: "Deleted" }, 409: { description: "Archive the note first" }, ...errors } },
    },
    "/projects": {
      get: { summary: "List projects", responses: { 200: { description: "Projects", ...json({ type: "object", properties: { projects: { type: "array", items: project } } }) }, ...errors } },
      post: { summary: "Create a project", requestBody: json(projectInput), responses: { 201: { description: "Created", ...json(project) }, ...errors } },
    },
    "/projects/{id}": {
      parameters: idParam,
      get: { summary: "Get a project", responses: { 200: { description: "Project", ...json(project) }, ...errors } },
      put: { summary: "Update a project", requestBody: json(projectInput), responses: { 200: { description: "Updated", ...json(project) }, ...errors } },
      delete: { summary: "Delete a project", responses: { 200: { description: "Deleted" }, ...errors } },
    },
  },
};

export const GET: APIRoute = () => Response.json(spec);
