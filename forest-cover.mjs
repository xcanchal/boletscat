const FOREST_BY_RGB = new Map([
  [0x33cc33, [1, 1]], [0x19e61e, [1, 2]], // coníferes denses / clares
  [0x66ff33, [2, 1]], [0xb4ff9b, [2, 2]], // caducifolis densos / clars
  [0x689018, [3, 1]], [0xaaa500, [3, 2]], // esclerofil·les densos / clars
  [0x00ff9b, [4, 1]],                     // bosc de ribera
]);

function forestClassAt(rgba, width, x, y) {
  const offset = (y * width + x) * 4;
  if (!rgba[offset + 3]) return null;
  const rgb = (rgba[offset] << 16) | (rgba[offset + 1] << 8) | rgba[offset + 2];
  return FOREST_BY_RGB.get(rgb) ?? null;
}

/**
 * Agrega una imatge categòrica de cobertes a una graella més ampla.
 *
 * Cada cel·la final només es considera forestal quan més de la meitat de les
 * mostres ho són. Això evita que una clariana o un arbre aïllat al centre d'una
 * cel·la de 250 m decideixi tot el seu valor.
 */
export function aggregateForestCover({ rgba, width, height }, {
  gridWidth,
  gridHeight,
  samplesPerCell = 3,
} = {}) {
  if (!Number.isInteger(samplesPerCell) || samplesPerCell < 1 || samplesPerCell % 2 === 0) {
    throw new Error("samplesPerCell ha de ser un enter senar positiu");
  }
  if (width !== gridWidth * samplesPerCell || height !== gridHeight * samplesPerCell) {
    throw new Error("Dimensions inesperades de la coberta forestal");
  }

  const hosts = new Uint8Array(gridWidth * gridHeight);
  const forestStructure = new Uint8Array(gridWidth * gridHeight);
  const requiredForestSamples = Math.floor((samplesPerCell ** 2) / 2) + 1;
  const center = Math.floor(samplesPerCell / 2);

  for (let row = 0; row < gridHeight; row++) for (let col = 0; col < gridWidth; col++) {
    const hostCounts = new Uint8Array(5);
    const structureCounts = new Uint8Array(5 * 3);
    let forestSamples = 0;

    for (let sampleY = 0; sampleY < samplesPerCell; sampleY++) {
      for (let sampleX = 0; sampleX < samplesPerCell; sampleX++) {
        const forestClass = forestClassAt(
          rgba,
          width,
          col * samplesPerCell + sampleX,
          row * samplesPerCell + sampleY,
        );
        if (!forestClass) continue;
        const [host, structure] = forestClass;
        forestSamples++;
        hostCounts[host]++;
        structureCounts[host * 3 + structure]++;
      }
    }

    if (forestSamples < requiredForestSamples) continue;

    const centerClass = forestClassAt(
      rgba,
      width,
      col * samplesPerCell + center,
      row * samplesPerCell + center,
    );
    const maxHostCount = Math.max(...hostCounts);
    const dominantHost = centerClass && hostCounts[centerClass[0]] === maxHostCount
      ? centerClass[0]
      : hostCounts.findIndex((count) => count === maxHostCount);
    const denseCount = structureCounts[dominantHost * 3 + 1];
    const openCount = structureCounts[dominantHost * 3 + 2];
    const dominantStructure = centerClass?.[0] === dominantHost
      && structureCounts[dominantHost * 3 + centerClass[1]] === Math.max(denseCount, openCount)
      ? centerClass[1]
      : (denseCount >= openCount ? 1 : 2);
    const index = row * gridWidth + col;
    hosts[index] = dominantHost;
    forestStructure[index] = dominantStructure;
  }

  return { hosts, forestStructure };
}
