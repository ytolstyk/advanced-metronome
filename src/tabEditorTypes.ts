export type DurationValue =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirtysecond'
  | 'sixtyfourth'

export interface DotModifier {
  dotted: boolean
  doubleDotted: boolean
  triplet: boolean
}

export interface NoteModifiers {
  ghost?: true
  accent?: true
  staccato?: true
  letRing?: true
  palmMute?: true
  dead?: true
  naturalHarmonic?: true
  hammerOn?: true
  pullOff?: true
  legatoSlide?: true
  shiftSlide?: true
  slideInBelow?: true
  slideInAbove?: true
  slideOutDown?: true
  slideOutUp?: true
  bend?: true
  vibrato?: true
  trill?: true
  tapping?: true
  pickDown?: true
  pickUp?: true
}

export type NoteModifierKey = keyof NoteModifiers

export interface TabNote {
  fret: number // 0-24; -1 = no note on this string
  modifiers: NoteModifiers
}

export interface Beat {
  id: string
  duration: DurationValue
  dot: DotModifier
  notes: TabNote[] // index 0 = lowest string
  tiedFrom?: true  // this beat is a tied continuation from the previous measure
  dynamics?: 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff'
  repeatStart?: true
  repeatEnd?: true
  tempoChange?: number
}

export interface Measure {
  id: string
  timeSignature?: { numerator: number; denominator: number }
  beats: Beat[]
}

export interface TabTrack {
  title: string
  globalBpm: number
  globalTimeSig: { numerator: number; denominator: number }
  stringCount: 6 | 7 | 8
  tuningName: string
  openMidi: number[] // MIDI note per open string, low→high
  measures: Measure[]
}

export interface TabCursor {
  measureIndex: number
  beatIndex: number // can equal measure.beats.length to point at the virtual pending slot
  stringIndex: number // 0 = lowest string
}

export interface TabSelection {
  startMeasure: number
  startBeat: number
  endMeasure: number
  endBeat: number
}

export type ConnectionModifierKey = 'hammerOn' | 'pullOff' | 'legatoSlide' | 'shiftSlide'

export interface OverflowPending {
  fret: number
  measureIndex: number
  beatIndex: number
  stringIndex: number
  newDuration: DurationValue
  newDot: DotModifier
  overshootBeats: number // quarter-beats past measure capacity
}

export interface TabEditorState {
  track: TabTrack
  cursor: TabCursor
  selection: TabSelection | null
  noteSelection: TabCursor[]
  clipboard: Beat[] | null
  activeDuration: DurationValue
  activeDot: DotModifier
  activeModifiers: NoteModifiers
  isPlaying: boolean
  playheadMeasure: number
  playheadBeat: number
  viewMode: 'tab' | 'staff'
  pendingOverflow: OverflowPending | null
  undoStack: TabTrack[]
  redoStack: TabTrack[]
}
