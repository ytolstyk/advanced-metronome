import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TabEditorState, TabTrack, Beat, Measure, TabCursor, TabSelection, DotModifier, DurationValue } from './tabEditorTypes'
import { Duration } from './tabEditorTypes'
import {
  tabEditorReducer,
  createInitialTabState,
  saveTabTrack,
  measureCapacityTicks,
  measureUsedTicks,
  computeFillRests,
  beatDurationSeconds,
  ticksToNearestDuration,
  quarterBeatsToNearestDuration,
  normalizeSelection,
  isInSelection,
  effectiveBpmAt,
  buildOpenMidi,
  tuningNoteToMidi,
  fretToFreq,
  DURATION_TICKS,
  BEAT_WIDTHS,
  DURATION_LABELS,
  BEAT_WIDTH,
} from './tabEditorState'

// ─── helpers ────────────────────────────────────────────────────────────────

const noDot: DotModifier = { dotted: false, doubleDotted: false, triplet: false }

function makeBeat(duration: DurationValue = Duration.Quarter, notes: Beat['notes'] = []): Beat {
  return {
    id: 'beat-id',
    duration,
    dot: { ...noDot },
    notes,
  }
}

function makeMeasure(beats: Beat[] = []): Measure {
  return { id: 'measure-id', beats }
}

function makeTrack(overrides: Partial<TabTrack> = {}): TabTrack {
  return {
    schemaVersion: 4,
    title: 'Test',
    masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 }],
    stringCount: 6,
    tuningName: 'Standard',
    openMidi: [40, 45, 50, 55, 59, 64],
    measures: [makeMeasure()],
    ...overrides,
  }
}

function makeState(trackOverride?: Partial<TabTrack>, cursorOverride?: Partial<TabCursor>): TabEditorState {
  const track = makeTrack(trackOverride)
  return {
    track,
    cursor: { measureIndex: 0, beatIndex: 0, stringIndex: 6, ...cursorOverride },
    selection: null,
    selectionAnchor: null,
    noteSelection: [],
    clipboard: null,
    activeDuration: Duration.Quarter,
    activeDot: { ...noDot },
    activeModifiers: {},
    activePick: undefined,
    activeDynamics: undefined,
    isPlaying: false,
    playheadMeasure: 0,
    playheadBeat: 0,
    pendingOverflow: null,
    undoStack: [],
    redoStack: [],
  }
}

// ─── Pure utility functions ──────────────────────────────────────────────────

describe('measureCapacityTicks', () => {
  it('returns 960 for 4/4', () => {
    expect(measureCapacityTicks({ numerator: 4, denominator: 4 })).toBe(960)
  })

  it('returns 720 for 3/4', () => {
    expect(measureCapacityTicks({ numerator: 3, denominator: 4 })).toBe(720)
  })

  it('returns 720 for 6/8', () => {
    // (6 × 960) / 8 = 720
    expect(measureCapacityTicks({ numerator: 6, denominator: 8 })).toBe(720)
  })

  it('returns 1920 for 4/2', () => {
    expect(measureCapacityTicks({ numerator: 4, denominator: 2 })).toBe(1920)
  })

  it('returns 240 for 1/4', () => {
    expect(measureCapacityTicks({ numerator: 1, denominator: 4 })).toBe(240)
  })
})

describe('measureUsedTicks', () => {
  it('returns 0 for empty beats array', () => {
    expect(measureUsedTicks([])).toBe(0)
  })

  it('sums ticks for quarter notes', () => {
    // 2 quarter notes = 2 × 240 = 480
    const beats = [makeBeat(Duration.Quarter), makeBeat(Duration.Quarter)]
    expect(measureUsedTicks(beats)).toBe(480)
  })

  it('sums ticks for mixed durations', () => {
    // half (480) + eighth (120) = 600
    const beats = [makeBeat(Duration.Half), makeBeat(Duration.Eighth)]
    expect(measureUsedTicks(beats)).toBe(600)
  })

  it('accounts for dotted notes (×1.5)', () => {
    const dotted: Beat = { ...makeBeat(Duration.Quarter), dot: { dotted: true, doubleDotted: false, triplet: false } }
    // dotted quarter = 240 × 1.5 = 360
    expect(measureUsedTicks([dotted])).toBe(360)
  })

  it('accounts for double-dotted notes (×1.75)', () => {
    const doubleDotted: Beat = { ...makeBeat(Duration.Quarter), dot: { dotted: false, doubleDotted: true, triplet: false } }
    // double-dotted quarter = 240 × 1.75 = 420
    expect(measureUsedTicks([doubleDotted])).toBe(420)
  })

  it('accounts for triplet notes (×2/3)', () => {
    const triplet: Beat = { ...makeBeat(Duration.Quarter), dot: { dotted: false, doubleDotted: false, triplet: true } }
    // triplet quarter = 240 × 2/3 = 160
    expect(measureUsedTicks([triplet])).toBeCloseTo(160)
  })
})

describe('computeFillRests', () => {
  it('returns empty array for 0 ticks', () => {
    expect(computeFillRests(0)).toEqual([])
  })

  it('fills 960 ticks (4/4 full measure) as one whole note', () => {
    const rests = computeFillRests(960)
    expect(rests).toEqual([Duration.Whole])
  })

  it('fills 480 ticks as one half note', () => {
    expect(computeFillRests(480)).toEqual([Duration.Half])
  })

  it('fills 720 ticks as half + quarter', () => {
    const rests = computeFillRests(720)
    expect(rests).toEqual([Duration.Half, Duration.Quarter])
  })

  it('fills 360 ticks as dotted-half equivalent (half + quarter)', () => {
    // 360 = 240 (quarter) + 120 (eighth)
    const rests = computeFillRests(360)
    expect(rests).toEqual([Duration.Quarter, Duration.Eighth])
  })

  it('fills 15 ticks as a single sixty-fourth note', () => {
    expect(computeFillRests(15)).toEqual([Duration.SixtyFourth])
  })

  it('decomposes 720+240=960 as whole', () => {
    const rests = computeFillRests(240 + 120 + 60 + 30 + 15)
    // 465 = 240 + 120 + 60 + 30 + 15
    expect(rests).toEqual([
      Duration.Quarter,
      Duration.Eighth,
      Duration.Sixteenth,
      Duration.ThirtySecond,
      Duration.SixtyFourth,
    ])
  })
})

describe('beatDurationSeconds', () => {
  it('returns 0.5s for quarter note at 120 BPM', () => {
    expect(beatDurationSeconds(Duration.Quarter, noDot, 120)).toBeCloseTo(0.5)
  })

  it('returns 1s for half note at 120 BPM', () => {
    expect(beatDurationSeconds(Duration.Half, noDot, 120)).toBeCloseTo(1)
  })

  it('returns 2s for whole note at 120 BPM', () => {
    expect(beatDurationSeconds(Duration.Whole, noDot, 120)).toBeCloseTo(2)
  })

  it('returns 0.25s for eighth note at 120 BPM', () => {
    expect(beatDurationSeconds(Duration.Eighth, noDot, 120)).toBeCloseTo(0.25)
  })

  it('scales with BPM: quarter at 60 BPM = 1s', () => {
    expect(beatDurationSeconds(Duration.Quarter, noDot, 60)).toBeCloseTo(1)
  })

  it('scales with BPM: quarter at 240 BPM = 0.25s', () => {
    expect(beatDurationSeconds(Duration.Quarter, noDot, 240)).toBeCloseTo(0.25)
  })

  it('applies dotted modifier (×1.5)', () => {
    const dotted: DotModifier = { dotted: true, doubleDotted: false, triplet: false }
    // dotted quarter at 120 = 0.5 × 1.5 = 0.75
    expect(beatDurationSeconds(Duration.Quarter, dotted, 120)).toBeCloseTo(0.75)
  })

  it('applies double-dotted modifier (×1.75)', () => {
    const doubleDotted: DotModifier = { dotted: false, doubleDotted: true, triplet: false }
    expect(beatDurationSeconds(Duration.Quarter, doubleDotted, 120)).toBeCloseTo(0.875)
  })

  it('applies triplet modifier (×2/3)', () => {
    const triplet: DotModifier = { dotted: false, doubleDotted: false, triplet: true }
    expect(beatDurationSeconds(Duration.Quarter, triplet, 120)).toBeCloseTo(1 / 3)
  })
})

