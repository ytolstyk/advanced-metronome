import type {
  Beat,
  ConnectionModifierKey,
  DotModifier,
  DurationValue,
  Measure,
  NoteModifierKey,
  NoteModifiers,
  OverflowPending,
  TabCursor,
  TabEditorState,
  TabNote,
  TabSelection,
  TabTrack,
} from './tabEditorTypes'
import { NOTE_NAMES } from './data/noteColors'
import { TUNINGS } from './data/tunings'

const TAB_STORAGE_KEY = 'tab-editor-track'
const MAX_UNDO = 50

const MODIFIER_CONFLICTS: Partial<Record<NoteModifierKey, NoteModifierKey[]>> = {
  hammerOn: ['pullOff'],
  pullOff: ['hammerOn'],
  slideInBelow: ['slideInAbove'],
  slideInAbove: ['slideInBelow'],
  slideOutDown: ['slideOutUp'],
  slideOutUp: ['slideOutDown'],
  tapping: ['pickDown', 'pickUp'],
  pickDown: ['tapping', 'pickUp'],
  pickUp: ['tapping', 'pickDown'],
  staccato: ['vibrato', 'palmMute', 'letRing'],
  vibrato: ['palmMute', 'staccato'],
  palmMute: ['vibrato', 'letRing', 'staccato'],
  letRing: ['palmMute', 'staccato'],
}

function applyModifierConflicts(mods: NoteModifiers, modifier: NoteModifierKey): void {
  for (const conflict of MODIFIER_CONFLICTS[modifier] ?? []) {
    delete mods[conflict]
  }
}

const BEAT_SPREAD_CONFLICTS: Partial<Record<NoteModifierKey, NoteModifierKey[]>> = {
  palmMute: ['letRing', 'staccato'],
  letRing: ['palmMute', 'staccato'],
  staccato: ['palmMute', 'letRing', 'vibrato'],
}

function applyBeatSpreadConflicts(mods: NoteModifiers, modifier: NoteModifierKey): void {
  for (const conflict of BEAT_SPREAD_CONFLICTS[modifier] ?? []) {
    delete mods[conflict]
  }
}

// Strictly proportional to duration (each step doubles), so the playback cursor travels at
// a constant pixel/second rate within a row. beatWidthScale stretches/compresses all values
// uniformly when a row is fitted to 100% container width.
export const BEAT_WIDTH = 20
export const BEAT_WIDTHS: Record<DurationValue, number> = {
  whole:        80,
  half:         40,
  quarter:      20,
  eighth:       10,
  sixteenth:     5,
  thirtysecond:  2.5,
  sixtyfourth:   1.25,
}

export const DURATION_BEATS: Record<DurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtysecond: 0.125,
  sixtyfourth: 0.0625,
}

const DURATION_VALUES_ORDERED: DurationValue[] = [
  'whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth',
]

export function computeFillRests(remainingBeats: number): DurationValue[] {
  const rests: DurationValue[] = []
  let rem = remainingBeats
  for (const d of DURATION_VALUES_ORDERED) {
    const b = DURATION_BEATS[d]
    while (rem >= b - 1e-9) {
      rests.push(d)
      rem -= b
    }
  }
  return rests
}

function durationBeats(duration: DurationValue, dot: DotModifier): number {
  let beats = DURATION_BEATS[duration]
  if (dot.doubleDotted) beats *= 1.75
  else if (dot.dotted) beats *= 1.5
  if (dot.triplet) beats *= 2 / 3
  return beats
}

export function beatDurationSeconds(duration: DurationValue, dot: DotModifier, bpm: number): number {
  return (60 / bpm) * durationBeats(duration, dot)
}

export function measureCapacityBeats(timeSig: { numerator: number; denominator: number }): number {
  return (timeSig.numerator * 4) / timeSig.denominator
}

export function measureUsedBeats(beats: Beat[]): number {
  return beats.reduce((s, b) => s + durationBeats(b.duration, b.dot), 0)
}

// Maps a quarter-beat count to the closest (duration, dot) pair that fits within it
export function quarterBeatsToNearestDuration(qBeats: number): { duration: DurationValue; dot: DotModifier } {
  const noDot: DotModifier = { dotted: false, doubleDotted: false, triplet: false }
  const dotted: DotModifier = { dotted: true, doubleDotted: false, triplet: false }

  const options: Array<{ beats: number; duration: DurationValue; dot: DotModifier }> = [
    { beats: 4,       duration: 'whole',        dot: noDot },
    { beats: 3,       duration: 'half',         dot: dotted },
    { beats: 2,       duration: 'half',         dot: noDot },
    { beats: 1.5,     duration: 'quarter',      dot: dotted },
    { beats: 1,       duration: 'quarter',      dot: noDot },
    { beats: 0.75,    duration: 'eighth',       dot: dotted },
    { beats: 0.5,     duration: 'eighth',       dot: noDot },
    { beats: 0.375,   duration: 'sixteenth',    dot: dotted },
    { beats: 0.25,    duration: 'sixteenth',    dot: noDot },
    { beats: 0.1875,  duration: 'thirtysecond', dot: dotted },
    { beats: 0.125,   duration: 'thirtysecond', dot: noDot },
    { beats: 0.09375, duration: 'sixtyfourth',  dot: dotted },
    { beats: 0.0625,  duration: 'sixtyfourth',  dot: noDot },
  ]

  for (const opt of options) {
    if (opt.beats <= qBeats + 1e-9) return { duration: opt.duration, dot: opt.dot }
  }
  return { duration: 'sixtyfourth', dot: noDot }
}


export function tuningNoteToMidi(note: string, octave: number): number {
  const pc = NOTE_NAMES.indexOf(note)
  return (octave + 1) * 12 + pc
}

export function fretToFreq(openMidi: number, fret: number): number {
  return 440 * Math.pow(2, (openMidi + fret - 69) / 12)
}

function makeEmptyNote(): TabNote {
  return { fret: -1, modifiers: {} }
}

function makeBeat(duration: DurationValue = 'quarter', stringCount = 6): Beat {
  return {
    id: crypto.randomUUID(),
    duration,
    dot: { dotted: false, doubleDotted: false, triplet: false },
    notes: Array.from({ length: stringCount }, makeEmptyNote),
  }
}

function normalizeMeasuresInTrack(track: TabTrack): TabTrack {
  const measures = track.measures.map((m) => {
    const timeSig = m.timeSignature ?? track.globalTimeSig
    const remaining = measureCapacityBeats(timeSig) - measureUsedBeats(m.beats)
    if (remaining <= 1e-9) return m
    const fillRests = computeFillRests(remaining)
    const newBeats = fillRests.map((d) => makeBeat(d, track.stringCount))
    return { ...m, beats: [...m.beats, ...newBeats] }
  })
  return { ...track, measures }
}

// Measures start empty — beats are only created when notes are explicitly placed
function makeMeasure(): Measure {
  return {
    id: crypto.randomUUID(),
    beats: [],
  }
}

export function buildOpenMidi(tuningName: string, stringCount: 6 | 7 | 8): number[] {
  const presets = TUNINGS[stringCount]
  const preset = presets.find((p) => p.name === tuningName) ?? presets[0]
  return preset.strings.map((s) => tuningNoteToMidi(s.note, s.octave))
}

