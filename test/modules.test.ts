import { describe, expect, it } from "vitest";
import { moduleOfPath, withoutDisabled } from "@/config/modules";

describe("moduleOfPath", () => {
  it("maps app, API and public API paths to their app", () => {
    expect(moduleOfPath("/app/chat")).toBe("chat");
    expect(moduleOfPath("/app/notes/0b6c0f7e-0000-0000-0000-000000000000")).toBe("notes");
    expect(moduleOfPath("/api/app/drive/items")).toBe("drive");
    expect(moduleOfPath("/api/v1/calendar/events")).toBe("calendar");
    expect(moduleOfPath("/app/calendar?new=1")).toBe("calendar");
  });
  it("leaves mail, settings and look-alikes alone", () => {
    expect(moduleOfPath("/app/mail")).toBeNull();
    expect(moduleOfPath("/api/app/org/modules")).toBeNull();
    expect(moduleOfPath("/app/chatter")).toBeNull();
    expect(moduleOfPath("/notes-sync/x")).toBeNull();
    expect(moduleOfPath("/api/app/notes/people")).toBeNull();
  });
});

it("withoutDisabled drops turned-off apps only", () => {
  const nav = [{ href: "/app/mail" }, { href: "/app/chat" }, { href: "/app/drive?new=folder" }];
  expect(withoutDisabled(nav, ["chat", "drive"])).toEqual([{ href: "/app/mail" }]);
});
