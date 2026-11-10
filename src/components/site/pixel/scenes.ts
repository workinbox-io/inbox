/**
 * Work Inbox's pixel scenes (our own drawings): a company's office at night for the ink bands (inside for the hero, the
 * building from the street for the closing band) and small office scenes for the cards on the page. See pixel.ts for
 * the palette keys. Random values are drawn in a fixed order every frame, so nothing jumps between frames.
 */
import { type ColorKey, type Pix, type Scene, type Sprite, dithered, random, sprite } from "./pixel";

const S = {
  envelope: sprite(["wwwwwww", "w3www3w", "ww3w3ww", "www3www", "wwwwwww"]),
  plane: sprite(["w.......", "4ww.....", ".44www..", "..wwwwww", ".4ww....", "4w......"]),
  // An envelope on the page: outlined, since the page is white.
  letter: sprite(["5555555", "5500055", "5050505", "5005005", "5555555"]),
  postbox: sprite(["wwwwww", "w3333w", "wwwwww", "wwwwww", "wwwwww", ".3..3.", ".3..3."]),
  at: sprite([".55555.", "5.....5", "5..55.5", "5.5.5.5", "5..5555", "5......", ".55555."]),
  plant: sprite(["..3...3..", ".333.333.", "3.33333.3", ".3333333.", "..33333..", "...333...", "....3....", "..22222..", "..22222..", "...222..."]),
  standing: sprite(["..55..", ".5555.", ".5555.", "..55..", ".4444.", "444444", "444444", "444444", ".4..4.", ".4..4."]),
  walk: [
    sprite([".55.", ".55.", ".44.", "4444", ".44.", ".44.", ".4.4", ".4.4"]),
    sprite([".55.", ".55.", ".44.", "4444", ".44.", ".44.", "..4.", "..4."]),
  ],
};

const wrap = (v: number, n: number) => ((v % n) + n) % n;
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

/** Dither everything from row `from` down into the page colour. */
function fadeToPage(p: Pix, from: number) {
  for (let y = from; y < p.h; y++) {
    const l = (y - from) / (p.h - from);
    for (let x = 0; x < p.w; x++) if (dithered(l, x, y)) p.dot(x, y, "p");
  }
}

/** A night sky in a box: still stars and, optionally, a moon with a halo. */
function nightSky(p: Pix, x0: number, y0: number, w: number, h: number, moon: [number, number] | null, seed: number) {
  const rnd = random(seed);
  p.rect(x0, y0, w, h, "0");
  for (let i = 0; i < Math.round((w * h) / 220); i++) {
    const x = x0 + Math.floor(rnd() * w);
    const y = y0 + Math.floor(rnd() * h * 0.7);
    const bright = rnd() > 0.75;
    p.dot(x, y, bright ? "3" : "2");
  }
  if (!moon) return;
  const [mx, my] = moon;
  for (let y = Math.max(y0, my - 10); y <= Math.min(y0 + h - 1, my + 10); y++) {
    for (let x = Math.max(x0, mx - 10); x <= Math.min(x0 + w - 1, mx + 10); x++) {
      const d = Math.hypot(x - mx, y - my);
      if (d <= 3.6) p.dot(x, y, "w");
      else if (d < 10 && dithered((1 - (d - 3.6) / 6.4) * 0.5, x, y)) p.dot(x, y, "1");
    }
  }
}

/** Slow clouds inside a box, moving one whole pixel at a time. */
function clouds(p: Pix, t: number, x0: number, y0: number, w: number, h: number, seed: number) {
  const rnd = random(seed);
  for (let i = 0; i < 4; i++) {
    const len = 10 + Math.floor(rnd() * 18);
    const y = y0 + 2 + Math.floor(rnd() * h * 0.6);
    const start = rnd() * w;
    const speed = 0.6 + rnd() * 0.6;
    const x = x0 + Math.floor(wrap(start + t * speed, w + len)) - len;
    const left = Math.max(x, x0);
    const right = Math.min(x + len, x0 + w);
    if (right > left) p.rect(left, y, right - left, 1, "1");
    if (right - 3 > left + 3) p.rect(left + 3, y + 1, right - left - 6, 1, "1");
  }
}

