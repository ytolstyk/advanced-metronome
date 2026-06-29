import type { InstrumentId, Measure, Pattern } from '../types';
import { INSTRUMENT_IDS } from '../constants';

export interface HitEvent {
  instrument: InstrumentId;
  offsetSec: number;
  confidence: number;
}

/**
 * Converts raw drum hit timestamps (clip-relative, in seconds) to a boolean Pattern grid.
 *
 * Uses detectedBpm (from the analysis result) — NOT the drum machine's current BPM —
 * so hits land in the correct slots regardless of the app's tempo setting.
 *
 * Step duration mirrors AudioEngine.getBeatDuration:
 *   stepDuration = (60 / bpm) * (4 / subdivision) / stepsPerBeat
 */
export function quantizeHits(
  hits: HitEvent[],
  measures: Measure[],
  bpm: number,
): Pattern {
  // Build cumulative step start times that match how AudioEngine schedules beats
  const stepStartTimes: number[] = [];
  let time = 0;
  for (const m of measures) {
    const spb = m.timeSignature.stepsPerBeat ?? 1;
    const subdivision = m.timeSignature.subdivision;
    const stepsInMeasure = m.timeSignature.beats * spb;
    const stepDuration = (60 / bpm) * (4 / subdivision) / spb;
    for (let i = 0; i < stepsInMeasure; i++) {
      stepStartTimes.push(time);
      time += stepDuration;
    }
  }

  const totalSteps = stepStartTimes.length;

  const pattern = {} as Pattern;
  for (const id of INSTRUMENT_IDS) {
    pattern[id] = new Array(totalSteps).fill(false);
  }

  if (totalSteps === 0) return pattern;

  for (const hit of hits) {
    if (!(INSTRUMENT_IDS as string[]).includes(hit.instrument)) continue;

    // Find the nearest step index
    let nearest = 0;
    let minDiff = Math.abs(hit.offsetSec - stepStartTimes[0]);
    for (let i = 1; i < totalSteps; i++) {
      const diff = Math.abs(hit.offsetSec - stepStartTimes[i]);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = i;
      }
    }

    pattern[hit.instrument as InstrumentId][nearest] = true;
  }

  return pattern;
}
