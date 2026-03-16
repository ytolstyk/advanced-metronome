import type { InstrumentId } from './types';

export interface Preset {
  name: string;
  beats: number;
  subdivision: number;
  stepsPerBeat?: number; // 1=straight (default), 2=half beats, 3=triplets, 4=quarter beats (16th notes)
  pattern: Partial<Record<InstrumentId, number[]>>;
}

// All steps are 0-indexed within total steps (beats × stepsPerBeat).
export const PRESETS: Preset[] = [
  {
    // 4/4, 16th-note grid (4 beats × 4 steps = 16 steps)
    name: 'Basic Rock',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 4,
    pattern: {
      kick:  [0, 8],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    // 4/4, 16th-note grid (4 beats × 4 steps = 16 steps)
    name: 'Four on the Floor',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 4,
    pattern: {
      kick:    [0, 4, 8, 12],
      snare:   [4, 12],
      hihat:   [0, 2, 4, 6, 8, 10, 12, 14],
      openhat: [14],
    },
  },
  {
    // 4/4, 16th-note grid (4 beats × 4 steps = 16 steps)
    name: 'Hip-Hop',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 4,
    pattern: {
      kick:  [0, 3, 8, 11],
      snare: [4, 14],
      hihat: [0, 4, 8, 12],
      rim:   [10],
    },
  },
  {
    // 4/4, 16th-note grid (4 beats × 4 steps = 16 steps)
    name: 'Funk',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 4,
    pattern: {
      kick:  [0, 3, 8],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
      clap:  [4, 12],
      rim:   [10],
    },
  },
  {
    // 4/4, 8th-note grid (4 beats × 2 steps = 8 steps)
    name: 'Reggae',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 2,
    pattern: {
      kick:  [0, 4],
      snare: [3, 7],
      hihat: [1, 3, 5, 7],
      rim:   [0, 2, 4, 6],
    },
  },
  {
    // 4/4, 16th-note grid (4 beats × 4 steps = 16 steps)
    name: 'Bossa Nova',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 4,
    pattern: {
      kick:  [0, 7, 11],
      snare: [3, 10],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
      rim:   [0, 3, 6, 10, 12],
    },
  },
  {
    // 3/4, 16th-note grid (3 beats × 4 steps = 12 steps)
    name: 'Waltz',
    beats: 3,
    subdivision: 4,
    stepsPerBeat: 4,
    pattern: {
      kick:  [0, 4, 8],
      snare: [4, 10],
      hihat: [0, 2, 4, 6, 8, 10],
    },
  },
  {
    // 4/4, triplet grid (4 beats × 3 steps = 12 steps, 12/8 shuffle feel)
    name: 'Shuffle',
    beats: 4,
    subdivision: 4,
    stepsPerBeat: 3,
    pattern: {
      kick:    [0, 6],
      snare:   [3, 9],
      hihat:   [0, 3, 6, 9],
      openhat: [2, 5, 8, 11],
    },
  },
];
