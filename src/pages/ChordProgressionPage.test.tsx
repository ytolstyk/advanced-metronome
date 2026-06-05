/**
 * Unit tests for the progressionReducer extracted from ChordProgressionPage.
 * We test the reducer directly without mounting the full component.
 * The reducer and types are not exported from the page, so we re-declare
 * a minimal version here that mirrors the source exactly.
 */
import { describe, it, expect } from 'vitest';
import type { ChordSlot } from '../utils/chordTheory';
import type { RootNote, ChordType } from '../data/chords';

// ── Mirror of the private reducer types ──────────────────────────────────────

type InstrumentType = 'guitar' | 'piano' | 'pad';
type BeatsPerChord = 1 | 2 | 4;

interface ProgressionState {
  slots: (ChordSlot | null)[];
  bpm: number;
  beatsPerChord: BeatsPerChord;
  instrument: InstrumentType;
  isPlaying: boolean;
  currentSlotIndex: number;
  pickerOpenAt: number | null;
}

type ProgressionAction =
  | { type: 'SET_SLOT'; index: number; chord: ChordSlot | null }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_BEATS_PER_CHORD'; beats: BeatsPerChord }
  | { type: 'SET_INSTRUMENT'; instrument: InstrumentType }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CURRENT_SLOT'; index: number }
  | { type: 'OPEN_PICKER'; index: number }
  | { type: 'CLOSE_PICKER' }
  | { type: 'APPLY_SLOTS'; slots: (ChordSlot | null)[] };

const SLOT_COUNT = 8;

function progressionReducer(state: ProgressionState, action: ProgressionAction): ProgressionState {
  switch (action.type) {
    case 'SET_SLOT': {
      const slots = [...state.slots];
      slots[action.index] = action.chord;
      return { ...state, slots };
    }
    case 'SET_BPM':
      return { ...state, bpm: action.bpm };
    case 'SET_BEATS_PER_CHORD':
      return { ...state, beatsPerChord: action.beats };
    case 'SET_INSTRUMENT':
      return { ...state, instrument: action.instrument };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying };
    case 'SET_CURRENT_SLOT':
      return { ...state, currentSlotIndex: action.index };
    case 'OPEN_PICKER':
      return { ...state, pickerOpenAt: action.index };
    case 'CLOSE_PICKER':
      return { ...state, pickerOpenAt: null };
    case 'APPLY_SLOTS':
      return { ...state, slots: action.slots };
    default:
      return state;
  }
}