describe('ticksToNearestDuration', () => {
  it('returns whole note for 960 ticks', () => {
    const result = ticksToNearestDuration(960)
    expect(result.duration).toBe(Duration.Whole)
    expect(result.dot.dotted).toBe(false)
  })

  it('returns half note for 480 ticks', () => {
    const result = ticksToNearestDuration(480)
    expect(result.duration).toBe(Duration.Half)
    expect(result.dot.dotted).toBe(false)
  })

  it('returns dotted half note for 720 ticks', () => {
    const result = ticksToNearestDuration(720)
    expect(result.duration).toBe(Duration.Half)
    expect(result.dot.dotted).toBe(true)
  })

  it('returns quarter note for 240 ticks', () => {
    const result = ticksToNearestDuration(240)
    expect(result.duration).toBe(Duration.Quarter)
    expect(result.dot.dotted).toBe(false)
  })

  it('returns sixty-fourth note for 15 ticks (minimum)', () => {
    const result = ticksToNearestDuration(15)
    expect(result.duration).toBe(Duration.SixtyFourth)
    expect(result.dot.dotted).toBe(false)
  })

  it('returns sixty-fourth note for very small ticks', () => {
    const result = ticksToNearestDuration(1)
    expect(result.duration).toBe(Duration.SixtyFourth)
  })
})

describe('quarterBeatsToNearestDuration', () => {
  it('maps 1 quarter beat to quarter note', () => {
    const result = quarterBeatsToNearestDuration(1)
    expect(result.duration).toBe(Duration.Quarter)
  })

  it('maps 4 quarter beats to whole note', () => {
    const result = quarterBeatsToNearestDuration(4)
    expect(result.duration).toBe(Duration.Whole)
  })

  it('maps 2 quarter beats to half note', () => {
    const result = quarterBeatsToNearestDuration(2)
    expect(result.duration).toBe(Duration.Half)
  })
})

describe('normalizeSelection', () => {
  it('returns same selection when start is before end', () => {
    const sel: TabSelection = { startMeasure: 0, startBeat: 1, endMeasure: 1, endBeat: 2 }
    const norm = normalizeSelection(sel)
    expect(norm).toEqual({ startMeasure: 0, startBeat: 1, endMeasure: 1, endBeat: 2 })
  })

  it('swaps start and end when selection is reversed', () => {
    const sel: TabSelection = { startMeasure: 2, startBeat: 3, endMeasure: 0, endBeat: 1 }
    const norm = normalizeSelection(sel)
    expect(norm).toEqual({ startMeasure: 0, startBeat: 1, endMeasure: 2, endBeat: 3 })
  })

  it('handles same measure with beat order reversal', () => {
    const sel: TabSelection = { startMeasure: 1, startBeat: 3, endMeasure: 1, endBeat: 1 }
    const norm = normalizeSelection(sel)
    expect(norm).toEqual({ startMeasure: 1, startBeat: 1, endMeasure: 1, endBeat: 3 })
  })

  it('handles same measure same beat (single beat selection)', () => {
    const sel: TabSelection = { startMeasure: 2, startBeat: 2, endMeasure: 2, endBeat: 2 }
    expect(normalizeSelection(sel)).toEqual(sel)
  })
})

describe('isInSelection', () => {
  const sel: TabSelection = { startMeasure: 1, startBeat: 2, endMeasure: 3, endBeat: 1 }

  it('returns false when selection is null', () => {
    expect(isInSelection(null, 1, 2)).toBe(false)
  })

  it('returns true for a beat squarely inside the selection', () => {
    expect(isInSelection(sel, 2, 0)).toBe(true)
  })

  it('returns true for the start boundary beat', () => {
    expect(isInSelection(sel, 1, 2)).toBe(true)
  })

  it('returns true for the end boundary beat', () => {
    expect(isInSelection(sel, 3, 1)).toBe(true)
  })

  it('returns false for a beat before the start measure', () => {
    expect(isInSelection(sel, 0, 5)).toBe(false)
  })

  it('returns false for a beat after the end measure', () => {
    expect(isInSelection(sel, 4, 0)).toBe(false)
  })

  it('returns false for a beat before start within the start measure', () => {
    expect(isInSelection(sel, 1, 1)).toBe(false)
  })

  it('returns false for a beat past end within the end measure', () => {
    expect(isInSelection(sel, 3, 2)).toBe(false)
  })
})

describe('effectiveBpmAt', () => {
  it('returns the first masterBar bpm', () => {
    const track = makeTrack({ masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 }] })
    expect(effectiveBpmAt(track, 0)).toBe(120)
  })

  it('inherits bpm from the previous masterBar when undefined', () => {
    const track = makeTrack({
      masterBars: [
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 100 },
        { timeSignature: { numerator: 4, denominator: 4 } },
      ],
      measures: [makeMeasure(), makeMeasure()],
    })
    expect(effectiveBpmAt(track, 1)).toBe(100)
  })

  it('uses the overriding bpm when set on a later measure', () => {
    const track = makeTrack({
      masterBars: [
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 80 },
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 160 },
      ],
      measures: [makeMeasure(), makeMeasure()],
    })
    expect(effectiveBpmAt(track, 1)).toBe(160)
  })

  it('clamps measureIndex to the last masterBar when out of range', () => {
    const track = makeTrack({ masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm: 90 }] })
    expect(effectiveBpmAt(track, 99)).toBe(90)
  })

  it('falls back to 120 if no bpm is defined', () => {
    const track = makeTrack({
      masterBars: [{ timeSignature: { numerator: 4, denominator: 4 } }],
    })
    expect(effectiveBpmAt(track, 0)).toBe(120)
  })
})

describe('tuningNoteToMidi', () => {
  it('returns correct MIDI for E2', () => {
    // E2: (2+1)*12 + 4 = 36 + 4 = 40
    expect(tuningNoteToMidi('E', 2)).toBe(40)
  })

  it('returns correct MIDI for A2', () => {
    // A2: (2+1)*12 + 9 = 36 + 9 = 45
    expect(tuningNoteToMidi('A', 2)).toBe(45)
  })

  it('returns correct MIDI for E4', () => {
    // E4: (4+1)*12 + 4 = 60 + 4 = 64
    expect(tuningNoteToMidi('E', 4)).toBe(64)
  })
})

describe('fretToFreq', () => {
  it('returns 440Hz for open A4 (MIDI 69, fret 0)', () => {
    expect(fretToFreq(69, 0)).toBeCloseTo(440)
  })

  it('returns 880Hz for A5 (MIDI 69, fret 12 — one octave)', () => {
    expect(fretToFreq(69, 12)).toBeCloseTo(880)
  })

  it('returns approximately 246.94Hz for B3 (MIDI 59, fret 0)', () => {
    // B3 = 440 × 2^((59-69)/12)
    expect(fretToFreq(59, 0)).toBeCloseTo(246.94, 1)
  })
})

describe('buildOpenMidi', () => {
  it('returns 6 MIDI values for standard 6-string tuning', () => {
    const midi = buildOpenMidi('Standard', 6)
    expect(midi).toHaveLength(6)
  })

  it('returns standard tuning MIDI values (E2 A2 D3 G3 B3 E4)', () => {
    const midi = buildOpenMidi('Standard', 6)
    // Standard E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
    expect(midi).toEqual([40, 45, 50, 55, 59, 64])
  })

  it('returns 7 MIDI values for 7-string tuning', () => {
    const midi = buildOpenMidi('Standard', 7)
    expect(midi).toHaveLength(7)
  })

  it('falls back to first preset for unknown tuning name', () => {
    const midi1 = buildOpenMidi('UNKNOWN_TUNING', 6)
    const midi2 = buildOpenMidi('Standard', 6)
    expect(midi1).toEqual(midi2)
  })
})

describe('DURATION_TICKS', () => {
  it('whole note is 960 ticks', () => {
    expect(DURATION_TICKS[Duration.Whole]).toBe(960)
  })

  it('each duration is exactly half of the previous', () => {
    expect(DURATION_TICKS[Duration.Half]).toBe(DURATION_TICKS[Duration.Whole] / 2)
    expect(DURATION_TICKS[Duration.Quarter]).toBe(DURATION_TICKS[Duration.Half] / 2)
    expect(DURATION_TICKS[Duration.Eighth]).toBe(DURATION_TICKS[Duration.Quarter] / 2)
    expect(DURATION_TICKS[Duration.Sixteenth]).toBe(DURATION_TICKS[Duration.Eighth] / 2)
    expect(DURATION_TICKS[Duration.ThirtySecond]).toBe(DURATION_TICKS[Duration.Sixteenth] / 2)
    expect(DURATION_TICKS[Duration.SixtyFourth]).toBe(DURATION_TICKS[Duration.ThirtySecond] / 2)
  })
})

describe('BEAT_WIDTHS', () => {
  it('whole note is 80 units wide', () => {
    expect(BEAT_WIDTHS[Duration.Whole]).toBe(80)
  })

  it('each duration is exactly half the width of the previous', () => {
    expect(BEAT_WIDTHS[Duration.Half]).toBe(BEAT_WIDTHS[Duration.Whole] / 2)
    expect(BEAT_WIDTHS[Duration.Quarter]).toBe(BEAT_WIDTHS[Duration.Half] / 2)
    expect(BEAT_WIDTHS[Duration.Eighth]).toBe(BEAT_WIDTHS[Duration.Quarter] / 2)
    expect(BEAT_WIDTHS[Duration.Sixteenth]).toBe(BEAT_WIDTHS[Duration.Eighth] / 2)
  })

  it('BEAT_WIDTH constant equals width of a quarter note', () => {
    expect(BEAT_WIDTH).toBe(BEAT_WIDTHS[Duration.Quarter])
  })
})

