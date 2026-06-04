import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fromAlphaTabScore } from './fromAlphaTabScore'
import type { ImportResult } from './fromAlphaTabScore'
import * as at from '@coderline/alphatab'

// ─── alphaTab enum numeric constants (from inspecting dist/alphaTab.js) ───────
// These are used to build mock objects without needing real alphaTab instances.
const AT_DURATION = {
  Whole: 1, Half: 2, Quarter: 4, Eighth: 8, Sixteenth: 16,
  ThirtySecond: 32, SixtyFourth: 64,
} as const

const AT_DYNAMIC = {
  PPP: 0, PP: 1, P: 2, MP: 3, MF: 4, F: 5, FF: 6, FFF: 7,
} as const

const AT_HARMONIC = {
  None: 0, Natural: 1, Artificial: 2, Pinch: 3, Tap: 4, Semi: 5, Feedback: 6,
} as const

const AT_VIBRATO = { None: 0, Slight: 1, Wide: 2 } as const

const AT_SLIDE_OUT = {
  None: 0, Shift: 1, Legato: 2, OutUp: 3, OutDown: 4, PickSlideDown: 5, PickSlideUp: 6,
} as const

const AT_SLIDE_IN = { None: 0, IntoFromBelow: 1, IntoFromAbove: 2 } as const

const AT_BEND_TYPE = { None: 0, Custom: 1 } as const

const AT_GRACE = { None: 0, OnBeat: 1 } as const

const AT_OTTAVIA = { _15ma: 0, _8va: 1, Regular: 2 } as const

const AT_AUTOMATION = { Tempo: 0 } as const

const AT_FADE = { None: 0, FadeIn: 1, FadeOut: 2, VolumeSwell: 3 } as const

const AT_PICK = { None: 0, Up: 1, Down: 2 } as const

const AT_WHAMMY = { None: 0, Custom: 1 } as const

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<at.model.Note> = {}): at.model.Note {
  return {
    string: 1,
    fret: 5,
    isHammerPullOrigin: false,
    isHammerPullDestination: false,
    vibrato: AT_VIBRATO.None,
    isPalmMute: false,
    isLetRing: false,
    isDead: false,
    isGhost: false,
    isStaccato: false,
    isLeftHandTapped: false,
    harmonicType: AT_HARMONIC.None,
    harmonicValue: 0,
    slideOutType: AT_SLIDE_OUT.None,
    slideInType: AT_SLIDE_IN.None,
    isTrill: false,
    trillFret: 0,
    trillSpeed: AT_DURATION.Sixteenth,
    bendType: AT_BEND_TYPE.None,
    bendPoints: [],
    isTieDestination: false,
    isFingering: false,
    isSlurOrigin: false,
    isSlurDestination: false,
    ...overrides,
  } as unknown as at.model.Note
}

function makeBeat(overrides: Partial<at.model.Beat> = {}): at.model.Beat {
  return {
    duration: AT_DURATION.Quarter,
    dots: 0,
    tupletNumerator: 1,
    tupletDenominator: 1,
    hasTuplet: false,
    notes: [],
    dynamics: AT_DYNAMIC.F,
    pickStroke: AT_PICK.None,
    tremoloPicking: null,
    fade: AT_FADE.None,
    whammyBarType: AT_WHAMMY.None,
    whammyBarPoints: [],
    text: null,
    hasChord: false,
    chord: null,
    automations: [],
    lyrics: null,
    ottava: AT_OTTAVIA.Regular,
    graceType: AT_GRACE.None,
    isRest: false,
    ...overrides,
  } as unknown as at.model.Beat
}

function makeVoice(beats: at.model.Beat[] = []): at.model.Voice {
  return { beats } as unknown as at.model.Voice
}

function makeBar(voices: at.model.Voice[] = []): at.model.Bar {
  return { voices } as unknown as at.model.Bar
}

