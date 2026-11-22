import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(["Getting started", "Guides", "Account"]),
    order: z.number(),
    /** Last real content change, shown on the page and as dateModified. Bump it when you edit the page. */
    updated: z.coerce.date(),
    /** A prompt from `config/agent-prompts.ts`: "Open in Claude Code / Codex / Cursor" under the title. */
    agentPrompt: z.string().optional(),
  }),
});

export const collections = { docs };
