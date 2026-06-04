import type {
  Beat,
  BendCurve,
  BendData,
  ConnectionModifierKey,
  DotModifier,
  DurationValue,
  HarmonicTypeValue,
  ImportedTrackInfo,
  MasterBar,
  Measure,
  NoteModifierKey,
  NoteModifiers,
  OverflowPending,
  TabCursor,
  TabEditorState,
  TabNote,
  TabSelection,
  TabTrack,
  WhammyBarData,
} from './tabEditorTypes'
import { Duration } from './tabEditorTypes'
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
  staccato: ['vibrato', 'palmMute', 'letRing', 'trill'],
  vibrato: ['palmMute', 'staccato', 'trill'],
  palmMute: ['vibrato', 'letRing', 'staccato', 'trill'],
  letRing: ['palmMute', 'staccato'],
  harmonicType: ['dead', 'palmMute'],
  dead: ['harmonicType', 'trill'],
  trill: ['dead', 'staccato', 'vibrato', 'palmMute'],
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
// a constant pixel/second rate within a row.
export const BEAT_WIDTH = 20
export const BEAT_WIDTHS: Record<DurationValue, number> = {
  [Duration.Whole]:        80,
  [Duration.Half]:         40,
  [Duration.Quarter]:      20,
  [Duration.Eighth]:       10,
  [Duration.Sixteenth]:     5,
  [Duration.ThirtySecond]:  2.5,
  [Duration.SixtyFourth]:   1.25,
}

// Ticks per duration (960 ticks = whole note — standard MIDI/alphaTab resolution)
export const DURATION_TICKS: Record<DurationValue, number> = {
  [Duration.Whole]:        960,
  [Duration.Half]:         480,
  [Duration.Quarter]:      240,
  [Duration.Eighth]:       120,
  [Duration.Sixteenth]:     60,
  [Duration.ThirtySecond]:  30,
  [Duration.SixtyFourth]:   15,
}

// Human-readable labels for each DurationValue integer
export const DURATION_LABELS: Record<DurationValue, string> = {
  [Duration.Whole]:        '1/1',
  [Duration.Half]:         '1/2',
  [Duration.Quarter]:      '1/4',
  [Duration.Eighth]:       '1/8',
  [Duration.Sixteenth]:    '1/16',
  [Duration.ThirtySecond]: '1/32',
  [Duration.SixtyFourth]:  '1/64',
}

const DURATION_VALUES_ORDERED: DurationValue[] = [
  Duration.Whole, Duration.Half, Duration.Quarter, Duration.Eighth,
  Duration.Sixteenth, Duration.ThirtySecond, Duration.SixtyFourth,
]

export function computeFillRests(remainingTicks: number): DurationValue[] {
  const rests: DurationValue[] = []
  let rem = remainingTicks
  for (const d of DURATION_VALUES_ORDERED) {
    const t = DURATION_TICKS[d]
    while (rem >= t - 1e-6) {
      rests.push(d)
      rem -= t
    }
  }
  return rests
}

function durationTicks(duration: DurationValue, dot: DotModifier): number {
  let ticks = DURATION_TICKS[duration]
  if (dot.doubleDotted) ticks *= 1.75
  else if (dot.dotted) ticks *= 1.5
  if (dot.triplet) ticks *= 2 / 3
  return ticks
}

export function beatDurationSeconds(duration: DurationValue, dot: DotModifier, bpm: number): number {
  // 240 ticks = 1 quarter note; (ticks/240) * (60/bpm) = seconds
  return (durationTicks(duration, dot) / 240) * (60 / bpm)
}

export function measureCapacityTicks(timeSig: { numerator: number; denominator: number }): number {
  return (timeSig.numerator * 960) / timeSig.denominator
}

export function measureUsedTicks(beats: Beat[]): number {
  return beats.reduce((s, b) => s + durationTicks(b.duration, b.dot), 0)
}

// Maps a tick count to the closest (duration, dot) pair that fits within it
export function ticksToNearestDuration(targetTicks: number): { duration: DurationValue; dot: DotModifier } {
  const noDot: DotModifier = { dotted: false, doubleDotted: false, triplet: false }
  const dotted: DotModifier = { dotted: true, doubleDotted: false, triplet: false }

  const options: Array<{ ticks: number; duration: DurationValue; dot: DotModifier }> = [
    { ticks: 960,   duration: Duration.Whole,        dot: noDot },
    { ticks: 720,   duration: Duration.Half,         dot: dotted },
    { ticks: 480,   duration: Duration.Half,         dot: noDot },
    { ticks: 360,   duration: Duration.Quarter,      dot: dotted },
    { ticks: 240,   duration: Duration.Quarter,      dot: noDot },
    { ticks: 180,   duration: Duration.Eighth,       dot: dotted },
    { ticks: 120,   duration: Duration.Eighth,       dot: noDot },
    { ticks: 90,    duration: Duration.Sixteenth,    dot: dotted },
    { ticks: 60,    duration: Duration.Sixteenth,    dot: noDot },
    { ticks: 45,    duration: Duration.ThirtySecond, dot: dotted },
    { ticks: 30,    duration: Duration.ThirtySecond, dot: noDot },
    { ticks: 22.5,  duration: Duration.SixtyFourth,  dot: dotted },
    { ticks: 15,    duration: Duration.SixtyFourth,  dot: noDot },
  ]

  for (const opt of options) {
    if (opt.ticks <= targetTicks + 1e-6) return { duration: opt.duration, dot: opt.dot }
  }
  return { duration: Duration.SixtyFourth, dot: noDot }
}

// Legacy alias used by a few callers
export function quarterBeatsToNearestDuration(qBeats: number): { duration: DurationValue; dot: DotModifier } {
  return ticksToNearestDuration(qBeats * 240)
}

export function tuningNoteToMidi(note: string, octave: number): number {
  const pc = NOTE_NAMES.indexOf(note)
  return (octave + 1) * 12 + pc
}

export function fretToFreq(openMidi: number, fret: number): number {
  return 440 * Math.pow(2, (openMidi + fret - 69) / 12)
}

function makeBeat(duration: DurationValue = Duration.Quarter): Beat {
  return {
    id: crypto.randomUUID(),
    duration,
    dot: { dotted: false, doubleDotted: false, triplet: false },
    notes: [],  // sparse — notes are added individually with .string property
  }
}

// Returns the masterBar for a measure, falling back to [0] if out-of-range
function masterBarAt(track: TabTrack, mi: number): MasterBar {
  return track.masterBars[mi] ?? track.masterBars[0]!
}

function normalizeMeasuresInTrack(track: TabTrack): TabTrack {
  const measures = track.measures.map((m, mi) => {
    const timeSig = masterBarAt(track, mi).timeSignature
    const remaining = measureCapacityTicks(timeSig) - measureUsedTicks(m.beats)
    if (remaining <= 1e-6) return m
    const fillRests = computeFillRests(remaining)
    const newBeats = fillRests.map((d) => makeBeat(d))
    return { ...m, beats: [...m.beats, ...newBeats] }
  })
  return { ...track, measures }
}

function makeMeasure(): Measure {
  return { id: crypto.randomUUID(), beats: [] }
}

export function buildOpenMidi(tuningName: string, stringCount: 6 | 7 | 8): number[] {
  const presets = TUNINGS[stringCount]
  const preset = presets.find((p) => p.name === tuningName) ?? presets[0]!
  // low→high: index 0 = string 1 (lowest pitch), index stringCount-1 = highest pitch
  return preset.strings.map((s) => tuningNoteToMidi(s.note, s.octave))
}

function createDefaultTrack(): TabTrack {
  const stringCount = 6
  const tuningName = 'Standard'
  const openMidi = buildOpenMidi(tuningName, stringCount)
  return {
    schemaVersion: 4,
    title: 'Untitled',
    masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 }],
    stringCount,
    tuningName,
    openMidi,
    measures: [makeMeasure()],
  }
}

// ─── localStorage migration ─────────────────────────────────────────────────

const STRING_DURATION_TO_INT: Record<string, DurationValue> = {
  whole:        Duration.Whole,
  half:         Duration.Half,
  quarter:      Duration.Quarter,
  eighth:       Duration.Eighth,
  sixteenth:    Duration.Sixteenth,
  thirtysecond: Duration.ThirtySecond,
  sixtyfourth:  Duration.SixtyFourth,
}

