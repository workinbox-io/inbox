import { describe, expect, it } from "vitest";
import { AGENTS, MAX_HREF, fitsLinks } from "@/lib/agent-links";
import { DOCS_AGENT_PROMPTS } from "@/config/agent-prompts";

describe("agent links", () => {
  it("encode the prompt so & # and newlines survive, in every app link and web fallback", () => {
    const prompt = "a & b # c\n\nd?e=f";
    for (const agent of AGENTS)
      for (const href of [...agent.schemes(prompt), agent.web(prompt)]) {
        const params = new URL(href).searchParams;
        expect([params.get("q"), params.get("prompt"), params.get("text")]).toContain(prompt);
      }
  });

  it("try the app first and fall back to an https page", () => {
    for (const agent of AGENTS) {
      for (const href of agent.schemes("x")) expect(href).not.toMatch(/^https?:/);
      expect(agent.web("x")).toMatch(/^https:\/\//);
    }
  });

  it("refuse a prompt that's too long instead of cutting it", () => {
    expect(fitsLinks("x".repeat(MAX_HREF))).toBe(false);
  });

  it("fit every docs prompt", () => {
    for (const [name, prompt] of Object.entries(DOCS_AGENT_PROMPTS)) expect(fitsLinks(prompt("https://example.com")), name).toBe(true);
  });
});
