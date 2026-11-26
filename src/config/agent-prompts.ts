import { siteConfig } from "./site";

/**
 * Setup prompts for coding agents, by name. A doc picks one with `agentPrompt: <name>` in its frontmatter and gets
 * "Open in Claude Code / Codex / Cursor" under its title (`DocsLayout`, `components/app/agent-buttons.tsx`). Keep
 * them short and point to Markdown: the whole prompt travels in a link (lib/agent-links.ts).
 */
export const DOCS_AGENT_PROMPTS: Record<string, (origin: string) => string> = {
  quickstart: (origin) =>
    [
      `Help me set up ${siteConfig.name} for this project.`,
      `Read ${origin}/llms.txt and ${origin}/docs/quickstart.md first.`,
      `If the ${siteConfig.name} MCP server isn't connected yet, tell me to run: claude mcp add --transport http ${siteConfig.name.toLowerCase()} ${origin}/mcp`,
      "Then ask me what I want to do, and keep the changes small.",
    ].join("\n\n"),
};
