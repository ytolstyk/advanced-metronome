export type SubdivisionLabel =
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | 'sixteenth'
  | 'quarter-triplet' | 'eighth-triplet';

export function subsPerBeat(sub: SubdivisionLabel, numerator: number): number {
  switch (sub) {
    case 'whole': return 1 / numerator;
    case 'half': return 0.5;
    case 'quarter': return 1;
    case 'eighth': return 2;
    case 'sixteenth': return 4;
    case 'quarter-triplet': return 3;
    case 'eighth-triplet': return 6;
  }
}

/** The tempo fields of a segment; `TrackPiece` satisfies it. Kept structural so this file imports nothing. */
export interface TempoPiece {
  bpm: number;
  repeats: number;
  rampEndBpm?: number;
  rampMode?: 'linear' | 'stepped';
  rampStepSize?: number;
  rampStepMeasures?: number;
}

/** Returns the effective BPM for a specific repetition (measure) within a piece. */
export function getBpmAtRepetition(piece: TempoPiece, repetition: number): number {
  if (!piece.rampMode || piece.rampEndBpm === undefined) return piece.bpm;
  const { bpm: startBpm, rampEndBpm: endBpm, repeats } = piece;
  if (piece.rampMode === 'linear') {
    if (repeats <= 1) return startBpm;
    const t = repetition / (repeats - 1);
    return startBpm + (endBpm - startBpm) * t;
  }
  // stepped
  const stepSize = piece.rampStepSize ?? 5;
  const stepMeasures = Math.max(1, piece.rampStepMeasures ?? 4);
  const direction = Math.sign(endBpm - startBpm);
  const steps = Math.floor(repetition / stepMeasures);
  const raw = startBpm + steps * stepSize * direction;
  return direction >= 0 ? Math.min(raw, endBpm) : Math.max(raw, endBpm);
}

/** What `measureTrack` needs from a segment; `TrackPiece` satisfies it. */
export interface TimedPiece extends TempoPiece {
  timeSignature: { numerator: number; denominator: number };
  subdivision: SubdivisionLabel;
}

/**
 * Playing time (seconds, at 100% speed) and the number of clicks `exportClickTrack` schedules for a
 * track. One definition for the band track limits that mirrors the exporter, so they can't drift apart.
 */
export function measureTrack(pieces: readonly TimedPiece[]): { seconds: number; clicks: number } {
  let seconds = 0;
  let clicks = 0;
  for (const piece of pieces) {
    const { numerator, denominator } = piece.timeSignature;
    const whole = piece.subdivision === 'whole';
    const subs = subsPerBeat(piece.subdivision, numerator);
    // Same tick count and spacing as the exporter, so an odd numerator on a half-note subdivision (which
    // rounds up to a longer bar) is measured as it really renders, not as the time signature suggests.
    const ticks = whole ? 1 : Math.round(numerator * subs);
    clicks += ticks * piece.repeats;
    for (let rep = 0; rep < piece.repeats; rep++) {
      const beatDur = (60 / getBpmAtRepetition(piece, rep)) * (4 / denominator);
      seconds += whole ? beatDur * numerator : ticks * (beatDur / subs);
    }
  }
  return { seconds, clicks };
}
