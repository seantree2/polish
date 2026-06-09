// Generates all app icons at build/run time using only Node built-ins (zlib).
// No binary image files are committed to the repo — everything is drawn here.
// Output:
//   build/icon.png            512x512 colour icon (electron-builder makes .ico/.icns from this)
//   assets/tray.png           32x32  colour tray icon (Windows / Linux)
//   assets/trayTemplate.png   16x16  black silhouette (macOS menu bar)
//   assets/trayTemplate@2x.png 32x32 black silhouette (macOS retina menu bar)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- drawing ----
function drawIcon(size, kind) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const radius = size * 0.22;
  const arm = size * 0.34;
  const thick = size * 0.085;
  const brand = [124, 92, 231]; // #7C5CE7
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // four-point sparkle (tapered plus)
      const star =
        (ay < thick * (1 - ax / arm) && ax < arm) ||
        (ax < thick * (1 - ay / arm) && ay < arm);

      if (kind === 'template') {
        if (star) { buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255; }
        else buf[i + 3] = 0;
        continue;
      }

      // colour icon: rounded square background + white sparkle
      const half = c - size * 0.06;
      const qx = ax - (half - radius);
      const qy = ay - (half - radius);
      let inside;
      if (qx <= 0 || qy <= 0) inside = ax <= half && ay <= half;
      else inside = qx * qx + qy * qy <= radius * radius;

      if (star && inside) { buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255; }
      else if (inside) { buf[i] = brand[0]; buf[i + 1] = brand[1]; buf[i + 2] = brand[2]; buf[i + 3] = 255; }
      else buf[i + 3] = 0;
    }
  }
  return buf;
}

function write(file, size, kind) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(size, drawIcon(size, kind)));
  console.log('wrote', path.relative(process.cwd(), file));
}

const root = path.join(__dirname, '..');
write(path.join(root, 'build', 'icon.png'), 512, 'color');
write(path.join(root, 'assets', 'tray.png'), 32, 'color');
write(path.join(root, 'assets', 'trayTemplate.png'), 16, 'template');
write(path.join(root, 'assets', 'trayTemplate@2x.png'), 32, 'template');
