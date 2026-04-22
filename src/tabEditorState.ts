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

// All beats are the same visual width regardless of duration
export const BEAT_WIDTH = 40
export const BEAT_WIDTHS: Record<DurationValue, number> = {
  whole: BEAT_WIDTH,
  half: BEAT_WIDTH,
  quarter: BEAT_WIDTH,
  eighth: BEAT_WIDTH,
  sixteenth: BEAT_WIDTH,
  thirtysecond: BEAT_WIDTH,
  sixtyfourth: BEAT_WIDTH,
}

const DURATION_BEATS: Record<DurationValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  thirtysecond: 0.125,
  sixtyfourth: 0.0625,
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
    track = saved ? (JSON.parse(saved) as TabTrack) : createDefaultTrack()
  } catch {
    track = createDefaultTrack()
  }
  return {
    track,
    cursor: { measureIndex: 0, beatIndex: 0, stringIndex: 0 },
    selection: null,
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

// Advance cursor right, allowing the virtual pending slot (beatIndex = beats.length)
function advanceCursorRight(cursor: TabCursor, track: TabTrack): TabCursor {
  const measure = track.measures[cursor.measureIndex]
  if (!measure) return cursor

  const timeSig = measure.timeSignature ?? track.globalTimeSig
  const capacity = measureCapacityBeats(timeSig)
  const used = measureUsedBeats(measure.beats)
  const hasVirtualSlot = used < capacity - 1e-9
  const isAtVirtualSlot = cursor.beatIndex === measure.beats.length

  if (!isAtVirtualSlot) {
    if (cursor.beatIndex < measure.beats.length - 1) {
      return { ...cursor, beatIndex: cursor.beatIndex + 1 }
    }
    if (hasVirtualSlot) {
      return { ...cursor, beatIndex: measure.beats.length }
    }
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
    const prevBeatIdx = Math.max(0, prevMeasure.beats.length - 1)
    return {
      ...cursor,
      measureIndex: cursor.measureIndex - 1,
      beatIndex: prevBeatIdx,
    }
  }
  return cursor
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

function normalizeSelection(sel: TabSelection): TabSelection {
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

  if (beatIndex === measure.beats.length) {
    // Virtual slot: append new beat
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
  | { type: 'SET_CURSOR'; cursor: TabCursor }
  | { type: 'SET_SELECTION'; selection: TabSelection | null }
  | { type: 'COPY' }
  | { type: 'CUT' }
  | { type: 'PASTE'; measureIndex: number; beatIndex: number }
  | { type: 'SET_MEASURE_BPM_ONLY'; measureIndex: number; bpm: number }
  | { type: 'SET_MEASURE_BPM_FROM'; fromIndex: number; bpm: number }
  | { type: 'SET_TITLE'; title: string }
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

// ─── Reducer ────────────────────────────────────────────────────────────────

export function tabEditorReducer(
  state: TabEditorState,
  action: TabEditorAction,
): TabEditorState {
  switch (action.type) {
    case 'ADD_NOTE': {
      const measure = state.track.measures[action.measureIndex]
      if (!measure) return state

      const timeSig = measure.timeSignature ?? state.track.globalTimeSig
      const s = pushUndo(state)
      const { measure: updatedMeasure, overflow } = placeNoteInMeasure(
        measure,
        action.beatIndex,
        action.stringIndex,
        action.fret,
        s.activeDuration,
        s.activeDot,
        s.activeModifiers,
        s.track.stringCount,
        timeSig,
      )

      if (overflow) {
        return { ...state, pendingOverflow: { ...overflow, measureIndex: action.measureIndex } }
      }

      const measures = s.track.measures.map((m, mi) => mi === action.measureIndex ? updatedMeasure : m)
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
        if (action.modifier === 'slideInBelow') delete next.slideInAbove
        if (action.modifier === 'slideInAbove') delete next.slideInBelow
        if (action.modifier === 'slideOutDown') delete next.slideOutUp
        if (action.modifier === 'slideOutUp') delete next.slideOutDown
        if (action.modifier === 'tapping') { delete next.pickDown; delete next.pickUp }
        if (action.modifier === 'pickDown') { delete next.tapping; delete next.pickUp }
        if (action.modifier === 'pickUp') { delete next.tapping; delete next.pickDown }
        if (action.modifier === 'vibrato') delete next.palmMute
        if (action.modifier === 'palmMute') delete next.vibrato
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
            const notes = b.notes.map((n, si) => {
              if (si !== action.stringIndex) return n
              const cur = n.modifiers[action.modifier]
              const mods = { ...n.modifiers }
              if (cur) {
                delete mods[action.modifier]
              } else {
                mods[action.modifier] = true
                if (action.modifier === 'hammerOn') delete mods.pullOff
                if (action.modifier === 'pullOff') delete mods.hammerOn
                if (action.modifier === 'slideInBelow') delete mods.slideInAbove
                if (action.modifier === 'slideInAbove') delete mods.slideInBelow
                if (action.modifier === 'slideOutDown') delete mods.slideOutUp
                if (action.modifier === 'slideOutUp') delete mods.slideOutDown
                if (action.modifier === 'tapping') { delete mods.pickDown; delete mods.pickUp }
                if (action.modifier === 'pickDown') { delete mods.tapping; delete mods.pickUp }
                if (action.modifier === 'pickUp') { delete mods.tapping; delete mods.pickDown }
                if (action.modifier === 'vibrato') delete mods.palmMute
                if (action.modifier === 'palmMute') delete mods.vibrato
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
      if (action.direction === 'right') {
        const advanced = advanceCursorRight(cursor, track)
        if (advanced === cursor) {
          const newMeasure = makeMeasure()
          const measures = [...track.measures, newMeasure]
          const newCursor = { ...cursor, measureIndex: measures.length - 1, beatIndex: 0 }
          return { ...state, track: { ...track, measures }, cursor: newCursor, selection: null }
        }
        return { ...state, cursor: advanced, selection: null }
      }
      if (action.direction === 'left') {
        return { ...state, cursor: advanceCursorLeft(cursor, track), selection: null }
      }
      if (action.direction === 'up') {
        const si = Math.min(track.stringCount - 1, cursor.stringIndex + 1)
        return { ...state, cursor: { ...cursor, stringIndex: si } }
      }
      if (action.direction === 'down') {
        const si = Math.max(0, cursor.stringIndex - 1)
        return { ...state, cursor: { ...cursor, stringIndex: si } }
      }
      return state
    }

    case 'SET_CURSOR':
      return { ...state, cursor: action.cursor }

    case 'SET_SELECTION':
      return { ...state, selection: action.selection }

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
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n, si) => {
            if (!selSet.has(`${mi}:${bi}:${si}`)) return n
            const mods = { ...n.modifiers, [action.modifier]: true as const }
            if (action.modifier === 'tapping') { delete mods.pickDown; delete mods.pickUp }
            if (action.modifier === 'pickDown') { delete mods.tapping; delete mods.pickUp }
            if (action.modifier === 'pickUp') { delete mods.tapping; delete mods.pickDown }
            if (action.modifier === 'vibrato') delete mods.palmMute
            if (action.modifier === 'palmMute') delete mods.vibrato
            return { ...n, modifiers: mods }
          }),
        })),
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
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n, si) => {
            if (!toMark.has(`${mi}:${bi}:${si}`)) return n
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
        if (bi >= measures[mi].beats.length) {
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
      if (beatIndex === measure.beats.length) {
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
        if (beatIndex === m.beats.length) {
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
      const { fret, measureIndex, beatIndex, stringIndex, newDuration, newDot, overshootBeats } = state.pendingOverflow
      const s = pushUndo(state)

      // Place note at full declared duration in current measure
      let measures = s.track.measures.map((m, mi) => {
        if (mi !== measureIndex) return m
        if (beatIndex === m.beats.length) {
          const newBeat = makeBeat(newDuration, s.track.stringCount)
          newBeat.dot = { ...newDot }
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
            return { ...b, duration: newDuration, dot: { ...newDot }, notes }
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

    default:
      return state
  }
}

