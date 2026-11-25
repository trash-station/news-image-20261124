// The World Today — Tuesday 24 November 2026.
//
// A program that draws a newspaper front page summing up the world's
// news of 24 November 2026 and writes it to /output/entry.png
// (1024x1024 PNG, about 20 KB). Node standard library only: no network,
// no fonts, no image files. Every pixel is drawn in code — a 5x7 bitmap
// font written for this entry, flat-shape pictograms, and a hand-written
// PNG encoder — so both runs write byte-identical output.
//
// Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- font --
// A 5x7 pixel font. Each glyph is 7 rows of 5 bits ("1" = ink).
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

// -------------------------------------------------------------- canvas --
type RGB = [number, number, number];

const PAPER: RGB = [246, 239, 220];
const PANEL: RGB = [255, 253, 245];
const PANEL_EDGE: RGB = [203, 191, 154];
const NAVY: RGB = [22, 35, 63];
const RED: RGB = [179, 38, 30];
const YELLOW: RGB = [242, 201, 76];
const INK: RGB = [26, 26, 26];
const GREY: RGB = [96, 92, 78];
const WHITE: RGB = [255, 255, 255];
const SEA: RGB = [36, 86, 166];
const HULL: RGB = [31, 36, 48];
const ORANGE: RGB = [232, 126, 24];
const LIGHT_GREY: RGB = [214, 210, 198];

class Canvas {
  readonly w: number;
  readonly h: number;
  private readonly buf: Uint8Array;

  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 3);
    this.rect(0, 0, w, h, bg);
  }

  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) this.set(i, j, c);
    }
  }

  frame(x: number, y: number, w: number, h: number, c: RGB): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
          this.set(x, y, c);
        }
      }
    }
  }

  // Filled triangle, scanline fill.
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        for (let x = Math.ceil(lo); x <= hi; x++) this.set(x, y, c);
      }
    }
  }

  // Explosion burst: spokes out of a centre plus a hot core.
  burst(cx: number, cy: number, r: number, c: RGB, core: RGB): void {
    for (let a = 0; a < 12; a++) {
      const ang = (a * Math.PI) / 6;
      const len = a % 2 === 0 ? r : Math.floor(r * 0.55);
      this.line(cx, cy, Math.round(cx + Math.cos(ang) * len), Math.round(cy + Math.sin(ang) * len), c);
    }
    this.disc(cx, cy, Math.max(3, Math.floor(r * 0.35)), core);
  }

  textWidth(s: string, scale: number): number {
    if (s.length === 0) return 0;
    return s.length * 6 * scale - scale;
  }

  text(s: string, x: number, y: number, scale: number, c: RGB): void {
    let cx = x;
    for (const ch of s) {
      const g = FONT[ch] ?? FONT[" "];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (g[row][col] === "1") {
            this.rect(cx + col * scale, y + row * scale, scale, scale, c);
          }
        }
      }
      cx += 6 * scale;
    }
  }

  textCentred(s: string, cx: number, y: number, scale: number, c: RGB): void {
    this.text(s, Math.round(cx - this.textWidth(s, scale) / 2), y, scale, c);
  }

  // Greedy word wrap to a pixel width; returns the lines.
  wrap(s: string, maxW: number, scale: number): string[] {
    const words = s.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const next = cur === "" ? word : cur + " " + word;
      if (this.textWidth(next, scale) <= maxW || cur === "") {
        cur = next;
      } else {
        lines.push(cur);
        cur = word;
      }
    }
    if (cur !== "") lines.push(cur);
    return lines;
  }

  paragraph(s: string, x: number, y: number, maxW: number, scale: number, c: RGB, step: number): number {
    const lines = this.wrap(s, maxW, scale);
    let yy = y;
    for (const line of lines) {
      this.text(line, x, yy, scale, c);
      yy += step;
    }
    return yy;
  }

  row(y: number): Uint8Array {
    return this.buf.subarray(y * this.w * 3, (y + 1) * this.w * 3);
  }
}

