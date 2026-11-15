import { describe, expect, it } from "vitest";
import { decodeMentions, encodeMentions, mentionedIds, plainChat, tokenize } from "@/lib/chat/format";
import { dmKey, slugifyChannel, startsGroup, toggleReaction, unreadMarker } from "@/lib/chat/rules";
import { signChatTicket, verifyChatTicket } from "@/lib/chat/ticket";

const people = [
  { id: "u1", name: "Anna" },
  { id: "u2", name: "Anna Nowak" },
];

describe("chat format", () => {
  it("tokenizes markdown, mentions and links", () => {
    expect(tokenize("hi **you** and _me_ `x` <@u1> https://a.io/b.")).toEqual([
      { type: "text", text: "hi " },
      { type: "bold", text: "you" },
      { type: "text", text: " and " },
      { type: "italic", text: "me" },
      { type: "text", text: " " },
      { type: "code", text: "x" },
      { type: "text", text: " " },
      { type: "mention", userId: "u1" },
      { type: "text", text: " " },
      { type: "link", text: "https://a.io/b" },
      { type: "text", text: "." },
    ]);
  });
  it("leaves snake_case alone", () => {
    expect(tokenize("a snake_case_name")).toEqual([{ type: "text", text: "a snake_case_name" }]);
  });
  it("encodes the longest name first and decodes back", () => {
    const enc = encodeMentions("@Anna Nowak and @Anna, mail@Anna", people);
    expect(enc).toBe("<@u2> and <@u1>, mail@Anna");
    expect(mentionedIds(enc)).toEqual(["u2", "u1"]);
    const name = (id: string) => people.find((p) => p.id === id)?.name;
    expect(decodeMentions(enc, name)).toBe("@Anna Nowak and @Anna, mail@Anna");
    expect(plainChat("hey <@zz>", name)).toBe("hey @someone");
  });
});

describe("chat rules", () => {
  it("slugifies names and keys DMs", () => {
    expect(slugifyChannel("  Żółw Team!! ")).toBe("zolw-team");
    expect(dmKey(["b", "a", "b"])).toBe("a,b");
  });
  it("groups by author within 5 minutes", () => {
    const t = new Date(2026, 0, 1, 10).getTime();
    expect(startsGroup(undefined, { authorId: "a", createdAt: t })).toBe(true);
    expect(startsGroup({ authorId: "a", createdAt: t }, { authorId: "a", createdAt: t + 60_000 })).toBe(false);
    expect(startsGroup({ authorId: "a", createdAt: t }, { authorId: "a", createdAt: t + 6 * 60_000 })).toBe(true);
    expect(startsGroup({ authorId: "a", createdAt: t, replyCount: 1 }, { authorId: "a", createdAt: t + 1 })).toBe(true);
    expect(startsGroup({ authorId: "b", createdAt: t }, { authorId: "a", createdAt: t + 1 })).toBe(true);
  });
  it("marks the first unread message by someone else", () => {
    const list = [
      { id: "1", authorId: "x", createdAt: 1 },
      { id: "2", authorId: "me", createdAt: 5 },
      { id: "3", authorId: "x", createdAt: 6 },
    ];
    expect(unreadMarker(list, 2, "me")).toBe("3");
    expect(unreadMarker(list, 10, "me")).toBeNull();
  });
  it("toggles reactions", () => {
    let r = toggleReaction([], "👍", "a");
    r = toggleReaction(r, "👍", "b");
    expect(r).toEqual([{ emoji: "👍", userIds: ["a", "b"] }]);
    r = toggleReaction(toggleReaction(r, "👍", "a"), "👍", "b");
    expect(r).toEqual([]);
  });
});

describe("chat ticket", () => {
  it("signs, verifies and expires", async () => {
    const token = await signChatTicket({ orgId: "o", userId: "u", exp: 1000 }, "s");
    expect(await verifyChatTicket(token, "s", 500)).toEqual({ orgId: "o", userId: "u", exp: 1000 });
    expect(await verifyChatTicket(token, "s", 2000)).toBeNull();
    expect(await verifyChatTicket(token, "other", 500)).toBeNull();
  });
});
