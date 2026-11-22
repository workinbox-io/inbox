import { describe, expect, it } from "vitest";
import { extractKeys, parseGithub, shouldMove, targetStatus } from "@/lib/collections/git";
import type { CollectionField } from "@/lib/collections/fields";

const status: CollectionField = { id: "status", name: "Status", type: "select", options: ["Backlog", "Todo", "In progress", "In review", "Done", "Released", "Cancelled"] };
const map = { started: "In progress", review: "In review", merged: "Done", deployed: "Released" };
const repository = { full_name: "acme/app", default_branch: "main" };

describe("extractKeys", () => {
  it("finds IDs in branches, titles and messages, once each", () => {
    expect(extractKeys(["feature/tas-12-login", "Fix TAS-12 and TAS-7", "TAS-123x", "XTAS-9", "TAS-1234"], "TAS")).toEqual([12, 7, 1234]);
  });
  it("ignores other prefixes", () => {
    expect(extractKeys(["DEV-3 TA-4"], "TAS")).toEqual([]);
  });
});

describe("parseGithub", () => {
  const pr = (over: Record<string, unknown>, action = "opened") => ({
    action,
    repository,
    pull_request: { html_url: "https://github.com/acme/app/pull/41", title: "Login TAS-12", body: "Closes TAS-13", head: { ref: "tas-12-login" }, state: "open", draft: false, merged_at: null, ...over },
  });
  it("reads pull requests and their state", () => {
    const [ev] = parseGithub("pull_request", pr({}), 1000);
    expect(ev).toMatchObject({ kind: "pr", repo: "acme/app", state: "open", at: 1000 });
    expect(ev!.texts).toContain("tas-12-login");
    expect(parseGithub("pull_request", pr({ draft: true }))[0]!.state).toBe("draft");
    expect(parseGithub("pull_request", pr({}, "ready_for_review"))[0]!.state).toBe("review");
    const merged = parseGithub("pull_request", pr({ state: "closed", merged_at: "2026-11-20T10:00:00Z" }, "closed"))[0]!;
    expect(merged).toMatchObject({ state: "merged", mergedAt: Date.parse("2026-11-20T10:00:00Z") });
    expect(parseGithub("pull_request", pr({ state: "closed" }, "closed"))[0]!.state).toBe("closed");
    expect(parseGithub("pull_request", pr({}, "labeled"))).toEqual([]);
  });
  it("reads pushes: a feature branch and its commits, not the default branch or tags", () => {
    const commits = [{ id: "abc1234", message: "TAS-12: form\n\nmore", url: "https://github.com/acme/app/commit/abc1234", timestamp: "2026-11-20T10:00:00Z" }];
    const evs = parseGithub("push", { ref: "refs/heads/tas-12-login", repository, commits });
    expect(evs.map((e) => e.kind)).toEqual(["branch", "commit"]);
    expect(evs[1]!.title).toBe("TAS-12: form");
    expect(parseGithub("push", { ref: "refs/heads/main", repository, commits }).map((e) => e.kind)).toEqual(["commit"]);
    expect(parseGithub("push", { ref: "refs/tags/v1", repository, commits })).toEqual([]);
    expect(parseGithub("push", { ref: "refs/heads/x", deleted: true, repository, commits: [] })).toEqual([]);
  });
  it("reads successful deploys only", () => {
    const ds = (state: string) => ({ repository, deployment: { environment: "production" }, deployment_status: { state, environment: "production", created_at: "2026-11-21T10:00:00Z" } });
    expect(parseGithub("deployment_status", ds("success"))[0]).toMatchObject({ kind: "deploy", environment: "production", at: Date.parse("2026-11-21T10:00:00Z") });
    expect(parseGithub("deployment_status", ds("failure"))).toEqual([]);
    expect(parseGithub("issues", { repository })).toEqual([]);
  });
});

describe("targetStatus", () => {
  it("maps steps to statuses", () => {
    expect(targetStatus(map, { kind: "branch" })).toBe("In progress");
    expect(targetStatus(map, { kind: "pr", state: "draft" })).toBe("In progress");
    expect(targetStatus(map, { kind: "pr", state: "review" })).toBe("In review");
    expect(targetStatus(map, { kind: "pr", state: "merged" })).toBe("Done");
    expect(targetStatus(map, { kind: "pr", state: "closed" })).toBeUndefined();
    expect(targetStatus(map, { kind: "commit" })).toBeUndefined();
    expect(targetStatus(map, { kind: "deploy", environment: "production" })).toBe("Released");
    expect(targetStatus(map, { kind: "deploy", environment: "staging" })).toBeUndefined();
    expect(targetStatus({ ...map, environment: "staging" }, { kind: "deploy", environment: "staging" })).toBe("Released");
    expect(targetStatus(null, { kind: "branch" })).toBeUndefined();
  });
});

describe("shouldMove", () => {
  it("moves forward only", () => {
    expect(shouldMove(status, "Todo", "In progress")).toBe(true);
    expect(shouldMove(status, undefined, "In progress")).toBe(true);
    expect(shouldMove(status, "Done", "In progress")).toBe(false);
    expect(shouldMove(status, "Done", "Done")).toBe(false);
    expect(shouldMove(status, "Done", "Released")).toBe(true);
  });
  it("never leaves a cancelled record or picks a missing option", () => {
    expect(shouldMove(status, "Cancelled", "Released")).toBe(false);
    expect(shouldMove(status, "Todo", "Shipped")).toBe(false);
    expect(shouldMove(status, "Todo", undefined)).toBe(false);
  });
});
