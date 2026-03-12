import type { RootNote, ChordType } from '../data/chords';
import { CHORD_DATABASE } from '../data/chords';
import type { ChordBeat, ChordInstrumentType } from '../types';

// Standard guitar tuning: low E → high e (MIDI note numbers)
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

const CHORD_INTERVALS: Record<ChordType, number[]> = {
  major:  [0, 4, 7],
  minor:  [0, 3, 7],
  sus2:   [0, 2, 7],
  sus4:   [0, 5, 7],
  aug:    [0, 4, 8],
  dim:    [0, 3, 6],
  dim7:   [0, 3, 6, 9],
  m7b5:   [0, 3, 6, 10],
  add9:   [0, 4, 7, 14],
  add4:   [0, 4, 5, 7],
  add7:   [0, 4, 7, 10],
  maj7:   [0, 4, 7, 11],
  m7:     [0, 3, 7, 10],
  '7':    [0, 4, 7, 10],
  '6':    [0, 4, 7, 9],
  m6:     [0, 3, 7, 9],
  '9':    [0, 4, 7, 10, 14],
  maj9:   [0, 4, 7, 11, 14],
  '5':    [0, 7],
};

const ROOT_SEMITONES: Record<RootNote, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

export function chordFrequencies(root: RootNote, type: ChordType): number[] {
  const rootSemitone = ROOT_SEMITONES[root];
  // Base MIDI for root at octave 4 (C4 = MIDI 60)
  const rootMidi = 60 + rootSemitone;
  const intervals = CHORD_INTERVALS[type] ?? [0, 4, 7];
  return intervals.map((interval) => {
    // Keep notes within a 2-octave range around root
    const midi = rootMidi + (interval % 12) + (interval >= 12 ? 12 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  });
}

function pluckString(ctx: AudioContext, dest: AudioNode, freq: number, startTime: number, vol: number) {
  const env = ctx.createGain();
  env.connect(dest);
  env.gain.setValueAtTime(0.001, startTime);
  env.gain.linearRampToValueAtTime(vol, startTime + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + 2.2);

  for (let h = 1; h <= 6; h++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * h;
    const hg = ctx.createGain();
    hg.gain.value = 0.5 / (h * h);
    osc.connect(hg);
    hg.connect(env);
    osc.start(startTime);
    osc.stop(startTime + 2.5);
  }
}

export function playGuitarChord(
  ctx: AudioContext,
  dest: AudioNode,
  root: RootNote,
  type: ChordType,
  time: number,
) {
  const entry = CHORD_DATABASE.find((e) => e.root === root && e.type === type);
  if (entry?.voicings[0]) {
    const frets = entry.voicings[0].frets;
    frets.forEach((fret, i) => {
      if (fret < 0) return;
      const freq = 440 * Math.pow(2, (OPEN_MIDI[i] + fret - 69) / 12);
      pluckString(ctx, dest, freq, time, 0.22);
    });
  } else {
    // Fallback: freq-based
    const freqs = chordFrequencies(root, type);
    freqs.forEach((freq) => {
      pluckString(ctx, dest, freq, time, 0.18);
    });
  }
}

export function playPianoChord(
  ctx: AudioContext,
  dest: AudioNode,
  root: RootNote,
  type: ChordType,
  time: number,
) {
  const freqs = chordFrequencies(root, type);
  const releaseTime = 4;

  freqs.forEach((freq) => {
    const env = ctx.createGain();
    env.connect(dest);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.18, time + 0.015);
    env.gain.exponentialRampToValueAtTime(0.08, time + 0.3);
    env.gain.setValueAtTime(0.08, time + releaseTime - 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, time + releaseTime + 0.1);

    // Fundamental + 2nd harmonic for piano-like tone
    for (let h = 1; h <= 3; h++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * h;
      const hg = ctx.createGain();
      hg.gain.value = 1 / (h * h);
      osc.connect(hg);
      hg.connect(env);
      osc.start(time);
      osc.stop(time + releaseTime + 0.2);
    }
  });
}

export function playPadChord(
  ctx: AudioContext,
  dest: AudioNode,
  root: RootNote,
  type: ChordType,
  time: number,
) {
  const freqs = chordFrequencies(root, type);
  const sustainTime = 6;

  freqs.forEach((freq) => {
    const env = ctx.createGain();
    env.connect(dest);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.12, time + 0.4);
    env.gain.setValueAtTime(0.12, time + sustainTime - 0.3);
    env.gain.linearRampToValueAtTime(0, time + sustainTime + 0.4);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    // Slight detune for warmth
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 1.003;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    osc.start(time);
    osc2.start(time);
    osc.stop(time + sustainTime + 0.5);
    osc2.stop(time + sustainTime + 0.5);
  });
}

export function playChordSynth(
  ctx: AudioContext,
  dest: AudioNode,
  chord: Pick<ChordBeat, 'root' | 'type'>,
  _instrument: ChordInstrumentType,
  time: number,
) {
  playGuitarChord(ctx, dest, chord.root, chord.type, time);
}
