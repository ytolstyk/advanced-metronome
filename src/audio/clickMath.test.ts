import { describe, expect, it } from 'vitest';
import { getBpmAtRepetition, measureTrack, subsPerBeat } from './clickMath';
import type { SubdivisionLabel, TimedPiece } from './clickMath';

const piece = (over: Partial<TimedPiece> = {}): TimedPiece => ({
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 1,
  ...over,
});

describe('subsPerBeat', () => {
  it.each<[SubdivisionLabel, number, number]>([
    ['half', 4, 0.5],
    ['quarter', 4, 1],
    ['eighth', 4, 2],
    ['sixteenth', 4, 4],
    ['quarter-triplet', 4, 3],
    ['eighth-triplet', 4, 6],
  ])('%s %s -> numerator %d -> %f clicks per beat (numerator-independent)', (sub, numerator, expected) => {
    expect(subsPerBeat(sub, numerator)).toBe(expected);
    expect(subsPerBeat(sub, 7)).toBe(expected);
  });

  it('whole is one click per bar, so 1 / numerator per beat', () => {
    expect(subsPerBeat('whole', 4)).toBe(0.25);
    expect(subsPerBeat('whole', 7)).toBeCloseTo(1 / 7);
  });
});

describe('getBpmAtRepetition (structural pieces)', () => {
  it('returns a fixed bpm when there is no ramp, or the end bpm is missing', () => {
    expect(getBpmAtRepetition(piece({ repeats: 8 }), 5)).toBe(120);
    expect(getBpmAtRepetition(piece({ repeats: 8, rampMode: 'linear' }), 5)).toBe(120);
    expect(getBpmAtRepetition(piece({ repeats: 8, rampEndBpm: 160 }), 5)).toBe(120);
  });

  it('interpolates linearly from start to end across the repeats', () => {
    const p = piece({ repeats: 5, rampMode: 'linear', rampEndBpm: 160 });
    expect([0, 2, 4].map((r) => getBpmAtRepetition(p, r))).toEqual([120, 140, 160]);
  });

  it('keeps the start bpm for a one-repeat linear ramp', () => {
    expect(getBpmAtRepetition(piece({ repeats: 1, rampMode: 'linear', rampEndBpm: 200 }), 0)).toBe(120);
  });

  it('steps up and clamps at the end bpm', () => {
    const p = piece({ repeats: 20, rampMode: 'stepped', rampEndBpm: 130, rampStepSize: 5, rampStepMeasures: 2 });
    expect(getBpmAtRepetition(p, 1)).toBe(120);
    expect(getBpmAtRepetition(p, 2)).toBe(125);
    expect(getBpmAtRepetition(p, 4)).toBe(130);
    expect(getBpmAtRepetition(p, 19)).toBe(130);
  });

  it('steps down and clamps at a lower end bpm', () => {
    const p = piece({ repeats: 20, rampMode: 'stepped', rampEndBpm: 110, rampStepSize: 5, rampStepMeasures: 1 });
    expect(getBpmAtRepetition(p, 1)).toBe(115);
    expect(getBpmAtRepetition(p, 10)).toBe(110);
  });

  it('defaults to a 5 bpm step every 4 measures and never divides by a step length below 1', () => {
    const p = piece({ repeats: 20, rampMode: 'stepped', rampEndBpm: 200 });
    expect(getBpmAtRepetition(p, 3)).toBe(120);
    expect(getBpmAtRepetition(p, 4)).toBe(125);
    const zero = piece({ repeats: 20, rampMode: 'stepped', rampEndBpm: 200, rampStepMeasures: 0 });
    expect(getBpmAtRepetition(zero, 1)).toBe(125);
  });
});

describe('measureTrack', () => {
  it('is empty for an empty track', () => {
    expect(measureTrack([])).toEqual({ seconds: 0, clicks: 0 });
  });

  it('sums seconds and clicks across segments', () => {
    const a = piece({ repeats: 2 }); // 2 bars of 4/4 @120 = 4 s, 8 clicks
    const b = piece({ repeats: 1, bpm: 60 }); // 1 bar @60 = 4 s, 4 clicks
    expect(measureTrack([a, b])).toEqual({ seconds: 8, clicks: 12 });
  });

  it('scales beat length by the denominator (6/8 beat is half a quarter)', () => {
    expect(measureTrack([piece({ timeSignature: { numerator: 6, denominator: 8 } })])).toEqual({ seconds: 1.5, clicks: 6 });
  });

  it('uses the per-bar ramp tempo, so a linear ramp takes less time than its start tempo', () => {
    const ramp = piece({ repeats: 3, rampMode: 'linear', rampEndBpm: 240 });
    // bars at 120, 180, 240 BPM: 2 + 4/3 + 1 seconds
    expect(measureTrack([ramp]).seconds).toBeCloseTo(2 + 4 / 3 + 1);
    expect(measureTrack([ramp]).clicks).toBe(12);
  });

  it('whole subdivision gives one click per bar lasting the full bar', () => {
    expect(measureTrack([piece({ subdivision: 'whole', repeats: 3 })])).toEqual({ seconds: 6, clicks: 3 });
  });
});