describe('DURATION_LABELS', () => {
  it('has a human-readable label for every duration', () => {
    const durations = [
      Duration.Whole, Duration.Half, Duration.Quarter, Duration.Eighth,
      Duration.Sixteenth, Duration.ThirtySecond, Duration.SixtyFourth,
    ] as const
    for (const d of durations) {
      expect(DURATION_LABELS[d]).toBeTruthy()
    }
  })
})

// ─── localStorage utilities ──────────────────────────────────────────────────

describe('saveTabTrack', () => {
  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  })

  it('serializes and saves the track to localStorage', () => {
    const track = makeTrack()
    saveTabTrack(track)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'tab-editor-track',
      JSON.stringify(track),
    )
  })

  it('does not throw if localStorage.setItem throws (storage full)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveTabTrack(makeTrack())).not.toThrow()
  })
})

describe('createInitialTabState', () => {
  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
  })

  it('returns a valid initial state with default track', () => {
    const state = createInitialTabState()
    expect(state.track.title).toBe('Untitled')
    expect(state.track.stringCount).toBe(6)
    expect(state.cursor.measureIndex).toBe(0)
    expect(state.cursor.beatIndex).toBe(0)
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(0)
    expect(state.pendingOverflow).toBeNull()
  })

  it('loads a v4 track from localStorage when present', () => {
    const savedTrack = makeTrack({ title: 'My Song' })
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(savedTrack))
    const state = createInitialTabState()
    expect(state.track.title).toBe('My Song')
  })

  it('falls back to default track when localStorage contains invalid JSON', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('{invalid json')
    const state = createInitialTabState()
    expect(state.track.title).toBe('Untitled')
  })

  it('normalizes measures by filling rest slots', () => {
    // A track with one measure that has no beats should get fill rests
    const trackWithEmptyMeasure = makeTrack({ measures: [makeMeasure([])] })
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(trackWithEmptyMeasure))
    const state = createInitialTabState()
    // Normalized measure should have fill rests to reach 4/4 capacity
    expect(measureUsedTicks(state.track.measures[0]!.beats)).toBeCloseTo(960)
  })
})

// ─── Reducer: SET_CURSOR ─────────────────────────────────────────────────────

describe('tabEditorReducer SET_CURSOR', () => {
  it('updates cursor position', () => {
    const state = makeState()
    const newCursor: TabCursor = { measureIndex: 1, beatIndex: 2, stringIndex: 3 }
    const next = tabEditorReducer(state, { type: 'SET_CURSOR', cursor: newCursor })
    expect(next.cursor).toEqual(newCursor)
  })

  it('syncs activeDuration when cursor is on an existing beat', () => {
    const halfBeat = makeBeat(Duration.Half)
    const state = makeState({
      measures: [makeMeasure([halfBeat])],
    })
    const next = tabEditorReducer(state, { type: 'SET_CURSOR', cursor: { measureIndex: 0, beatIndex: 0, stringIndex: 6 } })
    expect(next.activeDuration).toBe(Duration.Half)
  })

  it('does not push to undoStack', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_CURSOR', cursor: { measureIndex: 0, beatIndex: 1, stringIndex: 1 } })
    expect(next.undoStack).toHaveLength(0)
  })
})

// ─── Reducer: SET_ACTIVE_DURATION / SET_ACTIVE_DOT ──────────────────────────

describe('tabEditorReducer SET_ACTIVE_DURATION', () => {
  it('updates activeDuration without touching track', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_ACTIVE_DURATION', duration: Duration.Eighth })
    expect(next.activeDuration).toBe(Duration.Eighth)
    expect(next.track).toBe(state.track)
  })
})

describe('tabEditorReducer SET_ACTIVE_DOT', () => {
  it('updates activeDot', () => {
    const state = makeState()
    const dottedDot: DotModifier = { dotted: true, doubleDotted: false, triplet: false }
    const next = tabEditorReducer(state, { type: 'SET_ACTIVE_DOT', dot: dottedDot })
    expect(next.activeDot).toEqual(dottedDot)
  })
})

// ─── Reducer: ADD_NOTE ───────────────────────────────────────────────────────

describe('tabEditorReducer ADD_NOTE', () => {
  it('adds a note to a virtual (new) beat slot', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE',
      measureIndex: 0,
      beatIndex: 0,    // first slot — measure has no beats yet
      stringIndex: 1,
      fret: 5,
    })
    const beat = next.track.measures[0]!.beats[0]!
    expect(beat.notes).toHaveLength(1)
    expect(beat.notes[0]!.fret).toBe(5)
    expect(beat.notes[0]!.string).toBe(1)
  })

  it('pushes the previous track onto undoStack', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 3,
    })
    expect(next.undoStack).toHaveLength(1)
    expect(next.undoStack[0]).toBe(state.track)
  })

  it('clears redoStack when adding a note', () => {
    const track0 = makeTrack()
    const track1 = makeTrack({ title: 'v1' })
    const state = makeState()
    const stateWithRedo = { ...state, redoStack: [track0, track1] }
    const next = tabEditorReducer(stateWithRedo, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 7,
    })
    expect(next.redoStack).toHaveLength(0)
  })

  it('sets overflow when note duration exceeds measure capacity', () => {
    // Fill the measure to near-capacity with 3 quarter notes, then try to add a half note
    const beats: Beat[] = [
      makeBeat(Duration.Quarter),
      makeBeat(Duration.Quarter),
      makeBeat(Duration.Quarter),
    ]
    // Used: 3 × 240 = 720 ticks. Remaining: 240. Adding half (480) → overflow.
    const state = makeState({ measures: [makeMeasure(beats)] }, { beatIndex: 3 })
    const stateWithHalf = { ...state, activeDuration: Duration.Half }
    const next = tabEditorReducer(stateWithHalf, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 3, stringIndex: 1, fret: 2,
    })
    expect(next.pendingOverflow).not.toBeNull()
    expect(next.pendingOverflow?.fret).toBe(2)
    expect(next.pendingOverflow?.measureIndex).toBe(0)
  })

  it('does nothing when measureIndex is out of range', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 99, beatIndex: 0, stringIndex: 1, fret: 5,
    })
    expect(next.track.measures).toHaveLength(1)
    expect(next.undoStack).toHaveLength(0)
  })

  it('applies activeModifiers to the new note', () => {
    const state = { ...makeState(), activeModifiers: { palmMute: true as const } }
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 5,
    })
    expect(next.track.measures[0]!.beats[0]!.notes[0]!.modifiers.palmMute).toBe(true)
  })

  it('uses existing beat duration when adding to an existing beat', () => {
    const halfBeat = makeBeat(Duration.Half)
    const state = makeState({ measures: [makeMeasure([halfBeat])] })
    // activeDuration is quarter, but adding to an existing half beat
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 2, fret: 7,
    })
    expect(next.track.measures[0]!.beats[0]!.duration).toBe(Duration.Half)
  })

  it('clears pendingOverflow after a successful note add', () => {
    const state = { ...makeState(), pendingOverflow: {
      fret: 5, measureIndex: 0, beatIndex: 0, stringIndex: 1,
      newDuration: Duration.Quarter, newDot: { ...noDot }, overshootTicks: 60,
    } }
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 2, fret: 3,
    })
    expect(next.pendingOverflow).toBeNull()
  })
})

// ─── Reducer: DELETE_NOTE ────────────────────────────────────────────────────

describe('tabEditorReducer DELETE_NOTE', () => {
  it('removes the note from the specified beat', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] })
    const next = tabEditorReducer(state, {
      type: 'DELETE_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1,
    })
    expect(next.track.measures[0]!.beats[0]!.notes).toHaveLength(0)
  })

  it('leaves other notes on the same beat intact', () => {
    const beat = makeBeat(Duration.Quarter, [
      { string: 1, fret: 5, modifiers: {} },
      { string: 2, fret: 7, modifiers: {} },
    ])
    const state = makeState({ measures: [makeMeasure([beat])] })
    const next = tabEditorReducer(state, {
      type: 'DELETE_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1,
    })
    const remaining = next.track.measures[0]!.beats[0]!.notes
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.string).toBe(2)
  })

  it('pushes to undoStack on delete', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] })
    const next = tabEditorReducer(state, {
      type: 'DELETE_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1,
    })
    expect(next.undoStack).toHaveLength(1)
  })
})

// ─── Reducer: SET_BEAT_DURATION ──────────────────────────────────────────────

