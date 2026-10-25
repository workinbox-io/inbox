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
