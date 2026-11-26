/**
 * "Open in Claude Code / Codex / Cursor": links that open a coding agent with a prompt typed in (nothing runs until
 * the user presses Enter). Each agent tries its apps first, then a web page that takes the prompt. Keep prompts short
 * and point to Markdown (docs' `.md` copies, llms.txt) for the details: Claude Code takes up to 5,000 characters.
 * Pure module. Opening them: `lib/open-deep-link.ts`, buttons: `components/app/agent-buttons.tsx`.
 */

export type AgentId = "claude" | "codex" | "cursor";

export interface Agent {
  id: AgentId;
  label: string;
  /**
   * App links to try in order. A custom scheme opens only an app that registered it (never on a phone), so each one
   * falls through to `web`. None of them sends the prompt by itself.
   */
  schemes: (prompt: string) => string[];
  /** An https page that takes the prompt when no app answered: the web chat, or Cursor's own hand-off page. */
  web: (prompt: string) => string;
  /** The web fallback's name, for "Open in … instead". */
  webLabel: string;
  /** Where to get the app. */
  download: string;
}

const q = encodeURIComponent;

/** The tightest limit: Claude Code takes up to 5,000 characters in `q`. */
export const MAX_HREF = 6000;

export const AGENTS: Agent[] = [
  {
    id: "claude",
    label: "Claude Code",
    // The CLI registers claude-cli: on its first run, Claude Desktop registers claude: and hands code/new to Claude Code.
    schemes: (p) => [`claude-cli://open?q=${q(p)}`, `claude://code/new?q=${q(p)}`],
    web: (p) => `https://claude.ai/new?q=${q(p)}`,
    webLabel: "Claude.ai",
    download: "https://claude.com/claude-code",
  },
  {
    id: "codex",
    label: "Codex",
    schemes: (p) => [`codex://threads/new?prompt=${q(p)}`],
    web: (p) => `https://chatgpt.com/?q=${q(p)}`,
    webLabel: "ChatGPT",
    download: "https://chatgpt.com/codex",
  },
  {
    id: "cursor",
    label: "Cursor",
    schemes: () => [],
    web: (p) => `https://cursor.com/link/prompt?text=${q(p)}`,
    webLabel: "Cursor",
    download: "https://cursor.com/download",
  },
];

/** Whether the prompt fits every link (otherwise copy it instead). */
export const fitsLinks = (prompt: string) => AGENTS.every((a) => [...a.schemes(prompt), a.web(prompt)].every((href) => href.length <= MAX_HREF));