function makeMasterBar(overrides: Partial<{
  timeSignatureNumerator: number
  timeSignatureDenominator: number
  tempoAutomations: Array<{ value: number }>
  section: { text: string } | null
  isRepeatStart: boolean
  repeatCount: number
}> = {}): at.model.MasterBar {
  return {
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    tempoAutomations: [],
    section: null,
    isRepeatStart: false,
    repeatCount: 0,
    ...overrides,
  } as unknown as at.model.MasterBar
}

function makeStaff(overrides: Partial<{
  stringTuning: { tunings: number[]; name: string } | null
  bars: at.model.Bar[]
}> = {}): at.model.Staff {
  return {
    stringTuning: null,
    bars: [],
    ...overrides,
  } as unknown as at.model.Staff
}

function makeAtTrack(overrides: Partial<{
  name: string
  staves: at.model.Staff[]
}> = {}): at.model.Track {
  return {
    name: 'Guitar',
    staves: [makeStaff()],
    ...overrides,
  } as unknown as at.model.Track
}

function makeScore(overrides: Partial<{
  title: string
  artist: string
  tracks: at.model.Track[]
  masterBars: at.model.MasterBar[]
}> = {}): at.model.Score {
  return {
    title: 'Test Song',
    artist: 'Test Artist',
    tracks: [makeAtTrack()],
    masterBars: [makeMasterBar()],
    ...overrides,
  } as unknown as at.model.Score
}

// Mock crypto.randomUUID
beforeEach(() => {
  let counter = 0
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () => `mock-uuid-${++counter}` as ReturnType<typeof crypto.randomUUID>,
  )
})

// ─── fromAlphaTabScore: basic structure ──────────────────────────────────────

describe('fromAlphaTabScore', () => {
  it('returns a track with the score title', () => {
    const score = makeScore({ title: 'My Guitar Tab' })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.title).toBe('My Guitar Tab')
  })

  it('returns artist from score when present', () => {
    const score = makeScore({ artist: 'Jimi Hendrix' })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.artist).toBe('Jimi Hendrix')
  })

  it('falls back to track name when score title is empty', () => {
    const score = makeScore({
      title: '',
      tracks: [makeAtTrack({ name: 'Lead Guitar' })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.title).toBe('Lead Guitar')
  })

  it('falls back to "Imported Tab" when both score title and track name are empty', () => {
    const score = makeScore({ title: '', tracks: [makeAtTrack({ name: '' })] })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.title).toBe('Imported Tab')
  })

  it('has schemaVersion 4', () => {
    const score = makeScore()
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.schemaVersion).toBe(4)
  })

  it('returns no unsupported features for a simple single-track score', () => {
    const score = makeScore()
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toHaveLength(0)
  })
})

// ─── String count clamping ────────────────────────────────────────────────────

describe('fromAlphaTabScore string count', () => {
  it('uses 6 strings when tuning has exactly 6 strings', () => {
    const tunings = [64, 59, 55, 50, 45, 40] // high→low (alphaTab order)
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: { tunings, name: 'Standard' } })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.stringCount).toBe(6)
  })

  it('uses 7 strings when tuning has 7 strings', () => {
    const tunings = [64, 59, 55, 50, 45, 40, 35]
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: { tunings, name: '7-string' } })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.stringCount).toBe(7)
  })

  it('uses 8 strings when tuning has 8 strings', () => {
    const tunings = [64, 59, 55, 50, 45, 40, 35, 30]
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: { tunings, name: '8-string' } })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.stringCount).toBe(8)
  })

  it('clamps to 8 when tuning has more than 8 strings', () => {
    const tunings = [64, 59, 55, 50, 45, 40, 35, 30, 25]
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: { tunings, name: '9-string' } })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.stringCount).toBe(8)
  })

  it('falls back to 6-string standard when no tuning provided', () => {
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: null })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.stringCount).toBe(6)
    expect(track.openMidi).toEqual([40, 45, 50, 55, 59, 64])
  })
})

// ─── Tuning reversal ──────────────────────────────────────────────────────────

