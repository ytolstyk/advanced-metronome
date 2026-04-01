import type { Measure, Pattern } from '../types';
import type { TrackPiece, SubdivisionLabel } from '../audio/ClickTrackEngine';
import { INSTRUMENT_IDS } from '../constants';

function stepsForMeasure(m: Measure): number {
  return m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1);
}

/** Extract the flattened boolean slice for all instruments in a single measure */
function getMeasureSlice(pattern: Pattern, measures: Measure[], idx: number): boolean[] {
  let offset = 0;
  for (let i = 0; i < idx; i++) offset += stepsForMeasure(measures[i]);
  const steps = stepsForMeasure(measures[idx]);
  const result: boolean[] = [];
  for (const id of INSTRUMENT_IDS) {
    for (let i = 0; i < steps; i++) {
      result.push(pattern[id][offset + i] ?? false);
    }
  }
  return result;
}

function timeSigsEqual(a: Measure, b: Measure): boolean {
  return (
    a.timeSignature.beats === b.timeSignature.beats &&
    a.timeSignature.subdivision === b.timeSignature.subdivision &&
    (a.timeSignature.stepsPerBeat ?? 1) === (b.timeSignature.stepsPerBeat ?? 1)
  );
}

function slicesEqual(a: boolean[], b: boolean[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function stepsPerBeatToSubdivision(spb: number | undefined): SubdivisionLabel {
  switch (spb ?? 1) {
    case 2: return 'eighth';
    case 3: return 'eighth-triplet';
    case 4: return 'sixteenth';
    default: return 'quarter';
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const PALETTE = [
  '#8b5cf6', '#38bdf8', '#34d399', '#fbbf24',
  '#fb7185', '#fb923c', '#2dd4bf', '#94a3b8',
];

/**
 * Convert drum machine measures + pattern into click-track pieces.
 * Consecutive measures that are identical (same time-sig + same beat pattern)
 * are collapsed into a single piece with `repeats > 1`.
 */
export function drumToClickTrackPieces(
  measures: Measure[],
  pattern: Pattern,
  bpm: number,
): TrackPiece[] {
  const pieces: TrackPiece[] = [];
  let i = 0;
  let colorIdx = 0;

  while (i < measures.length) {
    const baseSlice = getMeasureSlice(pattern, measures, i);
    let count = 1;
    while (
      i + count < measures.length &&
      timeSigsEqual(measures[i], measures[i + count]) &&
      slicesEqual(baseSlice, getMeasureSlice(pattern, measures, i + count))
    ) {
      count++;
    }

    const ts = measures[i].timeSignature;
    pieces.push({
      id: uid(),
      label: '',
      color: PALETTE[colorIdx % PALETTE.length],
      groupId: null,
      timeSignature: { numerator: ts.beats, denominator: ts.subdivision },
      subdivision: stepsPerBeatToSubdivision(ts.stepsPerBeat),
      bpm,
      repeats: count,
    });

    i += count;
    colorIdx++;
  }

  return pieces;
}
