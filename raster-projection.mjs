const PI = Math.PI;
const DEG_TO_RAD = PI / 180;

export function wgs84ToUtm31(lon, lat) {
  const a = 6378137;
  const eccentricity = 0.00669438;
  const scale = 0.9996;
  const phi = lat * DEG_TO_RAD;
  const lambda = lon * DEG_TO_RAD;
  const centralMeridian = 3 * DEG_TO_RAD;
  const secondEccentricity = eccentricity / (1 - eccentricity);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const n = a / Math.sqrt(1 - eccentricity * sinPhi ** 2);
  const t = tanPhi ** 2;
  const c = secondEccentricity * cosPhi ** 2;
  const A = cosPhi * (lambda - centralMeridian);
  const m = a * (
    (1 - eccentricity / 4 - 3 * eccentricity ** 2 / 64 - 5 * eccentricity ** 3 / 256) * phi
    - (3 * eccentricity / 8 + 3 * eccentricity ** 2 / 32 + 45 * eccentricity ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * eccentricity ** 2 / 256 + 45 * eccentricity ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * eccentricity ** 3 / 3072) * Math.sin(6 * phi)
  );

  return [
    500000 + scale * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondEccentricity) * A ** 5 / 120),
    scale * (m + n * tanPhi * (A ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * A ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondEccentricity) * A ** 6 / 720)),
  ];
}

function toWebMercator(lon, lat) {
  const sin = Math.sin(lat * DEG_TO_RAD);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * PI)];
}

function fromWebMercator(x, y) {
  return [x * 360 - 180, Math.atan(Math.sinh(PI * (1 - 2 * y))) / DEG_TO_RAD];
}

function assertGrid(grid) {
  if (!Number.isInteger(grid?.width) || !Number.isInteger(grid?.height) || grid.width <= 0 || grid.height <= 0
    || !Number.isFinite(grid?.cell) || !Number.isFinite(grid?.x0) || !Number.isFinite(grid?.y1)
    || !Array.isArray(grid?.coordinates) || grid.coordinates.length !== 4) {
    throw new TypeError("Graella de predicció no vàlida");
  }
}

/**
 * Reprojecta la geometria de visualització, no les dades del model. La graella
 * original continua sent UTM 31N; aquest índex indica quin píxel UTM correspon
 * a cada píxel d'un canvas rectangular en Web Mercator.
 */
export function createRasterProjection(grid) {
  assertGrid(grid);
  const { width, height } = grid;
  const corners = grid.coordinates.map(([lon, lat]) => toWebMercator(lon, lat));
  const left = Math.min(...corners.map(([x]) => x));
  const right = Math.max(...corners.map(([x]) => x));
  const top = Math.min(...corners.map(([, y]) => y));
  const bottom = Math.max(...corners.map(([, y]) => y));
  const spanX = right - left;
  const spanY = bottom - top;
  if (!(spanX > 0) || !(spanY > 0)) throw new TypeError("Extensió de predicció no vàlida");

  const sourceIndices = new Int32Array(width * height);
  sourceIndices.fill(-1);

  // Constants de la projecció UTM 31N. Precalculem la part dependent de la
  // latitud una vegada per fila per no repetir trigonometria 1,2 M de vegades.
  const a = 6378137;
  const eccentricity = 0.00669438;
  const scale = 0.9996;
  const secondEccentricity = eccentricity / (1 - eccentricity);
  const centralMeridian = 3 * DEG_TO_RAD;
  const lambdaStart = (left + spanX / (2 * width)) * 2 * PI - PI;
  const lambdaStep = spanX * 2 * PI / width;

  for (let row = 0; row < height; row++) {
    const mercatorY = top + (row + 0.5) * spanY / height;
    const phi = Math.atan(Math.sinh(PI * (1 - 2 * mercatorY)));
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const tanPhi = Math.tan(phi);
    const n = a / Math.sqrt(1 - eccentricity * sinPhi ** 2);
    const t = tanPhi ** 2;
    const c = secondEccentricity * cosPhi ** 2;
    const m = a * (
      (1 - eccentricity / 4 - 3 * eccentricity ** 2 / 64 - 5 * eccentricity ** 3 / 256) * phi
      - (3 * eccentricity / 8 + 3 * eccentricity ** 2 / 32 + 45 * eccentricity ** 3 / 1024) * Math.sin(2 * phi)
      + (15 * eccentricity ** 2 / 256 + 45 * eccentricity ** 3 / 1024) * Math.sin(4 * phi)
      - (35 * eccentricity ** 3 / 3072) * Math.sin(6 * phi)
    );

    for (let col = 0; col < width; col++) {
      const lambda = lambdaStart + col * lambdaStep;
      const A = cosPhi * (lambda - centralMeridian);
      const easting = 500000 + scale * n * (
        A + (1 - t + c) * A ** 3 / 6
        + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondEccentricity) * A ** 5 / 120
      );
      const northing = scale * (
        m + n * tanPhi * (
          A ** 2 / 2
          + (5 - t + 9 * c + 4 * c ** 2) * A ** 4 / 24
          + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondEccentricity) * A ** 6 / 720
        )
      );
      const sourceCol = Math.floor((easting - grid.x0) / grid.cell);
      const sourceRow = Math.floor((grid.y1 - northing) / grid.cell);
      if (sourceCol >= 0 && sourceRow >= 0 && sourceCol < width && sourceRow < height) {
        sourceIndices[row * width + col] = sourceRow * width + sourceCol;
      }
    }
  }

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    coordinates: [
      fromWebMercator(left, top),
      fromWebMercator(right, top),
      fromWebMercator(right, bottom),
      fromWebMercator(left, bottom),
    ],
    sourceIndices,
  };
}

export function projectedPixelAtLngLat(projection, lon, lat) {
  const [x, y] = toWebMercator(lon, lat);
  const col = Math.floor((x - projection.left) / (projection.right - projection.left) * projection.width);
  const row = Math.floor((y - projection.top) / (projection.bottom - projection.top) * projection.height);
  if (col < 0 || row < 0 || col >= projection.width || row >= projection.height) return null;
  return { col, row, index: row * projection.width + col };
}