function createDefaultTrack(): TabTrack {
  const stringCount = 6
  const tuningName = 'Standard'
  const openMidi = buildOpenMidi(tuningName, stringCount)
  return {
    title: 'Untitled',
    globalBpm: 120,
    globalTimeSig: { numerator: 4, denominator: 4 },
    stringCount,
    tuningName,
    openMidi,
    measures: [makeMeasure()],
  }
}

export function createInitialTabState(): TabEditorState {
  let track: TabTrack
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY)
    track = saved ? normalizeMeasuresInTrack(JSON.parse(saved) as TabTrack) : createDefaultTrack()
  } catch {
    track = createDefaultTrack()
  }
  return {
    track,
    cursor: { measureIndex: 0, beatIndex: 0, stringIndex: 0 },
    selection: null,
    selectionAnchor: null,
    noteSelection: [],
    clipboard: null,
    activeDuration: 'quarter',
    activeDot: { dotted: false, doubleDotted: false, triplet: false },
    activeModifiers: {},
    isPlaying: false,
    playheadMeasure: 0,
    playheadBeat: 0,
    viewMode: 'tab',
    pendingOverflow: null,
    undoStack: [],
    redoStack: [],
  }
}

export function saveTabTrack(track: TabTrack): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(track))
  } catch {
    // storage full, ignore
  }
}

function pushUndo(state: TabEditorState): TabEditorState {
  const stack = [...state.undoStack, state.track].slice(-MAX_UNDO)
  return { ...state, undoStack: stack, redoStack: [] }
}

function cloneBeats(beats: Beat[]): Beat[] {
  return beats.map((b) => ({
    ...b,
    notes: b.notes.map((n) => ({ ...n, modifiers: { ...n.modifiers } })),
  }))
}

// Returns the activeDuration/activeDot sync for a cursor position.
// For real beats, mirrors the beat's own duration; for fill-rest slots, uses the computed fill rest duration.
function durationSyncForCursor(cursor: TabCursor, track: TabTrack): Partial<TabEditorState> {
  const measure = track.measures[cursor.measureIndex]
  if (!measure) return {}
  const beat = measure.beats[cursor.beatIndex]
  if (beat) return { activeDuration: beat.duration, activeDot: { ...beat.dot } }
  if (cursor.beatIndex >= measure.beats.length) {
    const timeSig = measure.timeSignature ?? track.globalTimeSig
    const remaining = measureCapacityBeats(timeSig) - measureUsedBeats(measure.beats)
    const fillRests = remaining > 1e-9 ? computeFillRests(remaining) : []
    const fillDur = fillRests[cursor.beatIndex - measure.beats.length]
    if (fillDur) return { activeDuration: fillDur, activeDot: { dotted: false, doubleDotted: false, triplet: false } }
  }
  return {}
}

// Advance cursor right through real beats then each fill-rest slot
function advanceCursorRight(cursor: TabCursor, track: TabTrack): TabCursor {
  const measure = track.measures[cursor.measureIndex]
  if (!measure) return cursor

  const timeSig = measure.timeSignature ?? track.globalTimeSig
  const capacity = measureCapacityBeats(timeSig)
  const used = measureUsedBeats(measure.beats)
  const remaining = capacity - used
  const fillRestCount = remaining > 1e-9 ? computeFillRests(remaining).length : 0
  const totalSlots = measure.beats.length + fillRestCount

  if (cursor.beatIndex < totalSlots - 1) {
    return { ...cursor, beatIndex: cursor.beatIndex + 1 }
  }

  if (cursor.measureIndex < track.measures.length - 1) {
    return { ...cursor, measureIndex: cursor.measureIndex + 1, beatIndex: 0 }
  }
  return cursor
}

function advanceCursorLeft(cursor: TabCursor, track: TabTrack): TabCursor {
  if (cursor.beatIndex > 0) {
    return { ...cursor, beatIndex: cursor.beatIndex - 1 }
  }
  if (cursor.measureIndex > 0) {
    const prevMeasure = track.measures[cursor.measureIndex - 1]
    const prevTimeSig = prevMeasure.timeSignature ?? track.globalTimeSig
    const prevCapacity = measureCapacityBeats(prevTimeSig)
    const prevUsed = measureUsedBeats(prevMeasure.beats)
    const prevRemaining = prevCapacity - prevUsed
    const prevFillRestCount = prevRemaining > 1e-9 ? computeFillRests(prevRemaining).length : 0
    const lastIdx = Math.max(0, prevMeasure.beats.length + prevFillRestCount - 1)
    return {
      ...cursor,
      measureIndex: cursor.measureIndex - 1,
      beatIndex: lastIdx,
    }
  }
  return cursor
}

