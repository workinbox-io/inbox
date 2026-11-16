/**
 * Work Inbox's pixel scenes (our own drawings): a startup in a living room at night for the hero bands, the office building from
 * the street for the closing band, and small office scenes for the cards on the page. See pixel.ts for
 * the palette keys. Random values are drawn in a fixed order every frame, so nothing jumps between frames.
 */
import { type ColorKey, type Pix, type Scene, type Sprite, dithered, random, sprite } from "./pixel";

import { office } from "./office";

const S = {
  envelope: sprite(["wwwwwww", "w3www3w", "ww3w3ww", "www3www", "wwwwwww"]),
  plane: sprite(["w.......", "4ww.....", ".44www..", "..wwwwww", ".4ww....", "4w......"]),
  // An envelope on the page: outlined, since the page is white.
  letter: sprite(["5555555", "5500055", "5050505", "5005005", "5555555"]),
  postbox: sprite(["wwwwww", "w3333w", "wwwwww", "wwwwww", "wwwwww", ".3..3.", ".3..3."]),
  // A page with a folded corner, outlined like the letter.
  doc: sprite(["55555..", "5000055", "5033005", "5000005", "5033305", "5000005", "5555555"]),
  at: sprite([".55555.", "5.....5", "5..55.5", "5.5.5.5", "5..5555", "5......", ".55555."]),
  plant: sprite(["..3...3..", ".333.333.", "3.33333.3", ".3333333.", "..33333..", "...333...", "....3....", "..22222..", "..22222..", "...222..."]),
  standing: sprite(["..55..", ".5555.", ".5555.", "..55..", ".4444.", "444444", "444444", "444444", ".4..4.", ".4..4."]),
  walk: [
    sprite([".55.", ".55.", ".44.", "4444", ".44.", ".44.", ".4.4", ".4.4"]),
    sprite([".55.", ".55.", ".44.", "4444", ".44.", ".44.", "..4.", "..4."]),
  ],
};

/** What drops into the boxes in the hero, bright on the ink band (the envelope is S.envelope). */
/** The six apps' things as pixel rows (w bright, 3 darker), in APPS order: the hero's chutes and its app links. */
export const APP_ROWS = [
  ["wwwwwww", "w3www3w", "ww3w3ww", "www3www", "wwwwwww"],
  ["wwwwwww", "w3w3w3w", "wwwwwww", ".ww....", "w......"],
  ["w.w.w", "wwwww", "w333w", "wwwww", "w33ww", "wwwww"],
  [".3.3.", "wwwww", "33333", "w3w3w", "wwwww", "w3www"],
  ["wwww.", "w33ww", "wwwww", "w333w", "wwwww", "wwwww"],
  ["wwwwwww", "w.33..w", "w.33.ww", "w3333.w", "wwwwwww"],
];

const ITEM = {
  chat: sprite(APP_ROWS[1]!),
  note: sprite(APP_ROWS[2]!),
  calendar: sprite(APP_ROWS[3]!),
  file: sprite(APP_ROWS[4]!),
  contact: sprite(APP_ROWS[5]!),
  box: sprite(["5.5.5", "55555", "5...5", "55555"]),
  at: sprite([".555.", "5.5.5", "5.555", ".5..."]),
  star: sprite(["..w..", ".www.", "wwwww", ".w.w."]),
  spam: sprite(["wwwwwww", "w33w33w", "www3www", "wwwwwww", "www3www"]),
};

/** 3×5 digits for the counter screen. */
const DIGITS = [
  ["555", "5.5", "5.5", "5.5", "555"], [".5.", "55.", ".5.", ".5.", "555"], ["555", "..5", "555", "5..", "555"],
  ["555", "..5", ".55", "..5", "555"], ["5.5", "5.5", "555", "..5", "..5"], ["555", "5..", "555", "..5", "555"],
  ["555", "5..", "555", "5.5", "555"], ["555", "..5", ".5.", ".5.", ".5."], ["555", "5.5", "555", "5.5", "555"],
  ["555", "5.5", "555", "..5", "555"],
].map(sprite);

const wrap = (v: number, n: number) => ((v % n) + n) % n;
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

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
    for (let x = 26 - off; x < p.w; x += 26) p.rect(x, y, 1, 1, "2");
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

/** A straight line between two scene points. */
function seg(p: Pix, a: [number, number], b: [number, number], c: ColorKey) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let i = 0; i <= n; i++) p.dot(Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n), c);
}

/** Someone standing, seen from the front, as tall as the people at the desks. */
function standing(p: Pix, x: number, floor: number, skin: ColorKey, body: ColorKey) {
  p.rect(x + 3, floor - 12, 3, 12, "3");
  p.rect(x + 8, floor - 12, 3, 12, "3");
  p.rect(x + 1, floor - 26, 12, 14, body);
  p.rect(x + 6, floor - 28, 2, 2, skin);
  p.rect(x + 4, floor - 34, 6, 6, skin);
  p.rect(x + 4, floor - 35, 6, 2, body);
}


