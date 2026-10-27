import { describe, expect, it } from "vitest";
import { canUseTool, toolError, toolResult } from "@/mcp/define";

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

  it("returns data as JSON text and structured content, errors as readable results", () => {
    expect(toolResult({ a: 1 })).toEqual({ content: [{ type: "text", text: '{"a":1}' }], structuredContent: { a: 1 } });
    expect(toolError("Nope")).toEqual({ content: [{ type: "text", text: "Nope" }], isError: true });
  });
});