/** A row of city blocks with still lit windows, from x0 to x1 standing on `base`. */
function skyline(p: Pix, x0: number, x1: number, base: number, maxH: number, seed: number) {
  const rnd = random(seed);
  let x = x0;
  while (x < x1) {
    const w = 5 + Math.floor(rnd() * 7);
    const h = 5 + Math.floor(rnd() * (maxH - 5));
    const right = Math.min(x + w, x1);
    p.rect(x, base - h, right - x, h, "1");
    for (let wy = base - h + 2; wy < base - 1; wy += 3) {
      for (let wx = x + 1; wx < right - 1; wx += 2) if (rnd() > 0.62) p.dot(wx, wy, "3");
    }
    x = right + (rnd() > 0.7 ? 1 : 0);
  }
}

/** A desk seen from the front: someone behind a laptop (or nobody) and a mug; the laptop's logo lights up with new mail. */
function desk(p: Pix, x: number, floor: number, t: number, i: number, who: ColorKey | null, mail = false) {
  const top = floor - 11;
  if (who) {
    // Shoulders wider than the laptop, a neck and a head with hair; the head nods now and then.
    const bob = 0;
    const body: ColorKey = who === "5" ? "4" : "3";
    p.rect(x + 5, top - 9, 16, 9, body);
    p.rect(x + 4, top - 7, 1, 7, body);
    p.rect(x + 21, top - 7, 1, 7, body);
    p.rect(x + 12, top - 11 + bob, 2, 2, who);
    p.rect(x + 10, top - 16 + bob, 6, 5, who);
    p.rect(x + 10, top - 17 + bob, 6, 2, body);
    // Hands typing: one up, one down, swapping a few times a second.
    const tap = Math.floor(t * 3 + i) % 2;
    p.rect(x + 7, top - 3 - tap, 3, 2, who);
    p.rect(x + 16, top - 2 - (1 - tap), 3, 2, who);
    // The laptop's back; its logo lights up when mail comes in.
    p.rect(x + 8, top - 7, 10, 7, "2");
    p.rect(x + 12, top - 5, 2, 2, mail ? "w" : "3");
    p.rect(x + 6, top - 1, 14, 1, "3");
    p.rect(x + 21, top - 3, 2, 3, "2");
  }
  p.rect(x, top, 26, 2, "4");
  p.rect(x + 1, top + 2, 1, floor - top - 2, "3");
  p.rect(x + 24, top + 2, 1, floor - top - 2, "3");
}

/** A floor of boards from `floor` down. */
function boards(p: Pix, floor: number) {
  p.rect(0, floor, p.w, p.h - floor, "1");
  for (let y = floor + 2; y < p.h; y += 3) {
    const off = (y * 7) % 13;
    for (let x = -off; x < p.w; x += 26) p.rect(x, y, 1, 1, "2");
  }
  p.rect(0, floor, p.w, 1, "2");
}

/** A sprite flying from a to b on an arc, for progress 0…1. */
function fly(p: Pix, s: Sprite, a: [number, number], b: [number, number], k: number, lift = 12) {
  if (k <= 0 || k >= 1) return;
  const e = ease(k);
  p.draw(s, a[0] + (b[0] - a[0]) * e - Math.floor(s.w / 2), a[1] + (b[1] - a[1]) * e - Math.sin(Math.PI * e) * lift - Math.floor(s.h / 2));
}

/** An office wall on the page over a floor of boards. */
function pageRoom(p: Pix, floor: number) {
  p.rect(0, 0, p.w, p.h, "0");
  p.dither(0, 0, p.w, floor, "0", "1", 0.18);
  boards(p, floor);
}

const DESKS_HERO = [16, 66, 136, 190];