/** The hero's packing room (scene "belt"): 480×100, drawn under the wall above it. */
function packingRoom(p: Pix, t: number, state: string) {
  const floor = 86;
  const top = 64; // the belt's surface
  const hovered = state === "" ? -1 : Number(state);
  const v = 16; // belt speed, px/s
  const gap = 48; // one box every 3 s
  const bw = 20;
  const bh = 14;
  const y = top - bh;
  const x0 = 58; // where the folder puts boxes down
  const tx = 380; // the taping machine
  const exit = 440; // the strip curtain
  const chutes = [140, 176, 212, 248, 284, 320];
  const items: Sprite[] = [S.envelope, ITEM.chat, ITEM.note, ITEM.calendar, ITEM.file, ITEM.contact];
  const fall = 1.1;
  const bin = 112; // the spam bin, in front of the belt
  t += 40; // a still frame (reduced motion) with things mid-air and boxes all along the belt
  const hour = new Date().getHours();
  const day = hour >= 7 && hour < 19; // the visitor's daytime: daylight in the window, the string lights off

  // Room: striped wallpaper, a skirting board, floor boards, string lights.
  p.rect(0, 0, p.w, p.h, "0");
  for (let x = 3; x < p.w; x += 8) p.dither(x, 0, 1, floor, "0", "1", 0.5);
  boards(p, floor);
  p.rect(0, floor - 2, p.w, 2, "1");
  for (let x = 0; x < p.w; x++) p.dot(x, 3 + Math.round(4 * Math.sin((Math.PI * (x % 50)) / 50)), "1");
  for (let i = 0; i * 10 + 5 < p.w; i++) {
    const x = i * 10 + 5;
    const on = (Math.floor(t * 2) + i * 3) % 7;
    p.rect(x, 4 + Math.round(4 * Math.sin((Math.PI * (x % 50)) / 50)), 2, 2, !day && on === 0 ? "w" : !day && on < 3 ? "4" : "3");
  }

  // A window on the street: the night sky, or in the visitor's daytime a pale sky, the sun and drifting clouds.
  if (day) {
    p.rect(8, 16, 36, 26, "3");
    for (let yy = 19; yy < 26; yy++) for (let xx = 31; xx < 38; xx++) if (Math.hypot(xx - 34, yy - 22) < 3.4) p.dot(xx, yy, "w");
    for (const [c0, cy] of [[4, 20], [20, 27]] as const) {
      const cx = 8 + Math.floor(wrap(c0 + t * 0.8, 46)) - 10;
      const l = Math.max(8, cx);
      const r = Math.min(44, cx + 10);
      if (r > l) p.rect(l, cy, r - l, 2, "4");
    }
  } else nightSky(p, 8, 16, 36, 26, [34, 22], 5);
  skyline(p, 8, 44, 42, 9, 7);
  p.rect(6, 14, 40, 2, "3");
  p.rect(6, 14, 2, 28, "3");
  p.rect(44, 14, 2, 28, "3");
  p.rect(25, 14, 2, 28, "3");
  p.rect(4, 42, 44, 2, "3");

  // The feed pipe along the ceiling and its six chutes, each with its app's sign and a lamp that lights as it drops.
  p.rect(118, 10, 222, 3, "2");
  p.rect(118, 10, 222, 1, "3");
  p.rect(118, 0, 3, 10, "2");
  for (let x = 130; x < 340; x += 18) p.rect(x, 9, 2, 5, "3");
  const busy = chutes.map(() => false);
  const boxAt = (n: number) => Math.round(t * v - n * gap);
  const last = Math.floor((t * v - x0 + bw) / gap);
  const boxes: number[] = [];
  for (let n = last - 12; n <= last; n++) {
    const x = boxAt(n);
    if (x >= x0 - bw && x < p.w) boxes.push(n);
  }
  for (const n of boxes) {
    const c = boxAt(n) + bw / 2;
    chutes.forEach((cx, j) => {
      const left = (cx - c) / v;
      if (left > 0 && left < fall * 0.5) busy[j] = true;
    });
  }
  chutes.forEach((cx, j) => {
    p.rect(cx - 2, 13, 4, 11, "2");
    p.rect(cx - 2, 13, 1, 11, "3");
    p.rect(cx - 7, 15, 14, 9, hovered === j ? "w" : "3");
    p.rect(cx - 6, 16, 12, 7, hovered === j ? "2" : "1");
    const icon = items[j]!;
    p.draw(icon, cx - Math.floor(icon.w / 2), 16 + Math.floor((7 - icon.h) / 2));
    for (let i = 0; i < 4; i++) p.rect(cx - 6 + i, 24 + i, 12 - i * 2, 1, i === 0 ? "3" : "2");
    p.rect(cx + 5, 25, 2, 2, busy[j] || hovered === j ? "w" : "2");
  });

  // The box folder: a magazine of flat boxes over the start of the belt, a pusher going back and forth.
  p.rect(x0 - 8, 26, 30, 4, "3");
  for (let i = 0; i < 6; i++) p.rect(x0 - 6 + (i % 2), 30 + i * 3, 26, 2, i % 2 ? "3" : "4");
  p.rect(x0 - 10, 26, 2, top - 26, "3");
  p.rect(x0 + 20, 26, 2, 22, "3");
  const push = Math.round(Math.max(0, Math.sin(((t * v) / gap) * Math.PI * 2)) * 4);
  p.rect(x0 - 16 + push, 46, 6, 3, "4");
  p.rect(x0 - 20, 46, 4 + push, 1, "3");

  // The belt: end drums, the tread moving with the boxes, rollers turning, legs to the floor.
  p.rect(x0 - 12, top, p.w - x0 + 12, 3, "2");
  const shift = Math.floor(wrap(t * v, 8));
  for (let x = x0 - 12 + shift; x < p.w; x += 8) p.rect(x, top, 4, 1, "3");
  p.rect(x0 - 12, top + 3, p.w - x0 + 12, 1, "1");
  const ring = (cx: number, cy: number, r: number, c: ColorKey) => {
    for (let k = 0; k < r * 8; k++) p.dot(cx + Math.round(Math.cos((k / (r * 8)) * Math.PI * 2) * r), cy + Math.round(Math.sin((k / (r * 8)) * Math.PI * 2) * r), c);
  };
  const turn = (t * v) / 3;
  for (let x = x0; x < p.w; x += 16) {
    ring(x, top + 8, 3, "2");
    p.dot(x + Math.round(Math.cos(turn) * 2), top + 8 + Math.round(Math.sin(turn) * 2), "3");
  }
  ring(x0 - 12, top + 4, 4, "3");
  p.dot(x0 - 12 + Math.round(Math.cos(turn) * 3), top + 4 + Math.round(Math.sin(turn) * 3), "4");
  for (let x = x0 + 8; x < p.w; x += 64) {
    p.rect(x, top + 12, 2, floor - top - 12, "2");
    p.rect(x - 3, floor - 1, 8, 1, "3");
  }
  p.rect(x0 - 8, top + 12, p.w - x0 + 8, 1, "2");

  // The taping machine: an arch over the belt, a roll that turns while it tapes.
  const taping = boxes.some((n) => Math.abs(boxAt(n) + bw / 2 - tx) < bw / 2);
  p.rect(tx - 16, 32, 32, 4, "3");
  p.rect(tx - 16, 32, 2, top - 32, "3");
  p.rect(tx + 14, 32, 2, top - 32, "3");
  ring(tx, 41, 4, "4");
  ring(tx, 41, 2, "2");
  const spin = taping ? t * 8 : 0;
  p.dot(tx + Math.round(Math.cos(spin) * 3), 41 + Math.round(Math.sin(spin) * 3), "w");
  if (taping) p.rect(tx - 1, 45, 2, y - 45, "w");

  // The boxes: unfolded at the start, filled under the chutes, taped shut under the arch.
  for (const n of boxes) {
    const x = boxAt(n);
    if (x < x0 - 2) continue;
    const c = x + bw / 2;
    const h = Math.min(bh, 3 + Math.round(((x - x0 + 2) / 10) * (bh - 3)));
    const by = top - h;
    p.rect(x, by, bw, h, "4");
    p.rect(x, by, bw, 1, "3");
    p.rect(x + bw - 1, by + 1, 1, h - 1, "3");
    if (h === bh) p.draw(ITEM.box, x + 3, y + 7, { "5": "3" });
    const spam = wrap(n, 9) === 4; // this box's mail is spam: it bounces off into the bin
    const filled = chutes.filter((cx) => cx <= c).length;
    if (h === bh) {
      // The flaps: they swing open once the box is folded, stand wide under the chutes, rise and fold flat onto
      // the lid on the way into the taper. The angle is measured from lying flat (0) to wide open (150°).
      const opened = ease((x - x0 - 8) / 14);
      const shut = ease((c - (tx - 22)) / 20);
      const ang = ((5 * Math.PI) / 6) * opened * (1 - shut);
      const inside = ang > Math.PI / 2; // past upright we see the flap's inner side
      const L = bw / 2;
      for (const [hx, dir] of [[x, 1], [x + bw - 1, -1]] as const) {
        const tip: [number, number] = [hx + dir * Math.cos(ang) * L, by - 1 - Math.sin(ang) * L];
        seg(p, [hx, by - 1], tip, inside ? "3" : "4");
        seg(p, [hx, by], [tip[0], tip[1] + 1], inside ? "2" : "3");
      }
      if (ang > 1) for (let j = 0; j < filled; j++) if (!(spam && j === 0)) p.rect(x + 3 + j * 2 + (j > 2 ? 1 : 0), by - 1 - (j % 2), 2, 1 + (j % 2), j % 2 ? "w" : "4");
      // Under the taper: tape across the lid and down the front as the roll turns, then the label goes on.
      const taped = Math.min(1, Math.max(0, (c - tx + 4) / 10));
      if (taped > 0) p.rect(x + bw / 2 - 1, by - 1, 2, 1 + Math.round(6 * taped), "w");
      if (c >= tx + 12) {
        const slap = Math.min(1, (c - tx - 12) / 4);
        p.rect(x + 11, y + 6 + Math.round((1 - slap) * -3), 7, 6, "w");
        p.draw(ITEM.at, x + 12, y + 7 + Math.round((1 - slap) * -3), { "5": "3" });
        if (wrap(n, 7) === 3) p.draw(ITEM.star, x + 3, y + 1);
      }
    }
    // What's falling into this box right now.
    chutes.forEach((cx, j) => {
      const left = (cx - c) / v;
      const item = spam && j === 0 ? ITEM.spam : items[j]!;
      const land = y - item.h + 3;
      if (spam && j === 0 && left <= 0 && left > -0.8) {
        // Spam: off the flap and into the bin in front.
        const k = -left / 0.8;
        p.draw(item, cx - 3 + (bin - cx) * k, land - 3 + (floor - 14 - land) * k - Math.sin(Math.PI * k) * 16);
        return;
      }
      if (left <= 0 || left >= fall) return;
      const k = 1 - left / fall;
      const iy = Math.round(28 + (land - 28) * k * k);
      // A faint trail behind anything falling fast.
      if (k > 0.35) {
        p.dot(cx, iy - 3, "2");
        p.dot(cx, iy - 6, "1");
      }
      p.draw(item, cx - Math.floor(item.w / 2), iy);
    });
  }

  // The strip curtain the boxes leave through, its strips pushed aside as one goes by.
  p.rect(exit - 2, 30, 36, 4, "3");
  p.rect(exit - 2, 30, 2, floor - 30, "3");
  const through = boxes.find((n) => boxAt(n) + bw > exit && boxAt(n) < exit + 30);
  for (let i = 0; i < 8; i++) {
    const sx = exit + 2 + i * 4;
    const bend = through !== undefined && Math.abs(boxAt(through) + bw - sx) < 8 ? 2 : 0;
    p.rect(sx, 34, 2, top - 34 - 6, i % 2 ? "2" : "3");
    p.rect(sx + bend, top - 6, 2, 6, i % 2 ? "2" : "3");
  }

  // The screen over the curtain: boxes shipped so far, ticking up as each one is taped.
  const shipped = 1200 + Math.floor((t * v - (tx - bw / 2)) / gap);
  p.rect(392, 14, 40, 14, "3");
  p.rect(393, 15, 38, 12, "1");
  p.draw(ITEM.box, 396, 17);
  String(shipped).padStart(4, "0").split("").forEach((d, i) => p.draw(DIGITS[Number(d)]!, 408 + i * 5, 18, { "5": taping ? "w" : "4" }));

  // A poster on the wall between the chutes and the taper.
  p.rect(344, 16, 20, 22, "3");
  p.rect(345, 17, 18, 20, "1");
  p.draw(S.at, 350, 21, { "5": "4" });
  p.rect(348, 31, 12, 1, "2");
  p.rect(350, 33, 8, 1, "2");

  // In front: a pallet filling with shipped boxes, six to a pallet. When it's full a forklift drives in from the
  // right, lifts it and takes it away; the next box starts a new pallet.
  const batch = wrap((t * v - (tx - bw / 2)) / gap, 6); // boxes shipped in this batch, fractional
  const crate = (sx: number, sy: number) => {
    p.rect(sx, sy, 12, 7, "4");
    p.rect(sx, sy, 12, 1, "3");
    p.rect(sx + 11, sy + 1, 1, 6, "3");
    p.rect(sx + 5, sy, 2, 3, "w");
  };
  const pallet = (px: number, py: number, count: number) => {
    p.rect(px, py, 42, 3, "3");
    for (const dx of [2, 19, 36]) p.rect(px + dx, py, 3, 3, "2");
    for (let i = 0; i < count; i++) crate(px + 2 + (i % 3) * 13, py - 7 * (Math.floor(i / 3) + 1));
  };
  const forklift = (fx: number, lift: number) => {
    // Mast and forks on the left, the cab and its driver on the right, two wheels.
    p.rect(fx, floor - 34, 2, 31, "2");
    p.rect(fx + 3, floor - 34, 1, 31, "2");
    p.rect(fx - 22, floor - 4 - lift, 24, 2, "3");
    p.rect(fx + 4, floor - 16, 18, 10, "3");
    p.rect(fx + 8, floor - 30, 12, 2, "2");
    p.rect(fx + 8, floor - 30, 1, 14, "2");
    p.rect(fx + 19, floor - 30, 1, 14, "2");
    p.rect(fx + 11, floor - 24, 5, 5, "5");
    p.rect(fx + 11, floor - 25, 5, 2, "4");
    p.rect(fx + 10, floor - 19, 7, 3, "4");
    for (const wx of [fx + 7, fx + 18]) {
      p.rect(wx - 2, floor - 5, 5, 5, "1");
      p.dot(wx, floor - 3, "3");
    }
  };
  if (batch < 1) {
    // Driving off with the full pallet.
    const k = batch;
    const fx = 436 + Math.round(ease(k) * 70);
    pallet(fx - 22, floor - 6, 6);
    forklift(fx, 3);
  } else {
    pallet(392, floor - 3, Math.min(6, Math.floor(batch)));
    if (batch > 5.2) forklift(436 + Math.round((1 - ease((batch - 5.2) / 0.8)) * 70), 0);
  }

  // The spam bin in front of the belt, its lid lifting when something lands in it.
  p.rect(bin - 7, floor - 12, 14, 12, "2");
  p.rect(bin - 7, floor - 12, 14, 1, "3");
  for (let x = bin - 5; x < bin + 6; x += 3) p.rect(x, floor - 10, 1, 8, "1");
  const open = boxes.some((n) => wrap(n, 9) === 4 && (chutes[0]! - (boxAt(n) + bw / 2)) / v <= 0 && (chutes[0]! - (boxAt(n) + bw / 2)) / v > -0.9);
  p.rect(bin - 8, floor - 14 - (open ? 2 : 0), 16, 2, "3");

  // Someone walks the line with a clipboard, there and back, legs swinging.
  const walk = wrap(t, 36) / 18;
  const wx = Math.round(170 + (walk < 1 ? ease(walk) : 1 - ease(walk - 1)) * 140);
  const stride = Math.floor(t * 4) % 2;
  p.rect(wx + 3 + (stride ? 1 : -1), floor - 12, 3, 12, "3");
  p.rect(wx + 8 + (stride ? -1 : 1), floor - 12, 3, 12, "3");
  p.rect(wx + 2 + (stride ? 1 : -1), floor - 1, 5, 1, "2");
  p.rect(wx + 7 + (stride ? -1 : 1), floor - 1, 5, 1, "2");
  p.rect(wx + 1, floor - 26, 12, 14, "4");
  p.rect(wx + 6, floor - 28, 2, 2, "5");
  p.rect(wx + 4, floor - 34, 6, 6, "5");
  p.rect(wx + 4, floor - 35, 6, 2, "3");
  const facing = walk < 1 ? 1 : -1;
  p.rect(facing > 0 ? wx + 12 : wx - 3, floor - 22, 5, 7, "w");
  p.rect(facing > 0 ? wx + 13 : wx - 2, floor - 20, 3, 1, "3");

  // In front: someone at a desk with a laptop and a mug, watching the boxes go.
  desk(p, 6, floor, t, 0, "5");
  p.rect(28, floor - 14, 3, 3, "w");
  // Their chair and legs, as at the living room's table.
  p.rect(13, floor - 9, 12, 2, "1");
  p.rect(15, floor - 9, 3, 9, "2");
  p.rect(20, floor - 9, 3, 9, "2");
  p.rect(14, floor - 1, 4, 1, "3");
  p.rect(20, floor - 1, 4, 1, "3");
  p.draw(S.plant, 462, floor - 10);
}

