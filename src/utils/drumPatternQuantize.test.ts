import { describe, it, expect } from 'vitest';
import { quantizeHits } from './drumPatternQuantize';
import type { HitEvent } from './drumPatternQuantize';
import type { Measure } from '../types';

function measure(beats: number, subdivision: number, stepsPerBeat?: number): Measure {
  return { timeSignature: { beats, subdivision, stepsPerBeat } };
}

describe('quantizeHits', () => {
  it('maps hits to correct steps on a uniform 4/4 quarter-note grid', () => {
    // 120 BPM, 4/4, stepsPerBeat=1 → step duration = 0.5s, 8 steps over 2 measures
    const measures = [measure(4, 4, 1), measure(4, 4, 1)];
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 0.0, confidence: 0.9 },  // step 0
      { instrument: 'snare', offsetSec: 1.0, confidence: 0.9 }, // step 2
      { instrument: 'kick', offsetSec: 4.0, confidence: 0.9 },  // step 8 → clamp → step 7
    ];
    const pattern = quantizeHits(hits, measures, 120);
    expect(pattern.kick[0]).toBe(true);
    expect(pattern.snare[2]).toBe(true);
    // Hit at 4.0s is exactly one step past the last step (7 × 0.5 = 3.5, 8 × 0.5 = 4.0)
    // totalSteps=8, last index=7; nearest to 4.0 is index 7 (diff 0.5) vs edge; clamped to 7
    expect(pattern.kick[7]).toBe(true);
  });

  it('maps hits correctly on a 16th-note grid (stepsPerBeat=4)', () => {
    // 120 BPM, 4/4, stepsPerBeat=4 → step duration = 0.125s
    const measures = [measure(4, 4, 4)];
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 0.0, confidence: 0.9 },   // step 0
      { instrument: 'snare', offsetSec: 0.5, confidence: 0.9 },  // step 4
      { instrument: 'hihat', offsetSec: 0.125, confidence: 0.9 }, // step 1
      { instrument: 'hihat', offsetSec: 1.875, confidence: 0.9 }, // step 15
    ];
    const pattern = quantizeHits(hits, measures, 120);
    expect(pattern.kick[0]).toBe(true);
    expect(pattern.snare[4]).toBe(true);
    expect(pattern.hihat[1]).toBe(true);
    expect(pattern.hihat[15]).toBe(true);
  });

  it('handles stepsPerBeat=undefined the same as stepsPerBeat=1', () => {
    // Undefined should default to 1 (matching getTotalBeats and AudioEngine)
    const withUndefined = [measure(4, 4, undefined)];
    const withOne = [measure(4, 4, 1)];
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 0.0, confidence: 0.9 },
      { instrument: 'snare', offsetSec: 1.0, confidence: 0.9 },
    ];
    const p1 = quantizeHits(hits, withUndefined, 120);
    const p2 = quantizeHits(hits, withOne, 120);
    expect(p1.kick).toEqual(p2.kick);
    expect(p1.snare).toEqual(p2.snare);
  });

  it('handles mixed time signatures', () => {
    // 120 BPM, 4/4 then 5/4, stepsPerBeat=1
    // Measure 1: 4 steps × 0.5s = 0–1.5s (steps 0–3)
    // Measure 2: 5 steps × 0.5s = 2.0–4.0s (steps 4–8)
    const measures = [measure(4, 4, 1), measure(5, 4, 1)];
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 0.0, confidence: 0.9 },  // step 0
      { instrument: 'snare', offsetSec: 2.0, confidence: 0.9 }, // step 4
      { instrument: 'hihat', offsetSec: 4.0, confidence: 0.9 }, // step 8 → last step
    ];
    const pattern = quantizeHits(hits, measures, 120);
    expect(pattern.kick[0]).toBe(true);
    expect(pattern.snare[4]).toBe(true);
    expect(pattern.hihat[8]).toBe(true);
  });

  it('handles triplet grid (stepsPerBeat=3)', () => {
    // 120 BPM, 4/4, stepsPerBeat=3 → step duration = (0.5 / 3) ≈ 0.1667s, 12 steps
    const measures = [measure(4, 4, 3)];
    const stepDur = (60 / 120) * (4 / 4) / 3; // ≈ 0.16667s
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 0.0, confidence: 0.9 },            // step 0
      { instrument: 'hihat', offsetSec: stepDur * 3, confidence: 0.9 },   // step 3
      { instrument: 'snare', offsetSec: stepDur * 6, confidence: 0.9 },   // step 6
    ];
    const pattern = quantizeHits(hits, measures, 120);
    expect(pattern.kick[0]).toBe(true);
    expect(pattern.hihat[3]).toBe(true);
    expect(pattern.snare[6]).toBe(true);
  });

  it('picks the nearer step when a hit lands between two steps', () => {
    // 120 BPM, 4/4, stepsPerBeat=1 → steps at 0, 0.5, 1.0, 1.5 s
    const measures = [measure(4, 4, 1)];
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 0.24, confidence: 0.9 }, // closer to step 0 (diff 0.24)
      { instrument: 'snare', offsetSec: 0.26, confidence: 0.9 }, // closer to step 1 (diff 0.24)
    ];
    const pattern = quantizeHits(hits, measures, 120);
    expect(pattern.kick[0]).toBe(true);
    expect(pattern.snare[1]).toBe(true);
  });

  it('clamps hits past the last step to the last step', () => {
    const measures = [measure(4, 4, 1)];
    const hits: HitEvent[] = [
      { instrument: 'kick', offsetSec: 999, confidence: 0.9 },
    ];
    const pattern = quantizeHits(hits, measures, 120);
    expect(pattern.kick[3]).toBe(true); // last step of a 4-step grid
  });

  it('ignores unknown instrument names', () => {
    const measures = [measure(4, 4, 1)];
    const hits: HitEvent[] = [
      { instrument: 'cowbell' as never, offsetSec: 0, confidence: 0.9 },
    ];
    const pattern = quantizeHits(hits, measures, 120);
    // All rows should remain false
    expect(Object.values(pattern).every(row => row.every(v => !v))).toBe(true);
  });

  it('returns an empty pattern when measures array is empty', () => {
    const pattern = quantizeHits([], [], 120);
    expect(Object.values(pattern).every(row => row.length === 0)).toBe(true);
  });
});
