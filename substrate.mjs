/**
 * Classificació conservadora del substrat geològic per al model de Boletada.
 *
 * No pretén substituir un mapa edafològic ni estimar un pH exacte. Tradueix la
 * litologia 1:250.000 de l'ICGC a tres senyals amplis que sí són útils per a
 * priors micològics: silícic, calcari i mixt. La resta queda com a desconegut.
 */

export const SUBSTRATE = Object.freeze({ unknown:0, siliceous:1, calcareous:2, mixed:3 });
export const SUBSTRATE_BY_CODE = Object.freeze([null, "siliceous", "calcareous", "mixed"]);

const normalized = (text = "") => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const SILICEOUS = [
  /\bgranit/, /\bgranodiorit/, /\bleucogranit/, /\bgranitoid/, /\bgneiss/,
  /\bpissarr/, /\besquist/, /\bquars/, /\blidit/, /\bradiolarit/, /\bgrauvac/,
  /\bpegmatit/, /\baplit/, /\briol/, /\broques? acides?\b/, /\btufs? acids?\b/,
];
const CALCAREOUS = [
  /\bcalcari/, /\bdolomi/, /\bmargues?\b/, /\bmargocalc/, /\bcalcarenit/,
  /\bcarbonatic/, /\bcalcopelit/, /\btravert/,
];

export function classifyLithology(description, protolith = "") {
  const text = normalized(`${description} ${protolith}`);
  const siliceous = SILICEOUS.some((pattern) => pattern.test(text));
  const calcareous = CALCAREOUS.some((pattern) => pattern.test(text));
  if (siliceous && calcareous) return SUBSTRATE.mixed;
  if (siliceous) return SUBSTRATE.siliceous;
  if (calcareous) return SUBSTRATE.calcareous;
  return SUBSTRATE.unknown;
}

function envelopeBytes(flags) {
  return [0, 32, 48, 48, 64][(flags >> 1) & 0x07] ?? 0;
}

function readUInt32(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function readDouble(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readDoubleLE(offset) : buffer.readDoubleBE(offset);
}

function parseWkb(buffer, start) {
  let offset = start;
  const littleEndian = buffer[offset++] === 1;
  const rawType = readUInt32(buffer, offset, littleEndian); offset += 4;
  const type = rawType % 1000;
  const dimensions = rawType >= 3000 ? 4 : rawType >= 1000 ? 3 : 2;

  if (type === 3) {
    const ringCount = readUInt32(buffer, offset, littleEndian); offset += 4;
    const rings = [];
    for (let ring = 0; ring < ringCount; ring++) {
      const pointCount = readUInt32(buffer, offset, littleEndian); offset += 4;
      const points = new Array(pointCount);
      for (let point = 0; point < pointCount; point++) {
        points[point] = [readDouble(buffer, offset, littleEndian), readDouble(buffer, offset + 8, littleEndian)];
        offset += dimensions * 8;
      }
      rings.push(points);
    }
    return { polygons:[rings], offset };
  }

  if (type === 6) {
    const polygonCount = readUInt32(buffer, offset, littleEndian); offset += 4;
    const polygons = [];
    for (let polygon = 0; polygon < polygonCount; polygon++) {
      const parsed = parseWkb(buffer, offset);
      polygons.push(...parsed.polygons);
      offset = parsed.offset;
    }
    return { polygons, offset };
  }

  throw new Error(`Geometria WKB no compatible: tipus ${rawType}`);
}

export function decodeGeoPackagePolygons(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (buffer.toString("ascii", 0, 2) !== "GP") throw new Error("Geometria GeoPackage invàlida");
  const offset = 8 + envelopeBytes(buffer[3]);
  return parseWkb(buffer, offset).polygons;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x, y, rings) {
  if (!rings.length || !pointInRing(x, y, rings[0])) return false;
  for (let hole = 1; hole < rings.length; hole++) if (pointInRing(x, y, rings[hole])) return false;
  return true;
}

export function rasterizeSubstrate(rows, grid, forestHosts) {
  const { width, height, cell, x0, y1 } = grid;
  const substrate = new Uint8Array(width * height);
  const counts = new Uint32Array(4);

  for (const row of rows) {
    const code = classifyLithology(row.description, row.protolith);
    if (!code) continue;
    const polygons = decodeGeoPackagePolygons(row.geometry);
    const colStart = Math.max(0, Math.ceil((row.minx - x0) / cell - 0.5));
    const colEnd = Math.min(width - 1, Math.floor((row.maxx - x0) / cell - 0.5));
    const rowStart = Math.max(0, Math.ceil((y1 - row.maxy) / cell - 0.5));
    const rowEnd = Math.min(height - 1, Math.floor((y1 - row.miny) / cell - 0.5));
    if (colStart > colEnd || rowStart > rowEnd) continue;

    for (let gridRow = rowStart; gridRow <= rowEnd; gridRow++) {
      const y = y1 - (gridRow + 0.5) * cell;
      for (let col = colStart; col <= colEnd; col++) {
        const index = gridRow * width + col;
        if (forestHosts && !forestHosts[index]) continue;
        const x = x0 + (col + 0.5) * cell;
        if (polygons.some((polygon) => pointInPolygon(x, y, polygon))) substrate[index] = code;
      }
    }
  }

  for (let i = 0; i < substrate.length; i++) if (!forestHosts || forestHosts[i]) counts[substrate[i]]++;
  return { substrate, counts };
}
