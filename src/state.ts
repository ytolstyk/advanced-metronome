import type {
  AppState,
  ChordBeat,
  ChordInstrumentType,
  ChordPattern,
  InstrumentId,
  LoopConfig,
  Measure,
  Pattern,
  TimeSignature,
} from './types';
import type { Preset } from './presets';
import {
  DEFAULT_BPM,
  DEFAULT_HUMANIZE,
  DEFAULT_LOOP_COUNT,
  DEFAULT_MEASURE,
  DEFAULT_MEASURE_COUNT,
  DEFAULT_VOLUME,
  INSTRUMENT_IDS,
} from './constants';

export function getTotalBeats(measures: Measure[]): number {
  return measures.reduce(
    (sum, m) => sum + m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1),
    0,
  );
}

function createEmptyPattern(totalBeats: number): Pattern {
  const pattern = {} as Pattern;
  for (const id of INSTRUMENT_IDS) {
    pattern[id] = new Array(totalBeats).fill(false);
  }
  return pattern;
}

function resizePattern(
  pattern: Pattern,
  oldMeasures: Measure[],
  newMeasures: Measure[],
): Pattern {
  const newTotal = getTotalBeats(newMeasures);
  const oldTotal = getTotalBeats(oldMeasures);

  if (newTotal === oldTotal) return pattern;

  const resized = {} as Pattern;
  for (const id of INSTRUMENT_IDS) {
    const old = pattern[id];
    const arr = new Array(newTotal).fill(false);
    for (let i = 0; i < Math.min(oldTotal, newTotal); i++) {
      arr[i] = old[i];
    }
    resized[id] = arr;
  }
  return resized;
}

// When a measure's time signature changes, remap beats in that measure
// proportionally so they land on the nearest equivalent position in the new grid.
// Other measures are copied verbatim.
function remapPatternForMeasureChange(
  pattern: Pattern,
  oldMeasures: Measure[],
  newMeasures: Measure[],
  changedIndex: number,
): Pattern {
  const newTotal = getTotalBeats(newMeasures);
  const result = {} as Pattern;

  for (const id of INSTRUMENT_IDS) {
    const newArr = new Array(newTotal).fill(false);
    let oldOffset = 0;
    let newOffset = 0;

    for (let mi = 0; mi < newMeasures.length; mi++) {
      const oldTs = oldMeasures[mi].timeSignature;
      const newTs = newMeasures[mi].timeSignature;
      const oldSteps = oldTs.beats * (oldTs.stepsPerBeat ?? 1);
      const newSteps = newTs.beats * (newTs.stepsPerBeat ?? 1);

      if (mi === changedIndex) {
        // Map each active step to the proportionally equivalent position in the new grid.
        // Beat-boundary steps land exactly; subdivision steps snap to nearest.
        for (let i = 0; i < oldSteps; i++) {
          if (pattern[id][oldOffset + i]) {
            const newStep = Math.min(
              newSteps - 1,
              Math.round((i / oldSteps) * newSteps),
            );
            newArr[newOffset + newStep] = true;
          }
        }
      } else {
        // Unchanged measure: copy as-is
        for (let i = 0; i < Math.min(oldSteps, newSteps); i++) {
          newArr[newOffset + i] = pattern[id][oldOffset + i] ?? false;
        }
      }

      oldOffset += oldSteps;
      newOffset += newSteps;
    }

    result[id] = newArr;
  }

  return result;
}

function sanitizeChordBeat(chord: ChordBeat): ChordBeat {
  return {
    ...chord,
    fadeDuration: chord.fadeDuration ?? 100,
    fadeCurve: chord.fadeCurve ?? 'linear',
  };
}

function resizeChordPattern(
  pattern: ChordPattern,
  newTotal: number,
): ChordPattern {
  const newPattern: ChordPattern = new Array(newTotal).fill(null);
  for (let i = 0; i < newTotal && i < pattern.length; i++) {
    const chord = pattern[i];
    if (chord !== null) {
      newPattern[i] = sanitizeChordBeat(chord);
    }
  }
  return newPattern;
}

function createDefaultMeasures(): Measure[] {
  return Array.from({ length: DEFAULT_MEASURE_COUNT }, () => ({
    timeSignature: { ...DEFAULT_MEASURE.timeSignature },
  }));
}

export const STORAGE_KEY = 'drum-machine-state';