function cleanNoteModifiers(track: TabTrack): TabTrack {
  return {
    ...track,
    measures: track.measures.map((m) => ({
      ...m,
      beats: m.beats.map((b) => {
        // Migrate legacy per-note pickDown/pickUp to beat-level pickStroke (first note wins)
        let pickStroke = b.pickStroke
        const notes = b.notes.map((n) => {
          const mods = { ...n.modifiers } as Record<string, unknown>
          if (!pickStroke) {
            if (mods.pickDown) pickStroke = 'down'
            else if (mods.pickUp) pickStroke = 'up'
          }
          delete mods.pickDown
          delete mods.pickUp
          // vibrato: true is pre-VibratoType legacy data → default to Slight (1)
          if (mods.vibrato === true) mods.vibrato = 1
          // naturalHarmonic: true is pre-HarmonicType legacy data → Natural (1)
          if (mods.naturalHarmonic === true) {
            mods.harmonicType = 1
            delete mods.naturalHarmonic
          }
          // harmonicType: true is invalid (was never valid but guard anyway)
          if (mods.harmonicType === true) mods.harmonicType = 1
          // Migrate legacy bendAmount (semitones) to bendData (multi-point curve)
          const note = n as TabNote & { bendAmount?: number }
          if (note.modifiers.bend && !note.bendData && note.bendAmount !== undefined) {
            const qtValue = Math.round(note.bendAmount * 4)
            const { bendAmount: _ba, ...noteRest } = note as TabNote & { bendAmount?: number }
            void _ba
            return {
              ...noteRest,
              modifiers: mods as NoteModifiers,
              bendData: {
                points: [{ offset: 0, value: 0 }, { offset: 60, value: qtValue }],
                segments: ['up' as BendCurve],
              } satisfies BendData,
            }
          }
          return { ...n, modifiers: mods as NoteModifiers }
        })
        return { ...b, notes, ...(pickStroke ? { pickStroke } : {}) }
      }),
    })),
  }
}

function migrateV3ToV4(track: TabTrack & { schemaVersion: 3 | 4 }): TabTrack {
  return {
    ...track,
    schemaVersion: 4,
    measures: track.measures.map((m) => {
      const firstBeat = m.beats[0] as (Beat & { repeatStart?: unknown }) | undefined
      const lastBeat = m.beats[m.beats.length - 1] as (Beat & { repeatEnd?: unknown }) | undefined
      const repeatOpen = firstBeat?.repeatStart ? true as const : undefined
      const repeatClose = lastBeat?.repeatEnd ? 2 : undefined
      return {
        ...m,
        ...(repeatOpen !== undefined ? { repeatOpen } : {}),
        ...(repeatClose !== undefined ? { repeatClose } : {}),
        beats: m.beats.map((b) => {
          const { repeatStart: _rs, repeatEnd: _re, ...rest } = b as Beat & { repeatStart?: unknown; repeatEnd?: unknown }
          void _rs; void _re
          return rest as Beat
        }),
      }
    }),
  }
}

export function migrateTrackIfNeeded(raw: unknown): TabTrack {
  const data = raw as Record<string, unknown>

  // Already v4 format — still run modifier cleanup to fix legacy boolean values
  if (data.schemaVersion === 4) return cleanNoteModifiers(data as unknown as TabTrack)

  // v3 → v4: move repeatStart/repeatEnd from beats to measure-level repeatOpen/repeatClose
  if (data.schemaVersion === 3) {
    const v3 = cleanNoteModifiers(data as unknown as TabTrack)
    return migrateV3ToV4(v3 as TabTrack & { schemaVersion: 3 | 4 })
  }

  // v2 → v3: flip string indices (1=highest → 1=lowest) and reverse openMidi (high→low → low→high)
  if (data.schemaVersion === 2) {
    const sc = (data.stringCount as number) ?? 6
    const v2 = data as unknown as TabTrack
    const measures = v2.measures.map((m) => ({
      ...m,
      beats: m.beats.map((b) => ({
        ...b,
        notes: b.notes.map((n) => ({ ...n, string: sc + 1 - n.string })),
      })),
    }))
    return migrateV3ToV4({ ...v2, schemaVersion: 3, openMidi: v2.openMidi.slice().reverse(), measures } as unknown as TabTrack & { schemaVersion: 3 | 4 })
  }

  // Legacy format: has globalBpm / globalTimeSig and fixed-array notes
  const stringCount = (data.stringCount as 6 | 7 | 8) ?? 6
  const globalTimeSig = (data.globalTimeSig as { numerator: number; denominator: number }) ??
    { numerator: 4, denominator: 4 }
  const globalBpm = (data.globalBpm as number) ?? 120

  type OldMeasure = {
    id: string
    beats: Array<{
      id: string; duration: string; dot: DotModifier
      notes: Array<{ fret: number; modifiers: NoteModifiers; bendAmount?: number }>
      [k: string]: unknown
    }>
    timeSignature?: { numerator: number; denominator: number }
    bpm?: number
  }

  const oldMeasures = ((data.measures as OldMeasure[]) ?? [])

  const masterBars: MasterBar[] = oldMeasures.map((m, i) => ({
    timeSignature: m.timeSignature ?? globalTimeSig,
    bpm: i === 0 ? (m.bpm ?? globalBpm) : m.bpm,
  }))
  if (masterBars.length === 0) {
    masterBars.push({ timeSignature: globalTimeSig, bpm: globalBpm })
  } else if (!masterBars[0]!.bpm) {
    masterBars[0] = { ...masterBars[0]!, bpm: globalBpm }
  }

  const measures = oldMeasures.map((m) => ({
    id: m.id,
    beats: m.beats.map((b) => ({
      ...b,
      duration: STRING_DURATION_TO_INT[b.duration] ?? Duration.Quarter,
      // Old notes[i] (0-based, i=0=lowest) → new note.string = oldIdx + 1 (1-based, 1=lowest)
      notes: b.notes
        .map((n, oldIdx) => ({ ...n, string: oldIdx + 1 }))
        .filter((n) => n.fret >= 0),
    })),
  }))

  // Old openMidi was low→high; v3 openMidi is also low→high — no reversal needed
  const openMidi = (data.openMidi as number[]) ??
    buildOpenMidi((data.tuningName as string) ?? 'Standard', stringCount)

  const { globalBpm: _gb, globalTimeSig: _gt, ...rest } = data as Record<string, unknown> & {
    globalBpm: number; globalTimeSig: unknown
  }
  void _gb; void _gt

  const v3track = {
    ...(rest as Omit<TabTrack, 'masterBars' | 'measures' | 'openMidi' | 'schemaVersion'>),
    schemaVersion: 3 as const,
    masterBars,
    measures,
    openMidi,
  }
  return migrateV3ToV4(v3track as unknown as TabTrack & { schemaVersion: 3 | 4 })
}