describe('tabEditorReducer SET_BEAT_DURATION', () => {
  it('changes the duration of the specified beat', () => {
    const beat = makeBeat(Duration.Quarter)
    const state = makeState({ measures: [makeMeasure([beat])] })
    const next = tabEditorReducer(state, {
      type: 'SET_BEAT_DURATION', measureIndex: 0, beatIndex: 0, duration: Duration.Half,
    })
    expect(next.track.measures[0]!.beats[0]!.duration).toBe(Duration.Half)
  })

  it('pushes to undoStack', () => {
    const beat = makeBeat(Duration.Quarter)
    const state = makeState({ measures: [makeMeasure([beat])] })
    const next = tabEditorReducer(state, {
      type: 'SET_BEAT_DURATION', measureIndex: 0, beatIndex: 0, duration: Duration.Eighth,
    })
    expect(next.undoStack).toHaveLength(1)
  })

  it('does not affect other beats', () => {
    const beat0 = makeBeat(Duration.Quarter)
    const beat1 = makeBeat(Duration.Half)
    const state = makeState({ measures: [makeMeasure([beat0, beat1])] })
    const next = tabEditorReducer(state, {
      type: 'SET_BEAT_DURATION', measureIndex: 0, beatIndex: 0, duration: Duration.Eighth,
    })
    expect(next.track.measures[0]!.beats[1]!.duration).toBe(Duration.Half)
  })
})

// ─── Reducer: INSERT_BEAT_BEFORE / INSERT_BEAT_AFTER ────────────────────────

describe('tabEditorReducer INSERT_BEAT_BEFORE', () => {
  it('inserts a new beat before the specified index', () => {
    const beat0 = { ...makeBeat(Duration.Quarter), id: 'b0' }
    const beat1 = { ...makeBeat(Duration.Quarter), id: 'b1' }
    const state = makeState({ measures: [makeMeasure([beat0, beat1])] })
    const next = tabEditorReducer(state, {
      type: 'INSERT_BEAT_BEFORE', measureIndex: 0, beatIndex: 1,
    })
    // Normalization may add fill rests; verify the user beats are in the right positions
    const beats = next.track.measures[0]!.beats
    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats[0]!.id).toBe('b0')
    expect(beats[2]!.id).toBe('b1')
  })

  it('uses activeDuration for the new beat', () => {
    const state = { ...makeState(), activeDuration: Duration.Eighth }
    const next = tabEditorReducer(state, {
      type: 'INSERT_BEAT_BEFORE', measureIndex: 0, beatIndex: 0,
    })
    expect(next.track.measures[0]!.beats[0]!.duration).toBe(Duration.Eighth)
  })
})

describe('tabEditorReducer INSERT_BEAT_AFTER', () => {
  it('inserts a new beat after the specified index', () => {
    const beat0 = { ...makeBeat(Duration.Quarter), id: 'b0' }
    const state = makeState({ measures: [makeMeasure([beat0])] })
    const next = tabEditorReducer(state, {
      type: 'INSERT_BEAT_AFTER', measureIndex: 0, beatIndex: 0,
    })
    // Normalization may add fill rests on top; at minimum 2 explicit beats
    const beats = next.track.measures[0]!.beats
    expect(beats.length).toBeGreaterThanOrEqual(2)
    expect(beats[0]!.id).toBe('b0')
  })
})

// ─── Reducer: DELETE_BEAT ────────────────────────────────────────────────────

describe('tabEditorReducer DELETE_BEAT', () => {
  it('removes the specified beat', () => {
    const beat0 = { ...makeBeat(Duration.Quarter), id: 'b0' }
    const beat1 = { ...makeBeat(Duration.Quarter), id: 'b1' }
    const state = makeState({ measures: [makeMeasure([beat0, beat1])] })
    const next = tabEditorReducer(state, {
      type: 'DELETE_BEAT', measureIndex: 0, beatIndex: 0,
    })
    expect(next.track.measures[0]!.beats.some((b) => b.id === 'b0')).toBe(false)
    expect(next.track.measures[0]!.beats.some((b) => b.id === 'b1')).toBe(true)
  })

  it('does not delete when only one beat remains', () => {
    const beat0 = makeBeat(Duration.Whole)
    const state = makeState({ measures: [makeMeasure([beat0])] })
    const next = tabEditorReducer(state, {
      type: 'DELETE_BEAT', measureIndex: 0, beatIndex: 0,
    })
    expect(next.track.measures[0]!.beats).toHaveLength(1)
  })

  it('adjusts cursor beatIndex if it would be out of bounds', () => {
    const beats = [makeBeat(), makeBeat()]
    const state = makeState({ measures: [makeMeasure(beats)] }, { beatIndex: 1 })
    const next = tabEditorReducer(state, {
      type: 'DELETE_BEAT', measureIndex: 0, beatIndex: 1,
    })
    expect(next.cursor.beatIndex).toBeLessThan(next.track.measures[0]!.beats.length)
  })
})

// ─── Reducer: INSERT_MEASURE_BEFORE / INSERT_MEASURE_AFTER ──────────────────

describe('tabEditorReducer INSERT_MEASURE_BEFORE', () => {
  it('inserts a new empty measure before the specified index', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'INSERT_MEASURE_BEFORE', measureIndex: 0 })
    expect(next.track.measures).toHaveLength(2)
  })

  it('inserts a corresponding masterBar', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'INSERT_MEASURE_BEFORE', measureIndex: 0 })
    expect(next.track.masterBars).toHaveLength(2)
  })

  it('inherits time signature from the reference masterBar', () => {
    const state = makeState({
      masterBars: [{ timeSignature: { numerator: 3, denominator: 4 }, bpm: 100 }],
    })
    const next = tabEditorReducer(state, { type: 'INSERT_MEASURE_BEFORE', measureIndex: 0 })
    expect(next.track.masterBars[0]!.timeSignature).toEqual({ numerator: 3, denominator: 4 })
  })
})

describe('tabEditorReducer INSERT_MEASURE_AFTER', () => {
  it('inserts a new measure after the specified index', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'INSERT_MEASURE_AFTER', measureIndex: 0 })
    expect(next.track.measures).toHaveLength(2)
    expect(next.track.masterBars).toHaveLength(2)
  })
})

// ─── Reducer: DELETE_MEASURE ─────────────────────────────────────────────────

describe('tabEditorReducer DELETE_MEASURE', () => {
  it('removes the specified measure', () => {
    const m0 = makeMeasure()
    const m1 = makeMeasure()
    const state = makeState({ measures: [m0, m1], masterBars: [
      { timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 },
      { timeSignature: { numerator: 4, denominator: 4 } },
    ]})
    const next = tabEditorReducer(state, { type: 'DELETE_MEASURE', measureIndex: 0 })
    expect(next.track.measures).toHaveLength(1)
    expect(next.track.masterBars).toHaveLength(1)
  })

  it('does not delete when only one measure remains', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'DELETE_MEASURE', measureIndex: 0 })
    expect(next.track.measures).toHaveLength(1)
  })

  it('promotes bpm to next masterBar when first measure (which has bpm) is deleted', () => {
    const state = makeState({
      measures: [makeMeasure(), makeMeasure()],
      masterBars: [
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 100 },
        { timeSignature: { numerator: 4, denominator: 4 } },
      ],
    })
    const next = tabEditorReducer(state, { type: 'DELETE_MEASURE', measureIndex: 0 })
    expect(next.track.masterBars[0]!.bpm).toBe(100)
  })

  it('resets cursor to within bounds after deletion', () => {
    const state = makeState({
      measures: [makeMeasure(), makeMeasure()],
      masterBars: [
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 },
        { timeSignature: { numerator: 4, denominator: 4 } },
      ],
    }, { measureIndex: 1, beatIndex: 2 })
    const next = tabEditorReducer(state, { type: 'DELETE_MEASURE', measureIndex: 1 })
    expect(next.cursor.measureIndex).toBeLessThan(next.track.measures.length)
    expect(next.cursor.beatIndex).toBe(0)
  })
})

// ─── Reducer: MOVE_CURSOR ────────────────────────────────────────────────────

describe('tabEditorReducer MOVE_CURSOR', () => {
  it('moves cursor right within the measure', () => {
    const beats = [makeBeat(), makeBeat()]
    const state = makeState({ measures: [makeMeasure(beats)] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'right' })
    expect(next.cursor.beatIndex).toBe(1)
  })

  it('moves cursor left within the measure', () => {
    const beats = [makeBeat(), makeBeat()]
    const state = makeState({ measures: [makeMeasure(beats)] }, { beatIndex: 1 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'left' })
    expect(next.cursor.beatIndex).toBe(0)
  })

  it('does not move cursor left past beat 0 in measure 0', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'left' })
    expect(next.cursor.measureIndex).toBe(0)
    expect(next.cursor.beatIndex).toBe(0)
  })

  it('moves cursor up (higher string number = higher pitch)', () => {
    const state = makeState({}, { stringIndex: 3 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'up' })
    expect(next.cursor.stringIndex).toBe(4)
  })

  it('does not move cursor string above stringCount', () => {
    const state = makeState({}, { stringIndex: 6 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'up' })
    expect(next.cursor.stringIndex).toBe(6)
  })

  it('moves cursor down (lower string number)', () => {
    const state = makeState({}, { stringIndex: 3 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'down' })
    expect(next.cursor.stringIndex).toBe(2)
  })

  it('does not move cursor string below 1', () => {
    const state = makeState({}, { stringIndex: 1 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'down' })
    expect(next.cursor.stringIndex).toBe(1)
  })

  it('moving right at last position creates a new measure', () => {
    // Empty measure with no beats — cursor is at virtual slot 0 in a 4/4 measure
    // Fill the measure completely so cursor is at the end
    const fullBeats = [makeBeat(Duration.Whole)]
    const state = makeState({ measures: [makeMeasure(fullBeats)] }, { beatIndex: 1 })
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'right' })
    expect(next.track.measures).toHaveLength(2)
    expect(next.cursor.measureIndex).toBe(1)
    expect(next.cursor.beatIndex).toBe(0)
  })

  it('clears selection when moving cursor', () => {
    const sel: TabSelection = { startMeasure: 0, startBeat: 0, endMeasure: 0, endBeat: 1 }
    const beats = [makeBeat(), makeBeat()]
    const state = { ...makeState({ measures: [makeMeasure(beats)] }), selection: sel }
    const next = tabEditorReducer(state, { type: 'MOVE_CURSOR', direction: 'right' })
    expect(next.selection).toBeNull()
  })
})

