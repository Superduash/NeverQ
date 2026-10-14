// backend/src/services/eta/stats.js
// Authoritative Bayesian consultation time and Welford variance calculation (NeverQ2 §4.1–§4.3, §4.7)
// Pure statistical functions without database or clock dependencies.

import { RULES } from '../../config/rules.js';

/**
 * Expected consultation duration for a department (Step 1, §4.2)
 * Bayesian blend of department default and observed sample mean.
 *
 * @param {number} defaultMin - Baseline department consultation minutes (D)
 * @param {number} n - Number of completed consultations
 * @param {number} mean - Mean consultation minutes
 * @returns {number} Expected duration in minutes, clamped to [1, 4*D]
 */
export function calculateExpected(defaultMin, n, mean) {
  if (typeof defaultMin !== 'number' || defaultMin <= 0 || !Number.isFinite(defaultMin)) {
    throw new Error(`Invalid defaultMin: ${defaultMin}`);
  }

  const K = RULES.K;
  const meanEff = n === 0 ? defaultMin : mean;
  let expected = (K * defaultMin + n * meanEff) / (K + n);

  // Clamp expected to [1, 4 * defaultMin]
  expected = Math.max(1, Math.min(4 * defaultMin, expected));
  return expected;
}

/**
 * Per-patient consultation standard deviation (Step 2, §4.3)
 * Blends default spread with sample variance, bounded by floor fraction.
 *
 * @param {number} defaultMin - Baseline department consultation minutes (D)
 * @param {number} expected - Expected consultation duration from Step 1
 * @param {number} n - Number of completed consultations
 * @param {number} m2 - Welford sum of squared deviations
 * @returns {number} Standard deviation in minutes per patient
 */
export function calculateSpread(defaultMin, expected, n, m2) {
  const K = RULES.K;
  const d0 = RULES.DEFAULT_SPREAD_FRAC * defaultMin;
  const d0Sq = d0 * d0;

  const sampleVar = n >= 2 ? Math.max(0, m2 / (n - 1)) : d0Sq;
  const varPP = (K * d0Sq + n * sampleVar) / (K + n);
  const sdFloor = RULES.SD_FLOOR_FRAC * expected;

  return Math.max(Math.sqrt(varPP), sdFloor);
}

/**
 * Welford online update algorithm for a completed consultation sample (Step 6, §4.7)
 *
 * @param {{ n: number, mean: number, m2: number, statsHistory?: number[] }} currentStats
 * @param {number} sampleMinutes - Duration in minutes of the completed consultation
 * @param {number} defaultMin - Baseline department consultation minutes (D)
 * @returns {{ n: number, mean: number, m2: number, statsHistory: number[], updated: boolean }}
 */
export function updateStats(currentStats, sampleMinutes, defaultMin) {
  const { n = 0, mean = 0, m2 = 0, statsHistory = [] } = currentStats || {};

  // Samples < 1 min are ignored per §4.7 rule E13
  if (sampleMinutes < RULES.MIN_SAMPLE_MIN) {
    return {
      n,
      mean,
      m2,
      statsHistory: [...statsHistory],
      updated: false,
    };
  }

  // Samples > 4 * D are clamped per §4.7 rule E14
  const clampedSample = Math.min(sampleMinutes, RULES.MAX_SAMPLE_MULT * defaultMin);

  const nPrime = n + 1;
  const mean0 = n === 0 ? 0 : mean;
  const delta = clampedSample - mean0;
  const meanPrime = mean0 + delta / nPrime;
  const m2Prime = m2 + delta * (clampedSample - meanPrime);

  const history = [...statsHistory, Number(meanPrime.toFixed(2))].slice(-20);

  return {
    n: nPrime,
    mean: Number(meanPrime.toFixed(4)),
    m2: Number(m2Prime.toFixed(4)),
    statsHistory: history,
    updated: true,
  };
}

/**
 * Determine confidence classification based on completed sample count n (§4.6)
 *
 * @param {number} n - Number of consultations
 * @returns {{ confidenceLevel: 'low'|'medium'|'high', confidence: string }}
 */
export function getConfidence(n) {
  if (n < 3) {
    return {
      confidenceLevel: 'low',
      confidence: "Low confidence — based on the hospital's default duration",
    };
  }
  if (n < 10) {
    return {
      confidenceLevel: 'medium',
      confidence: `Medium — based on ${n} recent consultations`,
    };
  }
  return {
    confidenceLevel: 'high',
    confidence: `Higher — based on ${n} recent consultations`,
  };
}
