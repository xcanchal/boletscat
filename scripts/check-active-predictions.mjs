#!/usr/bin/env node

import { readCurrentGeneration } from '../src/prediction-generations.mjs';
import { resolvePredictionDir } from '../src/prediction-path.mjs';

try {
  const manifest = await readCurrentGeneration(resolvePredictionDir());
  console.log(`Generació activa: ${manifest.generationId} (${manifest.referenceDate})`);
} catch (error) {
  console.error(`No hi ha cap generació activa vàlida: ${error.message}`);
  process.exitCode = 1;
}
