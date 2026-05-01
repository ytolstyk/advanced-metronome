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
  staccato?: true
  letRing?: true
  palmMute?: true
  dead?: true
  naturalHarmonic?: true
  hammerOn?: true
  pullOff?: true
  legatoSlide?: true
  slideInBelow?: true
  slideInAbove?: true
  slideOutDown?: true
  slideOutUp?: true
  bend?: true
  vibrato?: true
  tapping?: true
  pickDown?: true
  pickUp?: true
}

export type NoteModifierKey = keyof NoteModifiers

export interface TabNote {
  fret: number // 0-24; -1 = no note on this string
  modifiers: NoteModifiers
  bendAmount?: number // 0.5–5 in 0.5 increments; defaults to 1 when modifiers.bend is set
}

export interface Beat {
  id: string
  duration: DurationValue
  dot: DotModifier
  notes: TabNote[] // index 0 = lowest string
  tiedFrom?: true  // this beat is a tied continuation from the previous measure
  tiedTo?: true    // this beat ties into the first beat of the next measure
  dynamics?: 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff'
  repeatStart?: true
  repeatEnd?: true
  tempoChange?: number
}

export interface Measure {
  id: string
  timeSignature?: { numerator: number; denominator: number }
  bpm?: number
  beats: Beat[]
}

export interface TabTrack {
  title: string
  artist?: string
  tabAuthor?: string
  year?: string
  version?: number
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

export type ConnectionModifierKey = 'hammerOn' | 'pullOff' | 'legatoSlide'

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
  selectionAnchor: TabCursor | null
  noteSelection: TabCursor[]
  clipboard: Beat[] | null
  activeDuration: DurationValue
  activeDot: DotModifier
  activeModifiers: NoteModifiers
  isPlaying: boolean
  playheadMeasure: number
  playheadBeat: number
  pendingOverflow: OverflowPending | null
  undoStack: TabTrack[]
  redoStack: TabTrack[]
}