export function createInitialTabState(): TabEditorState {
  let track: TabTrack
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY)
    if (saved) {
      const raw = JSON.parse(saved) as unknown
      const migrated = migrateTrackIfNeeded(raw)
      track = normalizeMeasuresInTrack(migrated)
    } else {
      track = createDefaultTrack()
    }
  } catch {
    track = createDefaultTrack()
  }
  return {
    track,
    cursor: { measureIndex: 0, beatIndex: 0, stringIndex: track.stringCount },
    selection: null,
    selectionAnchor: null,
    noteSelection: [],
    clipboard: null,
    activeDuration: Duration.Quarter,
    activeDot: { dotted: false, doubleDotted: false, triplet: false },
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

export function saveTabTrack(track: TabTrack): void {
  try {
    // Strip import-derived fields before persisting:
    // importedFileBase64 — GP files are hundreds of KB and exhaust the 5MB localStorage quota.
    // importedTrackInfos / importedActiveTrackIndex — useless without the file bytes anyway.
    // On page reload the alphaTab preview falls back to toAlphaTabScore(track).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { importedFileBase64: _, importedTrackInfos: _ti, importedActiveTrackIndex: _ai, ...rest } = track
    localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // storage full, ignore
  }
}

function pushUndo(state: TabEditorState): TabEditorState {
  const stack = [...state.undoStack, state.track].slice(-MAX_UNDO)
  return { ...state, undoStack: stack, redoStack: [] }
}

// Sync tied-string notes in the next beat to match the base beat when tiedToNext is active.
// Only strings present in the base beat are updated; other strings in the next beat are untouched.
function syncTiedNextBeat(measures: Measure[], baseMi: number, baseBi: number): Measure[] {
  const baseBeat = measures[baseMi]?.beats[baseBi]
  if (!baseBeat?.tiedToNext) return measures
  const nextMi = baseBi + 1 < (measures[baseMi]?.beats.length ?? 0) ? baseMi : baseMi + 1
  const nextBi = baseBi + 1 < (measures[baseMi]?.beats.length ?? 0) ? baseBi + 1 : 0
  if (!measures[nextMi]?.beats[nextBi]) return measures
  const baseByString = new Map(baseBeat.notes.map((n) => [n.string, n]))
  return measures.map((m, mi) => {
    if (mi !== nextMi) return m
    return {
      ...m,
      beats: m.beats.map((b, bi) => {
        if (bi !== nextBi) return b
        // Update existing notes on tied strings; keep all other notes unchanged
        const updated = b.notes.map((n) => {
          const base = baseByString.get(n.string)
          return base ? { ...n, fret: base.fret } : n
        })
        // Add notes for tied strings not already present in the next beat
        for (const base of baseBeat.notes) {
          if (!updated.some((n) => n.string === base.string)) {
            updated.push({ ...base, modifiers: { ...base.modifiers } })
          }
        }
        return { ...b, notes: updated }
      }),
    }
  })
}

function cloneBeats(beats: Beat[]): Beat[] {
  return beats.map((b) => ({
    ...b,
    notes: b.notes.map((n) => ({ ...n, modifiers: { ...n.modifiers } })),
  }))
}

// Returns the activeDuration/activeDot/activePick sync for a cursor position.
function durationSyncForCursor(cursor: TabCursor, track: TabTrack): Partial<TabEditorState> {
  const measure = track.measures[cursor.measureIndex]
  if (!measure) return {}
  const beat = measure.beats[cursor.beatIndex]
  if (beat) return { activeDuration: beat.duration, activeDot: { ...beat.dot }, activePick: beat.pickStroke, activeDynamics: beat.dynamics }
  if (cursor.beatIndex >= measure.beats.length) {
    const timeSig = masterBarAt(track, cursor.measureIndex).timeSignature
    const remaining = measureCapacityTicks(timeSig) - measureUsedTicks(measure.beats)
    const fillRests = remaining > 1e-6 ? computeFillRests(remaining) : []
    const fillDur = fillRests[cursor.beatIndex - measure.beats.length]
    if (fillDur !== undefined) return { activeDuration: fillDur, activeDot: { dotted: false, doubleDotted: false, triplet: false }, activePick: undefined, activeDynamics: undefined }
  }
  return {}
}

function advanceCursorRight(cursor: TabCursor, track: TabTrack): TabCursor {
  const measure = track.measures[cursor.measureIndex]
  if (!measure) return cursor

  const timeSig = masterBarAt(track, cursor.measureIndex).timeSignature
  const capacity = measureCapacityTicks(timeSig)
  const used = measureUsedTicks(measure.beats)
  const remaining = capacity - used
  const fillRestCount = remaining > 1e-6 ? computeFillRests(remaining).length : 0
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
    const prevMeasure = track.measures[cursor.measureIndex - 1]!
    const prevTimeSig = masterBarAt(track, cursor.measureIndex - 1).timeSignature
    const prevCapacity = measureCapacityTicks(prevTimeSig)
    const prevUsed = measureUsedTicks(prevMeasure.beats)
    const prevRemaining = prevCapacity - prevUsed
    const prevFillRestCount = prevRemaining > 1e-6 ? computeFillRests(prevRemaining).length : 0
    const lastIdx = Math.max(0, prevMeasure.beats.length + prevFillRestCount - 1)
    return { ...cursor, measureIndex: cursor.measureIndex - 1, beatIndex: lastIdx }
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
  const mi = Math.min(measureIndex, track.masterBars.length - 1)
  for (let i = mi; i >= 0; i--) {
    if (track.masterBars[i]?.bpm !== undefined) return track.masterBars[i]!.bpm!
  }
  return 120
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
  timeSig: { numerator: number; denominator: number },
  harmonicValue?: number,
  activePick?: 'down' | 'up',
  activeDynamics?: Beat['dynamics'],
): { measure: Measure; overflow: Omit<OverflowPending, 'measureIndex'> | null } {
  const capacity = measureCapacityTicks(timeSig)
  const newBeatTicks = durationTicks(duration, dot)

  function upsertNote(notes: TabNote[], harmonicValue?: number): TabNote[] {
    const existingNote = notes.find((n) => n.string === stringIndex)
    const newNote: TabNote = {
      string: stringIndex,
      fret,
      modifiers: { ...activeModifiers },
      ...(activeModifiers.harmonicType === 2 && { harmonicValue: harmonicValue ?? existingNote?.harmonicValue ?? 12 }),
    }
    const idx = notes.findIndex((n) => n.string === stringIndex)
    if (idx >= 0) {
      return notes.map((n, i) => (i === idx ? newNote : n))
    }
    return [...notes, newNote].sort((a, b) => a.string - b.string)
  }

  if (beatIndex >= measure.beats.length) {
    // Virtual slot: append new beat
    const used = measureUsedTicks(measure.beats)
    if (used + newBeatTicks > capacity + 1e-6) {
      return {
        measure,
        overflow: { fret, beatIndex, stringIndex, newDuration: duration, newDot: dot, overshootTicks: used + newBeatTicks - capacity },
      }
    }
    const newBeat = makeBeat(duration)
    newBeat.dot = { ...dot }
    newBeat.notes = upsertNote([], harmonicValue)
    if (activePick) newBeat.pickStroke = activePick
    if (activeDynamics) newBeat.dynamics = activeDynamics
    return { measure: { ...measure, beats: [...measure.beats, newBeat] }, overflow: null }
  }

  // Existing beat: check capacity after duration change
  const existingBeat = measure.beats[beatIndex]
  if (!existingBeat) return { measure, overflow: null }

  const oldBeatTicks = durationTicks(existingBeat.duration, existingBeat.dot)
  const usedWithoutThis = measureUsedTicks(measure.beats) - oldBeatTicks
  if (usedWithoutThis + newBeatTicks > capacity + 1e-6) {
    return {
      measure,
      overflow: { fret, beatIndex, stringIndex, newDuration: duration, newDot: dot, overshootTicks: usedWithoutThis + newBeatTicks - capacity },
    }
  }

  const beats = measure.beats.map((b, bi) => {
    if (bi !== beatIndex) return b
    const notes = upsertNote(b.notes, harmonicValue)
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
  | { type: 'TOGGLE_MODIFIER'; modifier: NoteModifierKey; value?: true | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'TOGGLE_NOTE_IN_SELECTION'; cursor: TabCursor }
  | { type: 'ENSURE_NOTE_IN_SELECTION'; cursor: TabCursor }
  | { type: 'CLEAR_NOTE_SELECTION' }
  | { type: 'APPLY_CONNECTION_TO_SELECTION'; modifier: ConnectionModifierKey }
  | { type: 'APPLY_MODIFIER_TO_SELECTION'; modifier: NoteModifierKey; value?: true | 1 | 2 | 3 | 4 | 5 | 6 }
  | {
      type: 'APPLY_MODIFIER'
      measureIndex: number
      beatIndex: number
      stringIndex: number
      modifier: NoteModifierKey
      value?: true | 1 | 2 | 3 | 4 | 5 | 6
    }
  | { type: 'INSERT_BEAT_BEFORE'; measureIndex: number; beatIndex: number }
  | { type: 'INSERT_BEAT_AFTER'; measureIndex: number; beatIndex: number }
  | { type: 'DELETE_BEAT'; measureIndex: number; beatIndex: number }
  | { type: 'INSERT_MEASURE_BEFORE'; measureIndex: number }
  | { type: 'INSERT_MEASURE_AFTER'; measureIndex: number }
  | { type: 'DELETE_MEASURE'; measureIndex: number }
  | { type: 'MOVE_CURSOR'; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'SHIFT_MOVE_CURSOR'; direction: 'left' | 'right' }
  | { type: 'APPLY_MODIFIER_TO_BEAT_SELECTION'; modifier: NoteModifierKey; value?: true | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'APPLY_HARMONIC'; measureIndex: number; beatIndex: number; stringIndex: number; harmonicType?: HarmonicTypeValue; harmonicValue?: number }
  | { type: 'APPLY_HARMONIC_TO_SELECTION'; harmonicType?: HarmonicTypeValue; harmonicValue?: number }
  | { type: 'APPLY_HARMONIC_TO_BEAT_SELECTION'; harmonicType?: HarmonicTypeValue; harmonicValue?: number }
  | { type: 'SET_ACTIVE_HARMONIC'; harmonicType?: HarmonicTypeValue; harmonicValue?: number }
  | { type: 'APPLY_TRILL'; measureIndex: number; beatIndex: number; stringIndex: number; trillFret?: number; trillSpeed?: DurationValue }
  | { type: 'APPLY_TRILL_TO_SELECTION'; trillFret?: number; trillSpeed?: DurationValue }
  | { type: 'APPLY_TRILL_TO_BEAT_SELECTION'; trillFret?: number; trillSpeed?: DurationValue }
  | { type: 'SET_ACTIVE_TRILL'; trillFret?: number; trillSpeed?: DurationValue }
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
  | { type: 'SET_BEND_DATA'; measureIndex: number; beatIndex: number; stringIndex: number; bendData: BendData }
  | { type: 'CLEAR_NOTES' }
  | { type: 'RESOLVE_MEASURE_ERROR_REMOVE_NOTES'; measureIndex: number }
  | { type: 'RESOLVE_MEASURE_ERROR_SHIFT_NOTES'; measureIndex: number }
  | { type: 'RESOLVE_MEASURE_ERROR_ADJUST_RESTS'; measureIndex: number }
  | { type: 'INSERT_REST' }
  | { type: 'TOGGLE_PICK_STROKE'; direction: 'down' | 'up' }
  | { type: 'APPLY_TREMOLO_PICKING'; measureIndex: number; beatIndex: number; marks?: number }
  | { type: 'APPLY_TREMOLO_PICKING_TO_SELECTION'; marks?: number }
  | { type: 'SET_BEAT_TEXT'; measureIndex: number; beatIndex: number; text: string | null }
  | { type: 'SET_MEASURE_MARKER'; measureIndex: number; marker: string | null }
  | { type: 'TOGGLE_TIE_TO_NEXT'; measureIndex: number; beatIndex: number }
  | { type: 'SET_BEAT_CHORD'; measureIndex: number; beatIndex: number; chord: { name: string; frets: number[] } | null; populateFrets: boolean }
  | { type: 'SET_BEAT_FADE'; measureIndex: number; beatIndex: number; fade: Beat['fade'] }
  | { type: 'SET_BEAT_FADE_TO_SELECTION'; fade: Beat['fade'] }
  | { type: 'SET_BEAT_DYNAMICS'; dynamics: Beat['dynamics'] }
  | { type: 'SET_BEAT_DYNAMICS_TO_SELECTION'; dynamics: Beat['dynamics'] }
  | { type: 'SET_WHAMMY_BAR'; measureIndex: number; beatIndex: number; data: WhammyBarData | null }
  | { type: 'TOGGLE_REPEAT_OPEN'; measureIndex: number }
  | { type: 'SET_REPEAT_CLOSE'; measureIndex: number; count: number | null }
  | {
      type: 'IMPORT_TRACK'
      track: TabTrack
      fileBase64: string
      trackInfos: ImportedTrackInfo[]
      activeIndex: number
    }

// ─── Reducer ────────────────────────────────────────────────────────────────

function tabEditorReducerInner(
  state: TabEditorState,
  action: TabEditorAction,
): TabEditorState {
  switch (action.type) {
    case 'ADD_NOTE': {
      const measure = state.track.measures[action.measureIndex]
      if (!measure) return state

      const timeSig = masterBarAt(state.track, action.measureIndex).timeSignature
      const s = pushUndo(state)
      // When placing on an existing beat, inherit that beat's duration/dot
      const existingBeat = measure.beats[action.beatIndex]
      const duration = existingBeat ? existingBeat.duration : s.activeDuration
      const dot = existingBeat ? { ...existingBeat.dot } : s.activeDot
      // Preserve existing note modifiers when editing; activeModifiers can add on top.
      // Trill is excluded from inheritance — it must be applied explicitly via the trill dialog.
      const existingNote = existingBeat?.notes.find((n) => n.string === action.stringIndex)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { trill: _dropTrill, ...baseModifiers } = existingNote ? existingNote.modifiers : {} as NoteModifiers
      const mergedModifiers = { ...baseModifiers, ...s.activeModifiers }
      const newHarmonicValue = mergedModifiers.harmonicType === 2
        ? (s.activeHarmonicValue ?? existingNote?.harmonicValue ?? 12)
        : undefined
      const { measure: placedMeasure, overflow } = placeNoteInMeasure(
        measure,
        action.beatIndex,
        action.stringIndex,
        action.fret,
        duration,
        dot,
        mergedModifiers,
        timeSig,
        newHarmonicValue,
        s.activePick,
        s.activeDynamics,
      )

      if (overflow) {
        return { ...state, pendingOverflow: { ...overflow, measureIndex: action.measureIndex } }
      }

      // Beat-level PM/LR sync: if any note in the affected beat has palmMute or letRing,
      // propagate it to all notes in that beat (clearing the opposing modifier).
      const affectedBi = action.beatIndex < measure.beats.length ? action.beatIndex : placedMeasure.beats.length - 1
      const updatedMeasure = {
        ...placedMeasure,
        beats: placedMeasure.beats.map((b, bi) => {
          if (bi !== affectedBi) return b
          const hasPM = b.notes.some((n) => n.modifiers.palmMute)
          const hasLR = b.notes.some((n) => n.modifiers.letRing)
          const hasST = b.notes.some((n) => n.modifiers.staccato)
          if (!hasPM && !hasLR && !hasST) return b
          const dominant: 'palmMute' | 'letRing' | 'staccato' = hasPM ? 'palmMute' : hasLR ? 'letRing' : 'staccato'
          return {
            ...b,
            notes: b.notes.map((n) => {
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
          notes: b.notes.map((n) => {
            if (!n.modifiers.legatoSlide) return n
            const nextFret = updatedMeasure.beats[bi + 1]?.notes.find((nn) => nn.string === n.string)?.fret ?? -1
            if (nextFret >= 0 && nextFret === n.fret) {
              const mods = { ...n.modifiers }
              delete mods.legatoSlide
              return { ...n, modifiers: mods }
            }
            return n
          }),
        })),
      }

      // If the edited beat is a tied destination for the previous beat's tiedToNext,
      // break the tie (the user is explicitly overriding the note on that string).
      let baseWithBrokenTie = slideFixedMeasure
      if (action.beatIndex < measure.beats.length) {
        const prevBeatInMeasure = action.beatIndex > 0
          ? s.track.measures[action.measureIndex]?.beats[action.beatIndex - 1]
          : undefined
        const prevBeatCrossMeasure = action.beatIndex === 0 && action.measureIndex > 0
          ? (() => { const pm = s.track.measures[action.measureIndex - 1]; return pm?.beats[pm.beats.length - 1] })()
          : undefined
        const tieBaseBeat = prevBeatInMeasure ?? prevBeatCrossMeasure
        if (tieBaseBeat?.tiedToNext && tieBaseBeat.notes.some((n) => n.string === action.stringIndex)) {
          if (prevBeatInMeasure) {
            baseWithBrokenTie = {
              ...slideFixedMeasure,
              beats: slideFixedMeasure.beats.map((b, bi) => {
                if (bi !== action.beatIndex - 1) return b
                const { tiedToNext: _t, ...rest } = b
                void _t
                return rest
              }),
            }
          } else if (prevBeatCrossMeasure) {
            // Cross-measure: break tiedToNext on last beat of previous measure
            const prevMi = action.measureIndex - 1
            const prevMeasure = s.track.measures[prevMi]!
            const lastBi = prevMeasure.beats.length - 1
            const updatedPrev: Measure = {
              ...prevMeasure,
              beats: prevMeasure.beats.map((b, bi) => {
                if (bi !== lastBi) return b
                const { tiedToNext: _t, ...rest } = b
                void _t
                return rest
              }),
            }
            let measures = s.track.measures.map((m, mi) =>
              mi === action.measureIndex ? slideFixedMeasure : mi === prevMi ? updatedPrev : m,
            )
            measures = syncTiedNextBeat(measures, action.measureIndex, affectedBi)
            return { ...s, track: { ...s.track, measures }, pendingOverflow: null }
          }
        }
      }

      let measures = s.track.measures.map((m, mi) => mi === action.measureIndex ? baseWithBrokenTie : m)
      measures = syncTiedNextBeat(measures, action.measureIndex, affectedBi)
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
            const notes = b.notes.filter((n) => n.string !== action.stringIndex)
            return { ...b, notes: notes.map((n) => notes.length === 0 ? { ...n, modifiers: {} } : n) }
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

    case 'TOGGLE_PICK_STROKE': {
      const { direction } = action
      const { measureIndex: mi, beatIndex: bi } = state.cursor
      const measure = state.track.measures[mi]
      const beat = measure?.beats[bi]

      if (state.selection) {
        // Beat-range selection: toggle pick on all selected beats
        const s = pushUndo(state)
        const norm = normalizeSelection(state.selection)
        const allHave = (() => {
          for (let smi = norm.startMeasure; smi <= norm.endMeasure; smi++) {
            const m = state.track.measures[smi]
            if (!m) continue
            const bStart = smi === norm.startMeasure ? norm.startBeat : 0
            const bEnd = smi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
            for (let sbi = bStart; sbi <= bEnd; sbi++) {
              if (m.beats[sbi]?.pickStroke !== direction) return false
            }
          }
          return true
        })()
        const nextPick = allHave ? undefined : direction
        const measures = s.track.measures.map((m, smi) => {
          if (smi < norm.startMeasure || smi > norm.endMeasure) return m
          const bStart = smi === norm.startMeasure ? norm.startBeat : 0
          const bEnd = smi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
          return {
            ...m,
            beats: m.beats.map((b, sbi) =>
              sbi >= bStart && sbi <= bEnd
                ? { ...b, pickStroke: nextPick }
                : b,
            ),
          }
        })
        return { ...s, track: { ...s.track, measures }, activePick: nextPick }
      }

      if (beat) {
        // Single beat under cursor
        const s = pushUndo(state)
        const nextPick = beat.pickStroke === direction ? undefined : direction
        const measures = s.track.measures.map((m, mIdx) => {
          if (mIdx !== mi) return m
          return { ...m, beats: m.beats.map((b, bIdx) => bIdx !== bi ? b : { ...b, pickStroke: nextPick }) }
        })
        return { ...s, track: { ...s.track, measures }, activePick: nextPick }
      }

      // No beat under cursor — just toggle activePick
      const nextPick = state.activePick === direction ? undefined : direction
      return { ...state, activePick: nextPick }
    }

    case 'APPLY_TREMOLO_PICKING': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            return { ...b, tremoloMarks: action.marks }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'APPLY_TREMOLO_PICKING_TO_SELECTION': {
      if (!state.selection) return state
      const s = pushUndo(state)
      const norm = normalizeSelection(state.selection)
      const measures = s.track.measures.map((m, mi) => {
        if (mi < norm.startMeasure || mi > norm.endMeasure) return m
        const bStart = mi === norm.startMeasure ? norm.startBeat : 0
        const bEnd = mi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
        return {
          ...m,
          beats: m.beats.map((b, bi) =>
            bi >= bStart && bi <= bEnd ? { ...b, tremoloMarks: action.marks } : b,
          ),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'TOGGLE_MODIFIER': {
      const cur = state.activeModifiers[action.modifier]
      const next = { ...state.activeModifiers }
      if (cur) {
        delete next[action.modifier]
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next[action.modifier] = (action.value ?? true) as any
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
            const targetNote = b.notes.find((n) => n.string === action.stringIndex)
            const cur = targetNote?.modifiers[action.modifier]
            const setting = !cur
            const notes = b.notes.map((n) => {
              const mods = { ...n.modifiers }
              let bendDataOverride: BendData | null | undefined = undefined // undefined = no change
              if (n.string === action.stringIndex) {
                if (cur) {
                  delete mods[action.modifier]
                  if (action.modifier === 'bend') bendDataOverride = null  // clear bendData
                } else {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  mods[action.modifier] = (action.value ?? true) as any
                  applyModifierConflicts(mods, action.modifier)
                  if (action.modifier === 'bend' && !n.bendData) {
                    bendDataOverride = {
                      points: [{ offset: 0, value: 0 }, { offset: 60, value: 4 }],
                      segments: ['up'],
                    }
                  }
                }
              }
              // Beat-level spread: PM/LR/staccato applied to one note applies to all fretted notes
              if (setting && (action.modifier === 'palmMute' || action.modifier === 'letRing' || action.modifier === 'staccato')) {
                mods[action.modifier] = true
                applyBeatSpreadConflicts(mods, action.modifier)
              }
              if (bendDataOverride === null) {
                const { bendData: _bd, ...rest } = n as TabNote & { bendData?: BendData }
                void _bd
                return { ...rest, modifiers: mods }
              }
              return bendDataOverride !== undefined
                ? { ...n, modifiers: mods, bendData: bendDataOverride }
                : { ...n, modifiers: mods }
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
        beats.splice(action.beatIndex, 0, makeBeat(state.activeDuration))
        return { ...m, beats }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_BEAT_AFTER': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        const beats = [...m.beats]
        beats.splice(action.beatIndex + 1, 0, makeBeat(state.activeDuration))
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
      const masterBars = [...s.track.masterBars]
      const refMB = masterBars[action.measureIndex] ?? masterBars[0]!
      masterBars.splice(action.measureIndex, 0, { timeSignature: { ...refMB.timeSignature } })
      return { ...s, track: { ...s.track, measures, masterBars } }
    }

    case 'INSERT_MEASURE_AFTER': {
      const s = pushUndo(state)
      const measures = [...s.track.measures]
      measures.splice(action.measureIndex + 1, 0, makeMeasure())
      const masterBars = [...s.track.masterBars]
      const refMB = masterBars[action.measureIndex] ?? masterBars[0]!
      masterBars.splice(action.measureIndex + 1, 0, { timeSignature: { ...refMB.timeSignature } })
      return { ...s, track: { ...s.track, measures, masterBars } }
    }

    case 'DELETE_MEASURE': {
      const s = pushUndo(state)
      if (s.track.measures.length <= 1) return state
      const measures = s.track.measures.filter((_, mi) => mi !== action.measureIndex)
      const masterBars = s.track.masterBars.filter((_, mi) => mi !== action.measureIndex)
      // Ensure at least one masterBar always exists
      const finalMasterBars = masterBars.length > 0 ? masterBars : [s.track.masterBars[0]!]
      // If deleted bar had global bpm and next bar doesn't have one, promote it
      const deletedBpm = s.track.masterBars[action.measureIndex]?.bpm
      if (action.measureIndex === 0 && deletedBpm !== undefined && finalMasterBars[0] && !finalMasterBars[0].bpm) {
        finalMasterBars[0] = { ...finalMasterBars[0], bpm: deletedBpm }
      }
      const newMeasureIdx = Math.min(state.cursor.measureIndex, measures.length - 1)
      return {
        ...s,
        track: { ...s.track, measures, masterBars: finalMasterBars },
        cursor: { measureIndex: newMeasureIdx, beatIndex: 0, stringIndex: s.track.stringCount },
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
          const lastMB = track.masterBars[track.masterBars.length - 1] ?? track.masterBars[0]!
          const masterBars = [...track.masterBars, { timeSignature: { ...lastMB.timeSignature } }]
          const newCursor = { ...cursor, measureIndex: measures.length - 1, beatIndex: 0 }
          return withBeatSync(newCursor, { track: { ...track, measures, masterBars } })
        }
        return withBeatSync(advanced)
      }
      if (action.direction === 'left') {
        return withBeatSync(advanceCursorLeft(cursor, track))
      }
      if (action.direction === 'up') {
        // 1-based: 1=lowest string (bottom of tab). "up" arrow → higher number → higher pitch
        const si = Math.min(track.stringCount, cursor.stringIndex + 1)
        return withBeatSync({ ...cursor, stringIndex: si })
      }
      if (action.direction === 'down') {
        const si = Math.max(1, cursor.stringIndex - 1)
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
        return beat.notes.length === 0 || beat.notes.every((n) => !!n.modifiers[action.modifier])
      })
      const setting = !allHave

      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => {
          if (!selBeatSet.has(`${mi}:${bi}`)) return b
          const afterModifier = b.notes.map((n) => {
            if (!setting) {
              const mods = { ...n.modifiers }
              delete mods[action.modifier]
              return { ...n, modifiers: mods }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mods = { ...n.modifiers, [action.modifier]: (action.value ?? true) as any }
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
        const note = state.track.measures[c.measureIndex]?.beats[c.beatIndex]?.notes.find(
          (n) => n.string === c.stringIndex,
        )
        return note && !!note.modifiers[action.modifier]
      })
      const setting = !allHave
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => {
          const afterModifier = b.notes.map((n) => {
            if (!selSet.has(`${mi}:${bi}:${n.string}`)) return n
            if (allHave) {
              const mods = { ...n.modifiers }
              delete mods[action.modifier]
              return { ...n, modifiers: mods }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mods = { ...n.modifiers, [action.modifier]: (action.value ?? true) as any }
            applyModifierConflicts(mods, action.modifier)
            return { ...n, modifiers: mods }
          })
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
          const currFret = s.track.measures[curr.measureIndex]?.beats[curr.beatIndex]?.notes.find(
            (n) => n.string === curr.stringIndex,
          )?.fret ?? -1
          const nextFret = s.track.measures[next.measureIndex]?.beats[next.beatIndex]?.notes.find(
            (n) => n.string === next.stringIndex,
          )?.fret ?? -1
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
        const note = s.track.measures[tmi!]?.beats[tbi!]?.notes.find((n) => n.string === tsi!)
        return note && !!note.modifiers[action.modifier]
      })
      const selSetAll = new Set(
        state.noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}:${c.stringIndex}`),
      )
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n) => {
            const noteKey = `${mi}:${bi}:${n.string}`
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
            return { ...m, beats: m.beats.map((b, bi) => toClear.has(bi) ? { ...b, notes: [] } : b) }
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
              return { ...beat, notes: [] }
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
              return { ...b, notes: [] }
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
        if (bi < measures[mi]!.beats.length) {
          measures[mi]!.beats[bi] = newBeat
        } else {
          measures[mi]!.beats.push(newBeat)
        }
        bi++
        const pastedMeasure = measures[mi]!
        const pastedTimeSig = masterBarAt(s.track, mi).timeSignature
        const pastedCapacity = measureCapacityTicks(pastedTimeSig)
        const pastedUsed = measureUsedTicks(pastedMeasure.beats)
        if (bi >= pastedMeasure.beats.length && pastedUsed >= pastedCapacity - 1e-6) {
          bi = 0
          mi++
        }
      }
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_MEASURE_BPM_ONLY': {
      const clampedBpm = Math.max(20, Math.min(300, action.bpm))
      const prevBpm = effectiveBpmAt(state.track, action.measureIndex - 1)
      const masterBars = state.track.masterBars.map((mb, i) => {
        if (i === action.measureIndex) return { ...mb, bpm: clampedBpm }
        if (i === action.measureIndex + 1 && mb.bpm === undefined) return { ...mb, bpm: prevBpm }
        return mb
      })
      return { ...state, track: { ...state.track, masterBars } }
    }

    case 'SET_MEASURE_BPM_FROM': {
      const clampedBpm = Math.max(20, Math.min(300, action.bpm))
      const nextOverrideIdx = state.track.masterBars.findIndex((mb, i) => i > action.fromIndex && mb.bpm !== undefined)
      const clearUntil = nextOverrideIdx === -1 ? state.track.masterBars.length : nextOverrideIdx
      const masterBars = state.track.masterBars.map((mb, i) => {
        if (i === action.fromIndex) return { ...mb, bpm: clampedBpm }
        if (i > action.fromIndex && i < clearUntil) return { ...mb, bpm: undefined }
        return mb
      })
      return { ...state, track: { ...state.track, masterBars } }
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
        beats: m.beats.map((b) => ({
          ...b,
          // Filter out notes for strings beyond new stringCount; keep the rest
          notes: b.notes.filter((n) => n.string >= 1 && n.string <= stringCount),
        })),
      }))
      return {
        ...s,
        track: { ...s.track, stringCount, tuningName, openMidi, measures },
        cursor: {
          ...state.cursor,
          stringIndex: Math.min(Math.max(1, state.cursor.stringIndex), stringCount),
        },
      }
    }

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
        cursor: { measureIndex: 0, beatIndex: 0, stringIndex: action.track.stringCount },
        selection: null,
        selectionAnchor: null,
        noteSelection: [],
        clipboard: null,
        undoStack: [],
        redoStack: [],
        pendingOverflow: null,
      }

    case 'IMPORT_TRACK': {
      const track: TabTrack = {
        ...action.track,
        importedFileBase64: action.fileBase64,
        importedTrackInfos: action.trackInfos,
        importedActiveTrackIndex: action.activeIndex,
      }
      saveTabTrack(track)
      return {
        ...state,
        track,
        cursor: { measureIndex: 0, beatIndex: 0, stringIndex: track.stringCount },
        selection: null,
        selectionAnchor: null,
        noteSelection: [],
        clipboard: null,
        undoStack: [],
        redoStack: [],
        pendingOverflow: null,
      }
    }

    case 'SET_GLOBAL_TIME_SIG': {
      const s = pushUndo(state)
      const masterBars = s.track.masterBars.map((mb, i) =>
        i === 0 ? { ...mb, timeSignature: { numerator: action.numerator, denominator: action.denominator } } : mb,
      )
      return { ...s, track: { ...s.track, masterBars } }
    }

    case 'SET_MEASURE_TIME_SIG': {
      const s = pushUndo(state)
      const masterBars = s.track.masterBars.map((mb, mi) => {
        if (mi !== action.measureIndex) return mb
        return { ...mb, timeSignature: { numerator: action.numerator, denominator: action.denominator } }
      })
      return { ...s, track: { ...s.track, masterBars } }
    }

    case 'SET_MEASURE_TIME_SIG_RANGE': {
      const s = pushUndo(state)
      const masterBars = s.track.masterBars.map((mb, mi) => {
        if (mi < action.fromIndex || mi > action.toIndex) return mb
        return { ...mb, timeSignature: { numerator: action.numerator, denominator: action.denominator } }
      })
      return { ...s, track: { ...s.track, masterBars } }
    }

    case 'RESOLVE_OVERFLOW_TRIM': {
      if (!state.pendingOverflow) return state
      const { fret, measureIndex, beatIndex, stringIndex } = state.pendingOverflow
      const s = pushUndo(state)
      const measure = s.track.measures[measureIndex]
      if (!measure) return state

      const timeSig = masterBarAt(s.track, measureIndex).timeSignature
      const capacity = measureCapacityTicks(timeSig)

      let usedWithoutThis: number
      if (beatIndex >= measure.beats.length) {
        usedWithoutThis = measureUsedTicks(measure.beats)
      } else {
        const beat = measure.beats[beatIndex]
        if (!beat) return state
        usedWithoutThis = measureUsedTicks(measure.beats) - durationTicks(beat.duration, beat.dot)
      }
      const remaining = capacity - usedWithoutThis

      const { duration: trimDur, dot: trimDot } = ticksToNearestDuration(Math.max(0, remaining))

      const overflowHarmonicVal = state.activeModifiers.harmonicType === 2 ? (state.activeHarmonicValue ?? 12) : undefined

      const measures = s.track.measures.map((m, mi) => {
        if (mi !== measureIndex) return m
        if (beatIndex >= m.beats.length) {
          const newBeat = makeBeat(trimDur)
          newBeat.dot = { ...trimDot }
          newBeat.notes = [{
            string: stringIndex, fret, modifiers: { ...state.activeModifiers },
            ...(overflowHarmonicVal !== undefined && { harmonicValue: overflowHarmonicVal }),
          }]
          return { ...m, beats: [...m.beats, newBeat] }
        }
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== beatIndex) return b
            const existing = b.notes.findIndex((n) => n.string === stringIndex)
            const newNote = {
              string: stringIndex, fret, modifiers: { ...state.activeModifiers },
              ...(overflowHarmonicVal !== undefined && { harmonicValue: overflowHarmonicVal }),
            }
            const notes = existing >= 0
              ? b.notes.map((n, i) => (i === existing ? newNote : n))
              : [...b.notes, newNote].sort((a, n) => a.string - n.string)
            return { ...b, duration: trimDur, dot: { ...trimDot }, notes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures }, pendingOverflow: null }
    }

    case 'RESOLVE_OVERFLOW_BLEED': {
      if (!state.pendingOverflow) return state
      const { fret, measureIndex, beatIndex, stringIndex, overshootTicks } = state.pendingOverflow
      const s = pushUndo(state)

      const bleedMeasure = s.track.measures[measureIndex]
      if (!bleedMeasure) return state
      const bleedTimeSig = masterBarAt(s.track, measureIndex).timeSignature
      const bleedCapacity = measureCapacityTicks(bleedTimeSig)
      let bleedUsedWithoutThis: number
      if (beatIndex >= bleedMeasure.beats.length) {
        bleedUsedWithoutThis = measureUsedTicks(bleedMeasure.beats)
      } else {
        const existBeat = bleedMeasure.beats[beatIndex]
        if (!existBeat) return state
        bleedUsedWithoutThis = measureUsedTicks(bleedMeasure.beats) - durationTicks(existBeat.duration, existBeat.dot)
      }
      const bleedRemaining = bleedCapacity - bleedUsedWithoutThis
      const { duration: trimDur, dot: trimDot } = ticksToNearestDuration(Math.max(0, bleedRemaining))

      const bleedHarmonicVal = state.activeModifiers.harmonicType === 2 ? (state.activeHarmonicValue ?? 12) : undefined

      let measures = s.track.measures.map((m, mi) => {
        if (mi !== measureIndex) return m
        if (beatIndex >= m.beats.length) {
          const newBeat = makeBeat(trimDur)
          newBeat.dot = { ...trimDot }
          newBeat.tiedTo = true
          newBeat.notes = [{
            string: stringIndex, fret, modifiers: { ...state.activeModifiers },
            ...(bleedHarmonicVal !== undefined && { harmonicValue: bleedHarmonicVal }),
          }]
          return { ...m, beats: [...m.beats, newBeat] }
        }
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== beatIndex) return b
            const existing = b.notes.findIndex((n) => n.string === stringIndex)
            const newNote = {
              string: stringIndex, fret, modifiers: { ...state.activeModifiers },
              ...(bleedHarmonicVal !== undefined && { harmonicValue: bleedHarmonicVal }),
            }
            const notes = existing >= 0
              ? b.notes.map((n, i) => (i === existing ? newNote : n))
              : [...b.notes, newNote].sort((a, n) => a.string - n.string)
            return { ...b, duration: trimDur, dot: { ...trimDot }, tiedTo: true as const, notes }
          }),
        }
      })

      const { duration: bleedDur, dot: bleedDot } = ticksToNearestDuration(Math.max(15, overshootTicks))
      const nextMi = measureIndex + 1

      const tieBeat = makeBeat(bleedDur)
      tieBeat.dot = { ...bleedDot }
      tieBeat.tiedFrom = true
      tieBeat.notes = [{ string: stringIndex, fret, modifiers: {} }]

      if (nextMi < measures.length) {
        measures = measures.map((m, mi) => {
          if (mi !== nextMi) return m
          return { ...m, beats: [tieBeat, ...m.beats] }
        })
      } else {
        const newMeasure = makeMeasure()
        newMeasure.beats = [tieBeat]
        const lastMB = s.track.masterBars[s.track.masterBars.length - 1] ?? s.track.masterBars[0]!
        const masterBars = [...s.track.masterBars, { timeSignature: { ...lastMB.timeSignature } }]
        measures = [...measures, newMeasure]
        return {
          ...s,
          track: { ...s.track, measures, masterBars },
          pendingOverflow: null,
          cursor: { measureIndex: nextMi, beatIndex: 1, stringIndex },
        }
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
              return { ...b, notes: [] }
            }),
          }
        })
        return { ...s, track: { ...track, measures } }
      }

      if (noteSelection.length >= 2) {
        const beatSet = new Set(noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}`))
        const measures = track.measures.map((m, mi) => ({
          ...m,
          beats: m.beats.map((b, bi) => {
            if (!beatSet.has(`${mi}:${bi}`)) return b
            return { ...b, notes: [] }
          }),
        }))
        return { ...s, track: { ...track, measures } }
      }

      const measures = track.measures.map((m, mi) => {
        if (mi !== cursor.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== cursor.beatIndex) return b
            return { ...b, notes: [] }
          }),
        }
      })
      return { ...s, track: { ...track, measures } }
    }

    case 'SET_BEND_DATA': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const notes = b.notes.map((n) => {
              if (n.string !== action.stringIndex) return n
              const { ...rest } = n as TabNote & { bendAmount?: number }
              delete (rest as { bendAmount?: number }).bendAmount
              return { ...rest, bendData: action.bendData }
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
      const timeSig = masterBarAt(s.track, action.measureIndex).timeSignature
      const capacity = measureCapacityTicks(timeSig)

      let usedSoFar = 0
      const keptBeats: Beat[] = []
      for (const beat of measure.beats) {
        const beatDur = durationTicks(beat.duration, beat.dot)
        if (usedSoFar + beatDur <= capacity + 1e-6) {
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
      const timeSig = masterBarAt(s.track, action.measureIndex).timeSignature
      const capacity = measureCapacityTicks(timeSig)

      let usedSoFar = 0
      const keptBeats: Beat[] = []
      const overflowBeats: Beat[] = []

      for (let i = 0; i < measure.beats.length; i++) {
        const beat = measure.beats[i]!
        const beatDur = durationTicks(beat.duration, beat.dot)

        if (usedSoFar + beatDur <= capacity + 1e-6) {
          keptBeats.push(beat)
          usedSoFar += beatDur
        } else {
          const remaining = capacity - usedSoFar
          if (remaining > 1e-6) {
            const { duration: trimDur, dot: trimDot } = ticksToNearestDuration(remaining)
            const overshoot = beatDur - remaining
            const { duration: bleedDur, dot: bleedDot } = ticksToNearestDuration(Math.max(15, overshoot))
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
      const timeSig = masterBarAt(s.track, action.measureIndex).timeSignature
      const capacity = measureCapacityTicks(timeSig)

      const noteBeats = measure.beats.filter((b) => b.notes.length > 0)
      const noteBeatsUsed = measureUsedTicks(noteBeats)
      if (noteBeatsUsed > capacity + 1e-6) return state

      const remaining = capacity - noteBeatsUsed
      const restDurations = remaining > 1e-6 ? computeFillRests(remaining) : []
      const restBeats = restDurations.map((d) => makeBeat(d))

      const measures = s.track.measures.map((m, mi) =>
        mi === action.measureIndex ? { ...m, beats: [...noteBeats, ...restBeats] } : m,
      )
      return { ...s, track: { ...s.track, measures } }
    }

    case 'INSERT_REST': {
      const { cursor, activeDuration, activeDot, track } = state
      const measure = track.measures[cursor.measureIndex]
      if (!measure) return state
      if (cursor.beatIndex < measure.beats.length) return state

      const timeSig = masterBarAt(track, cursor.measureIndex).timeSignature
      const capacity = measureCapacityTicks(timeSig)
      const used = measureUsedTicks(measure.beats)
      const newBeatTicks = durationTicks(activeDuration, activeDot)
      if (used + newBeatTicks > capacity + 1e-6) return state

      const s = pushUndo(state)
      const newBeat = makeBeat(activeDuration)
      newBeat.dot = { ...activeDot }
      const measures = s.track.measures.map((m, mi) =>
        mi === cursor.measureIndex ? { ...m, beats: [...m.beats, newBeat] } : m,
      )
      const newTrack = { ...s.track, measures }
      const advancedCursor = advanceCursorRight(cursor, newTrack)
      return { ...s, track: newTrack, cursor: advancedCursor }
    }

    case 'SET_ACTIVE_HARMONIC': {
      const next = { ...state.activeModifiers }
      if (action.harmonicType === undefined) {
        delete next.harmonicType
      } else {
        next.harmonicType = action.harmonicType
        applyModifierConflicts(next, 'harmonicType')
      }
      return { ...state, activeModifiers: next, activeHarmonicValue: action.harmonicValue }
    }

    case 'APPLY_HARMONIC': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const notes = b.notes.map((n) => {
              if (n.string !== action.stringIndex) return n
              if (action.harmonicType === undefined) {
                const mods = { ...n.modifiers }
                delete mods.harmonicType
                return { ...n, modifiers: mods, harmonicValue: undefined }
              }
              const mods = { ...n.modifiers, harmonicType: action.harmonicType }
              applyModifierConflicts(mods, 'harmonicType')
              return { ...n, modifiers: mods, harmonicValue: action.harmonicValue }
            })
            return { ...b, notes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'APPLY_HARMONIC_TO_SELECTION': {
      if (state.noteSelection.length < 1) return state
      const s = pushUndo(state)
      const selSet = new Set(state.noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}:${c.stringIndex}`))
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n) => {
            if (!selSet.has(`${mi}:${bi}:${n.string}`)) return n
            if (action.harmonicType === undefined) {
              const mods = { ...n.modifiers }
              delete mods.harmonicType
              return { ...n, modifiers: mods, harmonicValue: undefined }
            }
            const mods = { ...n.modifiers, harmonicType: action.harmonicType }
            applyModifierConflicts(mods, 'harmonicType')
            return { ...n, modifiers: mods, harmonicValue: action.harmonicValue }
          }),
        })),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'APPLY_HARMONIC_TO_BEAT_SELECTION': {
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
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => {
          if (!selBeatSet.has(`${mi}:${bi}`)) return b
          return {
            ...b,
            notes: b.notes.map((n) => {
              if (action.harmonicType === undefined) {
                const mods = { ...n.modifiers }
                delete mods.harmonicType
                return { ...n, modifiers: mods, harmonicValue: undefined }
              }
              const mods = { ...n.modifiers, harmonicType: action.harmonicType }
              applyModifierConflicts(mods, 'harmonicType')
              return { ...n, modifiers: mods, harmonicValue: action.harmonicValue }
            }),
          }
        }),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_ACTIVE_TRILL': {
      return { ...state, activeTrillFret: action.trillFret, activeTrillSpeed: action.trillSpeed }
    }

    case 'APPLY_TRILL': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            const notes = b.notes.map((n) => {
              if (n.string !== action.stringIndex) return n
              if (action.trillFret === undefined) {
                const mods = { ...n.modifiers }
                delete mods.trill
                return { ...n, modifiers: mods, trillFret: undefined, trillSpeed: undefined }
              }
              const mods = { ...n.modifiers, trill: true as const }
              applyModifierConflicts(mods, 'trill')
              return { ...n, modifiers: mods, trillFret: action.trillFret, trillSpeed: action.trillSpeed }
            })
            return { ...b, notes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'APPLY_TRILL_TO_SELECTION': {
      if (state.noteSelection.length < 1) return state
      const s = pushUndo(state)
      const selSet = new Set(state.noteSelection.map((c) => `${c.measureIndex}:${c.beatIndex}:${c.stringIndex}`))
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => ({
          ...b,
          notes: b.notes.map((n) => {
            if (!selSet.has(`${mi}:${bi}:${n.string}`)) return n
            if (action.trillFret === undefined) {
              const mods = { ...n.modifiers }
              delete mods.trill
              return { ...n, modifiers: mods, trillFret: undefined, trillSpeed: undefined }
            }
            const mods = { ...n.modifiers, trill: true as const }
            applyModifierConflicts(mods, 'trill')
            return { ...n, modifiers: mods, trillFret: action.trillFret, trillSpeed: action.trillSpeed }
          }),
        })),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'APPLY_TRILL_TO_BEAT_SELECTION': {
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
      const measures = s.track.measures.map((m, mi) => ({
        ...m,
        beats: m.beats.map((b, bi) => {
          if (!selBeatSet.has(`${mi}:${bi}`)) return b
          return {
            ...b,
            notes: b.notes.map((n) => {
              if (action.trillFret === undefined) {
                const mods = { ...n.modifiers }
                delete mods.trill
                return { ...n, modifiers: mods, trillFret: undefined, trillSpeed: undefined }
              }
              const mods = { ...n.modifiers, trill: true as const }
              applyModifierConflicts(mods, 'trill')
              return { ...n, modifiers: mods, trillFret: action.trillFret, trillSpeed: action.trillSpeed }
            }),
          }
        }),
      }))
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_BEAT_TEXT': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            if (!action.text) {
              const { text: _t, ...rest } = b as Beat & { text?: string }
              void _t
              return rest
            }
            return { ...b, text: action.text }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_MEASURE_MARKER': {
      const s = pushUndo(state)
      const masterBars = s.track.masterBars.map((mb, i) => {
        if (i !== action.measureIndex) return mb
        if (!action.marker) {
          const { marker: _m, ...rest } = mb
          void _m
          return rest
        }
        return { ...mb, marker: action.marker }
      })
      return { ...s, track: { ...s.track, masterBars } }
    }

    case 'TOGGLE_TIE_TO_NEXT': {
      const s = pushUndo(state)
      const enabling = !s.track.measures[action.measureIndex]?.beats[action.beatIndex]?.tiedToNext
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            if (b.tiedToNext) {
              const { tiedToNext: _t, ...rest } = b
              void _t
              return rest
            }
            return { ...b, tiedToNext: true as const }
          }),
        }
      })
      const synced = enabling ? syncTiedNextBeat(measures, action.measureIndex, action.beatIndex) : measures
      return { ...s, track: { ...s.track, measures: synced } }
    }

    case 'SET_BEAT_CHORD': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            if (!action.chord) {
              const { chord: _c, ...rest } = b as Beat & { chord?: unknown }
              void _c
              return rest
            }
            const withChord = { ...b, chord: action.chord }
            if (!action.populateFrets) return withChord
            const newNotes: TabNote[] = action.chord.frets
              .map((fret, idx): TabNote | null =>
                fret < 0 ? null : { string: idx + 1, fret, modifiers: {} },
              )
              .filter((n): n is TabNote => n !== null)
            return { ...withChord, notes: newNotes }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_BEAT_FADE': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            if (!action.fade || b.fade === action.fade) {
              const { fade: _f, ...rest } = b as Beat & { fade?: unknown }
              void _f
              return rest as Beat
            }
            return { ...b, fade: action.fade }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_BEAT_FADE_TO_SELECTION': {
      if (!state.selection) return state
      const s = pushUndo(state)
      const norm = normalizeSelection(state.selection)
      const allHaveFade = (() => {
        for (let smi = norm.startMeasure; smi <= norm.endMeasure; smi++) {
          const m = s.track.measures[smi]
          if (!m) continue
          const bStart = smi === norm.startMeasure ? norm.startBeat : 0
          const bEnd = smi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
          for (let sbi = bStart; sbi <= bEnd; sbi++) {
            if (m.beats[sbi]?.fade !== action.fade) return false
          }
        }
        return true
      })()
      const nextFade = allHaveFade ? undefined : action.fade
      const measures = s.track.measures.map((m, mi) => {
        if (mi < norm.startMeasure || mi > norm.endMeasure) return m
        const bStart = mi === norm.startMeasure ? norm.startBeat : 0
        const bEnd = mi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi < bStart || bi > bEnd) return b
            if (!nextFade) {
              const { fade: _f, ...rest } = b as Beat & { fade?: unknown }
              void _f
              return rest as Beat
            }
            return { ...b, fade: nextFade }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_BEAT_DYNAMICS': {
      const { cursor } = state
      const { measureIndex: mi, beatIndex: bi } = cursor
      const measure = state.track.measures[mi]
      const beat = measure?.beats[bi]
      const nextDynamics = beat?.dynamics === action.dynamics ? undefined : action.dynamics
      if (beat) {
        const s = pushUndo(state)
        const measures = s.track.measures.map((m, mIdx) => {
          if (mIdx !== mi) return m
          return {
            ...m,
            beats: m.beats.map((b, bIdx) => {
              if (bIdx !== bi) return b
              if (!nextDynamics) {
                const { dynamics: _d, ...rest } = b as Beat & { dynamics?: unknown }
                void _d
                return rest as Beat
              }
              return { ...b, dynamics: nextDynamics }
            }),
          }
        })
        return { ...s, track: { ...s.track, measures }, activeDynamics: nextDynamics }
      }
      return { ...state, activeDynamics: nextDynamics }
    }

    case 'SET_BEAT_DYNAMICS_TO_SELECTION': {
      if (!state.selection) return state
      const s = pushUndo(state)
      const norm = normalizeSelection(state.selection)
      const allHaveDynamics = (() => {
        for (let smi = norm.startMeasure; smi <= norm.endMeasure; smi++) {
          const m = s.track.measures[smi]
          if (!m) continue
          const bStart = smi === norm.startMeasure ? norm.startBeat : 0
          const bEnd = smi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
          for (let sbi = bStart; sbi <= bEnd; sbi++) {
            if (m.beats[sbi]?.dynamics !== action.dynamics) return false
          }
        }
        return true
      })()
      const nextDynamics = allHaveDynamics ? undefined : action.dynamics
      const measures = s.track.measures.map((m, mi) => {
        if (mi < norm.startMeasure || mi > norm.endMeasure) return m
        const bStart = mi === norm.startMeasure ? norm.startBeat : 0
        const bEnd = mi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi < bStart || bi > bEnd) return b
            if (!nextDynamics) {
              const { dynamics: _d, ...rest } = b as Beat & { dynamics?: unknown }
              void _d
              return rest as Beat
            }
            return { ...b, dynamics: nextDynamics }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_WHAMMY_BAR': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        return {
          ...m,
          beats: m.beats.map((b, bi) => {
            if (bi !== action.beatIndex) return b
            if (!action.data) {
              const { whammyBar: _w, ...rest } = b as Beat & { whammyBar?: unknown }
              void _w
              return rest as Beat
            }
            return { ...b, whammyBar: action.data }
          }),
        }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'TOGGLE_REPEAT_OPEN': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        if (m.repeatOpen) {
          const { repeatOpen: _ro, ...rest } = m
          void _ro
          return rest as Measure
        }
        return { ...m, repeatOpen: true as const }
      })
      return { ...s, track: { ...s.track, measures } }
    }

    case 'SET_REPEAT_CLOSE': {
      const s = pushUndo(state)
      const measures = s.track.measures.map((m, mi) => {
        if (mi !== action.measureIndex) return m
        if (action.count === null) {
          const { repeatClose: _rc, ...rest } = m
          void _rc
          return rest as Measure
        }
        return { ...m, repeatClose: action.count }
      })
      return { ...s, track: { ...s.track, measures } }
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
