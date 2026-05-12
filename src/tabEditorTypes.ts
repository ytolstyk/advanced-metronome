export interface BendPointDef {
  offset: number  // 0–60 (AlphaTab BendPoint.offset range)
  value: number   // 0–24 quarter-tones (24 = 3 whole steps = 6 semitones)
}

export type BendCurve = 'up' | 'down'
// 'up'  = concave up (accelerating): Q(x2,y1) bezier — horizontal start, vertical end
// 'down' = concave down (decelerating): Q(x1,y2) bezier — vertical start, horizontal end

export interface BendData {
  points: BendPointDef[]   // ≥2 points, sorted by offset; points[0].offset === 0
  segments: BendCurve[]    // length === points.length - 1
}

// Harmonic types matching alphaTab's HarmonicType enum
export const HarmonicType = {
  Natural: 1,
  Artificial: 2,
  Pinch: 3,
  Tap: 4,
  Semi: 5,
  Feedback: 6,
} as const

export type HarmonicTypeValue = (typeof HarmonicType)[keyof typeof HarmonicType]

// Duration values matching alphaTab's Duration enum integers
export const Duration = {
  Whole:        1,
  Half:         2,
  Quarter:      4,
  Eighth:       8,
  Sixteenth:    16,
  ThirtySecond: 32,
  SixtyFourth:  64,
} as const

export type DurationValue = (typeof Duration)[keyof typeof Duration]

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
  harmonicType?: HarmonicTypeValue
  hammerOn?: true
  pullOff?: true
  legatoSlide?: true
  slideInBelow?: true
  slideInAbove?: true
  slideOutDown?: true
  slideOutUp?: true
  bend?: true
  vibrato?: 1 | 2  // 1 = Slight, 2 = Wide (alphaTab VibratoType)
  tapping?: true
  trill?: true      // alternates between this note and trillFret
}

export type NoteModifierKey = keyof NoteModifiers

export interface TabNote {
  string: number  // 1-based; 1 = lowest-pitched string (AlphaTab convention); always >= 1
  fret: number    // 0-24; always >= 0 (notes absent from beat.notes array = no note)
  modifiers: NoteModifiers
  bendData?: BendData // multi-point bend curve; replaces legacy bendAmount
  harmonicValue?: number // fret for artificial harmonic node point; only relevant when modifiers.harmonicType === 2
  trillFret?: number // auxiliary trill note fret (1-24); only relevant when modifiers.trill is set
  trillSpeed?: DurationValue // trill alternation speed; defaults to Duration.Sixteenth
}

export interface Beat {
  id: string
  duration: DurationValue
  dot: DotModifier
  notes: TabNote[]  // sparse; each note has .string (1-based, 1=lowest); fret always >= 0
  tiedFrom?: true   // this beat is a tied continuation from the previous measure
  tiedTo?: true     // this beat ties into the first beat of the next measure
  dynamics?: 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff'
  repeatStart?: true
  repeatEnd?: true
  tempoChange?: number
  pickStroke?: 'down' | 'up'  // beat-level pick direction (mirrors alphaTab Beat.pickStroke)
  tremoloMarks?: number  // tremolo picking marks (1–4) — mirrors alphaTab TremoloPickingEffect.marks directly; plays 2^marks picks per beat
}

// Corresponds to alphaTab's MasterBar — holds time sig and optional BPM for a measure.
// masterBars[i] corresponds to measures[i]. masterBars[0].bpm must always be set.
export interface MasterBar {
  timeSignature: { numerator: number; denominator: number }
  bpm?: number  // undefined = inherit from previous MasterBar's bpm
}

export interface Measure {
  id: string
  beats: Beat[]
}

export interface TabTrack {
  schemaVersion: 3  // v3 = string 1 = lowest-pitched (AlphaTab convention); openMidi low→high
  title: string
  artist?: string
  tabAuthor?: string
  year?: string
  version?: number
  masterBars: MasterBar[]  // masterBars[i] <-> measures[i]; always non-empty
  stringCount: 6 | 7 | 8
  tuningName: string
  openMidi: number[]  // low→high order: openMidi[0] = string 1 (lowest pitch)
  measures: Measure[]
}

export interface TabCursor {
  measureIndex: number
  beatIndex: number  // can equal measure.beats.length to point at the virtual pending slot
  stringIndex: number  // 1-based; 1 = lowest-pitched string (bottom of tab)
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
  overshootTicks: number  // ticks past measure capacity (replaces overshootBeats)
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
  activePick?: 'down' | 'up'  // beat-level pick direction to apply to the next new beat
  activeHarmonicValue?: number
  activeTrillFret?: number
  activeTrillSpeed?: DurationValue
  isPlaying: boolean
  playheadMeasure: number
  playheadBeat: number
  pendingOverflow: OverflowPending | null
  undoStack: TabTrack[]
  redoStack: TabTrack[]
}