// ------------------------------------------------------------ png encode --
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(cv: Canvas): Buffer {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 3 + 1)] = 0; // filter: none
    Buffer.from(cv.row(y)).copy(raw, y * (cv.w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ page --
const W = 1024;
const H = 1024;

function drawMasthead(cv: Canvas): void {
  cv.rect(16, 16, 992, 132, NAVY);
  cv.textCentred("THE WORLD TODAY", 512, 42, 9, WHITE);
  cv.textCentred("TUESDAY 24 NOVEMBER 2026", 512, 116, 3, YELLOW);
  cv.rect(16, 148, 992, 8, RED);
}

function drawTanker(cv: Canvas): void {
  // Sea with wave dashes.
  cv.rect(32, 392, 324, 52, SEA);
  for (let i = 0; i < 8; i++) {
    cv.rect(44 + i * 40, 406 + (i % 2) * 14, 22, 3, WHITE);
    cv.rect(56 + i * 38, 424 - (i % 2) * 12, 18, 3, WHITE);
  }
  // Hull with slanted bow, red waterline stripe, deck cargo.
  cv.rect(48, 336, 272, 56, HULL);
  cv.tri(320, 336, 356, 392, 320, 392, HULL);
  cv.rect(48, 336, 272, 8, RED);
  cv.rect(64, 304, 44, 32, LIGHT_GREY);
  cv.frame(64, 304, 44, 32, INK);
  cv.rect(118, 312, 44, 24, LIGHT_GREY);
  cv.frame(118, 312, 44, 24, INK);
  cv.rect(172, 304, 44, 32, LIGHT_GREY);
  cv.frame(172, 304, 44, 32, INK);
  cv.rect(232, 288, 30, 48, HULL);
  cv.rect(232, 288, 30, 10, RED);
  cv.rect(288, 296, 40, 40, WHITE);
  cv.frame(288, 296, 40, 40, INK);
  cv.rect(296, 306, 10, 8, NAVY);
  cv.rect(312, 306, 10, 8, NAVY);
  // Naval mine and explosion above the ship.
  const mx = 326;
  const my = 244;
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    cv.line(mx, my, Math.round(mx + Math.cos(ang) * 22), Math.round(my + Math.sin(ang) * 22), INK);
  }
  cv.disc(mx, my, 13, INK);
  cv.disc(mx - 4, my - 4, 4, GREY);
  cv.burst(268, 224, 30, ORANGE, YELLOW);
}

function drawLead(cv: Canvas): void {
  cv.rect(16, 172, 992, 288, PANEL);
  cv.frame(16, 172, 992, 288, PANEL_EDGE);
  drawTanker(cv);
  cv.text("MIDDLE EAST - WAR AT SEA", 380, 192, 2, RED);
  cv.text("FOUR TANKERS HIT", 380, 222, 4, INK);
  cv.text("MINES IN HORMUZ", 380, 254, 4, INK);
  cv.paragraph(
    "IRAN SAYS FOUR TANKERS STRUCK NAVAL MINES IN THE STRAIT OF HORMUZ AND CAUGHT FIRE. THE IRGC ALSO SAYS ITS NAVY ATTACKED A CONTAINER SHIP.",
    380,
    300,
    612,
    2,
    INK,
    26,
  );
  cv.rect(380, 392, 612, 2, PANEL_EDGE);
  cv.text("ALSO: DRONE HITS RIYADH TOWER, 11 HURT", 380, 408, 2, RED);
}

function drawCourthouse(cv: Canvas, cx: number): void {
  cv.tri(cx - 108, 538, cx + 108, 538, cx, 494, NAVY);
  cv.rect(cx - 108, 538, 216, 8, NAVY);
  cv.rect(cx - 96, 546, 16, 28, NAVY);
  cv.rect(cx - 8, 546, 16, 28, NAVY);
  cv.rect(cx + 80, 546, 16, 28, NAVY);
  cv.rect(cx - 108, 574, 216, 6, NAVY);
}

function drawStorefront(cv: Canvas, cx: number): void {
  // Striped awning.
  cv.rect(cx - 152, 500, 304, 26, RED);
  for (let i = 0; i < 8; i++) {
    cv.rect(cx - 152 + i * 38, 500, 19, 26, WHITE);
  }
  // Shop front with door and windows.
  cv.rect(cx - 140, 526, 280, 50, PANEL);
  cv.frame(cx - 140, 526, 280, 50, INK);
  cv.rect(cx - 118, 540, 56, 36, NAVY);
  cv.rect(cx - 96, 548, 12, 10, YELLOW);
  cv.rect(cx + 62, 540, 56, 36, NAVY);
  cv.rect(cx + 84, 548, 12, 10, YELLOW);
  cv.rect(cx - 22, 540, 44, 36, INK);
  // Red badge with the number held.
  cv.disc(cx + 118, 516, 26, RED);
  cv.textCentred("25", cx + 118, 505, 3, WHITE);
}

function drawShipAndDrone(cv: Canvas, cx: number): void {
  // Sea line under the ship only, not a bar across the whole panel.
  cv.rect(cx - 140, 800, 260, 12, SEA);
  cv.rect(cx - 130, 772, 190, 28, HULL);
  cv.tri(cx + 60, 772, cx + 92, 800, cx + 60, 800, HULL);
  cv.rect(cx - 130, 772, 190, 6, RED);
  cv.rect(cx - 108, 748, 36, 24, WHITE);
  cv.frame(cx - 108, 748, 36, 24, INK);
  cv.line(cx - 96, 748, cx - 96, 730, INK);
  // Drone above the ship, with a dashed drop line.
  const dx = cx + 120;
  const dy = 758;
  cv.disc(dx, dy, 9, INK);
  cv.line(dx - 22, dy - 10, dx + 22, dy + 10, INK);
  cv.line(dx - 22, dy + 10, dx + 22, dy - 10, INK);
  cv.disc(dx - 26, dy - 12, 6, GREY);
  cv.disc(dx + 26, dy - 12, 6, GREY);
  cv.disc(dx - 26, dy + 12, 6, GREY);
  cv.disc(dx + 26, dy + 12, 6, GREY);
  for (let y = dy + 12; y < 770; y += 8) cv.rect(dx - 1, y, 2, 4, RED);
  cv.burst(cx - 30, 762, 16, ORANGE, YELLOW);
}

function drawRocket(cv: Canvas, cx: number): void {
  cv.tri(cx - 20, 772, cx + 20, 772, cx, 748, RED);
  cv.rect(cx - 20, 772, 40, 34, WHITE);
  cv.frame(cx - 20, 772, 40, 34, INK);
  cv.disc(cx, 786, 6, SEA);
  cv.tri(cx - 20, 806, cx - 36, 820, cx - 20, 796, RED);
  cv.tri(cx + 20, 806, cx + 36, 820, cx + 20, 796, RED);
  cv.burst(cx, 818, 14, ORANGE, YELLOW);
  // Stars around the rocket.
  cv.disc(cx - 150, 762, 3, INK);
  cv.disc(cx + 140, 756, 3, INK);
  cv.disc(cx + 160, 796, 3, INK);
  cv.disc(cx - 130, 800, 3, INK);
}

function drawMiddleRow(cv: Canvas): void {
  // Huawei panel.
  cv.rect(16, 476, 484, 248, PANEL);
  cv.frame(16, 476, 484, 248, PANEL_EDGE);
  drawCourthouse(cv, 258);
  cv.text("TECH - US-CHINA", 32, 586, 2, RED);
  cv.text("HUAWEI GUILTY OF", 32, 610, 3, INK);
  cv.text("TRADE-SECRETS THEFT", 32, 634, 3, INK);
  cv.paragraph(
    "A US JURY FOUND HUAWEI GUILTY OF STEALING TRADE SECRETS AND BANK FRAUD. RACKETEERING: NOT GUILTY.",
    32,
    664,
    452,
    2,
    INK,
    24,
  );

  // Cartagena panel.
  cv.rect(524, 476, 484, 248, PANEL);
  cv.frame(524, 476, 484, 248, PANEL_EDGE);
  drawStorefront(cv, 766);
  cv.text("AMERICAS - HOSTAGES", 540, 586, 2, RED);
  cv.text("25 HELD HOSTAGE", 540, 610, 3, INK);
  cv.text("IN CARTAGENA STORE", 540, 634, 3, INK);
  cv.paragraph(
    "ARMED MEN SEIZED A SUPERMARKET IN CARTAGENA, COLOMBIA. FIVE OLDER WOMEN WERE FREED.",
    540,
    664,
    452,
    2,
    INK,
    24,
  );
}

function drawBottomRow(cv: Canvas): void {
  // Ukraine ships panel.
  cv.rect(16, 740, 484, 212, PANEL);
  cv.frame(16, 740, 484, 212, PANEL_EDGE);
  drawShipAndDrone(cv, 258);
  cv.text("EUROPE - WAR AT SEA", 32, 824, 2, RED);
  cv.text("UKRAINE HITS", 32, 846, 3, INK);
  cv.text("RUSSIAN SHIPS", 32, 870, 3, INK);
  cv.paragraph(
    "DRONES STRUCK A CARGO SHIP IN THE GULF OF FINLAND AND A WARSHIP OFF LIBYA.",
    32,
    896,
    452,
    2,
    INK,
    22,
  );

  // Shenzhou crew panel.
  cv.rect(524, 740, 484, 212, PANEL);
  cv.frame(524, 740, 484, 212, PANEL_EDGE);
  drawRocket(cv, 766);
  cv.text("SPACE - CHINA", 540, 824, 2, RED);
  cv.text("CHINA NAMES FIRST", 540, 846, 3, INK);
  cv.text("PAKISTANI ASTRONAUT", 540, 870, 3, INK);
  cv.paragraph(
    "ZEESHAN ALI, 40, WILL FLY ON SHENZHOU-24 TO TIANGONG - THE STATION'S FIRST FOREIGN GUEST.",
    540,
    896,
    452,
    2,
    INK,
    22,
  );
}

function drawFooter(cv: Canvas): void {
  cv.textCentred("REPORTED 24 NOVEMBER 2026", 512, 966, 2, GREY);
  cv.textCentred("SOURCES: REUTERS, AFP, AP", 512, 990, 2, GREY);
}

function main(): void {
  const cv = new Canvas(W, H, PAPER);
  drawMasthead(cv);
  drawLead(cv);
  drawMiddleRow(cv);
  drawBottomRow(cv);
  drawFooter(cv);

  const png = encodePNG(cv);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} ${png.length} bytes sha256=${sha}`);
}

main();