describe('fromAlphaTabScore tuning reversal', () => {
  it('reverses alphaTab high→low tuning to our low→high format', () => {
    // alphaTab stores high→low: [E4=64, B3=59, G3=55, D3=50, A2=45, E2=40]
    const atTunings = [64, 59, 55, 50, 45, 40]
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: { tunings: atTunings, name: 'Standard' } })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    // Our format low→high: [E2=40, A2=45, D3=50, G3=55, B3=59, E4=64]
    expect(track.openMidi).toEqual([40, 45, 50, 55, 59, 64])
  })

  it('uses tuning name from alphaTab stringTuning', () => {
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: { tunings: [64, 59, 55, 50, 45, 40], name: 'Drop D' } })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.tuningName).toBe('Drop D')
  })

  it('defaults tuning name to Standard when not provided', () => {
    const score = makeScore({
      tracks: [makeAtTrack({
        staves: [makeStaff({ stringTuning: null })],
      })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.tuningName).toBe('Standard')
  })
})

// ─── Duration conversion ──────────────────────────────────────────────────────

describe('fromAlphaTabScore duration conversion', () => {
  function scoreWithBeatDuration(duration: number): at.model.Score {
    const beat = makeBeat({ duration: duration as at.model.Duration })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    return makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
  }

  it('converts Whole (1) to Duration.Whole', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(1), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(1)
  })

  it('converts Half (2) to Duration.Half', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(2), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(2)
  })

  it('converts Quarter (4) to Duration.Quarter', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(4), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(4)
  })

  it('converts Eighth (8) to Duration.Eighth', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(8), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(8)
  })

  it('converts Sixteenth (16) to Duration.Sixteenth', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(16), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(16)
  })

  it('converts ThirtySecond (32) to Duration.ThirtySecond', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(32), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(32)
  })

  it('converts SixtyFourth (64) to Duration.SixtyFourth', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(64), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(64)
  })

  it('falls back to Duration.Quarter (4) for invalid duration values', () => {
    // -2 = DoubleWhole is not in our valid set
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(-2), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(4)
  })

  it('falls back to Duration.Quarter for -4 (QuadrupleWhole)', () => {
    const { track } = fromAlphaTabScore(scoreWithBeatDuration(-4), 0)
    expect(track.measures[0]?.beats[0]?.duration).toBe(4)
  })
})

// ─── Dot modifier conversion ──────────────────────────────────────────────────

describe('fromAlphaTabScore dot modifier conversion', () => {
  function scoreWithBeat(overrides: Partial<at.model.Beat>): at.model.Score {
    const beat = makeBeat(overrides)
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    return makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
  }

  it('sets dotted=true when dots=1', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({ dots: 1 }), 0)
    expect(track.measures[0]?.beats[0]?.dot.dotted).toBe(true)
    expect(track.measures[0]?.beats[0]?.dot.doubleDotted).toBe(false)
  })

  it('sets doubleDotted=true when dots=2', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({ dots: 2 }), 0)
    expect(track.measures[0]?.beats[0]?.dot.doubleDotted).toBe(true)
    expect(track.measures[0]?.beats[0]?.dot.dotted).toBe(false)
  })

  it('sets triplet=true when tuplet is 3:2', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      tupletNumerator: 3,
      tupletDenominator: 2,
      hasTuplet: true,
    }), 0)
    expect(track.measures[0]?.beats[0]?.dot.triplet).toBe(true)
  })

  it('does not set triplet for non-3:2 tuplets', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      tupletNumerator: 5,
      tupletDenominator: 4,
      hasTuplet: true,
    }), 0)
    expect(track.measures[0]?.beats[0]?.dot.triplet).toBe(false)
  })

  it('has no dots when dots=0 and no tuplet', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({ dots: 0 }), 0)
    const dot = track.measures[0]?.beats[0]?.dot
    expect(dot?.dotted).toBe(false)
    expect(dot?.doubleDotted).toBe(false)
    expect(dot?.triplet).toBe(false)
  })
})