export interface StorageValidationError {
  reason: string;
}

export function validateStoredState(): StorageValidationError | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return { reason: 'Stored data could not be parsed as JSON.' };
    }

    if (!data || typeof data !== 'object') {
      return { reason: 'Stored data is not a valid object.' };
    }

    const d = data as Record<string, unknown>;
    const config = d['config'] as Record<string, unknown> | undefined;

    if (!config || !Array.isArray(config['measures']) || (config['measures'] as unknown[]).length === 0) {
      return { reason: 'Stored config is missing or has no measures.' };
    }

    const measures = config['measures'] as Record<string, unknown>[];
    for (let i = 0; i < measures.length; i++) {
      const ts = measures[i]['timeSignature'] as Record<string, unknown> | undefined;
      if (!ts || typeof ts['beats'] !== 'number' || ts['beats'] <= 0) {
        return { reason: `Measure ${i + 1} has an invalid or missing time signature.` };
      }
    }

    const totalBeats = getTotalBeats(
      measures.map((m) => ({ timeSignature: m['timeSignature'] as TimeSignature })),
    );

    const pattern = d['pattern'] as Record<string, unknown> | undefined;
    if (!pattern || typeof pattern !== 'object') {
      return { reason: 'Stored drum pattern is missing.' };
    }

    for (const id of INSTRUMENT_IDS) {
      const track = pattern[id];
      if (!Array.isArray(track)) {
        return { reason: `Drum pattern is missing the "${id}" instrument track.` };
      }
      if (track.length !== totalBeats) {
        return {
          reason: `Pattern length mismatch for "${id}": expected ${totalBeats} steps (based on your measures), but found ${track.length}.`,
        };
      }
    }

    return null;
  } catch {
    return { reason: 'An unexpected error occurred while reading saved data.' };
  }
}

interface PersistedState {
  config: Omit<LoopConfig, 'humanize' | 'volume'> & { humanize?: number; volume?: number };
  pattern: Pattern;
  chordPattern?: ChordPattern;
  chordInstrument?: ChordInstrumentType;
  chordVolume?: number;
}

