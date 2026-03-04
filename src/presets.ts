import type { InstrumentId } from './types';

export interface Preset {
  name: string;
  beats: number;
  subdivision: number;
  pattern: Partial<Record<InstrumentId, number[]>>;
}

// All steps are 0-indexed. Patterns use 16th-note resolution unless noted.
export const PRESETS: Preset[] = [
  {
    name: 'Basic Rock',
    beats: 16,
    subdivision: 16,
    pattern: {
      kick:  [0, 8],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    name: 'Four on the Floor',
    beats: 16,
    subdivision: 16,
    pattern: {
      kick:    [0, 4, 8, 12],
      snare:   [4, 12],
      hihat:   [0, 2, 4, 6, 8, 10, 12, 14],
      openhat: [14],
    },
  },
  {
    name: 'Hip-Hop',
    beats: 16,
    subdivision: 16,
    pattern: {
      kick:  [0, 3, 8, 11],
      snare: [4, 14],
      hihat: [0, 4, 8, 12],
      rim:   [10],
    },
  },
  {
    name: 'Funk',
    beats: 16,
    subdivision: 16,
    pattern: {
      kick:  [0, 3, 8],
      snare: [4, 12],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
      clap:  [4, 12],
      rim:   [10],
    },
  },
  {
    name: 'Reggae',
    beats: 16,
    subdivision: 16,
    pattern: {
      kick:  [0, 8],
      snare: [6, 14],
      hihat: [2, 6, 10, 14],
      rim:   [0, 4, 8, 12],
    },
  },
  {
    name: 'Bossa Nova',
    beats: 16,
    subdivision: 16,
    pattern: {
      kick:  [0, 7, 11],
      snare: [3, 10],
      hihat: [0, 2, 4, 6, 8, 10, 12, 14],
      rim:   [0, 3, 6, 10, 12],
    },
  },
  {
    // 3/4 time: 12 sixteenth notes = 3 quarter notes
    name: 'Waltz',
    beats: 12,
    subdivision: 16,
    pattern: {
      kick:  [0, 4, 8],
      snare: [4, 10],
      hihat: [0, 2, 4, 6, 8, 10],
    },
  },
  {
    // 12/8 shuffle feel
    name: 'Shuffle',
    beats: 12,
    subdivision: 16,
    pattern: {
      kick:    [0, 6],
      snare:   [4, 10],
      hihat:   [0, 4, 8],
      openhat: [2, 6, 10],
    },
  },
];