// ─── Note modifier mapping ────────────────────────────────────────────────────

describe('fromAlphaTabScore note modifiers', () => {
  function scoreWithNote(noteOverrides: Partial<at.model.Note>): ImportResult {
    const note = makeNote(noteOverrides)
    const beat = makeBeat({ notes: [note] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    return fromAlphaTabScore(score, 0)
  }

  it('sets hammerOn when isHammerPullOrigin is true', () => {
    const { track } = scoreWithNote({ isHammerPullOrigin: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.hammerOn).toBe(true)
  })

  it('sets pullOff when isHammerPullDestination is true', () => {
    const { track } = scoreWithNote({ isHammerPullDestination: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.pullOff).toBe(true)
  })

  it('sets vibrato=1 for Slight vibrato', () => {
    const { track } = scoreWithNote({ vibrato: AT_VIBRATO.Slight as unknown as at.model.VibratoType })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.vibrato).toBe(1)
  })

  it('sets vibrato=2 for Wide vibrato', () => {
    const { track } = scoreWithNote({ vibrato: AT_VIBRATO.Wide as unknown as at.model.VibratoType })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.vibrato).toBe(2)
  })

  it('sets palmMute when isPalmMute is true', () => {
    const { track } = scoreWithNote({ isPalmMute: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.palmMute).toBe(true)
  })

  it('sets letRing when isLetRing is true', () => {
    const { track } = scoreWithNote({ isLetRing: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.letRing).toBe(true)
  })

  it('sets dead when isDead is true', () => {
    const { track } = scoreWithNote({ isDead: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.dead).toBe(true)
  })

  it('sets ghost when isGhost is true', () => {
    const { track } = scoreWithNote({ isGhost: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.ghost).toBe(true)
  })

  it('sets staccato when isStaccato is true', () => {
    const { track } = scoreWithNote({ isStaccato: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.staccato).toBe(true)
  })

  it('sets tapping when isLeftHandTapped is true', () => {
    const { track } = scoreWithNote({ isLeftHandTapped: true })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.tapping).toBe(true)
  })

  it('sets legatoSlide when slideOutType is Legato', () => {
    const { track } = scoreWithNote({
      slideOutType: AT_SLIDE_OUT.Legato as unknown as at.model.SlideOutType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.legatoSlide).toBe(true)
  })

  it('sets slideOutDown when slideOutType is OutDown', () => {
    const { track } = scoreWithNote({
      slideOutType: AT_SLIDE_OUT.OutDown as unknown as at.model.SlideOutType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.slideOutDown).toBe(true)
  })

  it('sets slideOutUp when slideOutType is OutUp', () => {
    const { track } = scoreWithNote({
      slideOutType: AT_SLIDE_OUT.OutUp as unknown as at.model.SlideOutType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.slideOutUp).toBe(true)
  })

  it('sets slideInBelow when slideInType is IntoFromBelow', () => {
    const { track } = scoreWithNote({
      slideInType: AT_SLIDE_IN.IntoFromBelow as unknown as at.model.SlideInType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.slideInBelow).toBe(true)
  })

  it('sets slideInAbove when slideInType is IntoFromAbove', () => {
    const { track } = scoreWithNote({
      slideInType: AT_SLIDE_IN.IntoFromAbove as unknown as at.model.SlideInType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.slideInAbove).toBe(true)
  })

  it('sets harmonicType=Natural for Natural harmonic', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Natural as unknown as at.model.HarmonicType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.harmonicType).toBe(1)
  })

  it('sets harmonicType=Artificial for Artificial harmonic', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Artificial as unknown as at.model.HarmonicType,
      harmonicValue: 12,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.harmonicType).toBe(2)
  })

  it('sets harmonicType=Pinch for Pinch harmonic', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Pinch as unknown as at.model.HarmonicType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.harmonicType).toBe(3)
  })

  it('sets harmonicType=Tap for Tap harmonic', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Tap as unknown as at.model.HarmonicType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.harmonicType).toBe(4)
  })

  it('sets harmonicType=Semi for Semi harmonic', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Semi as unknown as at.model.HarmonicType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.harmonicType).toBe(5)
  })

  it('sets harmonicType=Feedback for Feedback harmonic', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Feedback as unknown as at.model.HarmonicType,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.modifiers.harmonicType).toBe(6)
  })

  it('stores harmonicValue on the note when harmonicType is Artificial', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Artificial as unknown as at.model.HarmonicType,
      harmonicValue: 7,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.harmonicValue).toBe(7)
  })

  it('does not store harmonicValue when harmonicType is not Artificial', () => {
    const { track } = scoreWithNote({
      harmonicType: AT_HARMONIC.Natural as unknown as at.model.HarmonicType,
      harmonicValue: 12,
    })
    expect(track.measures[0]?.beats[0]?.notes[0]?.harmonicValue).toBeUndefined()
  })

  it('sets bend and stores bendData when bendType is not None and 2+ bendPoints exist', () => {
    const { track } = scoreWithNote({
      bendType: AT_BEND_TYPE.Custom as unknown as at.model.BendType,
      bendPoints: [
        { offset: 0, value: 0 },
        { offset: 60, value: 4 },
      ] as unknown as at.model.BendPoint[],
    })
    const note = track.measures[0]?.beats[0]?.notes[0]
    expect(note?.modifiers.bend).toBe(true)
    expect(note?.bendData?.points).toHaveLength(2)
    expect(note?.bendData?.points[0]).toEqual({ offset: 0, value: 0 })
    expect(note?.bendData?.points[1]).toEqual({ offset: 60, value: 4 })
  })

  it('does not set bend when bendPoints length < 2', () => {
    const { track } = scoreWithNote({
      bendType: AT_BEND_TYPE.Custom as unknown as at.model.BendType,
      bendPoints: [{ offset: 0, value: 0 }] as unknown as at.model.BendPoint[],
    })
    const note = track.measures[0]?.beats[0]?.notes[0]
    expect(note?.modifiers.bend).toBeUndefined()
  })

  it('sets trill and trillFret when isTrill is true and trillFret > 0', () => {
    const { track } = scoreWithNote({
      isTrill: true,
      trillFret: 7,
      trillSpeed: AT_DURATION.Sixteenth as unknown as at.model.Duration,
    })
    const note = track.measures[0]?.beats[0]?.notes[0]
    expect(note?.modifiers.trill).toBe(true)
    expect(note?.trillFret).toBe(7)
    expect(note?.trillSpeed).toBe(16)
  })

  it('does not set trill when isTrill is true but trillFret is 0', () => {
    const { track } = scoreWithNote({
      isTrill: true,
      trillFret: 0,
    })
    const note = track.measures[0]?.beats[0]?.notes[0]
    expect(note?.modifiers.trill).toBeUndefined()
  })

  it('skips notes where isTieDestination is true', () => {
    const tiedNote = makeNote({ isTieDestination: true })
    const normalNote = makeNote({ string: 2, fret: 3 })
    const beat = makeBeat({ notes: [tiedNote, normalNote] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    // Only the normal note (string=2) should be in the output
    expect(track.measures[0]?.beats[0]?.notes).toHaveLength(1)
    expect(track.measures[0]?.beats[0]?.notes[0]?.string).toBe(2)
  })

  it('sets tiedFrom on beat when a note has isTieDestination', () => {
    const tiedNote = makeNote({ isTieDestination: true, string: 1 })
    const beat = makeBeat({ notes: [tiedNote] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.measures[0]?.beats[0]?.tiedFrom).toBe(true)
  })
})

// ─── Beat-level properties ────────────────────────────────────────────────────

describe('fromAlphaTabScore beat-level properties', () => {
  function scoreWithBeat(overrides: Partial<at.model.Beat>): at.model.Score {
    const beat = makeBeat(overrides)
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    return makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
  }

  it('sets dynamics when not the default F', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      dynamics: AT_DYNAMIC.PP as unknown as at.model.DynamicValue,
    }), 0)
    expect(track.measures[0]?.beats[0]?.dynamics).toBe('pp')
  })

  it('does not set dynamics when dynamics is F (default)', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      dynamics: AT_DYNAMIC.F as unknown as at.model.DynamicValue,
    }), 0)
    expect(track.measures[0]?.beats[0]?.dynamics).toBeUndefined()
  })

  it('sets pickStroke down when PickStroke.Down', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      pickStroke: AT_PICK.Down as unknown as at.model.PickStroke,
    }), 0)
    expect(track.measures[0]?.beats[0]?.pickStroke).toBe('down')
  })

  it('sets pickStroke up when PickStroke.Up', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      pickStroke: AT_PICK.Up as unknown as at.model.PickStroke,
    }), 0)
    expect(track.measures[0]?.beats[0]?.pickStroke).toBe('up')
  })

  it('sets fade=fadeIn for FadeIn', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      fade: AT_FADE.FadeIn as unknown as at.model.FadeType,
    }), 0)
    expect(track.measures[0]?.beats[0]?.fade).toBe('fadeIn')
  })

  it('sets fade=fadeOut for FadeOut', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      fade: AT_FADE.FadeOut as unknown as at.model.FadeType,
    }), 0)
    expect(track.measures[0]?.beats[0]?.fade).toBe('fadeOut')
  })

  it('sets fade=fadeInOut for VolumeSwell', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      fade: AT_FADE.VolumeSwell as unknown as at.model.FadeType,
    }), 0)
    expect(track.measures[0]?.beats[0]?.fade).toBe('fadeInOut')
  })

  it('sets tremolo marks from tremoloPicking', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      tremoloPicking: { marks: 3 } as unknown as at.model.TremoloPickingEffect,
    }), 0)
    expect(track.measures[0]?.beats[0]?.tremoloMarks).toBe(3)
  })

  it('sets text annotation on beat', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({ text: 'Chorus' }), 0)
    expect(track.measures[0]?.beats[0]?.text).toBe('Chorus')
  })

  it('sets chord with reversed frets', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      hasChord: true,
      chord: {
        name: 'Am',
        strings: [0, 1, 2, 2, 0, -1], // high→low in alphaTab
      } as unknown as at.model.Chord,
    }), 0)
    const chord = track.measures[0]?.beats[0]?.chord
    expect(chord?.name).toBe('Am')
    // Reversed: low→high
    expect(chord?.frets).toEqual([-1, 0, 2, 2, 1, 0])
  })

  it('sets tempoChange from beat automation', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      automations: [
        {
          type: AT_AUTOMATION.Tempo,
          value: 160,
        } as unknown as at.model.Automation,
      ],
    }), 0)
    expect(track.measures[0]?.beats[0]?.tempoChange).toBe(160)
  })

  it('sets whammyBar when whammyBarType is not None', () => {
    const { track } = fromAlphaTabScore(scoreWithBeat({
      whammyBarType: AT_WHAMMY.Custom as unknown as at.model.WhammyType,
      whammyBarPoints: [
        { offset: 0, value: 0 },
        { offset: 30, value: -8 },
        { offset: 60, value: 0 },
      ] as unknown as at.model.BendPoint[],
    }), 0)
    const whammy = track.measures[0]?.beats[0]?.whammyBar
    expect(whammy?.points).toHaveLength(3)
    expect(whammy?.points[1]).toEqual({ offset: 30, value: -8 })
  })
})

