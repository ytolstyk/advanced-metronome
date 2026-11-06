import { describe, expect, it } from 'vitest';
import type { TrackPiece } from '../audio/ClickTrackEngine';
import { getMeasureDots, subTickToDotIndex } from './measureDots';

const piece = (over: Partial<TrackPiece> = {}): TrackPiece => ({
  id: 'p1',
  label: '',
  color: '#8b5cf6',
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 1,
  ...over,
});

describe('getMeasureDots', () => {
  it('draws a single accent for a whole-note subdivision, whatever the numerator', () => {
    expect(getMeasureDots(piece({ subdivision: 'whole' }))).toEqual(['accent']);
    expect(getMeasureDots(piece({ subdivision: 'whole', timeSignature: { numerator: 7, denominator: 8 } }))).toEqual(['accent']);
  });

  it('draws one dot per two beats for a half-note subdivision, rounding up for odd numerators', () => {
    expect(getMeasureDots(piece({ subdivision: 'half' }))).toEqual(['accent', 'beat']);
    expect(getMeasureDots(piece({ subdivision: 'half', timeSignature: { numerator: 3, denominator: 4 } }))).toEqual(['accent', 'beat']);
    expect(getMeasureDots(piece({ subdivision: 'half', timeSignature: { numerator: 5, denominator: 4 } }))).toEqual([
      'accent',
      'beat',
      'beat',
    ]);
  });

  it('draws accent then beats for a quarter subdivision', () => {
    expect(getMeasureDots(piece())).toEqual(['accent', 'beat', 'beat', 'beat']);
    expect(getMeasureDots(piece({ timeSignature: { numerator: 3, denominator: 4 } }))).toEqual(['accent', 'beat', 'beat']);
  });

  it('adds one sub dot after each beat for eighths', () => {
    expect(getMeasureDots(piece({ subdivision: 'eighth', timeSignature: { numerator: 2, denominator: 4 } }))).toEqual([
      'accent',
      'sub',
      'beat',
      'sub',
    ]);
  });

  it('adds three sub dots after each beat for sixteenths', () => {
    const dots = getMeasureDots(piece({ subdivision: 'sixteenth', timeSignature: { numerator: 2, denominator: 4 } }));
    expect(dots).toEqual(['accent', 'sub', 'sub', 'sub', 'beat', 'sub', 'sub', 'sub']);
  });

  it('shows no sub dots for quarter triplets (the engine ticks 3x per dot slot)', () => {
    expect(getMeasureDots(piece({ subdivision: 'quarter-triplet' }))).toEqual(['accent', 'beat', 'beat', 'beat']);
  });

  it('shows one sub dot per beat for eighth triplets', () => {
    const dots = getMeasureDots(piece({ subdivision: 'eighth-triplet', timeSignature: { numerator: 2, denominator: 4 } }));
    expect(dots).toEqual(['accent', 'sub', 'beat', 'sub']);
  });
});

describe('subTickToDotIndex', () => {
  it.each(['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const)('is the identity for %s', (subdivision) => {
    for (const tick of [0, 1, 5, 11]) expect(subTickToDotIndex(piece({ subdivision }), tick)).toBe(tick);
  });

  it.each(['quarter-triplet', 'eighth-triplet'] as const)('groups three ticks per dot for %s', (subdivision) => {
    const p = piece({ subdivision });
    expect([0, 1, 2, 3, 4, 5, 6, 8, 9].map((t) => subTickToDotIndex(p, t))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 3]);
  });

  it('maps -1 (before the first click) to a negative index for non-triplets and -1 for triplets', () => {
    expect(subTickToDotIndex(piece(), -1)).toBe(-1);
    expect(subTickToDotIndex(piece({ subdivision: 'quarter-triplet' }), -1)).toBe(-1);
  });
});
