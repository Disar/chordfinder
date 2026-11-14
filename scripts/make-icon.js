// Renders icons/icon.png and icons/icon.ico (PNG-in-ICO) with no dependencies.
// Picture: a root node with arrows to two chords, one branching off.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed-distance shapes in a 256-unit design space.
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdSegment = (x, y, ax, ay, bx, by, w) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h) - w;
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG_TOP = hex('#262c55'), BG_BOT = hex('#13162b');
const LINE = hex('#9aa3c8'), ROOT = hex('#ffb454'), A = hex('#7c8cff'), B = hex('#4cd99a');

// `scale` < 1 shrinks the artwork inside the canvas (macOS icons leave a margin).
function render(size, scale = 1) {
  const s = (size / 256) * scale, out = Buffer.alloc(size * size * 4);
  const shift = 128 - 128 / scale;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / s + shift, y = (py + 0.5) / s + shift, aa = 0.5 / s;
      const cov = (d) => Math.max(0, Math.min(1, 0.5 - d / (2 * aa)));
      let c = [0, 0, 0], a = 0;
      const over = (col, alpha) => { c = c.map((v, i) => v * (1 - alpha) + col[i] * alpha); a = a + alpha * (1 - a); };
      const t = y / 256;
      over(BG_TOP.map((v, i) => v * (1 - t) + BG_BOT[i] * t), cov(sdRoundRect(x, y, 128, 128, 120, 120, 52)));
      if (a > 0) {
        const lines = Math.min(
          sdSegment(x, y, 72, 128, 150, 84, 7),
          sdSegment(x, y, 72, 128, 150, 172, 7),
          sdSegment(x, y, 150, 84, 204, 84, 7),
        );
        over(LINE, cov(lines) * a);
        over(ROOT, cov(sdCircle(x, y, 68, 128, 30)) * a);
        over(A, cov(sdCircle(x, y, 150, 84, 22)) * a);
        over(A, cov(sdCircle(x, y, 206, 84, 18)) * a);
        over(B, cov(sdCircle(x, y, 150, 172, 22)) * a);
      }
      const o = (py * size + px) * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = Math.round(a * 255);
    }
  }
  return png(size, out);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((sz) => render(sz));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((sz, i) => {
  const e = 6 + i * 16;
  header[e] = sz === 256 ? 0 : sz; header[e + 1] = sz === 256 ? 0 : sz;
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(new URL('../icons/icon.ico', import.meta.url), Buffer.concat([header, ...images]));
writeFileSync(new URL('../icons/icon.png', import.meta.url), images.at(-1));
// Small image shown under the cursor while dragging a MIDI file out.
writeFileSync(new URL('../icons/drag.png', import.meta.url), render(48));

// Linux bundles (AppImage/deb) use these PNG sizes.
const pngOf = Object.fromEntries(sizes.map((sz, i) => [sz, images[i]]));
writeFileSync(new URL('../icons/32x32.png', import.meta.url), pngOf[32]);
writeFileSync(new URL('../icons/128x128.png', import.meta.url), pngOf[128]);
writeFileSync(new URL('../icons/128x128@2x.png', import.meta.url), pngOf[256]);

// macOS .icns: PNG-compressed entries. The artwork is inset to ~80% of the
// canvas, like Apple's icon grid (824 of 1024).
const MAC_SCALE = 824 / 1024;
const macPng = new Map();
const mac = (sz) => macPng.get(sz) ?? macPng.set(sz, render(sz, MAC_SCALE)).get(sz);
const ICNS = [['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic13', 256], ['ic08', 256],
  ['ic14', 512], ['ic09', 512], ['ic10', 1024]];
const entries = ICNS.map(([type, sz]) => {
  const head = Buffer.alloc(8); head.write(type, 0, 'ascii');
  const data = mac(sz); head.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([head, data]);
});
const icnsHead = Buffer.alloc(8); icnsHead.write('icns', 0, 'ascii');
icnsHead.writeUInt32BE(8 + entries.reduce((n, e) => n + e.length, 0), 4);
writeFileSync(new URL('../icons/icon.icns', import.meta.url), Buffer.concat([icnsHead, ...entries]));

console.log('wrote icons/icon.ico, icon.icns, icon.png, 32x32.png, 128x128.png, 128x128@2x.png, drag.png');
