import { Pix, type Scene, sprite } from "./pixel";

/** One clock for the scanner, attachment, delivery and acknowledgement. */
export function officePhase(t: number) {
  const time = ((t % 12) + 12) % 12;
  return { time, phase: time < 3 ? "scan" : time < 5 ? "file" : time < 8 ? "send" : time < 10 ? "receive" : "rest" };
}

const file = sprite(["aaaaaa..", "awwwwaa.", "awwwawaa", "awwwwwwa", "awaaaawa", "awwwwwwa", "awaaaawa", "awwwwwwa", "aaaaaaaa"]);
const envelope = sprite(["aaaaaaaaaaaa", "awwwwwwwwwwa", "aawwwwwwwwaa", "awawwwwwwawa", "awwawwwwawwa", "awwwaaaawwwa", "awwwwwwwwwwa", "aaaaaaaaaaaa"]);

const ease = (v: number) => {
  const k = Math.max(0, Math.min(1, v));
  return k * k * (3 - 2 * k);
};

const gesture = (t: number, start: number, end: number, ramp = 0.5) =>
  ease((t - start) / ramp) * (1 - ease((t - end + ramp) / ramp));

/** Same room and desk positions as the original hero, with details on a 480×320 grid. */
export const office: Scene = {
  w: 480, h: 320, surface: "band",
  draw(target, seconds) {
    const { time: t, phase } = officePhase(seconds);
    const p = new Pix(target.ctx, 480, 320, {
      ...target.pal, "0": "#141414", "1": "#242628", "2": "#363b3e", "3": "#858b8c", "4": "#c4b29b", "5": "#e5cfb2",
      a: "#d6402f", b: "#627d65", w: "#fef2d8",
    });
    p.rect(0, 0, 480, 320, "0");
    // Cool city, keeping the original panes, sill and low skyline behind the copy.
    for (const [left, right, high] of [[0, 300, 20], [308, 480, 44]]) {
      p.rect(left!, 0, right! - left!, 216, "1");
      for (let i = 0; i < 16; i++) {
        const x = left! + ((i * 47 + 13) % (right! - left!));
        p.dot(x, 12 + ((i * 31) % 160), "2");
      }
      for (let x = left!; x < right!; x += 18) {
        const h = 10 + ((x * 7) % (high! - 10));
        p.rect(x, 216 - h, Math.min(16, right! - x), h, "2");
        for (let y = 220 - h; y < 214; y += 6) {
          for (let wx = x + 3; wx < Math.min(x + 15, right!); wx += 5) if ((wx + y) % 3 === 0) p.dot(wx, y, "3");
        }
      }
    }
    p.rect(420, 56, 7, 7, "w");
    p.rect(0, 216, 480, 6, "2");
    p.rect(0, 222, 480, 62, "0");
    p.rect(0, 284, 480, 36, "1");
    p.rect(0, 284, 480, 1, "2");
    for (let y = 289; y < 320; y += 6) for (let x = (y * 7) % 26; x < 480; x += 52) p.rect(x, y, 2, 1, "2");

    // Low office furniture keeps the upper window area clear for the headline.
    p.rect(219, 250, 24, 34, "2");
    p.rect(221, 252, 20, 12, "0");
    p.rect(221, 266, 20, 15, "0");
    for (let i = 0; i < 5; i++) {
      p.rect(223 + i * 3, 254 + i % 2, 2, 9 - i % 2, i % 2 ? "b" : "4");
      p.dot(223 + i * 3, 257, "0");
    }
    p.rect(224, 270, 14, 3, "3");
    p.rect(225, 274, 12, 3, "4");
    p.rect(228, 245, 8, 5, "2");
    p.rect(231, 237, 2, 9, "b");
    p.rect(225, 239, 7, 3, "b");
    p.rect(233, 235, 6, 4, "b");

    for (const x of [32, 132, 272, 380]) {
      // Warm pendant light and a restrained pool on the desktop.
      p.rect(x + 25, 222, 1, 8, "2");
      p.rect(x + 20, 230, 11, 3, "4");
      p.rect(x + 22, 233, 7, 1, "w");
      p.dither(x + 12, 234, 27, 27, "0", "4", 0.06);
      if (x !== 272) {
        const receiving = x === 132 && t >= 8 && t < 10;
        const coffee = x === 32 ? gesture(t, 3.8, 7.3, 0.9) : x === 380 ? gesture(t, 0.8, 4.2, 0.9) : 0;
        const cupX = x + 43 - Math.round(coffee * 10);
        const cupY = 256 - Math.round(coffee * 17);
        const acknowledgement = ease((t - 8.3) / 0.4) * (1 - ease((t - 9.2) / 0.5));
        const nod = receiving ? Math.round(Math.sin(acknowledgement * Math.PI) * 2) : 0;
        const tap = receiving || coffee > 0 ? 0 : Math.floor(t * 4 + x) % 2;
        const hand = receiving ? Math.round(acknowledgement * 8) : tap;
        // Chair, hair, face, neck and shirt, each with single-pixel highlights.
        p.rect(x + 8, 241, 36, 27, "2");
        p.rect(x + 10, 243, 32, 23, "0");
        p.rect(x + 8, 244, 2, 20, "3");
        p.rect(x + 42, 244, 2, 20, "3");
        // Seat and bent legs remain visible below the front edge of the desk.
        p.rect(x + 12, 268, 29, 3, "3");
        p.rect(x + 17, 267, 7, 6, "2");
        p.rect(x + 30, 267, 7, 6, "2");
        p.rect(x + 18, 273, 5, 7, "2");
        p.rect(x + 31, 273, 5, 7, "2");
        p.rect(x + 15, 279, 8, 3, "3");
        p.rect(x + 31, 279, 8, 3, "3");
        p.rect(x + 25, 271, 2, 11, "3");
        p.rect(x + 13, 282, 27, 1, "2");
        p.rect(x + 12, 282, 3, 2, "3");
        p.rect(x + 38, 282, 3, 2, "3");
        p.rect(x + 11, 244, 30, 17, x === 380 ? "b" : "3");
        p.rect(x + 23, 239 + nod, 5, 6, "4");
        p.rect(x + 20, 230 + nod, 12, 10, "5");
        p.rect(x + 19, 228 + nod, 13, 4, "2");
        p.rect(x + 19, 232 + nod, 3, 5, "2");
        p.rect(x + 29, 234 + nod, (t + x) % 5 < 0.16 ? 2 : 1, 1, "0");
        p.rect(x + 31, 236 + nod, 2, 2, "4");
        p.rect(x + 13, 255 - tap, 6, 3, "5");
        const sleeve = x === 380 ? "b" : "3";
        if (coffee > 0) {
          p.rect(x + 37, 247, 4, 10, sleeve);
          p.rect(cupX + 2, cupY + 3, 4, 255 - cupY, sleeve);
          p.rect(cupX, cupY + 3, 5, 3, "5");
        } else {
          p.rect(x + 36, 251 - hand, 3, 7, sleeve);
          p.rect(x + 34, 255 - hand, 5, 3, "5");
        }
        p.rect(x + 17, 247, 20, 13, "2");
        p.rect(x + 19, 249, 16, 9, receiving ? "a" : "0");
        p.rect(x + 21, 251, receiving ? 10 : 6, 1, receiving ? "w" : "3");
        p.rect(x + 21, 254, 8, 1, "3");
        if (x === 132 && t >= 8.6 && t < 10) {
          // Open attachment, read its lines, then mark it approved.
          p.rect(x + 21, 250, 9, 7, "w");
          for (let row = 0; row < 3; row++) p.rect(x + 23, 251 + row * 2, 5 - row % 2, 1, "3");
          if (t > 9.3) {
            p.dot(x + 31, 254, "b"); p.dot(x + 32, 255, "b");
            p.dot(x + 33, 254, "b"); p.dot(x + 34, 253, "b");
          }
        } else if (!receiving) {
          const row = Math.floor(t * 2 + x) % 3;
          p.rect(x + 21, 250 + row * 2, 10, 1, "3");
          p.dot(x + 22 + Math.floor(t * 3) % 8, 256, "4");
        }
        p.rect(x + 25, 260, 3, 2, "3");
        p.rect(x + 15, 262, 25, 1, "3");
        p.rect(cupX, cupY, 5, 6, "4");
        p.rect(cupX + 5, cupY + 1, 2, 3, "4");
        p.rect(cupX + 1, cupY, 3, 1, "0");
        if (coffee === 0) {
          for (let i = 0; i < 2; i++) {
            const rise = (t * 2 + i * 3) % 6;
            p.dot(cupX + 1 + Math.round(Math.sin((t / 12 * Math.PI * 2) + i)), cupY - 2 - rise, "2");
          }
        }
      }
      p.rect(x, 262, 52, 4, "4");
      p.rect(x, 266, 52, 1, "2");
      p.rect(x + 2, 267, 2, 17, "3");
      p.rect(x + 48, 267, 2, 17, "2");
    }
    // The formerly empty station: operator, paper tray and flatbed scanner.
    p.rect(302, 235, 11, 10, "5");
    p.rect(301, 232, 13, 5, "2");
    p.dot(303, 239, "0");
    p.rect(303, 245, 5, 3, "4");
    p.rect(300, 248, 16, 19, "b");
    p.rect(300, 267, 5, 17, "2");
    p.rect(310, 267, 5, 17, "2");
    p.rect(298, 282, 8, 2, "3");
    p.rect(309, 282, 8, 2, "3");
    const reach = gesture(t, 0, 1.2, 0.4) + gesture(t, 2.5, 3.6, 0.4);
    const filing = gesture(t, 3.6, 4.8, 0.4);
    const handX = 301 - Math.round(reach * 12 + filing * 27);
    const handY = 259 - Math.round(reach * 8 + filing * 4);
    p.rect(handX + 3, handY, 303 - handX, 4, "b");
    p.rect(handX, handY, 5, 3, "5");
    p.rect(276, 249, 22, 12, "3");
    const lid = Math.max(gesture(t, 0, 1.2, 0.3), gesture(t, 2.5, 4.5, 0.4));
    const lidHeight = Math.round(lid * 13);
    p.rect(277, 247 - lidHeight, 20, 3, "4");
    p.rect(296, 247 - lidHeight, 1, lidHeight + 2, "3");
    if (lidHeight > 3) p.rect(279, 250 - lidHeight, 15, 1, "w");
    p.rect(279, 250, 16, 6, "2");
    p.rect(281, 251, 12, 4, "w");
    if (t < 0.7) {
      p.rect(294 - Math.round(ease(t / 0.7) * 11), 248, 10, 2, "w");
    }
    if (t >= 1.2 && t < 2.5) {
      p.rect(281, 251 + Math.floor((t - 1.2) / 1.3 * 4), 12, 1, "b");
      p.rect(282, 258, Math.round((t - 1.2) / 1.3 * 12), 1, "b");
    }
    if (t >= 2.8 && t < 4.5) {
      const k = ease((t - 2.8) / 1.3);
      p.rect(282 - Math.round(k * 14), 248 + Math.round(k * 6), 10, 2, "w");
      p.rect(284 - Math.round(k * 14), 248 + Math.round(k * 6), 5, 1, "3");
    }
    p.rect(278, 258, 2, 1, phase === "scan" ? "b" : "a");
    p.rect(267, 257, 8, 5, "2");
    p.rect(268, 256, 7, 1, "w");
    p.rect(269, 254, 6, 1, "4");

    // Scanner and recipient stay within the central crop on a phone.
    if (phase === "file") {
      const rise = ease((t - 3) / 1.4);
      p.draw(file, 280, 247 - Math.round(rise * 18));
      // Envelope grows around the attachment before it leaves the scanner.
      if (t > 4.4) {
        const h = Math.round(ease((t - 4.4) / 0.6) * 8);
        p.rect(278, 237 - h, 12, h, "a");
        if (h > 3) p.rect(280, 239 - h, 8, h - 3, "w");
      }
    }
    if (phase === "send") {
      const k = (t - 5) / 3;
      const e = ease(k);
      p.draw(envelope, 278 + (151 - 278) * e, 229 + 8 * e - Math.sin(Math.PI * e) * 15);
    }
    if (phase === "receive" && t < 8.6) {
      p.draw(envelope, 151, 237 + Math.round(ease((t - 8) / 0.6) * 12));
    }
    // A small receipt returns to the scanner before the quiet end of the loop.
    if (t >= 9.6 && t < 10.8) {
      const k = ease((t - 9.6) / 1.2);
      const x = 160 + 124 * k;
      const y = 242 - Math.sin(k * Math.PI) * 14;
      p.rect(x, y, 7, 6, "b");
      p.dot(x + 1, y + 2, "w"); p.dot(x + 2, y + 3, "w");
      p.dot(x + 3, y + 2, "w"); p.dot(x + 4, y + 1, "w");
    }
    if (t >= 10.8 && t < 11.5) {
      p.rect(282, 240, 7, 6, "b");
      p.dot(284, 243, "w"); p.dot(285, 242, "w"); p.dot(286, 241, "w");
    }
    // Quiet plants at the same edges as the original room.
    for (const x of [5, 459]) {
      p.rect(x + 7, 271, 1, 9, "b");
      p.rect(x + 2, 269, 6, 4, "b");
      p.rect(x + 8, 264, 6, 5, "b");
      p.dot(x + 12, 263, "b");
      p.rect(x + 3, 279, 11, 6, "2");
      p.rect(x + 4, 279, 9, 1, "4");
    }
    p.dither(0, 302, 480, 18, "1", "p", (_x, y) => (y - 302) / 18);
  },
};