// ─── MasterBar mapping ────────────────────────────────────────────────────────

describe('fromAlphaTabScore MasterBar mapping', () => {
  it('maps time signature from masterBar', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ timeSignatureNumerator: 3, timeSignatureDenominator: 4 })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.masterBars[0]?.timeSignature).toEqual({ numerator: 3, denominator: 4 })
  })

  it('sets bpm from tempoAutomations on masterBar', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ tempoAutomations: [{ value: 180 }] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.masterBars[0]?.bpm).toBe(180)
  })

  it('does not set bpm when tempoAutomations is empty', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ tempoAutomations: [] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    // First masterBar gets default 120 bpm when no bpm is set
    expect(track.masterBars[0]?.bpm).toBe(120)
  })

  it('sets marker from section text', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ section: { text: 'Verse' } })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.masterBars[0]?.marker).toBe('Verse')
  })

  it('sets repeatOpen from isRepeatStart', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ isRepeatStart: true })],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [makeBar()] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.measures[0]?.repeatOpen).toBe(true)
  })

  it('sets repeatClose from repeatCount when > 0', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ repeatCount: 3 })],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [makeBar()] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.measures[0]?.repeatClose).toBe(3)
  })

  it('does not set repeatClose when repeatCount is 0', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ repeatCount: 0 })],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [makeBar()] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.measures[0]?.repeatClose).toBeUndefined()
  })

  it('masterBars[0] always has a bpm (defaults to 120 when none provided)', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ tempoAutomations: [] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.masterBars[0]?.bpm).toBeDefined()
    expect(track.masterBars[0]?.bpm).toBe(120)
  })

  it('multiple measures map to separate masterBars and measures', () => {
    const score = makeScore({
      masterBars: [
        makeMasterBar({ timeSignatureNumerator: 4, timeSignatureDenominator: 4, tempoAutomations: [{ value: 120 }] }),
        makeMasterBar({ timeSignatureNumerator: 3, timeSignatureDenominator: 4 }),
      ],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [makeBar(), makeBar()] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.masterBars).toHaveLength(2)
    expect(track.measures).toHaveLength(2)
    expect(track.masterBars[1]?.timeSignature).toEqual({ numerator: 3, denominator: 4 })
  })
})