/**
 * Up the wall over the packing room: a departures board of the latest boxes shipped (the newest slides in at the top
 * each time the taper closes one, every 3 s like the room) and a clock showing the visitor's time.
 */
function departures(p: Pix, t: number) {
  const k = (t * 16 - (380 - 10)) / 48;
  const shipped = 1200 + Math.floor(k);
  const since = wrap(k, 1);
  const bx = 300;
  const by = 14;
  p.rect(bx, by, 164, 56, "3");
  p.rect(bx + 2, by + 2, 160, 52, "1");
  p.rect(bx + 2, by + 2, 160, 9, "2");
  p.draw(ITEM.box, bx + 6, by + 4, { "5": "w" });
  for (let i = 0; i < 6; i++) p.draw(sprite(APP_ROWS[i]!), bx + 20 + i * 11, by + 3);
  for (let i = 0; i < 3; i++) p.rect(bx + 148 - i * 5, by + 5, 3, 3, Math.floor(t * 2 + i) % 3 === 0 ? "w" : "3");
  const slide = Math.round((1 - ease(since * 4)) * -10);
  for (let r = 0; r < 5; r++) {
    const ry = by + 15 + r * 10 + slide;
    if (ry < by + 12 || ry > by + 47) continue;
    const id = shipped - r;
    const tone: ColorKey = r === 0 ? "w" : r === 1 ? "4" : "3";
    String(id).padStart(4, "0").split("").forEach((d, i) => p.draw(DIGITS[Number(d)]!, bx + 8 + i * 5, ry, { "5": tone }));
    seg(p, [bx + 32, ry + 2], [bx + 40, ry + 2], tone);
    p.dot(bx + 39, ry + 1, tone);
    p.dot(bx + 39, ry + 3, tone);
    p.draw(ITEM.at, bx + 46, ry, { "5": tone });
    for (let i = 0; i < 6; i++) p.rect(bx + 56 + i * 7, ry + 1, 5, 3, tone === "w" ? "4" : "2");
    if (wrap(id, 7) === 3) p.draw(ITEM.star, bx + 102, ry);
    p.rect(bx + 146, ry + 1, 8, 3, r === 0 && Math.floor(t * 3) % 2 ? "w" : tone === "w" ? "4" : "2");
  }
  const cx = 276;
  const cy = 34;
  for (let a = 0; a < 48; a++) p.dot(cx + Math.round(9 * Math.cos((a / 48) * Math.PI * 2)), cy + Math.round(9 * Math.sin((a / 48) * Math.PI * 2)), "3");
  for (let h = 0; h < 12; h++) p.dot(cx + Math.round(7 * Math.cos((h / 12) * Math.PI * 2)), cy + Math.round(7 * Math.sin((h / 12) * Math.PI * 2)), "2");
  const now = new Date();
  const hAng = (((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const mAng = (now.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;
  seg(p, [cx, cy], [cx + Math.round(Math.cos(hAng) * 4), cy + Math.round(Math.sin(hAng) * 4)], "4");
  seg(p, [cx, cy], [cx + Math.round(Math.cos(mAng) * 6), cy + Math.round(Math.sin(mAng) * 6)], "w");
}

export const SCENES: Record<string, Scene> = {
  office,
  /**
   * The home hero, a full-width strip: a startup run from a living room at night, seen from the front. Kitchen, a
   * window on the street, someone coding on the couch, the folding table with two laptops under a whiteboard (mail goes
   * from one to the other, a paper plane comes back), a TV with a game on, beige towers as the server, pizza boxes.
   */
  house: {
    w: 480,
    h: 100,
    surface: "band",
    draw(p, t) {
      const floor = 86;
      p.rect(0, 0, p.w, p.h, "0");
      // Striped wallpaper, a skirting board, floor boards and a rug under the table.
      for (let x = 3; x < p.w; x += 8) p.dither(x, 14, 1, floor - 14, "0", "1", 0.5);
      boards(p, floor);
      p.rect(0, floor - 2, p.w, 2, "1");
      p.rect(178, floor + 3, 76, 7, "2");
      for (let x = 180; x < 254; x += 4) p.dot(x, floor + 10, "2");

      // String lights sagging between hooks along the ceiling, bulbs twinkling.
      for (let x = 0; x < p.w; x++) p.dot(x, 3 + Math.round(4 * Math.sin((Math.PI * (x % 50)) / 50)), "1");
      for (let i = 0; i * 10 + 5 < p.w; i++) {
        const x = i * 10 + 5;
        const on = (Math.floor(t * 2) + i * 3) % 7;
        p.rect(x, 4 + Math.round(4 * Math.sin((Math.PI * (x % 50)) / 50)), 2, 2, on === 0 ? "w" : on < 3 ? "4" : "3");
      }

      // Kitchen: fridge with magnets, a counter with a coffee machine, someone waiting for their coffee.
      p.rect(8, floor - 52, 20, 52, "3");
      p.rect(8, floor - 34, 20, 1, "2");
      p.rect(24, floor - 48, 1, 10, "2");
      p.rect(24, floor - 30, 1, 14, "2");
      for (const [x, y] of [[12, 40], [18, 44], [14, 58]] as const) p.rect(x, y, 2, 2, "5");
      p.rect(30, floor - 24, 40, 3, "4");
      p.rect(31, floor - 21, 38, 21, "2");
      p.rect(50, floor - 21, 1, 21, "1");
      p.rect(44, floor - 14, 3, 1, "3");
      p.rect(54, floor - 14, 3, 1, "3");
      p.rect(33, floor - 36, 10, 12, "3");
      p.rect(35, floor - 33, 6, 2, "1");
      p.rect(37, floor - 28, 3, 4, "w");
      for (let i = 0; i < 3; i++) {
        const k = wrap(t * 1.5 + i / 3, 1);
        p.dot(38 + Math.round(Math.sin((k + i) * 6)), floor - 30 - Math.round(k * 8), "2");
      }
      standing(p, 53, floor, "5", "4");
      p.rect(51, floor - 20, 3, 3, "w");

      // Window on the street: night sky, the moon, low houses and a palm.
      nightSky(p, 74, 14, 40, 44, [104, 24], 5);
      skyline(p, 74, 114, 58, 10, 7);
      seg(p, [84, 58], [86, 34], "1");
      for (const [dx, dy] of [[-6, 3], [-5, -1], [0, -3], [5, -1], [6, 3]] as const) seg(p, [86, 34], [86 + dx, 34 + dy], "1");
      p.rect(72, 12, 44, 2, "3");
      p.rect(72, 12, 2, 46, "3");
      p.rect(114, 12, 2, 46, "3");
      p.rect(93, 12, 2, 46, "3");
      p.rect(70, 58, 48, 2, "3");

      // The couch: someone coding with a laptop on their knees, a cushion; a lava lamp on a crate next to it.
      p.rect(122, floor - 26, 50, 12, "2");
      p.rect(122, floor - 14, 50, 8, "3");
      p.rect(118, floor - 20, 5, 14, "2");
      p.rect(171, floor - 20, 5, 14, "2");
      p.rect(124, floor - 6, 2, 6, "2");
      p.rect(168, floor - 6, 2, 6, "2");
      p.rect(156, floor - 22, 10, 8, "1");
      p.rect(134, floor - 30, 12, 16, "4");
      p.rect(139, floor - 32, 2, 2, "5");
      p.rect(137, floor - 38, 6, 6, "5");
      p.rect(137, floor - 39, 6, 2, "4");
      p.rect(132, floor - 22, 16, 7, "2");
      p.rect(139, floor - 20, 2, 2, "3");
      p.rect(135, floor - 14, 3, 13, "2");
      p.rect(142, floor - 14, 3, 13, "2");
      p.rect(134, floor - 1, 5, 1, "3");
      p.rect(141, floor - 1, 5, 1, "3");
      const tap = Math.floor(t * 4) % 2;
      p.rect(130, floor - 18 - tap, 2, 2, "5");
      p.rect(148, floor - 17 - (1 - tap), 2, 2, "5");
      p.rect(180, floor - 12, 12, 12, "2");
      p.rect(180, floor - 8, 12, 1, "1");
      p.rect(183, floor - 15, 6, 3, "3");
      p.rect(184, floor - 30, 4, 15, "1");
      p.rect(183, floor - 32, 6, 2, "3");
      p.rect(185, floor - 17 - Math.round(wrap(t * 2.5, 11)), 2, 2, "4");
      p.rect(184, floor - 24 + Math.round(3 * Math.sin(t * 1.3)), 3, 2, "4");

      // Whiteboard over the table: sender, arrow, inbox, and a growth line drawn again and again.
      p.rect(196, 16, 60, 34, "3");
      p.rect(198, 18, 56, 30, "4");
      p.rect(201, 21, 8, 6, "2");
      seg(p, [211, 24], [219, 24], "2");
      p.dot(218, 23, "2");
      p.dot(218, 25, "2");
      p.rect(221, 21, 8, 6, "2");
      p.rect(222, 24, 6, 1, "4");
      const pts: [number, number][] = [[202, 44], [212, 42], [220, 43], [230, 37], [238, 38], [250, 28]];
      const drawn = Math.min(1, wrap(t, 6) / 4) * (pts.length - 1);
      for (let i = 0; i < Math.floor(drawn); i++) seg(p, pts[i]!, pts[i + 1]!, "1");
      const part = drawn - Math.floor(drawn);
      if (part > 0 && Math.floor(drawn) < pts.length - 1) {
        const [ax, ay] = pts[Math.floor(drawn)]!;
        const [bx, by] = pts[Math.floor(drawn) + 1]!;
        seg(p, [ax, ay], [ax + (bx - ax) * part, ay + (by - ay) * part], "1");
      }

      // The folding table: two people, their laptops' backs to us. Every 8 s mail goes left to right; the logo on the
      // right laptop lights up while it's read, and a paper plane comes back.
      const cycle = wrap(t, 8);
      desk(p, 196, floor, t, 0, "5");
      desk(p, 226, floor, t, 1, "4", cycle > 3.6 && cycle < 5.4);
      for (const x of [196, 226]) {
        p.rect(x + 7, floor - 9, 12, 2, "1");
        p.rect(x + 9, floor - 9, 3, 9, "2");
        p.rect(x + 14, floor - 9, 3, 9, "2");
        p.rect(x + 8, floor - 1, 4, 1, "3");
        p.rect(x + 14, floor - 1, 4, 1, "3");
      }
      p.rect(222, floor - 11, 4, 2, "4");
      p.rect(223, floor - 14, 2, 3, "w");
      fly(p, S.envelope, [209, floor - 30], [239, floor - 20], (cycle - 2.2) / 1.4, 12);
      fly(p, S.plane, [239, floor - 32], [209, floor - 32], (cycle - 5.6) / 1.4, 10);

      // TV with a game (a runner jumping over blocks), the console's light, a beanbag.
      p.rect(264, floor - 12, 44, 12, "2");
      p.rect(264, floor - 7, 44, 1, "1");
      p.rect(270, floor - 10, 10, 3, "3");
      p.dot(278, floor - 9, Math.floor(t * 2) % 2 ? "w" : "2");
      p.rect(268, floor - 42, 36, 28, "3");
      p.rect(270, floor - 40, 32, 22, "1");
      p.rect(270, floor - 22, 32, 1, "2");
      const scroll = wrap(t * 14, 32);
      for (const o of [0, 16]) p.rect(270 + Math.round(wrap(o - scroll, 32)), floor - 25, 2, 3, "3");
      const jump = Math.max(0, Math.sin(wrap(t * 14, 16) / 16 * Math.PI * 2 - 0.6)) * 5;
      p.rect(276, floor - 26 - Math.round(jump), 2, 4, "w");
      p.rect(285, floor - 14, 2, 2, "3");
      p.rect(312, floor - 9, 16, 9, "2");
      p.rect(314, floor - 12, 12, 3, "2");
      p.rect(316, floor - 9, 8, 2, "1");

      // The server: two beige towers with blinking lights, a router on top, cables to the wall.
      for (const [i, x] of [336, 350].entries()) {
        p.rect(x, floor - 30, 12, 30, "4");
        p.rect(x + 2, floor - 27, 8, 2, "3");
        p.rect(x + 2, floor - 23, 8, 1, "3");
        p.dot(x + 3, floor - 18, (Math.floor(t * 6) + i) % 3 ? "w" : "3");
        p.dot(x + 6, floor - 18, (Math.floor(t * 5) + i * 2) % 4 ? "3" : "w");
        p.rect(x + 2, floor - 10, 8, 6, "3");
      }
      p.rect(338, floor - 33, 10, 3, "2");
      p.rect(346, floor - 38, 1, 5, "2");
      p.dot(340, floor - 32, Math.floor(t * 3) % 2 ? "w" : "3");
      seg(p, [348, floor - 2], [362, floor - 1], "2");

      // A tower of pizza boxes and a plant in the corner.
      for (let i = 0; i < 6; i++) {
        const x = 366 + ((i * 3) % 4) - 1;
        p.rect(x, floor - 4 - i * 4, 18, 4, i % 2 ? "3" : "2");
        p.rect(x, floor - 4 - i * 4, 18, 1, "4");
      }
      p.draw(S.plant, 388, floor - 10);

      // By the front door: a bike against the wall, a hoodie on a hook, sneakers on the mat.
      for (const cx of [412, 436]) {
        for (let a = 0; a < 40; a++) p.dot(cx + Math.round(7 * Math.cos((a / 40) * Math.PI * 2)), floor - 8 + Math.round(7 * Math.sin((a / 40) * Math.PI * 2)), "3");
        p.dot(cx, floor - 8, "3");
      }
      seg(p, [412, floor - 8], [422, floor - 8], "4");
      seg(p, [422, floor - 8], [419, floor - 20], "4");
      seg(p, [419, floor - 18], [432, floor - 18], "4");
      seg(p, [432, floor - 18], [436, floor - 8], "4");
      seg(p, [432, floor - 18], [431, floor - 22], "4");
      p.rect(429, floor - 23, 5, 1, "4");
      p.rect(417, floor - 21, 5, 1, "4");
      p.rect(450, floor - 58, 26, 58, "3");
      p.rect(452, floor - 56, 22, 56, "2");
      p.rect(455, floor - 52, 16, 20, "1");
      p.rect(455, floor - 28, 16, 20, "1");
      p.rect(470, floor - 30, 2, 2, "4");
      p.rect(446, floor, 34, 2, "2");
      p.rect(454, floor - 2, 5, 2, "4");
      p.rect(460, floor - 2, 5, 2, "4");
      p.rect(442, floor - 50, 4, 1, "4");
      p.rect(440, floor - 49, 8, 12, "2");
      p.rect(442, floor - 37, 4, 2, "2");
    },
  },
  /**
   * The home hero, a full-width strip: the workspace's packing room at night. A machine on the left folds boxes from a
   * stack of flat cardboard onto the belt; six chutes, one per app (mail, chat, notes, calendar, files, contacts), each
   * drop their thing into every box passing under them; the taping machine closes the full box and it leaves through
   * the strip curtain on the right. The screen counts boxes shipped, a forklift takes each full pallet away, someone
   * walks the line with a clipboard and someone at a desk keeps an eye on it all. Now and then a spam mail bounces off
   * into the bin, and some boxes leave with a star. `state` is the chute the pointer is over (its app lights up).
   * Every box moves `gap` px per `gap / v` s, so the drops line up by construction.
   */
  belt: {
    w: 480,
    h: 180,
    surface: "band",
    draw(p, t, state) {
      // The room is 100 px tall; above it, the wall goes on up the right side (the left stays plain for the hero text).
      const up = 80;
      p.rect(0, 0, p.w, up + 14, "0");
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      for (let x = 3; x < p.w; x += 8) p.dither(x, 0, 1, up, "0", "1", (_, yy) => 0.5 * Math.max(clamp((x - 250) / 60), clamp((yy - 62) / 18)));
      departures(p, t + 40);
      p.ctx.save();
      p.ctx.translate(0, up);
      packingRoom(p, t, state);
      p.ctx.restore();
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
  /** Card: a shared note with presence, named cursors and a live selection. */
  notes: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      // Tiny bitmap labels stay on the same pixel grid as the other illustrations.
      const glyphs: Record<string, string[]> = {
        A: [".5.", "5.5", "555", "5.5", "5.5"], B: ["55.", "5.5", "55.", "5.5", "55."],
        C: [".55", "5..", "5..", "5..", ".55"], E: ["555", "5..", "55.", "5..", "555"],
        H: ["5.5", "5.5", "555", "5.5", "5.5"], L: ["5..", "5..", "5..", "5..", "555"],
        N: ["5.5", "555", "555", "555", "5.5"], P: ["55.", "5.5", "55.", "5..", "5.."],
        U: ["5.5", "5.5", "5.5", "5.5", "555"],
      };
      const label = (text: string, x: number, y: number, color: ColorKey) => {
        [...text].forEach((letter, i) => {
          if (glyphs[letter]) p.draw(sprite(glyphs[letter]!), x + i * 4, y, { "5": color });
        });
      };
      p.rect(0, 0, 120, 66, "0");
      p.rect(5, 4, 110, 59, "1");
      p.rect(4, 3, 110, 59, "4");
      p.rect(5, 4, 108, 57, "0");
      label("LAUNCH PLAN", 10, 8, "5");
      p.rect(5, 17, 108, 1, "2");
      p.rect(90, 6, 9, 9, "5");
      p.rect(101, 6, 9, 9, "3");
      label("A", 93, 8, "0");
      label("B", 104, 8, "0");
      p.rect(12, 23, 57, 2, "5");
      p.rect(12, 33, 18, 1, "3");
      p.rect(33, 30, 43, 7, "2");
      p.rect(35, 33, 38, 1, "4");
      p.rect(76, 29, 1, 9, "4");
      p.rect(76, 22, 15, 7, "4");
      label("BEN", 78, 23, "0");
      p.rect(12, 42, 4, 4, "3");
      p.dot(13, 43, "0");
      p.rect(20, 43, 51, 1, "3");
      p.rect(12, 52, 4, 4, "3");
      p.rect(13, 53, 2, 2, "0");
      const end = 55 + Math.floor((Math.sin(t * 1.5) + 1) * 4);
      p.rect(20, 53, end - 20, 1, "4");
      p.rect(end, 49, 1, 9, "5");
      p.rect(end, 42, 19, 7, "5");
      label("ANNA", end + 2, 43, "0");
    },
  },
  /** Card: the team's address book, a pinboard of cards that fills as mail goes out. */
  contacts: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(8, 4, 72, 42, "4");
      p.rect(10, 6, 68, 38, "1");
      const faces: ColorKey[] = ["5", "4", "3", "5", "3", "4"];
      const slot = (i: number): [number, number] => [13 + (i % 3) * 22, 9 + Math.floor(i / 3) * 17];
      const cyc = wrap(t, 10.5);
      const filled = Math.min(6, Math.floor(cyc / 1.5));
      for (let i = 0; i < filled; i++) {
        const [x, y] = slot(i);
        p.rect(x, y, 18, 14, "3");
        p.rect(x + 1, y + 1, 16, 12, "0");
        p.rect(x + 3, y + 3, 4, 4, faces[i]!);
        p.rect(x + 9, y + 4, 6, 1, "4");
        p.rect(x + 9, y + 7, 4, 1, "2");
        p.rect(x + 3, y + 10, 12, 1, "2");
      }
      // Whoever sends the mail stands by the board; each letter becomes a card.
      p.draw(S.standing, 90, floor - 10);
      p.draw(S.plant, 106, floor - 10);
      if (filled < 6) {
        const [x, y] = slot(filled);
        fly(p, S.letter, [94, floor - 12], [x + 9, y + 7], (cyc % 1.5) / 1.2, 12);
      }
    },
  },
  /** Card: a shelf of folders the team shares, files filing in from a laptop. */
  drive: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(8, 6, 58, 52, "4");
      p.rect(10, 8, 54, 48, "1");
      const colors: ColorKey[] = ["3", "4", "5", "2"];
      const cyc = wrap(t, 11);
      const added = Math.min(9, Math.floor(cyc / 1.1));
      [26, 44, 56].forEach((base, r) => {
        if (r < 2) p.rect(10, base, 54, 2, "4");
        const count = r < 2 ? 12 : added;
        for (let j = 0; j < count; j++) {
          const h = 10 + ((j * 7 + r * 3) % 5);
          const x = 12 + j * 4;
          p.rect(x, base - h, 3, h, colors[(j + r) % 4]!);
          p.dot(x + 1, base - h + 2, "0");
        }
      });
      desk(p, 74, floor, t, 0, "5");
      p.draw(S.plant, 106, floor - 10);
      if (added < 9) fly(p, S.doc, [87, floor - 20], [13 + added * 4, 46], (cyc % 1.1) / 0.9, 14);
    },
  },
  /** Card: a channel on the wall screen, messages from three people stacking up, someone typing. */
  chat: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(10, 4, 74, 44, "5");
      p.rect(12, 6, 70, 40, "0");
      p.rect(12, 6, 14, 40, "1");
      for (let r = 0; r < 4; r++) p.rect(15, 10 + r * 5, r === 1 ? 9 : 7, 1, r === 1 ? "5" : "3");
      const cyc = wrap(t, 9);
      const lines: [ColorKey, number][] = [["5", 34], ["4", 26], ["3", 40], ["5", 20]];
      const shown = Math.min(4, Math.floor(cyc / 1.4) + 1);
      lines.slice(0, shown).forEach(([c, w], i) => {
        const y = 10 + i * 8;
        p.rect(30, y, 4, 4, c);
        p.rect(36, y, 12, 1, "4");
        p.rect(36, y + 2, w, 1, "2");
      });
      // The next message is being typed: three dots in the composer.
      if (shown < 4) for (let d = 0; d < 3; d++) p.rect(32 + d * 3, 41, 2, 2, Math.floor(t * 3) % 3 === d ? "5" : "3");
      p.draw(S.standing, 90, floor - 10);
      p.draw(S.plant, 106, floor - 10);
    },
  },
  /** Card: a week on the wall, meetings filling the days, one of them with the whole team. */
  calendar: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(8, 4, 76, 46, "4");
      p.rect(10, 6, 72, 42, "0");
      p.rect(10, 6, 72, 5, "1");
      for (let d = 0; d < 5; d++) {
        const x = 12 + d * 14;
        p.rect(x + 4, 8, 4, 1, "4");
        if (d) p.rect(x - 2, 11, 1, 37, "2");
      }
      const blocks: [number, number, number, ColorKey][] = [
        [0, 14, 5, "3"], [1, 13, 14, "4"], [2, 20, 9, "5"], [2, 33, 6, "3"], [3, 20, 6, "4"], [3, 34, 11, "3"], [4, 27, 9, "5"],
      ];
      const cyc = wrap(t, 9);
      const shown = Math.min(blocks.length, Math.floor(cyc / 0.9) + 1);
      blocks.slice(0, shown).forEach(([d, y, h, c]) => {
        p.rect(12 + d * 14, y, 12, h, c);
        p.rect(13 + d * 14, y + 1, 6, 1, "0");
      });
      p.draw(S.standing, 92, floor - 10);
      p.draw(S.plant, 106, floor - 10);
    },
  },
  /** Card: an AI app on the wall screen; its reply waits as a draft until someone presses Send. */
  ai: {
    w: 120,
    h: 66,
    surface: "page",
    draw(p, t) {
      const floor = 58;
      pageRoom(p, floor);
      p.rect(10, 4, 74, 44, "5");
      p.rect(12, 6, 70, 40, "0");
      const cyc = wrap(t, 8);
      const bubbles: [number, number, number, ColorKey][] = [
        [16, 10, 30, "3"],
        [48, 17, 30, "4"],
      ];
      bubbles.forEach(([x, y, w, c], i) => {
        if (cyc < 0.4 + i * 1.2) return;
        p.rect(x, y, w, 5, c);
        p.rect(x + 2, y + 2, w - 8, 1, "0");
      });
      if (cyc > 2.8) {
        // The draft card: a letter and its Send button, pressed a moment later.
        p.rect(16, 26, 62, 15, "4");
        p.rect(17, 27, 60, 13, "0");
        p.draw(S.letter, 20, 31);
        p.rect(30, 31, 22, 1, "3");
        p.rect(30, 34, 16, 1, "2");
        p.rect(62, 31, 12, 5, cyc > 4.6 ? "5" : "3");
      }
      p.draw(S.standing, 90, floor - 10);
      p.draw(S.plant, 106, floor - 10);
      fly(p, S.letter, [68, 33], [124, 4], (cyc - 4.8) / 1.6, 10);
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
