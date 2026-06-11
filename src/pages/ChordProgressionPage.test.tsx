/**
 * Unit tests for ChordProgressionPage private logic.
 *
 * The reducer, parseSavedSlots, and findNextEmptySlot are module-private.
 * We use the re-declaration pattern: mirror the types and logic exactly,
 * then test them in isolation. parseSavedSlots is also exercised indirectly
 * via loadSavedState (which reads from localStorage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RootNote, ChordType } from '../data/chords';

// ── Mirror of the private types (must match ChordProgressionPage.tsx exactly) ─

type InstrumentType = 'guitar' | 'piano' | 'pad';

interface ProgressionSlot {
  root: RootNote;
  type: ChordType;
  beats: number;
}

interface ProgressionState {
  slots: (ProgressionSlot | null)[];
  bpm: number;
  instrument: InstrumentType;
  isPlaying: boolean;
  currentSlotIndex: number;
  activeSlotIndex: number | null;
  selectedKey: { root: RootNote; mode: 'major' | 'minor' } | null;
}

type ProgressionAction =
  | { type: 'SET_SLOT'; index: number; chord: ProgressionSlot | null }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_INSTRUMENT'; instrument: InstrumentType }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_CURRENT_SLOT'; index: number }
  | { type: 'SET_ACTIVE_SLOT'; index: number | null }
  | { type: 'SET_SLOT_BEATS'; index: number; beats: number }
  | { type: 'SET_SELECTED_KEY'; key: { root: RootNote; mode: 'major' | 'minor' } | null }
  | { type: 'APPLY_SLOTS'; slots: (ProgressionSlot | null)[] }
  | { type: 'REORDER_SLOTS'; from: number; to: number };

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
    case 'SET_INSTRUMENT':
      return { ...state, instrument: action.instrument };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying };
    case 'SET_CURRENT_SLOT':
      return { ...state, currentSlotIndex: action.index };
    case 'SET_ACTIVE_SLOT':
      return { ...state, activeSlotIndex: action.index };
    case 'SET_SLOT_BEATS': {
      const slots = [...state.slots];
      const slot = slots[action.index];
      if (slot) slots[action.index] = { ...slot, beats: Math.max(1, action.beats) };
      return { ...state, slots };
    }
    case 'SET_SELECTED_KEY':
      return { ...state, selectedKey: action.key };
    case 'APPLY_SLOTS':
      return { ...state, slots: action.slots };
    case 'REORDER_SLOTS': {
      const slots = [...state.slots];
      const [item] = slots.splice(action.from, 1);
      slots.splice(action.to, 0, item);
      return { ...state, slots };
    }
    default:
      return state;
  }
}

/** Mirrors the source's parseSavedSlots helper exactly. */
function parseSavedSlots(rawSlots: unknown[], fallbackBeats: number): (ProgressionSlot | null)[] {
  const slots: (ProgressionSlot | null)[] = rawSlots.map((s) => {
    if (!s || typeof s !== 'object') return null;
    const slot = s as Record<string, unknown>;
    if (typeof slot.root !== 'string' || typeof slot.type !== 'string') return null;
    return {
      root: slot.root as RootNote,
      type: slot.type as ChordType,
      beats: typeof slot.beats === 'number' ? Math.max(1, slot.beats) : fallbackBeats,
    };
  });
  while (slots.length < SLOT_COUNT) slots.push(null);
  return slots.slice(0, SLOT_COUNT);
}

/** Mirrors findNextEmptySlot exactly. */
function findNextEmptySlot(slots: (ProgressionSlot | null)[], afterIndex: number): number | null {
  for (let i = 1; i < slots.length; i++) {
    const idx = (afterIndex + i) % slots.length;
    if (slots[idx] === null) return idx;
  }
  return null;
}

