import { describe, expect, it } from "vitest";
import { dithered, palette, sprite } from "../src/components/site/pixel/pixel";

describe("pixel helpers", () => {
  it("dithers by level: none at 0, all at 1, half at 0.5", () => {
    const count = (l: number) => Array.from({ length: 16 }, (_, i) => dithered(l, i % 4, Math.floor(i / 4))).filter(Boolean).length;
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(16);
    expect(count(0.5)).toBe(8);
  });
  it("parses sprites with see-through cells and pads short rows", () => {
    const s = sprite(["5.5", "5"]);
    expect([s.w, s.h]).toEqual([3, 2]);
    expect(s.cells).toEqual(["5", null, "5", "5", null, null]);
  });
  it("builds six steps from background to foreground", () => {
    const p = palette("#000000", "#ffffff", "#fefefe");
    expect(p["0"]).toBe("#000000");
    expect(p["5"]).toBe("#ffffff");
    expect(p.p).toBe("#fefefe");
  });
});

import { office, officePhase } from "../src/components/site/pixel/office";
import { Pix } from "../src/components/site/pixel/pixel";
import { SCENES } from "../src/components/site/pixel/scenes";

it("keeps shared-note presence and both cursor labels visible, including with reduced motion", () => {
  for (const t of [0, 1, 4, 8]) {
    const commands: number[][] = [];
    const ctx = { fillStyle: "", fillRect(...args: number[]) { commands.push(args); } };
    SCENES.notes!.draw(new Pix(ctx as unknown as CanvasRenderingContext2D, 120, 66, palette("#ffffff", "#141414", "#ffffff")), t, "");
    expect(commands).toContainEqual([90, 6, 9, 9]);
    expect(commands).toContainEqual([101, 6, 9, 9]);
    expect(commands).toContainEqual([33, 30, 43, 7]);
    expect(commands).toContainEqual([76, 22, 15, 7]);
    expect(commands.some(([, y, w, h]) => y === 42 && w === 19 && h === 7)).toBe(true);
    for (const [x, y, w, h] of commands) {
      expect(x! >= 0 && y! >= 0 && x! + w! <= 120 && y! + h! <= 66).toBe(true);
    }
  }
});

describe("home office loop", () => {
  it("runs the five phases and repeats after twelve seconds", () => {
    expect([0, 3, 5, 8, 10].map(t => officePhase(t).phase)).toEqual(["scan", "file", "send", "receive", "rest"]);
    for (const t of [0, 1.5, 3, 4, 5, 6.5, 8, 9, 10, 11.5]) {
      expect(officePhase(t + 12)).toEqual(officePhase(t));
    }
  });
  it("draws identical commands at the same time and across the loop boundary", () => {
    const draw = (t: number) => {
      const commands: unknown[] = [];
      const ctx = { fillStyle: "", fillRect(...args: number[]) { commands.push([this.fillStyle, ...args]); } };
      office.draw(new Pix(ctx as unknown as CanvasRenderingContext2D, 480, 320, palette("#141414", "#fefefe", "#fffefa")), t, "");
      return commands;
    };
    for (const t of [0, 0.5, 1.5, 2.8, 4, 5.5, 6.5, 8.3, 9.4, 10.2, 11.2, 11.999]) {
      expect(draw(t)).toEqual(draw(t));
      expect(draw(t)).toEqual(draw(t + 12));
    }
    expect(draw(12)).toEqual(draw(0));
    for (const [a, b] of [[0, 0.5], [1, 2], [2.8, 3.5], [3, 4], [5, 6.5], [8, 8.5], [9, 9.4], [10, 10.5], [11, 11.5]]) {
      expect(draw(a!)).not.toEqual(draw(b!));
    }
  });
});

describe("home hero living room", () => {
  const draw = (t: number) => {
    const commands: [string, number, number, number, number][] = [];
    const ctx = { fillStyle: "", fillRect(x: number, y: number, w: number, h: number) { commands.push([this.fillStyle, x, y, w, h]); } };
    const pal = palette("#141414", "#fefefe", "#fffefa");
    SCENES.house!.draw(new Pix(ctx as unknown as CanvasRenderingContext2D, 480, 100, pal), t, "");
    return { commands, white: pal.w };
  };
  it("stays inside its canvas through the whole mail loop", () => {
    for (let t = 0; t < 8; t += 0.25) {
      for (const [, x, y, w, h] of draw(t).commands) expect(x >= 0 && y >= 0 && x + w <= 480 && y + h <= 100).toBe(true);
    }
  });
  it("lights the recipient's laptop logo only while the mail is read", () => {
    // The logo on the right laptop's back: desk at x 226, floor 86 (see desk()).
    const logo = (t: number) => {
      const { commands, white } = draw(t);
      return commands.some(([c, x, y, w, h]) => c === white && x === 238 && y === 70 && w === 2 && h === 2);
    };
    expect([1, 3, 4, 5, 6, 7.5].map(logo)).toEqual([false, false, true, true, false, false]);
  });
});