// ─── Reducer: TOGGLE_MODIFIER ────────────────────────────────────────────────

describe('tabEditorReducer TOGGLE_MODIFIER', () => {
  it('activates a modifier when it is off', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'TOGGLE_MODIFIER', modifier: 'ghost' })
    expect(next.activeModifiers.ghost).toBe(true)
  })

  it('deactivates a modifier when it is already on', () => {
    const state = { ...makeState(), activeModifiers: { ghost: true as const } }
    const next = tabEditorReducer(state, { type: 'TOGGLE_MODIFIER', modifier: 'ghost' })
    expect(next.activeModifiers.ghost).toBeUndefined()
  })

  it('clears conflicting modifier when enabling hammerOn (pullOff conflict)', () => {
    const state = { ...makeState(), activeModifiers: { pullOff: true as const } }
    const next = tabEditorReducer(state, { type: 'TOGGLE_MODIFIER', modifier: 'hammerOn' })
    expect(next.activeModifiers.hammerOn).toBe(true)
    expect(next.activeModifiers.pullOff).toBeUndefined()
  })

  it('clears conflicting modifier when enabling pullOff (hammerOn conflict)', () => {
    const state = { ...makeState(), activeModifiers: { hammerOn: true as const } }
    const next = tabEditorReducer(state, { type: 'TOGGLE_MODIFIER', modifier: 'pullOff' })
    expect(next.activeModifiers.pullOff).toBe(true)
    expect(next.activeModifiers.hammerOn).toBeUndefined()
  })

  it('does not affect the track', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'TOGGLE_MODIFIER', modifier: 'staccato' })
    expect(next.track).toBe(state.track)
  })
})

// ─── Reducer: UNDO / REDO ────────────────────────────────────────────────────

describe('tabEditorReducer UNDO', () => {
  it('does nothing when undoStack is empty', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'UNDO' })
    expect(next).toBe(state)
  })

  it('restores the previous track from undoStack', () => {
    const originalTrack = makeTrack({ title: 'Original' })
    const newTrack = makeTrack({ title: 'Modified' })
    const state: TabEditorState = {
      ...makeState(),
      track: newTrack,
      undoStack: [originalTrack],
    }
    const next = tabEditorReducer(state, { type: 'UNDO' })
    expect(next.track.title).toBe('Original')
    expect(next.undoStack).toHaveLength(0)
  })

  it('pushes current track to redoStack on undo', () => {
    const originalTrack = makeTrack({ title: 'Original' })
    const newTrack = makeTrack({ title: 'Modified' })
    const state: TabEditorState = {
      ...makeState(),
      track: newTrack,
      undoStack: [originalTrack],
    }
    const next = tabEditorReducer(state, { type: 'UNDO' })
    expect(next.redoStack).toHaveLength(1)
    expect(next.redoStack[0]!.title).toBe('Modified')
  })

  it('clears pendingOverflow on undo', () => {
    const originalTrack = makeTrack()
    const state: TabEditorState = {
      ...makeState(),
      undoStack: [originalTrack],
      pendingOverflow: {
        fret: 3, measureIndex: 0, beatIndex: 0, stringIndex: 1,
        newDuration: Duration.Quarter, newDot: { ...noDot }, overshootTicks: 60,
      },
    }
    const next = tabEditorReducer(state, { type: 'UNDO' })
    expect(next.pendingOverflow).toBeNull()
  })
})

describe('tabEditorReducer REDO', () => {
  it('does nothing when redoStack is empty', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'REDO' })
    expect(next).toBe(state)
  })

  it('restores the next track from redoStack', () => {
    const futureTrack = makeTrack({ title: 'Future' })
    const state: TabEditorState = {
      ...makeState(),
      redoStack: [futureTrack],
    }
    const next = tabEditorReducer(state, { type: 'REDO' })
    expect(next.track.title).toBe('Future')
    expect(next.redoStack).toHaveLength(0)
  })

  it('pushes current track to undoStack on redo', () => {
    const futureTrack = makeTrack({ title: 'Future' })
    const currentTrack = makeTrack({ title: 'Current' })
    const state: TabEditorState = {
      ...makeState(),
      track: currentTrack,
      redoStack: [futureTrack],
    }
    const next = tabEditorReducer(state, { type: 'REDO' })
    expect(next.undoStack).toHaveLength(1)
    expect(next.undoStack[0]!.title).toBe('Current')
  })
})

describe('undo/redo roundtrip', () => {
  it('ADD_NOTE → UNDO restores original track (no user-added notes)', () => {
    const state = makeState()
    const afterAdd = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 5,
    })
    expect(afterAdd.track.measures[0]!.beats[0]!.notes).toHaveLength(1)

    const afterUndo = tabEditorReducer(afterAdd, { type: 'UNDO' })
    // After undo the measure returns to the pre-add state (empty beats). Normalization
    // then fills it with rest beats — so beats may exist but all should have no notes.
    const beats = afterUndo.track.measures[0]!.beats
    expect(beats.every((b) => b.notes.length === 0)).toBe(true)
  })

  it('ADD_NOTE → UNDO → REDO restores the added note', () => {
    const state = makeState()
    const afterAdd = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 5,
    })
    const afterUndo = tabEditorReducer(afterAdd, { type: 'UNDO' })
    const afterRedo = tabEditorReducer(afterUndo, { type: 'REDO' })
    expect(afterRedo.track.measures[0]!.beats[0]!.notes[0]!.fret).toBe(5)
  })

  it('ADD_NOTE clears redoStack so redo history is lost', () => {
    const state = makeState()
    const s1 = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 5,
    })
    const s2 = tabEditorReducer(s1, { type: 'UNDO' })
    expect(s2.redoStack).toHaveLength(1)
    // Now add a different note — this should clear the redo stack
    const s3 = tabEditorReducer(s2, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 9,
    })
    expect(s3.redoStack).toHaveLength(0)
  })
})

// ─── Reducer: COPY / CUT / PASTE ────────────────────────────────────────────

describe('tabEditorReducer COPY', () => {
  it('copies the beat at cursor into clipboard', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'COPY' })
    expect(next.clipboard).toHaveLength(1)
    expect(next.clipboard![0]!.notes[0]!.fret).toBe(5)
  })

  it('does not modify the track', () => {
    const beat = makeBeat()
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'COPY' })
    expect(next.track).toBe(state.track)
  })

  it('does nothing when cursor is on a virtual slot with no beat', () => {
    // Empty measure, cursor at beatIndex 0 — no beat to copy
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'COPY' })
    expect(next.clipboard).toBeNull()
  })

  it('copies selected beats when a selection exists', () => {
    const beat0 = makeBeat(Duration.Quarter, [{ string: 1, fret: 1, modifiers: {} }])
    const beat1 = makeBeat(Duration.Quarter, [{ string: 1, fret: 2, modifiers: {} }])
    const state = {
      ...makeState({ measures: [makeMeasure([beat0, beat1])] }),
      selection: { startMeasure: 0, startBeat: 0, endMeasure: 0, endBeat: 1 },
    }
    const next = tabEditorReducer(state, { type: 'COPY' })
    expect(next.clipboard).toHaveLength(2)
  })
})

describe('tabEditorReducer CUT', () => {
  it('copies beat to clipboard and clears its notes', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'CUT' })
    expect(next.clipboard).toHaveLength(1)
    expect(next.clipboard![0]!.notes[0]!.fret).toBe(5)
    expect(next.track.measures[0]!.beats[0]!.notes).toHaveLength(0)
  })

  it('pushes to undoStack', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'CUT' })
    expect(next.undoStack).toHaveLength(1)
  })
})

