import { playPianoNote } from './pianoSynth';
import { pluckString, playPianoChord } from './chordSynths';
import type { RootNote, ChordType } from '../data/chords';
import { SCALE_INTERVALS } from '../data/scales';
import type { ScaleMode } from '../data/scales';

export function playInterval(
  ctx: AudioContext,
  rootMidi: number,
  semitones: number,
  direction: 'ascending' | 'descending' | 'harmonic',
): () => void {
  if (ctx.state === 'suspended') void ctx.resume();
  const f1 = 440 * Math.pow(2, (rootMidi - 69) / 12);
  const f2 = 440 * Math.pow(2, (rootMidi + semitones - 69) / 12);

  const stops: Array<() => void> = [];
  let timerId: ReturnType<typeof window.setTimeout> | null = null;

  if (direction === 'harmonic') {
    stops.push(playPianoNote(ctx, f1));
    stops.push(playPianoNote(ctx, f2));
  } else if (direction === 'ascending') {
    stops.push(playPianoNote(ctx, f1));
    timerId = window.setTimeout(() => { stops.push(playPianoNote(ctx, f2)); }, 600);
  } else {
    stops.push(playPianoNote(ctx, f2));
    timerId = window.setTimeout(() => { stops.push(playPianoNote(ctx, f1)); }, 600);
  }

  return () => {
    if (timerId !== null) window.clearTimeout(timerId);
    stops.forEach((fn) => fn());
  };
}

export function playEarTrainingChord(
  ctx: AudioContext,
  root: RootNote,
  type: ChordType,
): () => void {
  if (ctx.state === 'suspended') void ctx.resume();
  const killGain = ctx.createGain();
  killGain.gain.value = 1;
  killGain.connect(ctx.destination);
  playPianoChord(ctx, killGain, root, type, ctx.currentTime);
  return () => { killGain.gain.setTargetAtTime(0, ctx.currentTime, 0.015); };
}

export function playScale(
  ctx: AudioContext,
  rootMidi: number,
  mode: ScaleMode,
  stepMs = 280,
): () => void {
  if (ctx.state === 'suspended') void ctx.resume();
  const killGain = ctx.createGain();
  killGain.gain.value = 1;
  killGain.connect(ctx.destination);
  const asc = SCALE_INTERVALS[mode];
  const ascFull = [...asc, 12];
  const descFull = [...ascFull].reverse();
  const allOffsets = [...ascFull, ...descFull.slice(1)];
  const stepSec = stepMs / 1000;
  allOffsets.forEach((semitones, i) => {
    const freq = 440 * Math.pow(2, (rootMidi + semitones - 69) / 12);
    pluckString(ctx, killGain, freq, ctx.currentTime + i * stepSec, 0.3);
  });
  return () => { killGain.gain.setTargetAtTime(0, ctx.currentTime, 0.015); };
}
