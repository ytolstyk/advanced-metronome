import type { Measure, Pattern } from '../types';
import { INSTRUMENT_IDS } from '../constants';

function totalStepsFromMeasures(measures: Measure[]): number {
  return measures.reduce(
    (sum, m) => sum + m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1),
    0,
  );
}

/**
 * Shifts 1–2 hits per instrument by ±1–3 steps, preserving the overall groove.
 * Silent instruments are left untouched.
 */
export function mutatePattern(pattern: Pattern, measures: Measure[]): Pattern {
  const totalSteps = totalStepsFromMeasures(measures);
  const result = {} as Pattern;

  for (const id of INSTRUMENT_IDS) {
    const arr = [...pattern[id]];
    const hitIndices = arr.reduce<number[]>((acc, v, i) => {
      if (v) acc.push(i);
      return acc;
    }, []);

    if (hitIndices.length === 0) {
      result[id] = arr;
      continue;
    }

    const numMutations = Math.random() < 0.3 ? 2 : 1;
    for (let m = 0; m < numMutations; m++) {
      const pickIdx = Math.floor(Math.random() * hitIndices.length);
      const step = hitIndices[pickIdx];
      // Offset between -3 and +3, excluding 0
      const offsets = [-3, -2, -1, 1, 2, 3];
      const delta = offsets[Math.floor(Math.random() * offsets.length)];
      const newStep = ((step + delta) % totalSteps + totalSteps) % totalSteps;
      if (!arr[newStep]) {
        arr[step] = false;
        arr[newStep] = true;
        hitIndices[pickIdx] = newStep;
      }
    }

    result[id] = arr;
  }

  return result;
}

/**
 * Adds controlled randomness to a deterministic pattern.
 * randomness: 0 = no change, 1 = maximum variation.
 * Existing hits may be dropped (up to 30% chance at max) and
 * empty steps may gain ghost hits (up to 15% chance at max).
 */
export function applyPatternRandomness(
  pattern: Pattern,
  totalSteps: number,
  randomness: number,
): Pattern {
  if (randomness <= 0) return pattern;
  const result = {} as Pattern;

  for (const id of INSTRUMENT_IDS) {
    const arr = pattern[id].map((active) => {
      if (active) return Math.random() >= randomness * 0.3;
      return Math.random() < randomness * 0.15;
    });
    result[id] = arr;
  }

  // Ensure array lengths match (applyPatternRandomness never changes size)
  for (const id of INSTRUMENT_IDS) {
    if (result[id].length !== totalSteps) {
      result[id] = pattern[id].slice();
    }
  }

  return result;
}