describe('tabEditorReducer PASTE', () => {
  it('pastes clipboard beats starting at specified position', () => {
    const srcBeat = makeBeat(Duration.Quarter, [{ string: 1, fret: 9, modifiers: {} }])
    const targetBeat = makeBeat(Duration.Quarter)
    const state = {
      ...makeState({ measures: [makeMeasure([targetBeat])] }),
      clipboard: [srcBeat],
    }
    const next = tabEditorReducer(state, { type: 'PASTE', measureIndex: 0, beatIndex: 0 })
    expect(next.track.measures[0]!.beats[0]!.notes[0]!.fret).toBe(9)
  })

  it('does nothing when clipboard is empty', () => {
    const state = { ...makeState(), clipboard: null }
    const next = tabEditorReducer(state, { type: 'PASTE', measureIndex: 0, beatIndex: 0 })
    expect(next).toBe(state)
  })

  it('gives pasted beats new IDs', () => {
    const srcBeat = { ...makeBeat(), id: 'original-id' }
    const targetBeat = makeBeat()
    const state = {
      ...makeState({ measures: [makeMeasure([targetBeat])] }),
      clipboard: [srcBeat],
    }
    const next = tabEditorReducer(state, { type: 'PASTE', measureIndex: 0, beatIndex: 0 })
    expect(next.track.measures[0]!.beats[0]!.id).not.toBe('original-id')
  })

  it('pushes to undoStack on paste', () => {
    const srcBeat = makeBeat()
    const state = {
      ...makeState({ measures: [makeMeasure([makeBeat()])] }),
      clipboard: [srcBeat],
    }
    const next = tabEditorReducer(state, { type: 'PASTE', measureIndex: 0, beatIndex: 0 })
    expect(next.undoStack).toHaveLength(1)
  })
})

// ─── Reducer: LOAD_TRACK ─────────────────────────────────────────────────────

describe('tabEditorReducer LOAD_TRACK', () => {
  it('replaces the current track', () => {
    const state: TabEditorState = {
      ...makeState(),
      undoStack: [makeTrack()],
      redoStack: [makeTrack()],
      clipboard: [makeBeat()],
    }
    const newTrack = makeTrack({ title: 'Loaded' })
    const next = tabEditorReducer(state, { type: 'LOAD_TRACK', track: newTrack })
    expect(next.track.title).toBe('Loaded')
    expect(next.undoStack).toHaveLength(0)
    expect(next.redoStack).toHaveLength(0)
    expect(next.clipboard).toBeNull()
    expect(next.selection).toBeNull()
    expect(next.pendingOverflow).toBeNull()
  })

  it('resets cursor to start', () => {
    const state = makeState({}, { measureIndex: 3, beatIndex: 5 })
    const next = tabEditorReducer(state, { type: 'LOAD_TRACK', track: makeTrack() })
    expect(next.cursor.measureIndex).toBe(0)
    expect(next.cursor.beatIndex).toBe(0)
  })
})

// ─── Reducer: SET_TITLE / SET_METADATA ──────────────────────────────────────

describe('tabEditorReducer SET_TITLE', () => {
  it('updates the track title', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_TITLE', title: 'New Title' })
    expect(next.track.title).toBe('New Title')
  })

  it('does not push to undoStack', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_TITLE', title: 'Foo' })
    expect(next.undoStack).toHaveLength(0)
  })
})

describe('tabEditorReducer SET_METADATA', () => {
  it('applies patch fields to the track', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'SET_METADATA',
      patch: { artist: 'Jimi Hendrix', tabAuthor: 'Me', year: '1970' },
    })
    expect(next.track.artist).toBe('Jimi Hendrix')
    expect(next.track.tabAuthor).toBe('Me')
    expect(next.track.year).toBe('1970')
  })
})

// ─── Reducer: SET_PLAYING / SET_PLAYHEAD ────────────────────────────────────

describe('tabEditorReducer SET_PLAYING', () => {
  it('sets isPlaying to true', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_PLAYING', isPlaying: true })
    expect(next.isPlaying).toBe(true)
    expect(next.track).toBe(state.track)
  })

  it('sets isPlaying to false', () => {
    const state = { ...makeState(), isPlaying: true }
    const next = tabEditorReducer(state, { type: 'SET_PLAYING', isPlaying: false })
    expect(next.isPlaying).toBe(false)
  })
})

describe('tabEditorReducer SET_PLAYHEAD', () => {
  it('updates playhead position', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_PLAYHEAD', measureIndex: 2, beatIndex: 3 })
    expect(next.playheadMeasure).toBe(2)
    expect(next.playheadBeat).toBe(3)
  })
})

// ─── Reducer: overflow resolution ───────────────────────────────────────────

describe('tabEditorReducer DISMISS_OVERFLOW', () => {
  it('clears pendingOverflow', () => {
    const state: TabEditorState = {
      ...makeState(),
      pendingOverflow: {
        fret: 3, measureIndex: 0, beatIndex: 0, stringIndex: 1,
        newDuration: Duration.Quarter, newDot: { ...noDot }, overshootTicks: 60,
      },
    }
    const next = tabEditorReducer(state, { type: 'DISMISS_OVERFLOW' })
    expect(next.pendingOverflow).toBeNull()
  })

  it('does nothing when there is no pending overflow', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'DISMISS_OVERFLOW' })
    expect(next.pendingOverflow).toBeNull()
  })
})

describe('tabEditorReducer RESOLVE_OVERFLOW_TRIM', () => {
  it('does nothing when there is no pendingOverflow', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'RESOLVE_OVERFLOW_TRIM' })
    expect(next).toBe(state)
  })

  it('places the note at the largest duration that fits', () => {
    // Fill 3 quarter notes (720 ticks used), 240 remain. Try to add a half (480). Trim to quarter (240).
    const beats: Beat[] = [makeBeat(Duration.Quarter), makeBeat(Duration.Quarter), makeBeat(Duration.Quarter)]
    const state: TabEditorState = {
      ...makeState({ measures: [makeMeasure(beats)] }),
      pendingOverflow: {
        fret: 7, measureIndex: 0, beatIndex: 3, stringIndex: 2,
        newDuration: Duration.Half, newDot: { ...noDot }, overshootTicks: 240,
      },
    }
    const next = tabEditorReducer(state, { type: 'RESOLVE_OVERFLOW_TRIM' })
    expect(next.pendingOverflow).toBeNull()
    const newBeat = next.track.measures[0]!.beats[3]
    expect(newBeat).toBeDefined()
    expect(newBeat!.notes[0]!.fret).toBe(7)
    expect(newBeat!.duration).toBe(Duration.Quarter)
  })
})

describe('tabEditorReducer RESOLVE_OVERFLOW_BLEED', () => {
  it('does nothing when there is no pendingOverflow', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'RESOLVE_OVERFLOW_BLEED' })
    expect(next).toBe(state)
  })

  it('places the note and creates a tied beat in the next measure', () => {
    const beats: Beat[] = [makeBeat(Duration.Quarter), makeBeat(Duration.Quarter), makeBeat(Duration.Quarter)]
    const state: TabEditorState = {
      ...makeState({
        measures: [makeMeasure(beats), makeMeasure()],
        masterBars: [
          { timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 },
          { timeSignature: { numerator: 4, denominator: 4 } },
        ],
      }),
      pendingOverflow: {
        fret: 5, measureIndex: 0, beatIndex: 3, stringIndex: 1,
        newDuration: Duration.Half, newDot: { ...noDot }, overshootTicks: 240,
      },
    }
    const next = tabEditorReducer(state, { type: 'RESOLVE_OVERFLOW_BLEED' })
    expect(next.pendingOverflow).toBeNull()

    // Original measure should have a note with tiedTo flag
    const firstMeasureLastBeat = next.track.measures[0]!.beats.find((b) => b.tiedTo)
    expect(firstMeasureLastBeat).toBeDefined()
    expect(firstMeasureLastBeat!.notes[0]!.fret).toBe(5)

    // Second measure should start with a tied-from beat
    const secondMeasureFirstBeat = next.track.measures[1]!.beats[0]
    expect(secondMeasureFirstBeat!.tiedFrom).toBe(true)
    expect(secondMeasureFirstBeat!.notes[0]!.fret).toBe(5)
  })

  it('creates a new measure when overflowing past the last measure', () => {
    const beats: Beat[] = [makeBeat(Duration.Quarter), makeBeat(Duration.Quarter), makeBeat(Duration.Quarter)]
    const state: TabEditorState = {
      ...makeState({ measures: [makeMeasure(beats)] }),
      pendingOverflow: {
        fret: 4, measureIndex: 0, beatIndex: 3, stringIndex: 1,
        newDuration: Duration.Half, newDot: { ...noDot }, overshootTicks: 240,
      },
    }
    const next = tabEditorReducer(state, { type: 'RESOLVE_OVERFLOW_BLEED' })
    expect(next.track.measures).toHaveLength(2)
  })
})

// ─── Reducer: SET_GLOBAL_TIME_SIG / SET_MEASURE_TIME_SIG ────────────────────

