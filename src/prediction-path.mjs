import { resolve } from "node:path";

export const DEFAULT_PREDICTION_DIR = "private/predictions";

export function resolvePredictionDir(value = process.env.PREDICTION_DIR) {
  return resolve(value?.trim() || DEFAULT_PREDICTION_DIR);
}
