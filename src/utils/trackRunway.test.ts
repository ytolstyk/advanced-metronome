import { describe, expect, it } from 'vitest';
import type { TrackPiece } from '../audio/ClickTrackEngine';
import type { SegmentGroup } from '../clickTrackTypes';
import {
  RUNWAY_BARS_AFTER,
  COUNT_IN_FLAT,
  RUNWAY_BARS_BEFORE,
  anchorFlat,
  buildBarIndex,
  countInOffset,
  flatIndexOf,
  locateBar,
  runwayHeading,
  runwayWindow,
} from './trackRunway';

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

const group = (over: Partial<SegmentGroup> = {}): SegmentGroup => ({ id: 'g1', name: 'Chorus', color: '#ef4444', ...over });

describe('constants', () => {
  it('shows one bar before and two after', () => {
    expect(RUNWAY_BARS_BEFORE).toBe(1);
    expect(RUNWAY_BARS_AFTER).toBe(2);
  });
});

describe('buildBarIndex', () => {
  it('is empty for no pieces', () => {
    expect(buildBarIndex([])).toEqual({ starts: [], total: 0 });
  });

  it('records where each segment starts in the flattened track', () => {
    const index = buildBarIndex([piece({ repeats: 4 }), piece({ repeats: 1 }), piece({ repeats: 3 })]);
    expect(index).toEqual({ starts: [0, 4, 5], total: 8 });
  });

  it('treats a zero or negative repeat count as no bars', () => {
    expect(buildBarIndex([piece({ repeats: 0 }), piece({ repeats: -3 }), piece({ repeats: 2 })])).toEqual({
      starts: [0, 0, 0],
      total: 2,
    });
  });
});

describe('flatIndexOf', () => {
  const index = buildBarIndex([piece({ repeats: 4 }), piece({ repeats: 2 })]);

  it('adds the repetition to the segment start', () => {
    expect(flatIndexOf(index, 0, 0)).toBe(0);
    expect(flatIndexOf(index, 0, 3)).toBe(3);
    expect(flatIndexOf(index, 1, 0)).toBe(4);
    expect(flatIndexOf(index, 1, 1)).toBe(5);
  });

  it('falls back to the track start for an unknown segment', () => {
    expect(flatIndexOf(index, 9, 2)).toBe(2);
  });
});

describe('locateBar', () => {
  const index = buildBarIndex([piece({ repeats: 4 }), piece({ repeats: 1 }), piece({ repeats: 3 })]);

  it('finds the segment and repetition of every bar and round-trips with flatIndexOf', () => {
    for (let flat = 0; flat < index.total; flat++) {
      const bar = locateBar(index, flat);
      expect(bar).not.toBeNull();
      expect(bar!.flat).toBe(flat);
      expect(flatIndexOf(index, bar!.pieceIndex, bar!.rep)).toBe(flat);
    }
  });

  it('resolves segment boundaries to the new segment', () => {
    expect(locateBar(index, 3)).toEqual({ flat: 3, pieceIndex: 0, rep: 3 });
    expect(locateBar(index, 4)).toEqual({ flat: 4, pieceIndex: 1, rep: 0 });
    expect(locateBar(index, 5)).toEqual({ flat: 5, pieceIndex: 2, rep: 0 });
    expect(locateBar(index, 7)).toEqual({ flat: 7, pieceIndex: 2, rep: 2 });
  });

  it('is null before the start and past the end', () => {
    expect(locateBar(index, -1)).toBeNull();
    expect(locateBar(index, 8)).toBeNull();
    expect(locateBar(index, 100)).toBeNull();
  });

  it('is null for an empty track', () => {
    expect(locateBar(buildBarIndex([]), 0)).toBeNull();
  });

  it('skips a zero-repeat segment', () => {
    const withEmpty = buildBarIndex([piece({ repeats: 2 }), piece({ repeats: 0 }), piece({ repeats: 2 })]);
    expect(locateBar(withEmpty, 1)).toEqual({ flat: 1, pieceIndex: 0, rep: 1 });
    expect(locateBar(withEmpty, 2)).toEqual({ flat: 2, pieceIndex: 2, rep: 0 });
  });

  it('works for a single-bar track', () => {
    expect(locateBar(buildBarIndex([piece()]), 0)).toEqual({ flat: 0, pieceIndex: 0, rep: 0 });
  });
});

