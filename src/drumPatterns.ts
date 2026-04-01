import type { InstrumentId } from './types';

export interface DrumStyle {
  name: string;
  description: string;
  stepsPerBeat: 1 | 2 | 3 | 4;
  /** Returns 0-indexed step positions for one measure of `beats` beats */
  getPattern(beats: number): Partial<Record<InstrumentId, number[]>>;
}

function dedup(arr: number[]): number[] {
  return [...new Set(arr)].sort((a, b) => a - b);
}

/** Convert a fraction (0..1 exclusive) of total steps to a step index */
function frac(f: number, total: number): number {
  return Math.min(total - 1, Math.max(0, Math.round(f * total)));
}

export const DRUM_STYLES: DrumStyle[] = [
  {
    name: 'Rock',
    description: 'Straight 16ths · kick on 1 & 3 · snare on 2 & 4',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const kick: number[] = [];
      const snare: number[] = [];
      const hihat: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        if (b % 2 === 0) kick.push(s);
        else snare.push(s);
        hihat.push(s, s + 2); // 8th-note hi-hat
      }
      return { kick, snare, hihat };
    },
  },
  {
    name: 'Four on the Floor',
    description: 'Electronic · kick every beat · open hat on last 8th',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const kick: number[] = [];
      const snare: number[] = [];
      const hihat: number[] = [];
      const openhat: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        kick.push(s);
        if (b % 2 === 1) snare.push(s);
        hihat.push(s, s + 2);
      }
      const lastEighth = beats * spb - 2;
      if (lastEighth >= 0) openhat.push(lastEighth);
      return { kick, snare, hihat, openhat };
    },
  },
  {
    name: 'Hip-Hop',
    description: 'Syncopated kick · backbeat snare · quarter hi-hat',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const total = beats * spb;
      const kick = dedup(
        [frac(0, total), frac(3 / 16, total), frac(0.5, total), frac(11 / 16, total)].filter(
          x => x < total,
        ),
      );
      const snare = dedup(
        [frac(0.25, total), frac(0.875, total)].filter(x => x < total),
      );
      const hihat = Array.from({ length: beats }, (_, b) => b * spb);
      const rim = dedup([frac(10 / 16, total)].filter(x => x < total));
      return { kick, snare, hihat, rim };
    },
  },
  {
    name: 'Funk',
    description: 'Dense 16th hi-hat · syncopated kick · clap on 2 & 4',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const total = beats * spb;
      const kick = dedup(
        [0, frac(3 / 16, total), frac(0.5, total)].filter(x => x < total),
      );
      const snare = dedup(
        [frac(0.25, total), frac(0.75, total)].filter(x => x < total),
      );
      const hihat = Array.from({ length: total }, (_, i) => i);
      const clap = dedup(
        [frac(0.25, total), frac(0.75, total)].filter(x => x < total),
      );
      const rim = dedup([frac(10 / 16, total)].filter(x => x < total));
      return { kick, snare, hihat, clap, rim };
    },
  },
  {
    name: 'Jazz',
    description: 'Swing triplets · ride cymbal · sparse kick & snare',
    stepsPerBeat: 3,
    getPattern(beats) {
      const spb = 3;
      const hihat: number[] = []; // used as ride cymbal
      const kick: number[] = [];
      const snare: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        hihat.push(s, s + 2); // swing ride: beat + upswing
        if (b === 0) kick.push(s);
        if (b % 2 === 1) snare.push(s);
      }
      return { hihat, kick, snare };
    },
  },
  {
    name: 'Reggae',
    description: '8th notes · kick on 1 & 3 · skank on 2 & 4',
    stepsPerBeat: 2,
    getPattern(beats) {
      const spb = 2;
      const kick: number[] = [];
      const snare: number[] = [];
      const hihat: number[] = [];
      const rim: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        if (b % 2 === 0) kick.push(s);
        else {
          snare.push(s);
          rim.push(s);
        }
        hihat.push(s + 1); // off-beat hi-hat
      }
      return { kick, snare, hihat, rim };
    },
  },
  {
    name: 'Bossa Nova',
    description: 'Brazilian · cross-rhythm rim · 8th hi-hat',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const total = beats * spb;
      const kick = dedup(
        [0, frac(7 / 16, total), frac(11 / 16, total)].filter(x => x < total),
      );
      const snare = dedup(
        [frac(3 / 16, total), frac(10 / 16, total)].filter(x => x < total),
      );
      const hihat: number[] = [];
      for (let i = 0; i < total; i += 2) hihat.push(i);
      const rim = dedup(
        [0, frac(3 / 16, total), frac(6 / 16, total), frac(10 / 16, total), frac(12 / 16, total)].filter(
          x => x < total,
        ),
      );
      return { kick, snare, hihat, rim };
    },
  },
  {
    name: 'Waltz',
    description: '3/4 feel · kick on 1 · snare on 2 & 3 · 8th hi-hat',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const kick: number[] = [];
      const snare: number[] = [];
      const hihat: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        if (b % 3 === 0) kick.push(s);
        else snare.push(s);
        hihat.push(s, s + 2);
      }
      return { kick, snare, hihat };
    },
  },
  {
    name: 'Shuffle',
    description: 'Swing triplets · 12/8 feel · open hat on upswings',
    stepsPerBeat: 3,
    getPattern(beats) {
      const spb = 3;
      const kick: number[] = [];
      const snare: number[] = [];
      const hihat: number[] = [];
      const openhat: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        if (b % 2 === 0) kick.push(s);
        else snare.push(s);
        hihat.push(s);
        openhat.push(s + 2); // upswing open hat
      }
      return { kick, snare, hihat, openhat };
    },
  },
  {
    name: 'Metal',
    description: 'Double kick 8ths · driving snare on 2 & 4 · all 16ths',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const kick: number[] = [];
      const snare: number[] = [];
      const hihat: number[] = [];
      for (let b = 0; b < beats; b++) {
        const s = b * spb;
        kick.push(s, s + 2); // double kick on 8ths
        if (b % 2 === 1) snare.push(s);
        for (let i = 0; i < spb; i++) hihat.push(s + i); // all 16ths
      }
      return { kick, snare, hihat };
    },
  },
  {
    name: 'Latin',
    description: 'Samba/Salsa · syncopated · clave rim pattern',
    stepsPerBeat: 4,
    getPattern(beats) {
      const spb = 4;
      const total = beats * spb;
      const kick = dedup(
        [0, frac(3 / 8, total), frac(0.5, total), frac(7 / 8, total)].filter(x => x < total),
      );
      const snare = dedup(
        [frac(0.25, total), frac(0.625, total)].filter(x => x < total),
      );
      const hihat: number[] = [];
      for (let i = 0; i < total; i += 2) hihat.push(i);
      const rim = dedup(
        [
          0,
          frac(3 / 16, total),
          frac(3 / 8, total),
          frac(0.5, total),
          frac(11 / 16, total),
          frac(7 / 8, total),
        ].filter(x => x < total),
      );
      const tom = dedup(
        [frac(0.75, total), frac(15 / 16, total)].filter(x => x < total),
      );
      return { kick, snare, hihat, rim, tom };
    },
  },
];
