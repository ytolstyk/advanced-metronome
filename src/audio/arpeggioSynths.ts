import { pluckString } from './chordSynths';
import { STANDARD_OPEN_MIDI } from '../data/arpeggios';

export type SweepDirection = 'up' | 'down' | 'up-down';

export function playArpeggio(
  ctx: AudioContext,
  dest: AudioNode,
  frets: number[],
  openMidi: number[] = STANDARD_OPEN_MIDI,
  time: number,
  noteDelay = 0.1,
  direction: SweepDirection = 'up',
): void {
  const pairs = frets
    .map((fret, i) => ({ fret, midi: openMidi[i] }))
    .filter(p => p.fret >= 0);

  const upSeq = pairs;
  const downSeq = [...pairs].reverse();

  let seq: typeof pairs;
  if (direction === 'up') {
    seq = upSeq;
  } else if (direction === 'down') {
    seq = downSeq;
  } else {
    // up-down: omit the top note on the way back to avoid doubling
    seq = [...upSeq, ...downSeq.slice(1)];
  }

  seq.forEach(({ fret, midi }, idx) => {
    const freq = 440 * Math.pow(2, (midi + fret - 69) / 12);
    pluckString(ctx, dest, freq, time + idx * noteDelay, 0.2);
  });
}