export function saveState(
  config: AppState['config'],
  pattern: Pattern,
  chordPattern: ChordPattern,
  chordInstrument: ChordInstrumentType,
  chordVolume: number,
): void {
  try {
    const persisted: PersistedState = { config, pattern, chordPattern, chordInstrument, chordVolume };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function createInitialState(): AppState {
  const persisted = loadPersistedState();
  if (persisted) {
    const totalBeats = getTotalBeats(persisted.config.measures);
    const rawChordPattern = persisted.chordPattern ?? new Array(totalBeats).fill(null);
    return {
      config: {
        humanize: DEFAULT_HUMANIZE,
        volume: DEFAULT_VOLUME,
        ...persisted.config,
      },
      pattern: persisted.pattern,
      chordPattern: resizeChordPattern(rawChordPattern, totalBeats),
      chordInstrument: 'guitar',
      chordVolume: persisted.chordVolume ?? 80,
      isPlaying: false,
      currentBeat: 0,
      currentLoop: 0,
    };
  }
  const measures = createDefaultMeasures();
  const totalBeats = getTotalBeats(measures);
  return {
    config: {
      measures,
      bpm: DEFAULT_BPM,
      loopCount: DEFAULT_LOOP_COUNT,
      humanize: DEFAULT_HUMANIZE,
      volume: DEFAULT_VOLUME,
    },
    pattern: createEmptyPattern(totalBeats),
    chordPattern: new Array(totalBeats).fill(null),
    chordInstrument: 'guitar',
    chordVolume: 80,
    isPlaying: false,
    currentBeat: 0,
    currentLoop: 0,
  };
}

export type Action =
  | { type: 'TOGGLE_BEAT'; instrument: InstrumentId; beat: number }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_LOOP_COUNT'; loopCount: number }
  | { type: 'SET_MEASURE_COUNT'; count: number }
  | {
      type: 'SET_TIME_SIGNATURE';
      measureIndex: number;
      timeSignature: TimeSignature;
    }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CURRENT_BEAT'; beat: number }
  | { type: 'SET_CURRENT_LOOP'; loop: number }
  | { type: 'CLEAR_PATTERN' }
  | { type: 'COPY_MEASURE'; from: number; to: number }
  | { type: 'DELETE_MEASURE'; index: number }
  | { type: 'APPLY_PRESET'; preset: Preset }
  | { type: 'RESTORE_STATE'; state: AppState }
  | { type: 'APPLY_USER_PRESET'; config: LoopConfig; pattern: Pattern; chordPattern: ChordPattern }
  | { type: 'SET_HUMANIZE'; humanize: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'SET_CHORD_BEAT'; beat: number; chord: ChordBeat | null }
  | { type: 'SET_CHORD_INSTRUMENT'; instrument: ChordInstrumentType }
  | { type: 'CLEAR_CHORD_PATTERN' }
  | { type: 'SET_CHORD_VOLUME'; volume: number };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'TOGGLE_BEAT': {
      const newPattern = { ...state.pattern };
      const arr = [...newPattern[action.instrument]];
      arr[action.beat] = !arr[action.beat];
      newPattern[action.instrument] = arr;
      return { ...state, pattern: newPattern };
    }

    case 'SET_BPM':
      return {
        ...state,
        config: { ...state.config, bpm: action.bpm },
      };

    case 'SET_LOOP_COUNT':
      return {
        ...state,
        config: { ...state.config, loopCount: action.loopCount },
      };

    case 'SET_MEASURE_COUNT': {
      const current = state.config.measures;
      let newMeasures: Measure[];
      if (action.count > current.length) {
        newMeasures = [
          ...current,
          ...Array.from({ length: action.count - current.length }, () => ({
            timeSignature: { ...DEFAULT_MEASURE.timeSignature },
          })),
        ];
      } else {
        newMeasures = current.slice(0, action.count);
      }
      const newTotal = getTotalBeats(newMeasures);
      return {
        ...state,
        config: { ...state.config, measures: newMeasures },
        pattern: resizePattern(state.pattern, current, newMeasures),
        chordPattern: resizeChordPattern(state.chordPattern, newTotal),
        isPlaying: false,
        currentBeat: 0,
        currentLoop: 0,
      };
    }

    case 'SET_TIME_SIGNATURE': {
      const oldMeasures = state.config.measures;
      const newMeasures = oldMeasures.map((m, i) =>
        i === action.measureIndex
          ? { timeSignature: action.timeSignature }
          : m,
      );
      const newTotal = getTotalBeats(newMeasures);
      return {
        ...state,
        config: { ...state.config, measures: newMeasures },
        pattern: remapPatternForMeasureChange(
          state.pattern,
          oldMeasures,
          newMeasures,
          action.measureIndex,
        ),
        chordPattern: resizeChordPattern(state.chordPattern, newTotal),
        isPlaying: false,
        currentBeat: 0,
        currentLoop: 0,
      };
    }

    case 'SET_PLAYING':
      return {
        ...state,
        isPlaying: action.isPlaying,
        ...(action.isPlaying ? {} : {}),
      };

    case 'SET_CURRENT_BEAT':
      return { ...state, currentBeat: action.beat };

    case 'SET_CURRENT_LOOP':
      return { ...state, currentLoop: action.loop };

    case 'CLEAR_PATTERN':
      return {
        ...state,
        pattern: createEmptyPattern(getTotalBeats(state.config.measures)),
      };

    case 'COPY_MEASURE': {
      const measures = state.config.measures;
      const stepsOf = (m: Measure) =>
        m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1);

      // Copy the source time signature onto the destination measure so that
      // stepsPerBeat (half-beats, triplets) is preserved exactly.
      const fromTs = measures[action.from].timeSignature;
      const newMeasures = measures.map((m, i) =>
        i === action.to ? { timeSignature: { ...fromTs } } : m,
      );

      // Locate the source beat data in the existing pattern.
      let fromOffset = 0;
      for (let i = 0; i < action.from; i++) fromOffset += stepsOf(measures[i]);
      const fromSteps = stepsOf(measures[action.from]);

      // Rebuild the full pattern array for the new measure layout.
      const newPattern = {} as Pattern;
      for (const id of INSTRUMENT_IDS) {
        const oldArr = state.pattern[id];
        const newArr = new Array(getTotalBeats(newMeasures)).fill(false);
        let oldOff = 0;
        let newOff = 0;
        for (let mi = 0; mi < newMeasures.length; mi++) {
          const oldSteps = stepsOf(measures[mi]);
          const newSteps = stepsOf(newMeasures[mi]);
          if (mi === action.to) {
            for (let i = 0; i < fromSteps; i++) {
              newArr[newOff + i] = oldArr[fromOffset + i] ?? false;
            }
          } else {
            for (let i = 0; i < oldSteps; i++) {
              newArr[newOff + i] = oldArr[oldOff + i] ?? false;
            }
          }
          oldOff += oldSteps;
          newOff += newSteps;
        }
        newPattern[id] = newArr;
      }

      const stepCountChanged =
        stepsOf(measures[action.to]) !== stepsOf(newMeasures[action.to]);
      const newTotal2 = getTotalBeats(newMeasures);
      return {
        ...state,
        config: { ...state.config, measures: newMeasures },
        pattern: newPattern,
        chordPattern: resizeChordPattern(state.chordPattern, newTotal2),
        ...(stepCountChanged
          ? { isPlaying: false, currentBeat: 0, currentLoop: 0 }
          : {}),
      };
    }

    case 'DELETE_MEASURE': {
      const measures = state.config.measures;
      if (measures.length <= 1) return state;
      const newMeasures = measures.filter((_, i) => i !== action.index);
      const stepsOf = (m: Measure) =>
        m.timeSignature.beats * (m.timeSignature.stepsPerBeat ?? 1);
      const newPattern = {} as Pattern;
      for (const id of INSTRUMENT_IDS) {
        const oldArr = state.pattern[id];
        const newArr: boolean[] = [];
        let offset = 0;
        for (let mi = 0; mi < measures.length; mi++) {
          const steps = stepsOf(measures[mi]);
          if (mi !== action.index) {
            for (let i = 0; i < steps; i++) {
              newArr.push(oldArr[offset + i] ?? false);
            }
          }
          offset += steps;
        }
        newPattern[id] = newArr;
      }
      const newTotalDel = getTotalBeats(newMeasures);
      return {
        ...state,
        config: { ...state.config, measures: newMeasures },
        pattern: newPattern,
        chordPattern: resizeChordPattern(state.chordPattern, newTotalDel),
        isPlaying: false,
        currentBeat: 0,
        currentLoop: 0,
      };
    }

    case 'APPLY_PRESET': {
      const { preset } = action;
      const stepsPerBeat = preset.stepsPerBeat ?? 1;
      const totalSteps = preset.beats * stepsPerBeat;
      const measures: Measure[] = [
        { timeSignature: { beats: preset.beats, subdivision: preset.subdivision, stepsPerBeat } },
      ];
      const pattern = {} as Pattern;
      for (const id of INSTRUMENT_IDS) {
        const hits = preset.pattern[id] ?? [];
        const arr = new Array(totalSteps).fill(false);
        for (const step of hits) {
          if (step < totalSteps) arr[step] = true;
        }
        pattern[id] = arr;
      }
      return {
        ...state,
        config: { ...state.config, measures },
        pattern,
        chordPattern: new Array(totalSteps).fill(null),
        isPlaying: false,
        currentBeat: 0,
        currentLoop: 0,
      };
    }

    case 'APPLY_USER_PRESET':
      return {
        ...state,
        config: action.config,
        pattern: action.pattern,
        chordPattern: action.chordPattern,
        isPlaying: false,
        currentBeat: 0,
        currentLoop: 0,
      };

    case 'SET_HUMANIZE':
      return { ...state, config: { ...state.config, humanize: action.humanize } };

    case 'SET_VOLUME':
      return { ...state, config: { ...state.config, volume: action.volume } };

    case 'SET_CHORD_BEAT': {
      const newChordPattern = [...state.chordPattern];
      newChordPattern[action.beat] = action.chord;
      return { ...state, chordPattern: newChordPattern };
    }

    case 'SET_CHORD_INSTRUMENT':
      return { ...state, chordInstrument: action.instrument };

    case 'CLEAR_CHORD_PATTERN':
      return {
        ...state,
        chordPattern: new Array(getTotalBeats(state.config.measures)).fill(null),
      };

    case 'SET_CHORD_VOLUME':
      return { ...state, chordVolume: action.volume };

    case 'RESTORE_STATE':
      return {
        ...action.state,
        isPlaying: state.isPlaying,
        currentBeat: 0,
        currentLoop: state.currentLoop,
      };

    default:
      return state;
  }
}
