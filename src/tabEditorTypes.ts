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
  beatIndex: number
  stringIndex: number // 0 = lowest string
}

export interface TabSelection {
  startMeasure: number
  startBeat: number
  endMeasure: number
  endBeat: number
}

export interface TabEditorState {
  track: TabTrack
  cursor: TabCursor
  selection: TabSelection | null
  clipboard: Beat[] | null
  activeDuration: DurationValue
  activeDot: DotModifier
  activeModifiers: NoteModifiers
  isPlaying: boolean
  playheadMeasure: number
  playheadBeat: number
  viewMode: 'tab' | 'staff'
  undoStack: TabTrack[]
  redoStack: TabTrack[]
}