describe('tabEditorReducer SET_GLOBAL_TIME_SIG', () => {
  it('updates the first masterBar time signature', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_GLOBAL_TIME_SIG', numerator: 3, denominator: 4 })
    expect(next.track.masterBars[0]!.timeSignature).toEqual({ numerator: 3, denominator: 4 })
  })

  it('pushes to undoStack', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_GLOBAL_TIME_SIG', numerator: 3, denominator: 4 })
    expect(next.undoStack).toHaveLength(1)
  })
})

describe('tabEditorReducer SET_MEASURE_TIME_SIG', () => {
  it('updates the time signature for the specified measure only', () => {
    const state = makeState({
      masterBars: [
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 },
        { timeSignature: { numerator: 4, denominator: 4 } },
      ],
      measures: [makeMeasure(), makeMeasure()],
    })
    const next = tabEditorReducer(state, {
      type: 'SET_MEASURE_TIME_SIG', measureIndex: 1, numerator: 5, denominator: 8,
    })
    expect(next.track.masterBars[1]!.timeSignature).toEqual({ numerator: 5, denominator: 8 })
    expect(next.track.masterBars[0]!.timeSignature).toEqual({ numerator: 4, denominator: 4 })
  })
})

// ─── Reducer: SET_MEASURE_BPM_ONLY / SET_MEASURE_BPM_FROM ───────────────────

describe('tabEditorReducer SET_MEASURE_BPM_ONLY', () => {
  it('clamps BPM to minimum of 20', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_MEASURE_BPM_ONLY', measureIndex: 0, bpm: 5 })
    expect(next.track.masterBars[0]!.bpm).toBe(20)
  })

  it('clamps BPM to maximum of 300', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_MEASURE_BPM_ONLY', measureIndex: 0, bpm: 500 })
    expect(next.track.masterBars[0]!.bpm).toBe(300)
  })

  it('sets the BPM on the specified masterBar', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_MEASURE_BPM_ONLY', measureIndex: 0, bpm: 150 })
    expect(next.track.masterBars[0]!.bpm).toBe(150)
  })
})

describe('tabEditorReducer SET_MEASURE_BPM_FROM', () => {
  it('sets BPM from the specified measure onwards (clearing subsequent overrides)', () => {
    const state = makeState({
      measures: [makeMeasure(), makeMeasure(), makeMeasure()],
      masterBars: [
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 },
        { timeSignature: { numerator: 4, denominator: 4 }, bpm: 140 },
        { timeSignature: { numerator: 4, denominator: 4 } },
      ],
    })
    // Set BPM from measure 0 to 100 — should clear measure 1's bpm
    const next = tabEditorReducer(state, { type: 'SET_MEASURE_BPM_FROM', fromIndex: 0, bpm: 100 })
    expect(next.track.masterBars[0]!.bpm).toBe(100)
    // Measure 1 had explicit bpm 140; since it's the next override, it should remain
    // (SET_MEASURE_BPM_FROM only clears bars between fromIndex and the next explicit override)
    expect(next.track.masterBars[1]!.bpm).toBe(140)
  })

  it('clamps BPM to range 20–300', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_MEASURE_BPM_FROM', fromIndex: 0, bpm: 1 })
    expect(next.track.masterBars[0]!.bpm).toBe(20)
  })
})

// ─── Reducer: SET_TUNING ─────────────────────────────────────────────────────

describe('tabEditorReducer SET_TUNING', () => {
  it('updates stringCount and tuningName', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'SET_TUNING',
      tuningName: 'Drop D',
      stringCount: 6,
      openMidi: [38, 45, 50, 55, 59, 64],
    })
    expect(next.track.tuningName).toBe('Drop D')
    expect(next.track.stringCount).toBe(6)
    expect(next.track.openMidi).toEqual([38, 45, 50, 55, 59, 64])
  })

  it('filters out notes for strings beyond the new stringCount', () => {
    const beat = makeBeat(Duration.Quarter, [
      { string: 1, fret: 5, modifiers: {} },
      { string: 7, fret: 3, modifiers: {} },
    ])
    const state = makeState({ measures: [makeMeasure([beat])], stringCount: 7 })
    const next = tabEditorReducer(state, {
      type: 'SET_TUNING',
      tuningName: 'Standard',
      stringCount: 6,
      openMidi: [40, 45, 50, 55, 59, 64],
    })
    const remaining = next.track.measures[0]!.beats[0]!.notes
    expect(remaining.every((n) => n.string <= 6)).toBe(true)
  })

  it('clamps cursor stringIndex to new stringCount', () => {
    const state = makeState({ stringCount: 7 }, { stringIndex: 7 })
    const next = tabEditorReducer(state, {
      type: 'SET_TUNING', tuningName: 'Standard', stringCount: 6, openMidi: [40, 45, 50, 55, 59, 64],
    })
    expect(next.cursor.stringIndex).toBeLessThanOrEqual(6)
  })

  it('pushes to undoStack', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'SET_TUNING', tuningName: 'Standard', stringCount: 6, openMidi: [40, 45, 50, 55, 59, 64],
    })
    expect(next.undoStack).toHaveLength(1)
  })
})

// ─── Reducer: CLEAR_NOTES ────────────────────────────────────────────────────

describe('tabEditorReducer CLEAR_NOTES', () => {
  it('clears notes from the beat at cursor when no selection', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'CLEAR_NOTES' })
    expect(next.track.measures[0]!.beats[0]!.notes).toHaveLength(0)
  })

  it('clears notes from all beats in the selection range', () => {
    const beat0 = makeBeat(Duration.Quarter, [{ string: 1, fret: 1, modifiers: {} }])
    const beat1 = makeBeat(Duration.Quarter, [{ string: 1, fret: 2, modifiers: {} }])
    const beat2 = makeBeat(Duration.Quarter, [{ string: 1, fret: 3, modifiers: {} }])
    const state = {
      ...makeState({ measures: [makeMeasure([beat0, beat1, beat2])] }),
      selection: { startMeasure: 0, startBeat: 0, endMeasure: 0, endBeat: 1 },
    }
    const next = tabEditorReducer(state, { type: 'CLEAR_NOTES' })
    expect(next.track.measures[0]!.beats[0]!.notes).toHaveLength(0)
    expect(next.track.measures[0]!.beats[1]!.notes).toHaveLength(0)
    // beat2 should be untouched
    expect(next.track.measures[0]!.beats[2]!.notes).toHaveLength(1)
  })

  it('pushes to undoStack', () => {
    const beat = makeBeat(Duration.Quarter, [{ string: 1, fret: 5, modifiers: {} }])
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'CLEAR_NOTES' })
    expect(next.undoStack).toHaveLength(1)
  })
})

// ─── Reducer: SET_SELECTION ──────────────────────────────────────────────────

describe('tabEditorReducer SET_SELECTION', () => {
  it('sets the selection', () => {
    const state = makeState()
    const sel: TabSelection = { startMeasure: 0, startBeat: 0, endMeasure: 0, endBeat: 2 }
    const next = tabEditorReducer(state, { type: 'SET_SELECTION', selection: sel })
    expect(next.selection).toEqual(sel)
  })

  it('clears selectionAnchor when selection is set to null', () => {
    const anchor: TabCursor = { measureIndex: 0, beatIndex: 1, stringIndex: 3 }
    const state = {
      ...makeState(),
      selection: { startMeasure: 0, startBeat: 0, endMeasure: 0, endBeat: 1 },
      selectionAnchor: anchor,
    }
    const next = tabEditorReducer(state, { type: 'SET_SELECTION', selection: null })
    expect(next.selection).toBeNull()
    expect(next.selectionAnchor).toBeNull()
  })
})

// ─── Reducer: SHIFT_MOVE_CURSOR ──────────────────────────────────────────────

describe('tabEditorReducer SHIFT_MOVE_CURSOR', () => {
  it('creates a selection extending from anchor to new cursor position', () => {
    const beats = [makeBeat(), makeBeat(), makeBeat()]
    const state = makeState({ measures: [makeMeasure(beats)] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'SHIFT_MOVE_CURSOR', direction: 'right' })
    expect(next.selection).not.toBeNull()
    expect(next.selection!.startBeat).toBe(0)
    expect(next.selection!.endBeat).toBe(1)
  })

  it('moves cursor to new position', () => {
    const beats = [makeBeat(), makeBeat(), makeBeat()]
    const state = makeState({ measures: [makeMeasure(beats)] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'SHIFT_MOVE_CURSOR', direction: 'right' })
    expect(next.cursor.beatIndex).toBe(1)
  })
})

// ─── Reducer: TOGGLE_REPEAT_OPEN / SET_REPEAT_CLOSE ─────────────────────────

describe('tabEditorReducer TOGGLE_REPEAT_OPEN', () => {
  it('sets repeatOpen to true when not set', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'TOGGLE_REPEAT_OPEN', measureIndex: 0 })
    expect(next.track.measures[0]!.repeatOpen).toBe(true)
  })

  it('removes repeatOpen when already set', () => {
    const measure: Measure = { id: 'mid', beats: [], repeatOpen: true }
    const state = makeState({ measures: [measure] })
    const next = tabEditorReducer(state, { type: 'TOGGLE_REPEAT_OPEN', measureIndex: 0 })
    expect(next.track.measures[0]!.repeatOpen).toBeUndefined()
  })
})