describe('runwayWindow', () => {
  const flats = (index: ReturnType<typeof buildBarIndex>, current: number) => runwayWindow(index, current).map((b) => b.flat);

  it('mounts two bars before and three after the current one (one beyond what shows, each side)', () => {
    const index = buildBarIndex([piece({ repeats: 20 })]);
    expect(flats(index, 10)).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it('clips at the start of the track', () => {
    const index = buildBarIndex([piece({ repeats: 20 })]);
    expect(flats(index, 0)).toEqual([0, 1, 2, 3]);
    expect(flats(index, 1)).toEqual([0, 1, 2, 3, 4]);
  });

  it('clips at the end of the track', () => {
    const index = buildBarIndex([piece({ repeats: 20 })]);
    expect(flats(index, 19)).toEqual([17, 18, 19]);
    expect(flats(index, 18)).toEqual([16, 17, 18, 19]);
  });

  it('is just the current bar for a one-bar track', () => {
    expect(flats(buildBarIndex([piece()]), 0)).toEqual([0]);
  });

  it('is empty for an empty track', () => {
    expect(flats(buildBarIndex([]), 0)).toEqual([]);
  });

  it('is empty when the current bar is far outside the track', () => {
    expect(flats(buildBarIndex([piece({ repeats: 3 })]), 50)).toEqual([]);
  });

  it('crosses segment boundaries, carrying each bar its own segment and repetition', () => {
    const index = buildBarIndex([piece({ repeats: 2 }), piece({ repeats: 3 })]);
    expect(runwayWindow(index, 1)).toEqual([
      { flat: 0, pieceIndex: 0, rep: 0 },
      { flat: 1, pieceIndex: 0, rep: 1 },
      { flat: 2, pieceIndex: 1, rep: 0 },
      { flat: 3, pieceIndex: 1, rep: 1 },
      { flat: 4, pieceIndex: 1, rep: 2 },
    ]);
  });

  it('keeps the same flat index (the React key) for a bar as the window advances', () => {
    const index = buildBarIndex([piece({ repeats: 20 })]);
    expect(flats(index, 10)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(flats(index, 11)).toEqual([9, 10, 11, 12, 13, 14]);
  });
});

describe('runwayHeading', () => {
  it('uses the segment tempo, label and no group when ungrouped', () => {
    expect(runwayHeading(piece({ bpm: 96, label: 'Verse' }), 0, [group()])).toEqual({ bpm: 96, group: '', section: 'Verse' });
  });

  it('looks the group up by id', () => {
    const groups = [group({ id: 'g0', name: 'Intro' }), group({ id: 'g1', name: 'Chorus' })];
    expect(runwayHeading(piece({ groupId: 'g1', label: 'Lift' }), 0, groups)).toEqual({ bpm: 120, group: 'Chorus', section: 'Lift' });
  });

  it('has an empty group when the id matches no group', () => {
    expect(runwayHeading(piece({ groupId: 'missing' }), 0, [group()]).group).toBe('');
    expect(runwayHeading(piece({ groupId: 'g1' }), 0, []).group).toBe('');
  });

  it('follows a linear ramp bar by bar', () => {
    const ramp = piece({ bpm: 100, rampEndBpm: 140, rampMode: 'linear', repeats: 5 });
    expect([0, 1, 2, 3, 4].map((rep) => runwayHeading(ramp, rep, []).bpm)).toEqual([100, 110, 120, 130, 140]);
  });

  it('rounds a fractional ramp tempo to a whole BPM', () => {
    const ramp = piece({ bpm: 100, rampEndBpm: 105, rampMode: 'linear', repeats: 3 });
    expect(runwayHeading(ramp, 1, []).bpm).toBe(103); // 102.5
  });

  it('follows a stepped ramp, holding each step for its bars and stopping at the end tempo', () => {
    const ramp = piece({ bpm: 100, rampEndBpm: 110, rampMode: 'stepped', rampStepSize: 5, rampStepMeasures: 2, repeats: 8 });
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((rep) => runwayHeading(ramp, rep, []).bpm)).toEqual([100, 100, 105, 105, 110, 110, 110, 110]);
  });

  it('follows a downward stepped ramp', () => {
    const ramp = piece({ bpm: 120, rampEndBpm: 110, rampMode: 'stepped', rampStepSize: 5, rampStepMeasures: 1, repeats: 4 });
    expect([0, 1, 2, 3].map((rep) => runwayHeading(ramp, rep, []).bpm)).toEqual([120, 115, 110, 110]);
  });

  it('keeps the fixed tempo when the piece has no ramp, whatever the repetition', () => {
    expect(runwayHeading(piece({ bpm: 90, repeats: 8 }), 7, []).bpm).toBe(90);
  });

  it('keeps a single-bar ramp at its start tempo', () => {
    expect(runwayHeading(piece({ bpm: 80, rampEndBpm: 160, rampMode: 'linear', repeats: 1 }), 0, []).bpm).toBe(80);
  });
});

describe('COUNT_IN_FLAT', () => {
  it('is the virtual bar just before bar 1', () => {
    expect(COUNT_IN_FLAT).toBe(-1);
  });
});

describe('anchorFlat', () => {
  it('anchors on the count-in card while counting, whatever the current bar', () => {
    expect(anchorFlat(0, true)).toBe(COUNT_IN_FLAT);
    expect(anchorFlat(7, true)).toBe(COUNT_IN_FLAT);
  });

  it('anchors on the current bar when not counting', () => {
    expect(anchorFlat(0, false)).toBe(0);
    expect(anchorFlat(7, false)).toBe(7);
  });

  it('puts bar 1 one slot after the anchor while counting', () => {
    expect(0 - anchorFlat(0, true)).toBe(1);
  });

  it('makes the mounted window while counting start at bar 1', () => {
    const index = buildBarIndex([piece({ repeats: 10 })]);
    expect(runwayWindow(index, anchorFlat(0, true)).map((b) => b.flat)).toEqual([0, 1, 2]);
  });
});

describe('countInOffset', () => {
  it('is 0 while counting (the card is the anchor)', () => {
    expect(countInOffset(0, true)).toBe(0);
  });

  it('is -1 once bar 1 plays (previous slot)', () => {
    expect(countInOffset(0, false)).toBe(-1);
  });

  it('drifts one slot further left each bar', () => {
    expect(countInOffset(1, false)).toBe(-2);
  });

  it('is null once it is further left than RUNWAY_BARS_BEFORE + 1 slots', () => {
    expect(-(RUNWAY_BARS_BEFORE + 1)).toBe(-2);
    expect(countInOffset(2, false)).toBeNull();
    expect(countInOffset(50, false)).toBeNull();
  });

  it('ignores the current bar while counting', () => {
    expect(countInOffset(30, true)).toBe(0);
  });
});