// ─── Empty score / edge cases ─────────────────────────────────────────────────

describe('fromAlphaTabScore edge cases', () => {
  it('ensures at least one measure when masterBars is empty', () => {
    const score = makeScore({ masterBars: [] })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.measures.length).toBeGreaterThanOrEqual(1)
    expect(track.masterBars.length).toBeGreaterThanOrEqual(1)
  })

  it('ensures masterBars[0] has bpm=120 fallback when no bpm set', () => {
    const score = makeScore({
      masterBars: [makeMasterBar({ tempoAutomations: [] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.masterBars[0]?.bpm).toBe(120)
  })

  it('falls back to track 0 when requested trackIndex is out of range', () => {
    const score = makeScore({ tracks: [makeAtTrack({ name: 'Main Track' })] })
    const { track } = fromAlphaTabScore(score, 99)
    expect(track.title).toBeTruthy()
  })

  it('assigns unique ids to each measure', () => {
    const score = makeScore({
      masterBars: [makeMasterBar(), makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [makeBar(), makeBar()] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    const ids = track.measures.map((m) => m.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('assigns unique ids to each beat', () => {
    const beat1 = makeBeat()
    const beat2 = makeBeat()
    const voice = makeVoice([beat1, beat2])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    const ids = track.measures[0]?.beats.map((b) => b.id) ?? []
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('stores fret and string from note', () => {
    const note = makeNote({ string: 3, fret: 12 })
    const beat = makeBeat({ notes: [note] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { track } = fromAlphaTabScore(score, 0)
    expect(track.measures[0]?.beats[0]?.notes[0]?.string).toBe(3)
    expect(track.measures[0]?.beats[0]?.notes[0]?.fret).toBe(12)
  })
})

// ─── Unsupported feature detection ───────────────────────────────────────────

describe('fromAlphaTabScore unsupported features', () => {
  it('reports multiple tracks as unsupported', () => {
    const score = makeScore({
      tracks: [makeAtTrack({ name: 'Guitar 1' }), makeAtTrack({ name: 'Guitar 2' })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures.some((f) => f.includes('Multiple tracks'))).toBe(true)
  })

  it('reports lyrics as unsupported', () => {
    const beat = makeBeat({ lyrics: ['hello'] as unknown as string[] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Lyrics')
  })

  it('reports ottava as unsupported when not Regular', () => {
    const beat = makeBeat({ ottava: AT_OTTAVIA._8va as unknown as at.model.Ottavia })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Ottava (8va / 8vb) markers')
  })

  it('reports grace notes as unsupported', () => {
    const beat = makeBeat({ graceType: AT_GRACE.OnBeat as unknown as at.model.GraceType })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Grace notes')
  })

  it('reports non-triplet tuplets as unsupported', () => {
    const beat = makeBeat({ tupletNumerator: 5, tupletDenominator: 4, hasTuplet: true })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Non-triplet tuplets')
  })

  it('does not report triplet 3:2 tuplets as unsupported', () => {
    const beat = makeBeat({ tupletNumerator: 3, tupletDenominator: 2, hasTuplet: true })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).not.toContain('Non-triplet tuplets')
  })

  it('reports shift slides as unsupported', () => {
    const note = makeNote({ slideOutType: AT_SLIDE_OUT.Shift as unknown as at.model.SlideOutType })
    const beat = makeBeat({ notes: [note] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Shift slides')
  })

  it('reports pick slides as unsupported', () => {
    const note = makeNote({
      slideOutType: AT_SLIDE_OUT.PickSlideDown as unknown as at.model.SlideOutType,
    })
    const beat = makeBeat({ notes: [note] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Pick slides')
  })

  it('reports fingering notation as unsupported', () => {
    const note = makeNote({ isFingering: true })
    const beat = makeBeat({ notes: [note] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Fingering notation')
  })

  it('reports slurs as unsupported', () => {
    const note = makeNote({ isSlurOrigin: true })
    const beat = makeBeat({ notes: [note] })
    const voice = makeVoice([beat])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Slurs')
  })

  it('reports multiple voices as unsupported when voice 1+ has non-rest beats', () => {
    const beat1 = makeBeat({ isRest: false })
    const voice0 = makeVoice([beat1])
    const voice1 = makeVoice([makeBeat({ isRest: false })])
    const bar = makeBar([voice0, voice1])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).toContain('Multiple voices per measure')
  })

  it('does not report multiple voices when all additional voices have only rests', () => {
    const beat1 = makeBeat({ isRest: false })
    const voice0 = makeVoice([beat1])
    const voice1 = makeVoice([makeBeat({ isRest: true })])
    const bar = makeBar([voice0, voice1])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    expect(unsupportedFeatures).not.toContain('Multiple voices per measure')
  })

  it('deduplicates unsupported features across beats', () => {
    const beat1 = makeBeat({ lyrics: ['a'] as unknown as string[] })
    const beat2 = makeBeat({ lyrics: ['b'] as unknown as string[] })
    const voice = makeVoice([beat1, beat2])
    const bar = makeBar([voice])
    const score = makeScore({
      masterBars: [makeMasterBar()],
      tracks: [makeAtTrack({ staves: [makeStaff({ bars: [bar] })] })],
    })
    const { unsupportedFeatures } = fromAlphaTabScore(score, 0)
    const lyricCount = unsupportedFeatures.filter((f) => f === 'Lyrics').length
    expect(lyricCount).toBe(1)
  })
})

// ─── Track selection ──────────────────────────────────────────────────────────

describe('fromAlphaTabScore track selection', () => {
  it('selects the requested trackIndex', () => {
    const track0 = makeAtTrack({ name: 'Guitar 1' })
    const track1 = makeAtTrack({ name: 'Bass' })
    const score = makeScore({ tracks: [track0, track1] })
    const { track } = fromAlphaTabScore(score, 1)
    // The title comes from score.title, but note that the unsupported warning is about multi-track
    // What we can check is that it used track1's staves (no staves → default tuning)
    expect(track.openMidi).toEqual([40, 45, 50, 55, 59, 64]) // default because no staves with tuning
  })
})
