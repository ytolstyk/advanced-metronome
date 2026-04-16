import type {
  Beat,
  DotModifier,
  DurationValue,
  Measure,
  NoteModifierKey,
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

export const BEAT_WIDTHS: Record<DurationValue, number> = {
  whole: 160,
  half: 80,
  quarter: 40,
  eighth: 20,
  sixteenth: 14,
  thirtysecond: 10,
  sixtyfourth: 8,
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

export function beatDurationSeconds(duration: DurationValue, dot: DotModifier, bpm: number): number {
  let beats = DURATION_BEATS[duration]
  if (dot.doubleDotted) beats *= 1.75
  else if (dot.dotted) beats *= 1.5
  if (dot.triplet) beats *= 2 / 3
  return (60 / bpm) * beats
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

function makeMeasure(stringCount = 6, beatsCount = 4): Measure {
  return {
    id: crypto.randomUUID(),
    beats: Array.from({ length: beatsCount }, () => makeBeat('quarter', stringCount)),
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
    measures: [makeMeasure(stringCount, 4)],
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
    clipboard: null,
    activeDuration: 'quarter',
    activeDot: { dotted: false, doubleDotted: false, triplet: false },
    activeModifiers: {},
    isPlaying: false,
    playheadMeasure: 0,
    playheadBeat: 0,
    viewMode: 'tab',
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

// Helper: clone deep a Beat array
function cloneBeats(beats: Beat[]): Beat[] {
  return beats.map((b) => ({
    ...b,
    notes: b.notes.map((n) => ({ ...n, modifiers: { ...n.modifiers } })),
  }))
}

// Advance cursor right within track, wrapping across measures
function advanceCursorRight(cursor: TabCursor, track: TabTrack): TabCursor {
  const measure = track.measures[cursor.measureIndex]
  if (!measure) return cursor
  if (cursor.beatIndex < measure.beats.length - 1) {
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
    return {
      ...cursor,
      measureIndex: cursor.measureIndex - 1,
      beatIndex: prevMeasure.beats.length - 1,
    }
  }
  return cursor
}

// Collect beats from selection (flat array across measures, in order)
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
  | { type: 'SET_ACTIVE_DURATION'; duration: DurationValue }
  | { type: 'SET_ACTIVE_DOT'; dot: DotModifier }
  | { type: 'TOGGLE_MODIFIER'; modifier: NoteModifierKey }
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
  | { type: 'SET_BPM'; bpm: number }
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

// ─── Reducer ────────────────────────────────────────────────────────────────

export function tabEditorReducer(
  state: TabEditorState,
  action: TabEditorAction,
): TabEditorState {
  switch (action.type) {
    case 'ADD_NOTE': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const notes = b.notes.map((n, si) => {
              if (si !== action.stringIndex) return n
              return { fret: action.fret, modifiers: { ...state.activeModifiers } }
            })
            return { ...b, notes }
          }),
        }
      })
      const track = { ...s.track, measures }
      return { ...s, track }
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
              if (cur) delete mods[action.modifier]
              else mods[action.modifier] = true
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
        if (m.beats.length <= 1) return m // keep at least 1 beat
        const beats = m.beats.filter((_, bi) => bi !== action.beatIndex)
        return { ...m, beats }
      })
      const measure = measures[state.cursor.measureIndex]
      const newBeatIdx = Math.min(state.cursor.beatIndex, (measure?.beats.length ?? 1) - 1)
      return {
        ...s,
        track: { ...s.track, measures },
        cursor: { ...state.cursor, beatIndex: newBeatIdx },
      }
    }

    case 'INSERT_MEASURE_BEFORE': {
      const s = pushUndo(state)
      const measures = [...s.track.measures]
      measures.splice(
        action.measureIndex,
        0,
        makeMeasure(s.track.stringCount, s.track.globalTimeSig.numerator),
      )
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_MEASURE_AFTER': {
      const s = pushUndo(state)
      const measures = [...s.track.measures]
      measures.splice(
        action.measureIndex + 1,
        0,
        makeMeasure(s.track.stringCount, s.track.globalTimeSig.numerator),
      )
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
        return { ...state, cursor: advanceCursorRight(cursor, track), selection: null }
      }
      if (action.direction === 'left') {
        return { ...state, cursor: advanceCursorLeft(cursor, track), selection: null }
      }
      if (action.direction === 'up') {
        const si = Math.max(0, cursor.stringIndex - 1)
        return { ...state, cursor: { ...cursor, stringIndex: si } }
      }
      if (action.direction === 'down') {
        const si = Math.min(track.stringCount - 1, cursor.stringIndex + 1)
        return { ...state, cursor: { ...cursor, stringIndex: si } }
      }
      return state
    }

    case 'SET_CURSOR':
      return { ...state, cursor: action.cursor }

    case 'SET_SELECTION':
      return { ...state, selection: action.selection }

    case 'COPY': {
      const sel = state.selection
      if (!sel) {
        // Copy current beat
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
        // Clear the beat (set all frets to -1)
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
        // Clear selected beats
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
      return {
        ...s,
        track: { ...s.track, measures },
        clipboard,
        selection: null,
      }
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
        measures[mi].beats[bi] = newBeat
        bi++
        if (bi >= measures[mi].beats.length) {
          bi = 0
          mi++
        }
      }
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_BPM':
      return { ...state, track: { ...state.track, globalBpm: Math.max(20, Math.min(300, action.bpm)) } }

    case 'SET_TITLE':
      return { ...state, track: { ...state.track, title: action.title } }

    case 'SET_TUNING': {
      const s = pushUndo(state)
      // Remap notes: if string count changed, resize each beat's notes array
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
        track: {
          ...s.track,
          stringCount,
          tuningName,
          openMidi,
          measures,
        },
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
      return { ...state, track, undoStack, redoStack }
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
      }

    default:
      return state
  }
}
