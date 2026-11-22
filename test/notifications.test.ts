import { describe, expect, it } from "vitest";
import { actorsText, dayBucket, noteMentions, placeGroup, snoozeTimes } from "@/lib/notifications";

describe("notifications", () => {
  it("names the people of a group", () => {
    expect(actorsText([])).toBe("Someone");
    expect(actorsText(["Diana", "Diana"])).toBe("Diana");
    expect(actorsText(["Diana", "Tomasz"])).toBe("Diana and Tomasz");
    expect(actorsText(["Diana", "Tomasz", "Anna"])).toBe("Diana, Tomasz and Anna");
    expect(actorsText(["Diana", "Tomasz", "Anna", "Ola"])).toBe("Diana and 3 others");
  });
  it("puts times under today, yesterday or earlier", () => {
    const now = new Date(2026, 10, 16, 15).getTime();
    expect(dayBucket(new Date(2026, 10, 16, 1).getTime(), now)).toBe("today");
    expect(dayBucket(new Date(2026, 10, 15, 23).getTime(), now)).toBe("yesterday");
    expect(dayBucket(new Date(2026, 10, 14, 12).getTime(), now)).toBe("earlier");
  });
  it("places a group in the inbox, snoozed, done or muted", () => {
    expect(placeGroup(undefined, 100, 500)).toBe("inbox");
    expect(placeGroup({ at: 200, until: null, muted: false }, 100, 500)).toBe("done");
    expect(placeGroup({ at: 200, until: null, muted: false }, 300, 500)).toBe("inbox");
    expect(placeGroup({ at: 200, until: 900, muted: false }, 100, 500)).toBe("snoozed");
    expect(placeGroup({ at: 200, until: 400, muted: false }, 100, 500)).toBe("inbox");
    expect(placeGroup({ at: 200, until: null, muted: true }, 900, 500)).toBe("muted");
  });
  it("offers snooze times", () => {
    const thu = new Date(2026, 10, 19, 10).getTime();
    const [later, tomorrow, week] = snoozeTimes(thu);
    expect(later).toEqual({ id: "later", at: new Date(2026, 10, 19, 17).getTime() });
    expect(tomorrow.at).toBe(new Date(2026, 10, 20, 9).getTime());
    expect(week.at).toBe(new Date(2026, 10, 23, 9).getTime());
    expect(snoozeTimes(new Date(2026, 10, 19, 15).getTime())[0]).toEqual({ id: "in3h", at: new Date(2026, 10, 19, 18).getTime() });
    expect(snoozeTimes(new Date(2026, 10, 23, 8).getTime())[2].at).toBe(new Date(2026, 10, 30, 9).getTime());
  });
  it("finds people mentioned in a note", () => {
    const value = [
      { type: "p", children: [{ text: "Hi " }, { type: "mention", key: "u1", value: "Diana", children: [{ text: "" }] }] },
      { type: "ul", children: [{ type: "li", children: [{ type: "mention", key: "u2", children: [{ text: "" }] }] }] },
    ];
    expect([...noteMentions(value)]).toEqual(["u1", "u2"]);
  });
});
