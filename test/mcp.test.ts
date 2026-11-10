import { describe, expect, it } from "vitest";
import { canUseTool, needsPlan, toolError, toolResult, toolVisibility } from "@/mcp/define";

describe("mcp tools", () => {
  const scopes = (...s: string[]) => new Set(s);

  it("needs the read scope by default and write for changes", () => {
    expect(canUseTool({}, scopes("read"), "member")).toBe(true);
    expect(canUseTool({}, scopes(), "owner")).toBe(false);
    expect(canUseTool({ scope: "write" }, scopes("read"), "owner")).toBe(false);
    expect(canUseTool({ scope: "write" }, scopes("read", "write"), "member")).toBe(true);
  });

  it("keeps manage tools for owners and admins", () => {
    expect(canUseTool({ manage: true }, scopes("read"), "member")).toBe(false);
    expect(canUseTool({ manage: true }, scopes("read"), "admin")).toBe(true);
  });

  it("lets every plan read and needs a plan for changes", () => {
    expect(needsPlan({})).toBe(false);
    expect(needsPlan({ scope: "read" })).toBe(false);
    expect(needsPlan({ scope: "write" })).toBe(true);
  });

  it("hides app-only tools from the model of connected apps, not from API keys", () => {
    expect(toolVisibility({ appOnly: true }, false)).toEqual(["app"]);
    expect(toolVisibility({ appOnly: true }, true)).toEqual(["model", "app"]);
    expect(toolVisibility({}, false)).toEqual(["model", "app"]);
  });

  it("returns data as JSON text and structured content, errors as readable results", () => {
    expect(toolResult({ a: 1 })).toEqual({ content: [{ type: "text", text: '{"a":1}' }], structuredContent: { a: 1 } });
    // _meta goes to the widget only, never into what the model reads.
    const r = toolResult({ a: 1, _meta: { sendToken: "t" } });
    expect(r).toEqual({ content: [{ type: "text", text: '{"a":1}' }], structuredContent: { a: 1 }, _meta: { sendToken: "t" } });
    expect(toolError("Nope")).toEqual({ content: [{ type: "text", text: "Nope" }], isError: true });
  });
});