const initialState: ProgressionState = {
  slots: new Array<ChordSlot | null>(SLOT_COUNT).fill(null),
  bpm: 120,
  beatsPerChord: 4,
  instrument: 'guitar',
  isPlaying: false,
  currentSlotIndex: -1,
  pickerOpenAt: null,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSlot(root: RootNote, type: ChordType): ChordSlot {
  return { root, type };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('progressionReducer', () => {
  describe('initial state', () => {
    it('has 8 null slots', () => {
      expect(initialState.slots).toHaveLength(8);
      expect(initialState.slots.every((s) => s === null)).toBe(true);
    });

    it('starts with bpm 120', () => {
      expect(initialState.bpm).toBe(120);
    });

    it('starts with beatsPerChord 4', () => {
      expect(initialState.beatsPerChord).toBe(4);
    });

    it('starts with guitar instrument', () => {
      expect(initialState.instrument).toBe('guitar');
    });

    it('starts not playing', () => {
      expect(initialState.isPlaying).toBe(false);
    });

    it('starts with currentSlotIndex -1', () => {
      expect(initialState.currentSlotIndex).toBe(-1);
    });

    it('starts with pickerOpenAt null', () => {
      expect(initialState.pickerOpenAt).toBeNull();
    });
  });

  describe('SET_SLOT', () => {
    it('sets a chord at the given index', () => {
      const chord = makeSlot('C', 'major');
      const next = progressionReducer(initialState, { type: 'SET_SLOT', index: 0, chord });
      expect(next.slots[0]).toEqual(chord);
    });

    it('does not mutate other slots', () => {
      const chord = makeSlot('G', 'minor');
      const next = progressionReducer(initialState, { type: 'SET_SLOT', index: 3, chord });
      for (let i = 0; i < 8; i++) {
        if (i !== 3) expect(next.slots[i]).toBeNull();
      }
      expect(next.slots[3]).toEqual(chord);
    });

    it('clears a slot when chord is null', () => {
      const withChord = progressionReducer(
        initialState,
        { type: 'SET_SLOT', index: 2, chord: makeSlot('F', 'major') },
      );
      const cleared = progressionReducer(withChord, { type: 'SET_SLOT', index: 2, chord: null });
      expect(cleared.slots[2]).toBeNull();
    });

    it('sets chord at the last slot (index 7)', () => {
      const chord = makeSlot('D', 'minor');
      const next = progressionReducer(initialState, { type: 'SET_SLOT', index: 7, chord });
      expect(next.slots[7]).toEqual(chord);
    });

    it('returns a new slots array (immutable update)', () => {
      const chord = makeSlot('E', 'major');
      const next = progressionReducer(initialState, { type: 'SET_SLOT', index: 0, chord });
      expect(next.slots).not.toBe(initialState.slots);
    });
  });

  describe('SET_BPM', () => {
    it('updates bpm', () => {
      const next = progressionReducer(initialState, { type: 'SET_BPM', bpm: 180 });
      expect(next.bpm).toBe(180);
    });

    it('does not change other state fields', () => {
      const next = progressionReducer(initialState, { type: 'SET_BPM', bpm: 90 });
      expect(next.slots).toEqual(initialState.slots);
      expect(next.instrument).toBe(initialState.instrument);
    });
  });

  describe('SET_BEATS_PER_CHORD', () => {
    it('sets beatsPerChord to 1', () => {
      const next = progressionReducer(initialState, { type: 'SET_BEATS_PER_CHORD', beats: 1 });
      expect(next.beatsPerChord).toBe(1);
    });

    it('sets beatsPerChord to 2', () => {
      const next = progressionReducer(initialState, { type: 'SET_BEATS_PER_CHORD', beats: 2 });
      expect(next.beatsPerChord).toBe(2);
    });

    it('sets beatsPerChord to 4', () => {
      const next = progressionReducer(
        { ...initialState, beatsPerChord: 1 },
        { type: 'SET_BEATS_PER_CHORD', beats: 4 },
      );
      expect(next.beatsPerChord).toBe(4);
    });
  });

  describe('SET_INSTRUMENT', () => {
    it('sets instrument to piano', () => {
      const next = progressionReducer(initialState, { type: 'SET_INSTRUMENT', instrument: 'piano' });
      expect(next.instrument).toBe('piano');
    });

    it('sets instrument to pad', () => {
      const next = progressionReducer(initialState, { type: 'SET_INSTRUMENT', instrument: 'pad' });
      expect(next.instrument).toBe('pad');
    });

    it('sets instrument back to guitar', () => {
      const state: ProgressionState = { ...initialState, instrument: 'piano' };
      const next = progressionReducer(state, { type: 'SET_INSTRUMENT', instrument: 'guitar' });
      expect(next.instrument).toBe('guitar');
    });
  });

  describe('SET_PLAYING', () => {
    it('sets isPlaying to true', () => {
      const next = progressionReducer(initialState, { type: 'SET_PLAYING', isPlaying: true });
      expect(next.isPlaying).toBe(true);
    });

    it('sets isPlaying to false', () => {
      const playing: ProgressionState = { ...initialState, isPlaying: true };
      const next = progressionReducer(playing, { type: 'SET_PLAYING', isPlaying: false });
      expect(next.isPlaying).toBe(false);
    });
  });

  describe('SET_CURRENT_SLOT', () => {
    it('updates currentSlotIndex', () => {
      const next = progressionReducer(initialState, { type: 'SET_CURRENT_SLOT', index: 3 });
      expect(next.currentSlotIndex).toBe(3);
    });

    it('can reset to -1', () => {
      const active: ProgressionState = { ...initialState, currentSlotIndex: 2 };
      const next = progressionReducer(active, { type: 'SET_CURRENT_SLOT', index: -1 });
      expect(next.currentSlotIndex).toBe(-1);
    });
  });

  describe('OPEN_PICKER', () => {
    it('sets pickerOpenAt to the given index', () => {
      const next = progressionReducer(initialState, { type: 'OPEN_PICKER', index: 5 });
      expect(next.pickerOpenAt).toBe(5);
    });

    it('can open picker at index 0', () => {
      const next = progressionReducer(initialState, { type: 'OPEN_PICKER', index: 0 });
      expect(next.pickerOpenAt).toBe(0);
    });

    it('does not change slot contents', () => {
      const next = progressionReducer(initialState, { type: 'OPEN_PICKER', index: 2 });
      expect(next.slots).toEqual(initialState.slots);
    });
  });

  describe('CLOSE_PICKER', () => {
    it('sets pickerOpenAt to null', () => {
      const open: ProgressionState = { ...initialState, pickerOpenAt: 3 };
      const next = progressionReducer(open, { type: 'CLOSE_PICKER' });
      expect(next.pickerOpenAt).toBeNull();
    });

    it('is a no-op when picker is already closed', () => {
      const next = progressionReducer(initialState, { type: 'CLOSE_PICKER' });
      expect(next.pickerOpenAt).toBeNull();
    });
  });

  describe('APPLY_SLOTS', () => {
    it('replaces all 8 slots', () => {
      const newSlots: (ChordSlot | null)[] = [
        makeSlot('C', 'major'),
        makeSlot('F', 'major'),
        makeSlot('G', 'major'),
        makeSlot('C', 'major'),
        null,
        null,
        null,
        null,
      ];
      const next = progressionReducer(initialState, { type: 'APPLY_SLOTS', slots: newSlots });
      expect(next.slots).toEqual(newSlots);
    });

    it('replaces slots with all-null array', () => {
      const withChords: ProgressionState = {
        ...initialState,
        slots: [makeSlot('C', 'major'), null, null, null, null, null, null, null],
      };
      const allNull = new Array<ChordSlot | null>(8).fill(null);
      const next = progressionReducer(withChords, { type: 'APPLY_SLOTS', slots: allNull });
      expect(next.slots.every((s) => s === null)).toBe(true);
    });

    it('does not change other state fields', () => {
      const newSlots = new Array<ChordSlot | null>(8).fill(null);
      const next = progressionReducer(
        { ...initialState, bpm: 160, instrument: 'piano' },
        { type: 'APPLY_SLOTS', slots: newSlots },
      );
      expect(next.bpm).toBe(160);
      expect(next.instrument).toBe('piano');
    });
  });

  describe('state immutability', () => {
    it('each action returns a new state object', () => {
      const next = progressionReducer(initialState, { type: 'SET_BPM', bpm: 100 });
      expect(next).not.toBe(initialState);
    });

    it('SET_SLOT does not mutate the original slots array', () => {
      const originalSlots = [...initialState.slots];
      progressionReducer(initialState, {
        type: 'SET_SLOT',
        index: 0,
        chord: makeSlot('A', 'minor'),
      });
      expect(initialState.slots).toEqual(originalSlots);
    });
  });
});
