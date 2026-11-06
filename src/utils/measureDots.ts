import type { TrackPiece } from '../audio/ClickTrackEngine';
import type { SubdivisionLabel } from '../audio/clickMath';

export type MeasureDot = 'accent' | 'beat' | 'sub';

/** Small dots drawn after each beat's own dot. */
const EXTRA_DOTS_PER_BEAT: Partial<Record<SubdivisionLabel, number>> = { eighth: 1, 'eighth-triplet': 1, sixteenth: 3 };

/** The dots drawn for one bar of a segment: the first is the accent, then one per beat plus its subdivisions. */
export function getMeasureDots(piece: TrackPiece): MeasureDot[] {
  const { numerator } = piece.timeSignature;
  const sub = piece.subdivision;
  if (sub === 'whole') return ['accent'];
  if (sub === 'half') {
    const count = Math.ceil(numerator / 2);
    return Array.from({ length: count }, (_, i): MeasureDot => (i === 0 ? 'accent' : 'beat'));
  }
  const extraDots = EXTRA_DOTS_PER_BEAT[sub] ?? 0;
  const result: MeasureDot[] = [];
  for (let b = 0; b < numerator; b++) {
    result.push(b === 0 ? 'accent' : 'beat');
    for (let s = 0; s < extraDots; s++) result.push('sub');
  }
  return result;
}

/** Maps the engine's sub-tick within a bar to the index of the dot to light in `getMeasureDots`. */
export function subTickToDotIndex(piece: TrackPiece, subTick: number): number {
  // Triplets: the engine fires 3x per "dot slot" but dots only show beats.
  if (piece.subdivision === 'quarter-triplet' || piece.subdivision === 'eighth-triplet') {
    return Math.floor(subTick / 3);
  }
  return subTick; // 1:1 for whole/half/quarter/eighth/sixteenth
}