function getUniqueBeatPositions(noteSelection: TabCursor[]): Array<{ mi: number; bi: number }> {
  const seen = new Set<string>()
  const result: Array<{ mi: number; bi: number }> = []
  for (const c of noteSelection) {
    const key = `${c.measureIndex}:${c.beatIndex}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ mi: c.measureIndex, bi: c.beatIndex })
    }
  }
  return result.sort((a, b) => a.mi !== b.mi ? a.mi - b.mi : a.bi - b.bi)
}

function getSelectedBeats(track: TabTrack, sel: TabSelection): Beat[] {
  const result: Beat[] = []
  const { startMeasure, startBeat, endMeasure, endBeat } = normalizeSelection(sel)
  for (let mi = startMeasure; mi <= endMeasure; mi++) {
    const measure = track.measures[mi]
    if (!measure) continue
    const bStart = mi === startMeasure ? startBeat : 0
    const bEnd = mi === endMeasure ? endBeat : measure.beats.length - 1
    for (let bi = bStart; bi <= bEnd; bi++) {
      if (measure.beats[bi]) result.push(measure.beats[bi])
    }
  }
  return result
}

export function normalizeSelection(sel: TabSelection): TabSelection {
  const [sm, sb, em, eb] =
    sel.startMeasure < sel.endMeasure ||
    (sel.startMeasure === sel.endMeasure && sel.startBeat <= sel.endBeat)
      ? [sel.startMeasure, sel.startBeat, sel.endMeasure, sel.endBeat]
      : [sel.endMeasure, sel.endBeat, sel.startMeasure, sel.startBeat]
  return { startMeasure: sm, startBeat: sb, endMeasure: em, endBeat: eb }
}

export function isInSelection(
  sel: TabSelection | null,
  measureIndex: number,
  beatIndex: number,
): boolean {
  if (!sel) return false
  const { startMeasure, startBeat, endMeasure, endBeat } = normalizeSelection(sel)
  if (measureIndex < startMeasure || measureIndex > endMeasure) return false
  if (measureIndex === startMeasure && beatIndex < startBeat) return false
  if (measureIndex === endMeasure && beatIndex > endBeat) return false
  return true
}

export function effectiveBpmAt(track: TabTrack, measureIndex: number): number {
  for (let i = Math.min(measureIndex, track.measures.length - 1); i >= 0; i--) {
    if (track.measures[i]?.bpm !== undefined) return track.measures[i].bpm!
  }
  return track.globalBpm
}

// Helper: place a note on an existing beat or append a new beat, with capacity checking
function placeNoteInMeasure(
  measure: Measure,
  beatIndex: number,
  stringIndex: number,
  fret: number,
  duration: DurationValue,
  dot: DotModifier,
  activeModifiers: NoteModifiers,
  stringCount: number,
  timeSig: { numerator: number; denominator: number },
): { measure: Measure; overflow: Omit<OverflowPending, 'measureIndex'> | null } {
  const capacity = measureCapacityBeats(timeSig)
  const newBeatBeats = durationBeats(duration, dot)

  if (beatIndex >= measure.beats.length) {
    // Virtual slot (any fill-rest position): append new beat
    const used = measureUsedBeats(measure.beats)
    if (used + newBeatBeats > capacity + 1e-9) {
      return {
        measure,
        overflow: { fret, beatIndex, stringIndex, newDuration: duration, newDot: dot, overshootBeats: used + newBeatBeats - capacity },
      }
    }
    const newBeat = makeBeat(duration, stringCount)
    newBeat.dot = { ...dot }
    newBeat.notes[stringIndex] = { fret, modifiers: { ...activeModifiers } }
    return { measure: { ...measure, beats: [...measure.beats, newBeat] }, overflow: null }
  }

  // Existing beat: check capacity after duration change
  const existingBeat = measure.beats[beatIndex]
  if (!existingBeat) return { measure, overflow: null }

  const oldBeatBeats = durationBeats(existingBeat.duration, existingBeat.dot)
  const usedWithoutThis = measureUsedBeats(measure.beats) - oldBeatBeats
  if (usedWithoutThis + newBeatBeats > capacity + 1e-9) {
    return {
      measure,
      overflow: { fret, beatIndex, stringIndex, newDuration: duration, newDot: dot, overshootBeats: usedWithoutThis + newBeatBeats - capacity },
    }
  }

  const beats = measure.beats.map((b, bi) => {
    if (bi !== beatIndex) return b
    const notes = b.notes.map((n, si) => {
      if (si !== stringIndex) return n
      return { fret, modifiers: { ...activeModifiers } }
    })
    return { ...b, duration, dot: { ...dot }, notes }
  })
  return { measure: { ...measure, beats }, overflow: null }
}

// ─── Actions ───────────────────────────────────────────────────────────────

export type TabEditorAction =
  | {
      type: 'ADD_NOTE'
      measureIndex: number
      beatIndex: number
      stringIndex: number
      fret: number
    }
  | {
      type: 'DELETE_NOTE'
      measureIndex: number
      beatIndex: number
      stringIndex: number
    }
  | {
      type: 'SET_BEAT_DURATION'
      measureIndex: number
      beatIndex: number
      duration: DurationValue
    }
  | {
      type: 'SET_BEAT_DOT'
      measureIndex: number
      beatIndex: number
      dot: DotModifier
    }
  | { type: 'SET_ACTIVE_DURATION'; duration: DurationValue }
  | { type: 'SET_ACTIVE_DOT'; dot: DotModifier }
  | { type: 'TOGGLE_MODIFIER'; modifier: NoteModifierKey }
  | { type: 'TOGGLE_NOTE_IN_SELECTION'; cursor: TabCursor }
  | { type: 'ENSURE_NOTE_IN_SELECTION'; cursor: TabCursor }
  | { type: 'CLEAR_NOTE_SELECTION' }
  | { type: 'APPLY_CONNECTION_TO_SELECTION'; modifier: ConnectionModifierKey }
  | { type: 'APPLY_MODIFIER_TO_SELECTION'; modifier: NoteModifierKey }
  | {
      type: 'APPLY_MODIFIER'
      measureIndex: number
      beatIndex: number
      stringIndex: number
      modifier: NoteModifierKey
    }
  | { type: 'INSERT_BEAT_BEFORE'; measureIndex: number; beatIndex: number }
  | { type: 'INSERT_BEAT_AFTER'; measureIndex: number; beatIndex: number }
  | { type: 'DELETE_BEAT'; measureIndex: number; beatIndex: number }
  | { type: 'INSERT_MEASURE_BEFORE'; measureIndex: number }
  | { type: 'INSERT_MEASURE_AFTER'; measureIndex: number }
  | { type: 'DELETE_MEASURE'; measureIndex: number }
  | { type: 'MOVE_CURSOR'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'SHIFT_MOVE_CURSOR'; direction: 'left' | 'right' }
  | { type: 'APPLY_MODIFIER_TO_BEAT_SELECTION'; modifier: NoteModifierKey }
  | { type: 'SET_CURSOR'; cursor: TabCursor }
  | { type: 'SET_SELECTION'; selection: TabSelection | null }
  | { type: 'COPY' }
  | { type: 'CUT' }
  | { type: 'PASTE'; measureIndex: number; beatIndex: number }
  | { type: 'SET_MEASURE_BPM_ONLY'; measureIndex: number; bpm: number }
  | { type: 'SET_MEASURE_BPM_FROM'; fromIndex: number; bpm: number }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_METADATA'; patch: { title?: string; artist?: string; tabAuthor?: string; year?: string; version?: number } }
  | {
      type: 'SET_TUNING'
      tuningName: string
      stringCount: 6 | 7 | 8
      openMidi: number[]
    }
  | { type: 'SET_VIEW_MODE'; mode: 'tab' | 'staff' }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_PLAYHEAD'; measureIndex: number; beatIndex: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'LOAD_TRACK'; track: TabTrack }
  | { type: 'SET_GLOBAL_TIME_SIG'; numerator: number; denominator: number }
  | { type: 'SET_MEASURE_TIME_SIG'; measureIndex: number; numerator: number; denominator: number }
  | { type: 'SET_MEASURE_TIME_SIG_RANGE'; fromIndex: number; toIndex: number; numerator: number; denominator: number }
  | { type: 'RESOLVE_OVERFLOW_TRIM' }
  | { type: 'RESOLVE_OVERFLOW_BLEED' }
  | { type: 'DISMISS_OVERFLOW' }
  | { type: 'SET_BEND_AMOUNT'; measureIndex: number; beatIndex: number; stringIndex: number; amount: number }
  | { type: 'CLEAR_NOTES' }
  | { type: 'RESOLVE_MEASURE_ERROR_REMOVE_NOTES'; measureIndex: number }
  | { type: 'RESOLVE_MEASURE_ERROR_SHIFT_NOTES'; measureIndex: number }
  | { type: 'RESOLVE_MEASURE_ERROR_ADJUST_RESTS'; measureIndex: number }
  | { type: 'INSERT_REST' }

// ─── Reducer ────────────────────────────────────────────────────────────────

function tabEditorReducerInner(
  state: TabEditorState,
  action: TabEditorAction,
): TabEditorState {
  switch (action.type) {
    case 'ADD_NOTE': {
      const measure = state.track.measures[action.measureIndex]
      if (!measure) return state

      const timeSig = measure.timeSignature ?? state.track.globalTimeSig
      const s = pushUndo(state)
      // When placing on an existing beat, inherit that beat's duration/dot
      const existingBeat = measure.beats[action.beatIndex]
      const duration = existingBeat ? existingBeat.duration : s.activeDuration
      const dot = existingBeat ? { ...existingBeat.dot } : s.activeDot
      // Preserve existing note modifiers when editing; activeModifiers can add on top
      const existingNote = existingBeat?.notes[action.stringIndex]
      const baseModifiers = (existingNote && existingNote.fret >= 0) ? existingNote.modifiers : {}
      const mergedModifiers = { ...baseModifiers, ...s.activeModifiers }
      const { measure: placedMeasure, overflow } = placeNoteInMeasure(
        measure,
        action.beatIndex,
        action.stringIndex,
        action.fret,
        duration,
        dot,
        mergedModifiers,
        s.track.stringCount,
        timeSig,
      )

      if (overflow) {
        return { ...state, pendingOverflow: { ...overflow, measureIndex: action.measureIndex } }
      }

      // Beat-level PM/LR sync: if any note in the affected beat has palmMute or letRing,
      // propagate it to all notes with a fret on that beat (clearing the opposing modifier).
      const affectedBi = action.beatIndex < measure.beats.length ? action.beatIndex : placedMeasure.beats.length - 1
      const updatedMeasure = {
        ...placedMeasure,
        beats: placedMeasure.beats.map((b, bi) => {
          if (bi !== affectedBi) return b
          const hasPM = b.notes.some((n) => n.fret >= 0 && n.modifiers.palmMute)
          const hasLR = b.notes.some((n) => n.fret >= 0 && n.modifiers.letRing)
          const hasST = b.notes.some((n) => n.fret >= 0 && n.modifiers.staccato)
          if (!hasPM && !hasLR && !hasST) return b
          const dominant: 'palmMute' | 'letRing' | 'staccato' = hasPM ? 'palmMute' : hasLR ? 'letRing' : 'staccato'
          return {
            ...b,
            notes: b.notes.map((n) => {
              if (n.fret < 0) return n
              const mods = { ...n.modifiers, [dominant]: true as const }
              if (dominant === 'palmMute') { delete mods.letRing; delete mods.staccato }
              if (dominant === 'letRing') { delete mods.palmMute; delete mods.staccato }
              if (dominant === 'staccato') { delete mods.palmMute; delete mods.letRing; delete mods.vibrato }
              return { ...n, modifiers: mods }
            }),
          }
        }),
      }

      // Remove legatoSlide where source and destination frets are equal (no direction = invalid)
      const slideFixedMeasure = {
        ...updatedMeasure,
        beats: updatedMeasure.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n, si) => {
            if (!n.modifiers.legatoSlide) return n
            const nextFret = updatedMeasure.beats[bi + 1]?.notes[si]?.fret ?? -1
            if (nextFret >= 0 && nextFret === n.fret) {
              const mods = { ...n.modifiers }
              delete mods.legatoSlide
              return { ...n, modifiers: mods }
            }
            return n
          }),
        })),
      }

      const measures = s.track.measures.map((m, mi) => mi === action.measureIndex ? slideFixedMeasure : m)
      return { ...s, track: { ...s.track, measures }, pendingOverflow: null }
    }

    case 'DELETE_NOTE': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const notes = b.notes.map((n, si) => {
              if (si !== action.stringIndex) return n
              return { fret: -1, modifiers: {} }
            })
            // If no fret-bearing notes remain, clear beat-level modifiers from all notes
            const hasAnyFret = notes.some((n) => n.fret >= 0)
            if (!hasAnyFret) {
              return { ...b, notes: notes.map((n) => ({ ...n, modifiers: {} })) }
            }
            return { ...b, notes }
          }),
        }
      })
      return { ...state, track: { ...s.track, measures }, undoStack: s.undoStack, redoStack: [] }
    }

    case 'SET_BEAT_DURATION': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            return { ...b, duration: action.duration }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_BEAT_DOT': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            return { ...b, dot: { ...action.dot } }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_ACTIVE_DURATION':
      return { ...state, activeDuration: action.duration }

    case 'SET_ACTIVE_DOT':
      return { ...state, activeDot: action.dot }

    case 'TOGGLE_MODIFIER': {
      const cur = state.activeModifiers[action.modifier]
      const next = { ...state.activeModifiers }
      if (cur) {
        delete next[action.modifier]
      } else {
        next[action.modifier] = true
        applyModifierConflicts(next, action.modifier)
      }
      return { ...state, activeModifiers: next }
    }

    case 'APPLY_MODIFIER': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const cur = b.notes[action.stringIndex]?.modifiers[action.modifier]
            const setting = !cur
            const notes = b.notes.map((n, si) => {
              const mods = { ...n.modifiers }
              if (si === action.stringIndex) {
                if (cur) {
                  delete mods[action.modifier]
                } else {
                  mods[action.modifier] = true
                  applyModifierConflicts(mods, action.modifier)
                }
              }
              // Beat-level spread: PM/LR/staccato applied to one note applies to all notes with a fret
              if (setting && (action.modifier === 'palmMute' || action.modifier === 'letRing' || action.modifier === 'staccato') && n.fret >= 0) {
                mods[action.modifier] = true
                applyBeatSpreadConflicts(mods, action.modifier)
              }
              return { ...n, modifiers: mods }
            })
            return { ...b, notes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_BEAT_BEFORE': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        const beats = [...m.beats]
        beats.splice(action.beatIndex, 0, makeBeat(state.activeDuration, s.track.stringCount))
        return { ...m, beats }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_BEAT_AFTER': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        const beats = [...m.beats]
        beats.splice(action.beatIndex + 1, 0, makeBeat(state.activeDuration, s.track.stringCount))
        return { ...m, beats }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'DELETE_BEAT': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        if (m.beats.length <= 1) return m
        const beats = m.beats.filter((_, bi) => bi !== action.beatIndex)
        return { ...m, beats }
      })
      const measure = measures[state.cursor.measureIndex]
      const newBeatIdx = Math.min(state.cursor.beatIndex, (measure?.beats.length ?? 1) - 1)
      return {
        ...s,
        track: { ...s.track, measures },
        cursor: { ...state.cursor, beatIndex: Math.max(0, newBeatIdx) },
      }
    }

    case 'INSERT_MEASURE_BEFORE': {
      const s = pushUndo(state)
      const measures = [...s.track.measures]
      measures.splice(action.measureIndex, 0, makeMeasure())
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_MEASURE_AFTER': {
      const s = pushUndo(state)
      const measures = [...s.track.measures]
      measures.splice(action.measureIndex + 1, 0, makeMeasure())
      return { ...s, track: { ...s.track, measures } }
    }

    case 'DELETE_MEASURE': {
      const s = pushUndo(state)
      if (s.track.measures.length <= 1) return state
      const measures = s.track.measures.filter((_, mi) => mi !== action.measureIndex)
      const newMeasureIdx = Math.min(state.cursor.measureIndex, measures.length - 1)
      return {
        ...s,
        track: { ...s.track, measures },
        cursor: { measureIndex: newMeasureIdx, beatIndex: 0, stringIndex: 0 },
      }
    }

    case 'MOVE_CURSOR': {
      const { cursor, track } = state

      function withBeatSync(newCursor: TabCursor, extraState?: Partial<TabEditorState>): TabEditorState {
        const durationSync = durationSyncForCursor(newCursor, track)
        return { ...state, ...durationSync, ...extraState, cursor: newCursor, selection: null, selectionAnchor: null }
      }

      if (action.direction === 'right') {
        const advanced = advanceCursorRight(cursor, track)
        if (advanced === cursor) {
          const newMeasure = makeMeasure()
          const measures = [...track.measures, newMeasure]
          const newCursor = { ...cursor, measureIndex: measures.length - 1, beatIndex: 0 }
          return withBeatSync(newCursor, { track: { ...track, measures } })
        }
        return withBeatSync(advanced)
      }
      if (action.direction === 'left') {
        return withBeatSync(advanceCursorLeft(cursor, track))
      }
      if (action.direction === 'up') {
        const si = Math.min(track.stringCount - 1, cursor.stringIndex + 1)
        return withBeatSync({ ...cursor, stringIndex: si })
      }
      if (action.direction === 'down') {
        const si = Math.max(0, cursor.stringIndex - 1)
        return withBeatSync({ ...cursor, stringIndex: si })
      }
      return state
    }

    case 'SET_CURSOR': {
      const durationSync = durationSyncForCursor(action.cursor, state.track)
      return { ...state, ...durationSync, cursor: action.cursor }
    }

    case 'SET_SELECTION':
      return { ...state, selection: action.selection, selectionAnchor: action.selection === null ? null : state.selectionAnchor }

    case 'SHIFT_MOVE_CURSOR': {
      const { cursor, track } = state
      const anchor = state.selectionAnchor ?? cursor
      const newCursor = action.direction === 'right'
        ? advanceCursorRight(cursor, track)
        : advanceCursorLeft(cursor, track)
      if (newCursor === cursor) return state
      const durationSync = durationSyncForCursor(newCursor, track)
      const selection: TabSelection = {
        startMeasure: anchor.measureIndex,
        startBeat: anchor.beatIndex,
        endMeasure: newCursor.measureIndex,
        endBeat: newCursor.beatIndex,
      }
      return { ...state, ...durationSync, cursor: newCursor, selection, selectionAnchor: anchor }
    }

    case 'APPLY_MODIFIER_TO_BEAT_SELECTION': {
      const sel = state.selection
      if (!sel) return state
      const s = pushUndo(state)
      const norm = normalizeSelection(sel)

      const selBeatSet = new Set<string>()
      for (let mi = norm.startMeasure; mi <= norm.endMeasure; mi++) {
        const m = state.track.measures[mi]
        if (!m) continue
        const bStart = mi === norm.startMeasure ? norm.startBeat : 0
        const bEnd = mi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
        for (let bi = bStart; bi <= bEnd; bi++) selBeatSet.add(`${mi}:${bi}`)
      }

      const allHave = [...selBeatSet].every((key) => {
        const [tmi, tbi] = key.split(':').map(Number)
        const beat = state.track.measures[tmi!]?.beats[tbi!]
        if (!beat) return true
        return beat.notes.every((n) => n.fret < 0 || !!n.modifiers[action.modifier])
      })
      const setting = !allHave

      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => {
          if (!selBeatSet.has(`${mi}:${bi}`)) return b
          const afterModifier = b.notes.map((n) => {
            if (n.fret < 0) return n
            if (!setting) {
              const mods = { ...n.modifiers }
              delete mods[action.modifier]
              return { ...n, modifiers: mods }
            }
            const mods = { ...n.modifiers, [action.modifier]: true as const }
            applyModifierConflicts(mods, action.modifier)
            return { ...n, modifiers: mods }
          })
          if (setting && (action.modifier === 'palmMute' || action.modifier === 'letRing' || action.modifier === 'staccato')) {
            return {
              ...b, notes: afterModifier.map((n) => {
                const mods = { ...n.modifiers }
                applyBeatSpreadConflicts(mods, action.modifier)
                return { ...n, modifiers: mods }
              }),
            }
          }
          return { ...b, notes: afterModifier }
        }),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'TOGGLE_NOTE_IN_SELECTION': {
      const { measureIndex: mi, beatIndex: bi, stringIndex: si } = action.cursor
      const exists = state.noteSelection.some(
        (s) => s.measureIndex === mi && s.beatIndex === bi && s.stringIndex === si,
      )
      const noteSelection = exists
        ? state.noteSelection.filter(
            (s) => !(s.measureIndex === mi && s.beatIndex === bi && s.stringIndex === si),
          )
        : [...state.noteSelection, { ...action.cursor }]
      return { ...state, noteSelection }
    }

    case 'ENSURE_NOTE_IN_SELECTION': {
      const { measureIndex: mi, beatIndex: bi, stringIndex: si } = action.cursor
      const exists = state.noteSelection.some(
        (s) => s.measureIndex === mi && s.beatIndex === bi && s.stringIndex === si,
      )
      if (exists) return state
      return { ...state, noteSelection: [...state.noteSelection, { ...action.cursor }] }
    }

    case 'CLEAR_NOTE_SELECTION':
      return { ...state, noteSelection: [] }

    case 'APPLY_MODIFIER_TO_SELECTION': {
      if (state.noteSelection.length < 1) return state
      const s = pushUndo(state)
      const selSet = new Set(
        state.noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}:${c.stringIndex}`),
      )
      const allHave = state.noteSelection.every((c) => {
        const note = state.track.measures[c.measureIndex]?.beats[c.beatIndex]?.notes[c.stringIndex]
        return note && note.fret >= 0 && !!note.modifiers[action.modifier]
      })
      const setting = !allHave
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => {
          const afterModifier = b.notes.map((n, si) => {
            if (!selSet.has(`${mi}:${bi}:${si}`)) return n
            if (allHave) {
              const mods = { ...n.modifiers }
              delete mods[action.modifier]
              return { ...n, modifiers: mods }
            }
            const mods = { ...n.modifiers, [action.modifier]: true as const }
            applyModifierConflicts(mods, action.modifier)
            return { ...n, modifiers: mods }
          })
          // Beat-level exclusivity: clear opposing modifiers from every note in the beat
          if (setting && (action.modifier === 'palmMute' || action.modifier === 'letRing' || action.modifier === 'staccato')) {
            const beatHasModifier = afterModifier.some((n) => n.modifiers[action.modifier])
            if (beatHasModifier) {
              return {
                ...b, notes: afterModifier.map((n) => {
                  const mods = { ...n.modifiers }
                  applyBeatSpreadConflicts(mods, action.modifier)
                  return { ...n, modifiers: mods }
                }),
              }
            }
          }
          return { ...b, notes: afterModifier }
        }),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'APPLY_CONNECTION_TO_SELECTION': {
      if (state.noteSelection.length < 2) return state
      const s = pushUndo(state)
      const ordered = [...state.noteSelection].sort((a, b) => {
        if (a.measureIndex !== b.measureIndex) return a.measureIndex - b.measureIndex
        return a.beatIndex - b.beatIndex
      })

      const toMark = new Set<string>()
      const isHO = action.modifier === 'hammerOn'
      const isPO = action.modifier === 'pullOff'

      for (let i = 0; i < ordered.length - 1; i++) {
        const curr = ordered[i]!
        const next = ordered[i + 1]!
        const key = `${curr.measureIndex}:${curr.beatIndex}:${curr.stringIndex}`

        if (isHO || isPO) {
          if (curr.stringIndex !== next.stringIndex) continue
          const currFret = s.track.measures[curr.measureIndex]?.beats[curr.beatIndex]?.notes[curr.stringIndex]?.fret ?? -1
          const nextFret = s.track.measures[next.measureIndex]?.beats[next.beatIndex]?.notes[next.stringIndex]?.fret ?? -1
          if (currFret < 0 || nextFret < 0) continue
          if (isHO && nextFret > currFret) toMark.add(key)
          if (isPO && nextFret < currFret) toMark.add(key)
        } else {
          toMark.add(key)
        }
      }

      const conflictKey = isHO ? 'pullOff' : isPO ? 'hammerOn' : null
      const allHaveConnection = toMark.size > 0 && [...toMark].every((key) => {
        const [tmi, tbi, tsi] = key.split(':').map(Number)
        const note = s.track.measures[tmi!]?.beats[tbi!]?.notes[tsi!]
        return note && !!note.modifiers[action.modifier]
      })
      const selSetAll = new Set(
        state.noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}:${c.stringIndex}`),
      )
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n, si) => {
            const noteKey = `${mi}:${bi}:${si}`
            if (allHaveConnection) {
              if (!selSetAll.has(noteKey)) return n
              const mods = { ...n.modifiers }
              delete mods[action.modifier]
              return { ...n, modifiers: mods }
            }
            if (!toMark.has(noteKey)) return n
            const mods = { ...n.modifiers, [action.modifier]: true as const }
            if (conflictKey) delete mods[conflictKey]
            return { ...n, modifiers: mods }
          }),
        })),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'COPY': {
      const sel = state.selection
      if (!sel) {
        if (state.noteSelection.length > 0) {
          const positions = getUniqueBeatPositions(state.noteSelection)
          const beats = positions.map(({ mi, bi }) => state.track.measures[mi]?.beats[bi]).filter((b): b is Beat => !!b)
          if (beats.length > 0) return { ...state, clipboard: cloneBeats(beats) }
        }
        const m = state.track.measures[state.cursor.measureIndex]
        const b = m?.beats[state.cursor.beatIndex]
        if (!b) return state
        return { ...state, clipboard: cloneBeats([b]) }
      }
      const beats = getSelectedBeats(state.track, sel)
      return { ...state, clipboard: cloneBeats(beats) }
    }

    case 'CUT': {
      const s = pushUndo(state)
      const sel = state.selection
      let clipboard: Beat[]
      let measures: Measure[]

      if (!sel) {
        if (s.noteSelection.length > 0) {
          const positions = getUniqueBeatPositions(s.noteSelection)
          clipboard = cloneBeats(
            positions.map(({ mi, bi }) => s.track.measures[mi]?.beats[bi]).filter((b): b is Beat => !!b),
          )
          measures = s.track.measures.map((m, mi) => {
            const toClear = new Set(positions.filter((p) => p.mi === mi).map((p) => p.bi))
            if (toClear.size === 0) return m
            return { ...m, beats: m.beats.map((b, bi) => toClear.has(bi) ? { ...b, notes: b.notes.map(() => makeEmptyNote()) } : b) }
          })
          return { ...s, track: { ...s.track, measures }, clipboard, selection: null }
        }
        const m = s.track.measures[s.cursor.measureIndex]
        const b = m?.beats[s.cursor.beatIndex]
        if (!b) return state
        clipboard = cloneBeats([b])
        measures = s.track.measures.map((meas, mi) => {
          if (mi !== s.cursor.measureIndex) return meas
          return {
            ...meas,
            beats: meas.beats.map((beat, bi) => {
              if (bi !== s.cursor.beatIndex) return beat
              return { ...beat, notes: beat.notes.map(() => makeEmptyNote()) }
            }),
          }
        })
      } else {
        const norm = normalizeSelection(sel)
        clipboard = cloneBeats(getSelectedBeats(s.track, norm))
        measures = s.track.measures.map((m, mi) => {
          if (mi < norm.startMeasure || mi > norm.endMeasure) return m
          const bStart = mi === norm.startMeasure ? norm.startBeat : 0
          const bEnd = mi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
          return {
            ...m,
            beats: m.beats.map((b, bi) => {
              if (bi < bStart || bi > bEnd) return b
              return { ...b, notes: b.notes.map(() => makeEmptyNote()) }
            }),
          }
        })
      }
      return { ...s, track: { ...s.track, measures }, clipboard, selection: null }
    }

    case 'PASTE': {
      if (!state.clipboard || state.clipboard.length === 0) return state
      const s = pushUndo(state)
      const clip = state.clipboard
      let mi = action.measureIndex
      let bi = action.beatIndex
      const measures = s.track.measures.map((m) => ({ ...m, beats: [...m.beats] }))

      for (const srcBeat of clip) {
        if (mi >= measures.length) break
        const newBeat: Beat = {
          ...srcBeat,
          id: crypto.randomUUID(),
          notes: srcBeat.notes.map((n) => ({ ...n, modifiers: { ...n.modifiers } })),
        }
        if (bi < measures[mi].beats.length) {
          measures[mi].beats[bi] = newBeat
        } else {
          measures[mi].beats.push(newBeat)
        }
        bi++
        const pastedMeasure = measures[mi]!
        const pastedTimeSig = pastedMeasure.timeSignature ?? s.track.globalTimeSig
        const pastedCapacity = measureCapacityBeats(pastedTimeSig)
        const pastedUsed = measureUsedBeats(pastedMeasure.beats)
        if (bi >= pastedMeasure.beats.length && pastedUsed >= pastedCapacity - 1e-9) {
          bi = 0
          mi++
        }
      }
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_MEASURE_BPM_ONLY': {
      const clampedBpm = Math.max(20, Math.min(300, action.bpm))
      const prevBpm = effectiveBpmAt(state.track, action.measureIndex - 1)
      const measures = state.track.measures.map((m, i) => {
        if (i === action.measureIndex) return { ...m, bpm: clampedBpm }
        if (i === action.measureIndex + 1 && m.bpm === undefined) return { ...m, bpm: prevBpm }
        return m
      })
      return { ...state, track: { ...state.track, measures } }
    }

    case 'SET_MEASURE_BPM_FROM': {
      const clampedBpm = Math.max(20, Math.min(300, action.bpm))
      const nextOverrideIdx = state.track.measures.findIndex((m, i) => i > action.fromIndex && m.bpm !== undefined)
      const clearUntil = nextOverrideIdx === -1 ? state.track.measures.length : nextOverrideIdx
      const measures = state.track.measures.map((m, i) => {
        if (i === action.fromIndex) return { ...m, bpm: clampedBpm }
        if (i > action.fromIndex && i < clearUntil) return { ...m, bpm: undefined }
        return m
      })
      return { ...state, track: { ...state.track, measures } }
    }

    case 'SET_TITLE':
      return { ...state, track: { ...state.track, title: action.title } }

    case 'SET_METADATA':
      return { ...state, track: { ...state.track, ...action.patch } }

    case 'SET_TUNING': {
      const s = pushUndo(state)
      const { stringCount, openMidi, tuningName } = action
      const measures = s.track.measures.map((m) => ({
        ...m,
        beats: m.beats.map((b) => {
          const notes = Array.from({ length: stringCount }, (_, i) => b.notes[i] ?? makeEmptyNote())
          return { ...b, notes }
        }),
      }))
      return {
        ...s,
        track: { ...s.track, stringCount, tuningName, openMidi, measures },
        cursor: {
          ...state.cursor,
          stringIndex: Math.min(state.cursor.stringIndex, stringCount - 1),
        },
      }
    }

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode }

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying }

    case 'SET_PLAYHEAD':
      return { ...state, playheadMeasure: action.measureIndex, playheadBeat: action.beatIndex }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state
      const undoStack = [...state.undoStack]
      const track = undoStack.pop()!
      const redoStack = [state.track, ...state.redoStack].slice(0, MAX_UNDO)
      return { ...state, track, undoStack, redoStack, pendingOverflow: null }
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state
      const redoStack = [...state.redoStack]
      const track = redoStack.shift()!
      const undoStack = [...state.undoStack, state.track].slice(-MAX_UNDO)
      return { ...state, track, undoStack, redoStack }
    }

    case 'LOAD_TRACK':
      return {
        ...state,
        track: action.track,
        cursor: { measureIndex: 0, beatIndex: 0, stringIndex: 0 },
        selection: null,
        selectionAnchor: null,
        noteSelection: [],
        clipboard: null,
        undoStack: [],
        redoStack: [],
        pendingOverflow: null,
      }

    case 'SET_GLOBAL_TIME_SIG': {
      const s = pushUndo(state)
      return { ...s, track: { ...s.track, globalTimeSig: { numerator: action.numerator, denominator: action.denominator } } }
    }

    case 'SET_MEASURE_TIME_SIG': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return { ...m, timeSignature: { numerator: action.numerator, denominator: action.denominator } }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_MEASURE_TIME_SIG_RANGE': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi < action.fromIndex || mi > action.toIndex) return m
        return { ...m, timeSignature: { numerator: action.numerator, denominator: action.denominator } }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'RESOLVE_OVERFLOW_TRIM': {
      if (!state.pendingOverflow) return state
      const { fret, measureIndex, beatIndex, stringIndex } = state.pendingOverflow
      const s = pushUndo(state)
      const measure = s.track.measures[measureIndex]
      if (!measure) return state

      const timeSig = measure.timeSignature ?? s.track.globalTimeSig
      const capacity = measureCapacityBeats(timeSig)

      let usedWithoutThis: number
      if (beatIndex >= measure.beats.length) {
        usedWithoutThis = measureUsedBeats(measure.beats)
      } else {
        const beat = measure.beats[beatIndex]
        if (!beat) return state
        usedWithoutThis = measureUsedBeats(measure.beats) - durationBeats(beat.duration, beat.dot)
      }
      const remaining = capacity - usedWithoutThis

      const { duration: trimDur, dot: trimDot } = quarterBeatsToNearestDuration(Math.max(0, remaining))

      const measures = s.track.measures.map((m, mi) => {
        if (mi !== measureIndex) return m
        if (beatIndex >= m.beats.length) {
          const newBeat = makeBeat(trimDur, s.track.stringCount)
          newBeat.dot = { ...trimDot }
          newBeat.notes[stringIndex] = { fret, modifiers: { ...state.activeModifiers } }
          return { ...m, beats: [...m.beats, newBeat] }
        }
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== beatIndex) return b
            const notes = b.notes.map((n, si) => {
              if (si !== stringIndex) return n
              return { fret, modifiers: { ...state.activeModifiers } }
            })
            return { ...b, duration: trimDur, dot: { ...trimDot }, notes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures }, pendingOverflow: null }
    }

    case 'RESOLVE_OVERFLOW_BLEED': {
      if (!state.pendingOverflow) return state
      const { fret, measureIndex, beatIndex, stringIndex, overshootBeats } = state.pendingOverflow
      const s = pushUndo(state)

      // Compute trimmed duration that fills exactly the remaining space (same logic as TRIM)
      const bleedMeasure = s.track.measures[measureIndex]
      if (!bleedMeasure) return state
      const bleedTimeSig = bleedMeasure.timeSignature ?? s.track.globalTimeSig
      const bleedCapacity = measureCapacityBeats(bleedTimeSig)
      let bleedUsedWithoutThis: number
      if (beatIndex >= bleedMeasure.beats.length) {
        bleedUsedWithoutThis = measureUsedBeats(bleedMeasure.beats)
      } else {
        const existBeat = bleedMeasure.beats[beatIndex]
        if (!existBeat) return state
        bleedUsedWithoutThis = measureUsedBeats(bleedMeasure.beats) - durationBeats(existBeat.duration, existBeat.dot)
      }
      const bleedRemaining = bleedCapacity - bleedUsedWithoutThis
      const { duration: trimDur, dot: trimDot } = quarterBeatsToNearestDuration(Math.max(0, bleedRemaining))

      // Place trimmed note in current measure, marked as tying into the next measure
      let measures = s.track.measures.map((m, mi) => {
        if (mi !== measureIndex) return m
        if (beatIndex >= m.beats.length) {
          const newBeat = makeBeat(trimDur, s.track.stringCount)
          newBeat.dot = { ...trimDot }
          newBeat.tiedTo = true
          newBeat.notes[stringIndex] = { fret, modifiers: { ...state.activeModifiers } }
          return { ...m, beats: [...m.beats, newBeat] }
        }
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== beatIndex) return b
            const notes = b.notes.map((n, si) => {
              if (si !== stringIndex) return n
              return { fret, modifiers: { ...state.activeModifiers } }
            })
            return { ...b, duration: trimDur, dot: { ...trimDot }, tiedTo: true as const, notes }
          }),
        }
      })

      // Insert tied continuation beat at position 0 of next measure
      const { duration: bleedDur, dot: bleedDot } = quarterBeatsToNearestDuration(Math.max(0.0625, overshootBeats))
      const nextMi = measureIndex + 1

      if (nextMi < measures.length) {
        measures = measures.map((m, mi) => {
          if (mi !== nextMi) return m
          const tieBeat = makeBeat(bleedDur, s.track.stringCount)
          tieBeat.dot = { ...bleedDot }
          tieBeat.tiedFrom = true
          tieBeat.notes[stringIndex] = { fret, modifiers: {} }
          return { ...m, beats: [tieBeat, ...m.beats] }
        })
      } else {
        const newMeasure = makeMeasure()
        const tieBeat = makeBeat(bleedDur, s.track.stringCount)
        tieBeat.dot = { ...bleedDot }
        tieBeat.tiedFrom = true
        tieBeat.notes[stringIndex] = { fret, modifiers: {} }
        newMeasure.beats = [tieBeat]
        measures = [...measures, newMeasure]
      }

      return {
        ...s,
        track: { ...s.track, measures },
        pendingOverflow: null,
        cursor: { measureIndex: nextMi, beatIndex: 1, stringIndex },
      }
    }

    case 'DISMISS_OVERFLOW':
      return { ...state, pendingOverflow: null }

    case 'CLEAR_NOTES': {
      const s = pushUndo(state)
      const { cursor, selection, noteSelection, track } = s

      // Beat-range selection takes priority
      if (selection) {
        const norm = normalizeSelection(selection)
        const measures = track.measures.map((m, mi) => {
          if (mi < norm.startMeasure || mi > norm.endMeasure) return m
          const bStart = mi === norm.startMeasure ? norm.startBeat : 0
          const bEnd = mi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
          return {
            ...m,
            beats: m.beats.map((b, bi) => {
              if (bi < bStart || bi > bEnd) return b
              return { ...b, notes: b.notes.map(() => makeEmptyNote()) }
            }),
          }
        })
        return { ...s, track: { ...track, measures } }
      }

      // Multi-note selection: clear all notes in each affected beat
      if (noteSelection.length >= 2) {
        const beatSet = new Set(noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}`))
        const measures = track.measures.map((m, mi) => ({
          ...m,
          beats: m.beats.map((b, bi) => {
            if (!beatSet.has(`${mi}:${bi}`)) return b
            return { ...b, notes: b.notes.map(() => makeEmptyNote()) }
          }),
        }))
        return { ...s, track: { ...track, measures } }
      }

      // Single cursor: clear all notes at current beat
      const measures = track.measures.map((m, mi) => {
        if (mi !== cursor.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== cursor.beatIndex) return b
            return { ...b, notes: b.notes.map(() => makeEmptyNote()) }
          }),
        }
      })
      return { ...s, track: { ...track, measures } }
    }

    case 'SET_BEND_AMOUNT': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const notes = b.notes.map((n, si) => {
              if (si !== action.stringIndex) return n
              return { ...n, bendAmount: action.amount }
            })
            return { ...b, notes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'RESOLVE_MEASURE_ERROR_REMOVE_NOTES': {
      const s = pushUndo(state)
      const measure = s.track.measures[action.measureIndex]
      if (!measure) return state
      const timeSig = measure.timeSignature ?? s.track.globalTimeSig
      const capacity = measureCapacityBeats(timeSig)

      // Keep only beats that fit within capacity; drop the first beat that would overflow and all after
      let usedSoFar = 0
      const keptBeats: Beat[] = []
      for (const beat of measure.beats) {
        const beatDur = durationBeats(beat.duration, beat.dot)
        if (usedSoFar + beatDur <= capacity + 1e-9) {
          keptBeats.push(beat)
          usedSoFar += beatDur
        } else {
          break
        }
      }

      const measures = s.track.measures.map((m, mi) =>
        mi === action.measureIndex ? { ...m, beats: keptBeats } : m,
      )
      return { ...s, track: { ...s.track, measures } }
    }

    case 'RESOLVE_MEASURE_ERROR_SHIFT_NOTES': {
      const s = pushUndo(state)
      const measure = s.track.measures[action.measureIndex]
      if (!measure) return state
      const timeSig = measure.timeSignature ?? s.track.globalTimeSig
      const capacity = measureCapacityBeats(timeSig)

      let usedSoFar = 0
      const keptBeats: Beat[] = []
      const overflowBeats: Beat[] = []

      for (let i = 0; i < measure.beats.length; i++) {
        const beat = measure.beats[i]!
        const beatDur = durationBeats(beat.duration, beat.dot)

        if (usedSoFar + beatDur <= capacity + 1e-9) {
          keptBeats.push(beat)
          usedSoFar += beatDur
        } else {
          const remaining = capacity - usedSoFar
          if (remaining > 1e-9) {
            // Beat partially fits — split using bleed logic
            const { duration: trimDur, dot: trimDot } = quarterBeatsToNearestDuration(remaining)
            const overshoot = beatDur - remaining
            const { duration: bleedDur, dot: bleedDot } = quarterBeatsToNearestDuration(Math.max(0.0625, overshoot))
            const trimmedBeat: Beat = { ...beat, duration: trimDur, dot: trimDot, tiedTo: true }
            const bleedBeat: Beat = { ...beat, id: crypto.randomUUID(), duration: bleedDur, dot: bleedDot, tiedFrom: true }
            delete bleedBeat.tiedTo
            keptBeats.push(trimmedBeat)
            overflowBeats.push(bleedBeat)
          } else {
            overflowBeats.push(beat)
          }
          overflowBeats.push(...measure.beats.slice(i + 1))
          break
        }
      }

      const nextMi = action.measureIndex + 1
      let measures = s.track.measures.map((m, mi) =>
        mi === action.measureIndex ? { ...m, beats: keptBeats } : m,
      )

      if (overflowBeats.length > 0) {
        if (nextMi < measures.length) {
          measures = measures.map((m, mi) =>
            mi === nextMi ? { ...m, beats: [...overflowBeats, ...m.beats] } : m,
          )
        } else {
          const newMeasure = makeMeasure()
          newMeasure.beats = overflowBeats
          measures = [...measures, newMeasure]
        }
      }

      return { ...s, track: { ...s.track, measures } }
    }

    case 'RESOLVE_MEASURE_ERROR_ADJUST_RESTS': {
      const s = pushUndo(state)
      const measure = s.track.measures[action.measureIndex]
      if (!measure) return state
      const timeSig = measure.timeSignature ?? s.track.globalTimeSig
      const capacity = measureCapacityBeats(timeSig)

      // Keep only beats that have at least one fret-bearing note
      const noteBeats = measure.beats.filter((b) => b.notes.some((n) => n.fret >= 0))
      const noteBeatsUsed = measureUsedBeats(noteBeats)
      if (noteBeatsUsed > capacity + 1e-9) return state

      const remaining = capacity - noteBeatsUsed
      const restDurations = remaining > 1e-9 ? computeFillRests(remaining) : []
      const restBeats = restDurations.map((d) => makeBeat(d, s.track.stringCount))

      const measures = s.track.measures.map((m, mi) =>
        mi === action.measureIndex ? { ...m, beats: [...noteBeats, ...restBeats] } : m,
      )
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_REST': {
      const { cursor, activeDuration, activeDot, track } = state
      const measure = track.measures[cursor.measureIndex]
      if (!measure) return state
      // Only insert at virtual fill-rest slots, not on top of existing beats
      if (cursor.beatIndex < measure.beats.length) return state

      const timeSig = measure.timeSignature ?? track.globalTimeSig
      const capacity = measureCapacityBeats(timeSig)
      const used = measureUsedBeats(measure.beats)
      const newBeatBeats = durationBeats(activeDuration, activeDot)
      if (used + newBeatBeats > capacity + 1e-9) return state

      const s = pushUndo(state)
      const newBeat = makeBeat(activeDuration, track.stringCount)
      newBeat.dot = { ...activeDot }
      const measures = s.track.measures.map((m, mi) =>
        mi === cursor.measureIndex ? { ...m, beats: [...m.beats, newBeat] } : m,
      )
      const newTrack = { ...s.track, measures }
      const advancedCursor = advanceCursorRight(cursor, newTrack)
      return { ...s, track: newTrack, cursor: advancedCursor }
    }

    default:
      return state
  }
}

export function tabEditorReducer(
  state: TabEditorState,
  action: TabEditorAction,
): TabEditorState {
  const next = tabEditorReducerInner(state, action)
  if (next.track === state.track) return next
  return { ...next, track: normalizeMeasuresInTrack(next.track) }
}