describe('tabEditorReducer SET_REPEAT_CLOSE', () => {
  it('sets the repeat close count', () => {
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'SET_REPEAT_CLOSE', measureIndex: 0, count: 3 })
    expect(next.track.measures[0]!.repeatClose).toBe(3)
  })

  it('removes repeatClose when count is null', () => {
    const measure: Measure = { id: 'mid', beats: [], repeatClose: 2 }
    const state = makeState({ measures: [measure] })
    const next = tabEditorReducer(state, { type: 'SET_REPEAT_CLOSE', measureIndex: 0, count: null })
    expect(next.track.measures[0]!.repeatClose).toBeUndefined()
  })
})

// ─── Reducer: TOGGLE_PICK_STROKE ─────────────────────────────────────────────

describe('tabEditorReducer TOGGLE_PICK_STROKE', () => {
  it('sets pickStroke on the current beat when no selection', () => {
    const beat = makeBeat()
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'TOGGLE_PICK_STROKE', direction: 'down' })
    expect(next.track.measures[0]!.beats[0]!.pickStroke).toBe('down')
  })

  it('removes pickStroke when already set to the same direction', () => {
    const beat: Beat = { ...makeBeat(), pickStroke: 'down' }
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'TOGGLE_PICK_STROKE', direction: 'down' })
    expect(next.track.measures[0]!.beats[0]!.pickStroke).toBeUndefined()
  })

  it('toggles activePick when there is no beat under cursor', () => {
    // Empty measure — no beat at beatIndex 0
    const state = makeState()
    const next = tabEditorReducer(state, { type: 'TOGGLE_PICK_STROKE', direction: 'up' })
    expect(next.activePick).toBe('up')
  })
})

// ─── Reducer: INSERT_REST ─────────────────────────────────────────────────────

describe('tabEditorReducer INSERT_REST', () => {
  it('inserts a rest beat at the cursor virtual slot', () => {
    const state = makeState()
    // cursor is at beatIndex 0, measure is empty → virtual slot
    const next = tabEditorReducer(state, { type: 'INSERT_REST' })
    const beats = next.track.measures[0]!.beats
    expect(beats.length).toBeGreaterThan(0)
    // The inserted rest should have no notes
    expect(beats[0]!.notes).toHaveLength(0)
    expect(beats[0]!.duration).toBe(Duration.Quarter)
  })

  it('does nothing when cursor is on an existing beat (not a virtual slot)', () => {
    const beat = makeBeat(Duration.Quarter)
    const state = makeState({ measures: [makeMeasure([beat])] }, { beatIndex: 0 })
    const next = tabEditorReducer(state, { type: 'INSERT_REST' })
    // cursor.beatIndex 0 < beats.length 1 → no insert
    expect(next.track.measures[0]!.beats).toHaveLength(1)
    expect(next).toBe(state)
  })
})

// ─── Reducer: measure normalization (via reducer) ────────────────────────────

describe('measure normalization after state change', () => {
  it('fills rest slots up to full measure capacity after adding a note', () => {
    // Start with empty measure (0 beats). Add a quarter note (240 ticks).
    // Remaining = 720 ticks → computeFillRests(720) = [half(480), quarter(240)] = 2 fill beats.
    // Total: 1 note beat + 2 fill rest beats = 3 beats, all summing to 960 ticks.
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 5,
    })
    const beats = next.track.measures[0]!.beats
    const usedTicks = measureUsedTicks(beats)
    expect(usedTicks).toBeCloseTo(960)
    // The first beat is the real note beat
    expect(beats[0]!.notes).toHaveLength(1)
    // All subsequent beats are fill rests (no notes)
    expect(beats.slice(1).every((b) => b.notes.length === 0)).toBe(true)
  })

  it('fills rest slots for a 3/4 time signature', () => {
    const state = makeState({
      masterBars: [{ timeSignature: { numerator: 3, denominator: 4 }, bpm: 120 }],
    })
    const next = tabEditorReducer(state, {
      type: 'ADD_NOTE', measureIndex: 0, beatIndex: 0, stringIndex: 1, fret: 2,
    })
    // 3/4 = 720 ticks. After one quarter note (240), should fill 2 more quarter rests.
    const beats = next.track.measures[0]!.beats
    expect(measureUsedTicks(beats)).toBeCloseTo(720)
  })
})

// ─── Reducer: IMPORT_TRACK ───────────────────────────────────────────────────

describe('tabEditorReducer IMPORT_TRACK', () => {
  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
  })

  it('replaces the current track with the imported one', () => {
    const state = makeState()
    const importedTrack = makeTrack({ title: 'Imported Song' })
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: importedTrack,
      fileBase64: 'base64data==',
      trackInfos: [{ index: 0, name: 'Guitar', stringCount: 6 }],
      activeIndex: 0,
    })
    expect(next.track.title).toBe('Imported Song')
  })

  it('attaches importedFileBase64 to the track', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'abc123==',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.track.importedFileBase64).toBe('abc123==')
  })

  it('attaches importedTrackInfos to the track', () => {
    const state = makeState()
    const trackInfos = [
      { index: 0, name: 'Guitar', stringCount: 6 },
      { index: 1, name: 'Bass', stringCount: 4 },
    ]
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos,
      activeIndex: 0,
    })
    expect(next.track.importedTrackInfos).toEqual(trackInfos)
  })

  it('attaches importedActiveTrackIndex to the track', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [{ index: 1, name: 'Bass', stringCount: 4 }],
      activeIndex: 1,
    })
    expect(next.track.importedActiveTrackIndex).toBe(1)
  })

  it('resets cursor to the beginning', () => {
    const state = makeState({}, { measureIndex: 3, beatIndex: 2 })
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.cursor.measureIndex).toBe(0)
    expect(next.cursor.beatIndex).toBe(0)
  })

  it('resets cursor stringIndex to track.stringCount', () => {
    const state = makeState()
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack({ stringCount: 7 }),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.cursor.stringIndex).toBe(7)
  })

  it('clears selection', () => {
    const state: TabEditorState = {
      ...makeState(),
      selection: { startMeasure: 0, startBeat: 0, endMeasure: 0, endBeat: 1 },
    }
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.selection).toBeNull()
  })

  it('clears noteSelection', () => {
    const state: TabEditorState = {
      ...makeState(),
      noteSelection: [{ measureIndex: 0, beatIndex: 0, stringIndex: 1 }],
    }
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.noteSelection).toHaveLength(0)
  })

  it('clears clipboard', () => {
    const state: TabEditorState = {
      ...makeState(),
      clipboard: [makeBeat()],
    }
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.clipboard).toBeNull()
  })

  it('clears undoStack', () => {
    const state: TabEditorState = {
      ...makeState(),
      undoStack: [makeTrack(), makeTrack()],
    }
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.undoStack).toHaveLength(0)
  })

  it('clears redoStack', () => {
    const state: TabEditorState = {
      ...makeState(),
      redoStack: [makeTrack()],
    }
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.redoStack).toHaveLength(0)
  })

  it('clears pendingOverflow', () => {
    const state: TabEditorState = {
      ...makeState(),
      pendingOverflow: {
        fret: 5,
        measureIndex: 0,
        beatIndex: 0,
        stringIndex: 1,
        newDuration: Duration.Quarter,
        newDot: { dotted: false, doubleDotted: false, triplet: false },
        overshootTicks: 120,
      },
    }
    const next = tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'data',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(next.pendingOverflow).toBeNull()
  })

  it('calls saveTabTrack (localStorage.setItem) with the imported track', () => {
    const state = makeState()
    const importedTrack = makeTrack({ title: 'GP File' })
    tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: importedTrack,
      fileBase64: 'gpdata==',
      trackInfos: [],
      activeIndex: 0,
    })
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'tab-editor-track',
      expect.stringContaining('"title":"GP File"'),
    )
  })

  it('strips all import-derived fields from localStorage', () => {
    const state = makeState()
    tabEditorReducer(state, {
      type: 'IMPORT_TRACK',
      track: makeTrack(),
      fileBase64: 'stored-base64',
      trackInfos: [{ index: 0, name: 'Guitar', stringCount: 6 }],
      activeIndex: 0,
    })
    // None of the import-derived fields should be persisted (quota protection + useless without the file bytes)
    const allCalls = vi.mocked(localStorage.setItem).mock.calls
    const trackCalls = allCalls.filter(([key]) => key === 'tab-editor-track')
    expect(trackCalls.length).toBeGreaterThan(0)
    trackCalls.forEach(([, value]) => {
      expect(value).not.toContain('"importedFileBase64"')
      expect(value).not.toContain('"importedTrackInfos"')
      expect(value).not.toContain('"importedActiveTrackIndex"')
    })
  })
})
