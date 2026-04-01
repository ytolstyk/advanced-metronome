import type { Measure } from '../types';
import type { TrackPiece, SubdivisionLabel } from '../audio/ClickTrackEngine';
import { MAX_MEASURES } from '../constants';

function subdivisionToStepsPerBeat(sub: SubdivisionLabel): 1 | 2 | 3 | 4 {
  switch (sub) {
    case 'eighth': return 2;
    case 'quarter-triplet':
    case 'eighth-triplet': return 3;
    case 'sixteenth': return 4;
    default: return 1;
  }
}

/**
 * Convert click-track pieces into drum machine measures.
 * Each piece is expanded by its `repeats` count into individual measures.
 * Result is capped at MAX_MEASURES (8).
 * Returns the measures and the BPM of the first piece.
 */
export function clickTrackToDrumMeasures(
  pieces: TrackPiece[],
): { measures: Measure[]; bpm: number } {
  const bpm = pieces[0]?.bpm ?? 120;
  const measures: Measure[] = [];

  for (const piece of pieces) {
    const stepsPerBeat = subdivisionToStepsPerBeat(piece.subdivision);
    const ts = {
      beats: piece.timeSignature.numerator,
      subdivision: piece.timeSignature.denominator,
      stepsPerBeat,
    };
    for (let r = 0; r < piece.repeats; r++) {
      if (measures.length >= MAX_MEASURES) break;
      measures.push({ timeSignature: { ...ts } });
    }
    if (measures.length >= MAX_MEASURES) break;
  }

  if (measures.length === 0) {
    measures.push({ timeSignature: { beats: 4, subdivision: 4, stepsPerBeat: 4 } });
  }

  return { measures, bpm };
}