export const SCENES: Record<string, Scene> = {
  /** Inside the office at night: big windows on the city, lamps over the desks, mail and paper planes going round. */
  hero: {
    w: 240,
    h: 160,
    surface: "band",
    draw(p, t) {
      // Tall windows from the ceiling (the sky sits behind the hero's text), the office along the bottom.
      const floor = 142;
      const sill = 108;
      p.rect(0, 0, p.w, p.h, "0");
      // One wide pane on the left (behind the text), one on the right with the moon.
      const panes: [number, number][] = [
        [-2, 150],
        [154, 242],
      ];
      panes.forEach(([a, b], i) => {
        nightSky(p, a, 0, b - a, sill, i === 1 ? [212, 30] : null, 3 + i);
        clouds(p, t, a, 8, b - a, 50, 11 + i);
        // Low city on the left so the hero's last line stays clear of it.
        skyline(p, a, b, sill, i === 0 ? 10 : 22, 21 + i);
      });
      p.rect(0, sill, p.w, 3, "2");
      boards(p, floor);
      // Three people at work, one free desk with a plant on it. Envelopes come in low from the right, behind the
      // people, and drop into a laptop (its logo lights up next); drawn first so heads stay in front.
      const people: (ColorKey | null)[] = ["5", "4", null, "5"];
      DESKS_HERO.forEach((x, i) => {
        if (people[i]) fly(p, S.envelope, [246, floor - 32], [x + 13, floor - 16], wrap(t - i * 1.3, 5.2) / 1.6, 4);
      });
      DESKS_HERO.forEach((x, i) => {
        const k = wrap(t - i * 1.3, 5.2);
        desk(p, x, floor, t, i, people[i]!, people[i] !== null && k > 1.6 && k < 2.6);
      });
      p.draw(S.plant, 144, floor - 21);
      p.draw(S.plant, 2, floor - 10);
      p.draw(S.plant, 229, floor - 10);
      // Planes between people.
      fly(p, S.plane, [DESKS_HERO[0]! + 13, floor - 36], [DESKS_HERO[1]! + 13, floor - 36], wrap(t - 0.6, 6) / 2, 10);
      // Someone crossing with a coffee.
      const walker = Math.floor(wrap(t * 7, p.w + 40)) - 20;
      p.draw(S.walk[Math.floor(t * 4) % 2]!, walker, floor + 3, { "5": "4", "4": "3" });
      p.dot(walker + 4, floor + 6, "w");
      fadeToPage(p, 151);
    },
  },
  /** The office building from the street at night, mail flying in at its windows. */
  cta: {
    w: 240,
    h: 80,
    surface: "band",
    draw(p, t) {
      const street = 66;
      nightSky(p, 0, 0, p.w, street, [204, 14], 41);
      clouds(p, t, 0, 0, p.w, 30, 43);
      skyline(p, 0, 74, street, 26, 45);
      skyline(p, 168, 240, street, 30, 47);
      // The building: four floors of windows, people in some, an @ on the roof.
      const bx = 82;
      const bw = 76;
      p.rect(bx, 16, bw, street - 16, "2");
      p.rect(bx - 2, 14, bw + 4, 2, "3");
      p.draw(S.at, bx + bw / 2 - 3, 5, { "5": "w" });
      const rnd = random(49);
      for (let f = 0; f < 4; f++) {
        for (let c = 0; c < 6; c++) {
          const wx = bx + 4 + c * 12;
          const wy = 20 + f * 10;
          const lit = rnd() > 0.3;
          const someone = rnd() > 0.6;
          p.rect(wx, wy, 8, 6, lit ? "4" : "1");
          if (lit && someone) {
            p.rect(wx + 3, wy + 1, 2, 2, "2");
            p.rect(wx + 2, wy + 3, 4, 3, "2");
          }
        }
      }
      // The door, a post box and a street lamp.
      p.rect(bx + bw / 2 - 5, street - 9, 10, 9, "4");
      p.rect(bx + bw / 2 - 1, street - 9, 1, 9, "2");
      p.draw(S.postbox, bx + bw / 2 + 8, street - 7);
      p.rect(48, street - 22, 1, 22, "2");
      p.rect(46, street - 23, 5, 2, "w");
      for (let y = street - 21; y < street; y++) {
        const half = 2 + Math.floor((y - street + 21) * 0.4);
        for (let dx = -half; dx <= half; dx++) if (dithered(0.22, 48 + dx, y)) p.dot(48 + dx, y, "1");
      }
      p.rect(0, street, p.w, p.h - street, "1");
      p.rect(0, street, p.w, 1, "3");
      for (let x = 0; x < p.w; x += 14) p.rect(x, street + 8, 7, 1, "2");
      // Mail flying in at the windows, people walking home.
      for (let i = 0; i < 4; i++) {
        const from: [number, number] = i % 2 ? [250, 10 + i * 6] : [-10, 12 + i * 6];
        fly(p, S.envelope, from, [bx + 8 + i * 18, 23 + (i % 3) * 10], wrap(t - i * 1.5, 6) / 2.4, 10);
      }
      for (let i = 0; i < 2; i++) {
        const x = Math.floor(i === 0 ? wrap(t * 6, p.w + 20) - 10 : p.w - (wrap(t * 5 + 90, p.w + 20) - 10));
        p.draw(S.walk[Math.floor(t * 4 + i) % 2]!, x, street - 7, { "5": "4", "4": "3" });
      }
    },
  },
  /** Card: a personal mailbox for each person, mail landing on their laptops. */
  mailboxes: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 56;
      pageRoom(p, floor);
      [6, 47, 88].forEach((x, i) => {
        const k = wrap(t - i * 1.1, 3.3);
        desk(p, x, floor, t, i, (["5", "4", "5"] as const)[i]!, k > 1.3 && k < 2.4);
        if (k < 1.3) p.draw(S.letter, x + 10, -6 + ease(k / 1.3) * 30);
      });
    },
  },
  /** Card: the team at one table, support@ on the screen, its mail going round. */
  shared: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(42, 5, 36, 22, "5");
      p.rect(44, 7, 32, 18, "0");
      p.draw(S.at, 47, 12);
      for (let r = 0; r < 3; r++) p.rect(57, 11 + r * 4, 15 - r * 3, 1, "3");
      p.rect(59, 27, 2, 4, "4");
      const people: [number, ColorKey][] = [
        [18, "5"],
        [32, "4"],
        [82, "5"],
        [96, "3"],
      ];
      people.forEach(([x, c], i) => p.draw(S.standing, x, floor - 18, { "5": c, "4": c === "5" ? "4" : "3" }));
      p.rect(12, floor - 10, 96, 2, "4");
      p.rect(20, floor - 8, 1, 8, "3");
      p.rect(99, floor - 8, 1, 8, "3");
      people.forEach(([x], i) => fly(p, S.letter, [60, 18], [x + 3, floor - 20], wrap(t - i * 0.9, 3.6) / 1.2, 10));
    },
  },
  /** Card: a whiteboard the team writes on together. */
  notes: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(14, 4, 92, 40, "4");
      p.rect(16, 6, 88, 36, "0");
      p.rect(14, 44, 92, 2, "3");
      const lines = [44, 30, 52, 36, 24];
      const total = lines.reduce((a, b) => a + b, 0);
      let left = (wrap(t, 9) / 7) * total;
      let pen: [number, number] = [20, 11];
      lines.forEach((len, i) => {
        const y = 11 + i * 6;
        const n = Math.max(0, Math.min(len, left));
        if (n > 0) p.rect(20, y, n, i === 0 ? 2 : 1, i === 0 ? "5" : "3");
        if (left > 0) pen = [20 + n, y];
        left -= len;
      });
      p.rect(pen[0], pen[1] - 1, 2, 2, "5");
      // The writer follows the pen; the other one walks along the board.
      p.draw(S.standing, Math.max(14, Math.min(98, Math.floor(pen[0]) - 3)), floor - 10);
      p.draw(S.standing, 86 - Math.round((Math.sin(t * 0.5) * 0.5 + 0.5) * 20), floor - 10, { "5": "3", "4": "2" });
    },
  },
  /** Setup steps (data-state 0…3): the company's door and @, the people at their desks, the shared screen and mail. */
  setup: {
    w: 200,
    h: 80,
    surface: "page",
    draw(p, t, state) {
      const step = Number(state) || 0;
      const floor = 66;
      pageRoom(p, floor);
      const ghost = (on: boolean): Partial<Record<ColorKey, ColorKey>> | undefined => (on ? undefined : { "5": "1", "4": "1", "3": "1", "2": "1", w: "1" });
      // 1: the door with the @ of your domain.
      const door = ghost(step >= 1);
      p.rect(12, floor - 34, 24, 34, door?.["4"] ?? "4");
      p.rect(15, floor - 31, 18, 31, door ? "0" : "2");
      p.draw(S.at, 21, floor - 44, door);
      // 2: the people at their desks.
      [52, 88].forEach((x, i) => {
        if (step >= 2) desk(p, x, floor, t, i, i ? "4" : "5", step >= 3 && wrap(t - i, 2.6) > 1.6);
        else {
          p.rect(x, floor - 11, 26, 2, "1");
          p.rect(x + 8, floor - 17, 10, 6, "1");
        }
      });
      // 3: support@ on the wall screen, shared by both, and the mail flows.
      const screen = ghost(step >= 3);
      p.rect(138, 10, 44, 28, screen?.["5"] ?? "5");
      p.rect(140, 12, 40, 24, "0");
      p.draw(S.at, 144, 18, screen);
      for (let r = 0; r < 3; r++) p.rect(155, 17 + r * 5, 20 - r * 4, 1, screen?.["3"] ?? "3");
      p.draw(S.plant, 186, floor - 10, ghost(step >= 2));
      if (step >= 1) fly(p, S.letter, [24, floor - 30], step >= 3 ? [160, 24] : [65, floor - 20], wrap(t, 2.6) / 1.6, 16);
      if (step >= 3) [52, 88].forEach((x, i) => fly(p, S.letter, [160, 24], [x + 13, floor - 20], wrap(t - 0.8 - i * 0.7, 2.6) / 1.2, 10));
    },
  },
};
