import type {
  AppState,
  InstrumentId,
  LoopConfig,
  Measure,
  Pattern,
  TimeSignature,
} from './types';
import type { Preset } from './presets';
import {
  DEFAULT_BPM,
  DEFAULT_LOOP_COUNT,
  DEFAULT_MEASURE,
  DEFAULT_MEASURE_COUNT,
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

function createDefaultMeasures(): Measure[] {
  return Array.from({ length: DEFAULT_MEASURE_COUNT }, () => ({
    timeSignature: { ...DEFAULT_MEASURE.timeSignature },
  }));
}

const STORAGE_KEY = 'drum-machine-state';

interface PersistedState {
  config: AppState['config'];
  pattern: Pattern;
}

export function saveState(config: AppState['config'], pattern: Pattern): void {
  try {
    const persisted: PersistedState = { config, pattern };
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
    return {
      config: persisted.config,
      pattern: persisted.pattern,
      isPlaying: false,
      currentBeat: 0,
      currentLoop: 0,
    };
  }
  const measures = createDefaultMeasures();
  return {
    config: {
      measures,
      bpm: DEFAULT_BPM,
      loopCount: DEFAULT_LOOP_COUNT,
    },
    pattern: createEmptyPattern(getTotalBeats(measures)),
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
  | { type: 'APPLY_PRESET'; preset: Preset }
  | { type: 'RESTORE_STATE'; state: AppState }
  | { type: 'APPLY_USER_PRESET'; config: LoopConfig; pattern: Pattern };

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
      return {
        ...state,
        config: { ...state.config, measures: newMeasures },
        pattern: resizePattern(state.pattern, current, newMeasures),
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
      return {
        ...state,
        config: { ...state.config, measures: newMeasures },
        pattern: remapPatternForMeasureChange(
          state.pattern,
          oldMeasures,
          newMeasures,
          action.measureIndex,
        ),
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
      const stepsOf = (i: number) =>
        measures[i].timeSignature.beats * (measures[i].timeSignature.stepsPerBeat ?? 1);
      let fromOffset = 0;
      for (let i = 0; i < action.from; i++) fromOffset += stepsOf(i);
      const fromBeats = stepsOf(action.from);

      let toOffset = 0;
      for (let i = 0; i < action.to; i++) toOffset += stepsOf(i);
      const toBeats = stepsOf(action.to);

      const copyCount = Math.min(fromBeats, toBeats);
      const newPattern = { ...state.pattern };
      for (const id of INSTRUMENT_IDS) {
        const arr = [...newPattern[id]];
        for (let i = 0; i < copyCount; i++) {
          arr[toOffset + i] = state.pattern[id][fromOffset + i];
        }
        for (let i = copyCount; i < toBeats; i++) {
          arr[toOffset + i] = false;
        }
        newPattern[id] = arr;
      }
      return { ...state, pattern: newPattern };
    }

    case 'APPLY_PRESET': {
      const { preset } = action;
      const measures: Measure[] = [
        { timeSignature: { beats: preset.beats, subdivision: preset.subdivision } },
      ];
      const pattern = {} as Pattern;
      for (const id of INSTRUMENT_IDS) {
        const hits = preset.pattern[id] ?? [];
        const arr = new Array(preset.beats).fill(false);
        for (const step of hits) {
          if (step < preset.beats) arr[step] = true;
        }
        pattern[id] = arr;
      }
      return {
        ...state,
        config: { ...state.config, measures },
        pattern,
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
        isPlaying: false,
        currentBeat: 0,
        currentLoop: 0,
      };

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