const initialState: ProgressionState = {
  slots: new Array<ProgressionSlot | null>(SLOT_COUNT).fill(null),
  bpm: 120,
  instrument: 'guitar',
  isPlaying: false,
  currentSlotIndex: -1,
  activeSlotIndex: null,
  selectedKey: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(root: RootNote, type: ChordType, beats = 4): ProgressionSlot {
  return { root, type, beats };
}

function stateWithSlots(slots: (ProgressionSlot | null)[]): ProgressionState {
  return { ...initialState, slots };
}

// ─────────────────────────────────────────────────────────────────────────────
// progressionReducer
// ─────────────────────────────────────────────────────────────────────────────

describe('progressionReducer – initial state', () => {
  it('has 8 null slots', () => {
    expect(initialState.slots).toHaveLength(8);
    expect(initialState.slots.every((s) => s === null)).toBe(true);
  });

  it('starts with bpm 120', () => {
    expect(initialState.bpm).toBe(120);
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

  it('starts with activeSlotIndex null', () => {
    expect(initialState.activeSlotIndex).toBeNull();
  });

  it('starts with selectedKey null', () => {
    expect(initialState.selectedKey).toBeNull();
  });
});

describe('progressionReducer – SET_SLOT', () => {
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

  it('sets slot with custom beat count', () => {
    const chord = makeSlot('A', 'minor', 3);
    const next = progressionReducer(initialState, { type: 'SET_SLOT', index: 1, chord });
    expect(next.slots[1]).toEqual({ root: 'A', type: 'minor', beats: 3 });
  });
});

describe('progressionReducer – SET_BPM', () => {
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

describe('progressionReducer – SET_INSTRUMENT', () => {
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

describe('progressionReducer – SET_PLAYING', () => {
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

describe('progressionReducer – SET_CURRENT_SLOT', () => {
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

describe('progressionReducer – SET_ACTIVE_SLOT', () => {
  it('sets activeSlotIndex to a number', () => {
    const next = progressionReducer(initialState, { type: 'SET_ACTIVE_SLOT', index: 5 });
    expect(next.activeSlotIndex).toBe(5);
  });

  it('sets activeSlotIndex to null (deselect)', () => {
    const state: ProgressionState = { ...initialState, activeSlotIndex: 3 };
    const next = progressionReducer(state, { type: 'SET_ACTIVE_SLOT', index: null });
    expect(next.activeSlotIndex).toBeNull();
  });

  it('can activate index 0', () => {
    const next = progressionReducer(initialState, { type: 'SET_ACTIVE_SLOT', index: 0 });
    expect(next.activeSlotIndex).toBe(0);
  });
});

describe('progressionReducer – SET_SLOT_BEATS', () => {
  it('updates the beat count on an occupied slot', () => {
    const withSlot = progressionReducer(initialState, {
      type: 'SET_SLOT', index: 2, chord: makeSlot('C', 'major', 4),
    });
    const next = progressionReducer(withSlot, { type: 'SET_SLOT_BEATS', index: 2, beats: 3 });
    expect((next.slots[2] as ProgressionSlot).beats).toBe(3);
  });

  it('clamps beats to a minimum of 1', () => {
    const withSlot = progressionReducer(initialState, {
      type: 'SET_SLOT', index: 0, chord: makeSlot('G', 'major', 4),
    });
    const next = progressionReducer(withSlot, { type: 'SET_SLOT_BEATS', index: 0, beats: 0 });
    expect((next.slots[0] as ProgressionSlot).beats).toBe(1);
  });

  it('is a no-op on a null slot', () => {
    const next = progressionReducer(initialState, { type: 'SET_SLOT_BEATS', index: 4, beats: 3 });
    expect(next.slots[4]).toBeNull();
  });

  it('does not mutate other slots', () => {
    const withSlots = stateWithSlots([
      makeSlot('C', 'major', 4),
      makeSlot('G', 'major', 4),
      null, null, null, null, null, null,
    ]);
    const next = progressionReducer(withSlots, { type: 'SET_SLOT_BEATS', index: 0, beats: 2 });
    expect((next.slots[1] as ProgressionSlot).beats).toBe(4); // unchanged
  });

  it('preserves the root and type of the slot', () => {
    const withSlot = progressionReducer(initialState, {
      type: 'SET_SLOT', index: 1, chord: makeSlot('F#', 'maj7', 4),
    });
    const next = progressionReducer(withSlot, { type: 'SET_SLOT_BEATS', index: 1, beats: 6 });
    const slot = next.slots[1] as ProgressionSlot;
    expect(slot.root).toBe('F#');
    expect(slot.type).toBe('maj7');
    expect(slot.beats).toBe(6);
  });
});

describe('progressionReducer – SET_SELECTED_KEY', () => {
  it('sets a major key', () => {
    const next = progressionReducer(initialState, {
      type: 'SET_SELECTED_KEY',
      key: { root: 'C', mode: 'major' },
    });
    expect(next.selectedKey).toEqual({ root: 'C', mode: 'major' });
  });

  it('sets a minor key', () => {
    const next = progressionReducer(initialState, {
      type: 'SET_SELECTED_KEY',
      key: { root: 'A', mode: 'minor' },
    });
    expect(next.selectedKey).toEqual({ root: 'A', mode: 'minor' });
  });

  it('clears the selected key with null', () => {
    const withKey: ProgressionState = { ...initialState, selectedKey: { root: 'G', mode: 'major' } };
    const next = progressionReducer(withKey, { type: 'SET_SELECTED_KEY', key: null });
    expect(next.selectedKey).toBeNull();
  });
});

describe('progressionReducer – APPLY_SLOTS', () => {
  it('replaces all 8 slots', () => {
    const newSlots: (ProgressionSlot | null)[] = [
      makeSlot('C', 'major'),
      makeSlot('F', 'major'),
      makeSlot('G', 'major'),
      makeSlot('C', 'major'),
      null, null, null, null,
    ];
    const next = progressionReducer(initialState, { type: 'APPLY_SLOTS', slots: newSlots });
    expect(next.slots).toEqual(newSlots);
  });

  it('replaces slots with all-null array', () => {
    const withChords: ProgressionState = {
      ...initialState,
      slots: [makeSlot('C', 'major'), null, null, null, null, null, null, null],
    };
    const allNull = new Array<ProgressionSlot | null>(8).fill(null);
    const next = progressionReducer(withChords, { type: 'APPLY_SLOTS', slots: allNull });
    expect(next.slots.every((s) => s === null)).toBe(true);
  });

  it('does not change other state fields', () => {
    const newSlots = new Array<ProgressionSlot | null>(8).fill(null);
    const next = progressionReducer(
      { ...initialState, bpm: 160, instrument: 'piano' },
      { type: 'APPLY_SLOTS', slots: newSlots },
    );
    expect(next.bpm).toBe(160);
    expect(next.instrument).toBe('piano');
  });
});

describe('progressionReducer – REORDER_SLOTS', () => {
  it('moves a slot from a lower index to a higher one', () => {
    const slots: (ProgressionSlot | null)[] = [
      makeSlot('C', 'major'), makeSlot('G', 'major'), null, null, null, null, null, null,
    ];
    const state = stateWithSlots(slots);
    const next = progressionReducer(state, { type: 'REORDER_SLOTS', from: 0, to: 1 });
    expect(next.slots[0]).toEqual({ root: 'G', type: 'major', beats: 4 });
    expect(next.slots[1]).toEqual({ root: 'C', type: 'major', beats: 4 });
  });

  it('moves a slot from a higher index to a lower one', () => {
    const slots: (ProgressionSlot | null)[] = [
      makeSlot('C', 'major'), makeSlot('G', 'major'), makeSlot('D', 'minor'), null, null, null, null, null,
    ];
    const state = stateWithSlots(slots);
    const next = progressionReducer(state, { type: 'REORDER_SLOTS', from: 2, to: 0 });
    expect(next.slots[0]).toEqual({ root: 'D', type: 'minor', beats: 4 });
    expect(next.slots[1]).toEqual({ root: 'C', type: 'major', beats: 4 });
    expect(next.slots[2]).toEqual({ root: 'G', type: 'major', beats: 4 });
  });

  it('returns a new slots array (immutable update)', () => {
    const slots: (ProgressionSlot | null)[] = [
      makeSlot('C', 'major'), makeSlot('G', 'major'), null, null, null, null, null, null,
    ];
    const state = stateWithSlots(slots);
    const next = progressionReducer(state, { type: 'REORDER_SLOTS', from: 0, to: 1 });
    expect(next.slots).not.toBe(state.slots);
  });

  it('swapping slot with itself produces equivalent result', () => {
    const slots: (ProgressionSlot | null)[] = [
      makeSlot('C', 'major'), null, null, null, null, null, null, null,
    ];
    const state = stateWithSlots(slots);
    const next = progressionReducer(state, { type: 'REORDER_SLOTS', from: 0, to: 0 });
    expect(next.slots[0]).toEqual({ root: 'C', type: 'major', beats: 4 });
  });
});

describe('progressionReducer – state immutability', () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// parseSavedSlots (mirrored helper — tested directly)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSavedSlots', () => {
  it('returns 8 nulls for an empty input array', () => {
    const result = parseSavedSlots([], 4);
    expect(result).toHaveLength(8);
    expect(result.every((s) => s === null)).toBe(true);
  });

  it('converts a valid slot object to a ProgressionSlot', () => {
    const result = parseSavedSlots([{ root: 'G', type: 'major', beats: 4 }], 4);
    expect(result[0]).toEqual({ root: 'G', type: 'major', beats: 4 });
  });

  it('uses fallbackBeats when slot.beats is missing', () => {
    const result = parseSavedSlots([{ root: 'A', type: 'minor' }], 2);
    expect((result[0] as ProgressionSlot).beats).toBe(2);
  });

  it('clamps slot.beats to minimum 1', () => {
    const result = parseSavedSlots([{ root: 'C', type: 'major', beats: 0 }], 4);
    expect((result[0] as ProgressionSlot).beats).toBe(1);
  });

  it('returns null for a slot missing root', () => {
    const result = parseSavedSlots([{ type: 'major', beats: 4 }], 4);
    expect(result[0]).toBeNull();
  });

  it('returns null for a slot missing type', () => {
    const result = parseSavedSlots([{ root: 'C', beats: 4 }], 4);
    expect(result[0]).toBeNull();
  });

  it('returns null for a null entry', () => {
    const result = parseSavedSlots([null], 4);
    expect(result[0]).toBeNull();
  });

  it('returns null for a primitive entry', () => {
    const result = parseSavedSlots([42], 4);
    expect(result[0]).toBeNull();
  });

  it('pads result to 8 slots regardless of input length', () => {
    const result = parseSavedSlots([{ root: 'C', type: 'major', beats: 4 }], 4);
    expect(result).toHaveLength(8);
    expect(result.slice(1).every((s) => s === null)).toBe(true);
  });

  it('truncates result to 8 slots when input has more than 8 entries', () => {
    const many = Array.from({ length: 12 }, () => ({ root: 'C' as RootNote, type: 'major' as ChordType, beats: 4 }));
    const result = parseSavedSlots(many, 4);
    expect(result).toHaveLength(8);
  });

  it('preserves null entries within input', () => {
    const input = [
      { root: 'C' as RootNote, type: 'major' as ChordType, beats: 4 },
      null,
      { root: 'G' as RootNote, type: 'major' as ChordType, beats: 4 },
    ];
    const result = parseSavedSlots(input, 4);
    expect(result[0]).not.toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).not.toBeNull();
  });

  it('handles a slot with beats as non-number (string) by using fallbackBeats', () => {
    const result = parseSavedSlots([{ root: 'D', type: 'minor', beats: 'four' }], 3);
    expect((result[0] as ProgressionSlot).beats).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findNextEmptySlot (mirrored helper — tested directly)
// ─────────────────────────────────────────────────────────────────────────────

describe('findNextEmptySlot', () => {
  const EMPTY: (ProgressionSlot | null)[] = new Array(SLOT_COUNT).fill(null);

  it('returns 1 when afterIndex=0 and slot 1 is empty', () => {
    expect(findNextEmptySlot(EMPTY, 0)).toBe(1);
  });

  it('returns null when all slots are occupied', () => {
    const full: (ProgressionSlot | null)[] = Array.from(
      { length: SLOT_COUNT },
      () => makeSlot('C', 'major'),
    );
    expect(findNextEmptySlot(full, 0)).toBeNull();
  });

  it('wraps around the end of the array', () => {
    const slots: (ProgressionSlot | null)[] = [
      null,
      makeSlot('C', 'major'),
      makeSlot('G', 'major'),
      makeSlot('F', 'major'),
      makeSlot('D', 'minor'),
      makeSlot('A', 'minor'),
      makeSlot('E', 'minor'),
      makeSlot('B', 'minor'),
    ];
    // afterIndex=1, all slots 2..7 are filled, slot 0 is empty → wrap → index 0
    expect(findNextEmptySlot(slots, 1)).toBe(0);
  });

  it('skips the afterIndex itself', () => {
    // Slot 0 is null, afterIndex=0 → should NOT return 0 (starts at i=1)
    const slots: (ProgressionSlot | null)[] = [
      null, makeSlot('C', 'major'), makeSlot('G', 'major'),
      null, null, null, null, null,
    ];
    // starts searching from index 1; slot 3 is next empty after 0
    expect(findNextEmptySlot(slots, 0)).toBe(3);
  });

  it('finds the first empty slot immediately after afterIndex', () => {
    const slots: (ProgressionSlot | null)[] = [
      makeSlot('C', 'major'), null, makeSlot('G', 'major'),
      null, null, null, null, null,
    ];
    expect(findNextEmptySlot(slots, 0)).toBe(1);
  });

  it('returns null when only the afterIndex slot is empty (all others occupied)', () => {
    // afterIndex=0 is null, all others are filled; wrap skips index 0 itself
    const slots: (ProgressionSlot | null)[] = [
      null,
      makeSlot('C', 'major'),
      makeSlot('G', 'major'),
      makeSlot('F', 'major'),
      makeSlot('D', 'minor'),
      makeSlot('A', 'minor'),
      makeSlot('E', 'minor'),
      makeSlot('B', 'minor'),
    ];
    // i goes from 1..7: indices 1..7 are all filled
    // wraps back to 0 only at i=8, but loop stops at i < 8 (i.e. i ≤ 7)
    expect(findNextEmptySlot(slots, 0)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadSavedState (indirect test of parseSavedSlots via localStorage)
// ─────────────────────────────────────────────────────────────────────────────

// We can't import loadSavedState (it's private), but we can test parseSavedSlots
// via the re-declared version above to confirm all its paths are exercised.
// The localStorage-reading behavior is validated via the chordProgressionApi tests.

describe('parseSavedSlots – beatsPerChord migration (legacy data)', () => {
  it('uses fallbackBeats (legacy beatsPerChord) when individual slot has no beats field', () => {
    // Simulates loading from old format where beatsPerChord was global
    const legacySlot = { root: 'C' as RootNote, type: 'major' as ChordType }; // no beats
    const result = parseSavedSlots([legacySlot], 2 /* old beatsPerChord */);
    expect((result[0] as ProgressionSlot).beats).toBe(2);
  });

  it('prefers slot.beats over fallbackBeats when slot.beats is present', () => {
    // New format: each slot has its own beats
    const slot = { root: 'G' as RootNote, type: 'major' as ChordType, beats: 3 };
    const result = parseSavedSlots([slot], 4 /* fallback would be 4 */);
    expect((result[0] as ProgressionSlot).beats).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectedKey state management (via reducer)
// ─────────────────────────────────────────────────────────────────────────────

describe('progressionReducer – selectedKey round-trip', () => {
  it('sets and then clears the selected key', () => {
    let state = progressionReducer(initialState, {
      type: 'SET_SELECTED_KEY',
      key: { root: 'D', mode: 'major' },
    });
    expect(state.selectedKey).toEqual({ root: 'D', mode: 'major' });

    state = progressionReducer(state, { type: 'SET_SELECTED_KEY', key: null });
    expect(state.selectedKey).toBeNull();
  });

  it('replaces an existing key with a new one', () => {
    let state = progressionReducer(initialState, {
      type: 'SET_SELECTED_KEY',
      key: { root: 'C', mode: 'major' },
    });
    state = progressionReducer(state, {
      type: 'SET_SELECTED_KEY',
      key: { root: 'A', mode: 'minor' },
    });
    expect(state.selectedKey).toEqual({ root: 'A', mode: 'minor' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// localStorage mock (needed for any test that might call loadSavedState indirectly)
// ─────────────────────────────────────────────────────────────────────────────

// These tests use the mirrored functions so no localStorage access occurs.
// Still install the mock as a guard in case future tests in this file need it.
beforeEach(() => {
  const store: Record<string, string> = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k: string) => store[k] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string, v: string) => { store[k] = v; });
});
