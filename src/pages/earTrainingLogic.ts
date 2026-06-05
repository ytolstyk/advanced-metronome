import {
  INTERVAL_NAMES,
  INTERVAL_SEMITONES,
  INTERVAL_RANGE_MAX,
  type IntervalName,
  type IntervalRange,
  type IntervalDirection,
} from '../data/intervals';
import { ROOT_NOTES, type ChordType } from '../data/chords';
import { SCALE_MODES, type ScaleMode } from '../data/scales';

export interface IntervalQuestion {
  key: string;
  rootMidi: number;
  intervalName: IntervalName;
  semitones: number;
  actualDirection: 'ascending' | 'descending' | 'harmonic';
}

export function generateIntervalQuestion(
  range: IntervalRange,
  direction: IntervalDirection,
  excludeKey: string | null,
): IntervalQuestion {
  const maxSemitones = INTERVAL_RANGE_MAX[range];
  const eligible = INTERVAL_NAMES.filter((n) => INTERVAL_SEMITONES[n] <= maxSemitones);

  for (let attempt = 0; attempt < 40; attempt++) {
    const intervalName = eligible[Math.floor(Math.random() * eligible.length)];
    const semitones = INTERVAL_SEMITONES[intervalName];
    const rootMidi = 48 + Math.floor(Math.random() * 13); // C3–C4

    const resolvedDir: 'ascending' | 'descending' | 'harmonic' =
      direction === 'random'
        ? (['ascending', 'descending', 'harmonic'] as const)[Math.floor(Math.random() * 3)]
        : direction;

    const key = `${intervalName}-${resolvedDir}`;
    if (key !== excludeKey) {
      return { key, rootMidi, intervalName, semitones, actualDirection: resolvedDir };
    }
  }
  return {
    key: 'Octave-ascending',
    rootMidi: 48,
    intervalName: 'Octave',
    semitones: 12,
    actualDirection: 'ascending',
  };
}

export interface ChordQuestion {
  key: string;
  root: (typeof ROOT_NOTES)[number];
  type: ChordType;
}

export function generateChordQuestion(
  enabled: ReadonlySet<ChordType>,
  excludeKey: string | null,
): ChordQuestion {
  const types = [...enabled];
  for (let attempt = 0; attempt < 40; attempt++) {
    const root = ROOT_NOTES[Math.floor(Math.random() * ROOT_NOTES.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const key = `${root}-${type}`;
    if (key !== excludeKey) return { key, root, type };
  }
  return { key: 'C-major', root: 'C', type: 'major' };
}

export interface ScaleQuestion {
  key: string;
  rootMidi: number;
  mode: ScaleMode;
}

export function generateScaleQuestion(
  enabled: ReadonlySet<ScaleMode>,
  excludeKey: string | null,
): ScaleQuestion {
  const modes = [...enabled];
  for (let attempt = 0; attempt < 40; attempt++) {
    const rootMidi = 48 + Math.floor(Math.random() * 13); // C3–C4
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const key = mode; // mode name is sufficient for dedup (root doesn't matter perceptually)
    if (key !== excludeKey) return { key, rootMidi, mode };
  }
  // If all modes deduped (only 1 mode enabled), ignore excludeKey
  const mode = SCALE_MODES.find((m) => enabled.has(m)) ?? 'major';
  return { key: mode, rootMidi: 60, mode };
}
