import { deflateSync, inflateSync } from "node:zlib";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

let crcTable;
function crc32(buf) {
  crcTable ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}

export function encodeRgbaPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (width * 4 + 1); rows[dst] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, dst + 1);
  }
  return Buffer.concat([PNG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Decoder mínim per als PNG RGBA de l'ICGC (sense dependències npm).
export function decodeRgbaPng(png) {
  if (!png.subarray(0, 8).equals(PNG)) throw new Error("PNG invàlid");
  let off = 8, width, height, depth, colorType, interlace, compressed = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off), type = png.toString("ascii", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len); off += len + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0) throw new Error("Cal un PNG RGBA de 8 bits no entrellaçat");
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * 4, rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const src = y * (stride + 1), filter = raw[src], row = raw.subarray(src + 1, src + 1 + stride);
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[dst + x - 4] : 0;
      const b = y ? rgba[dst + x - stride] : 0;
      const c = y && x >= 4 ? rgba[dst + x - stride - 4] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`Filtre PNG no suportat: ${filter}`);
      rgba[dst + x] = v & 255;
    }
  }
  return { width, height, rgba };
}

