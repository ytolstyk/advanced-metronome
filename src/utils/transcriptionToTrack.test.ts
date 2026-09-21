import { describe, it, expect } from 'vitest'
import type { GeminiTabMeasure } from '../api/tabTranscriptionApi'
import { geminiResponseToTabTrack } from './transcriptionToTrack'
import { Duration } from '../tabEditorTypes'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function rawBeat(
  duration: string,
  dot: string,
  notes: Array<{ string: number; fret: number }> = [],
): GeminiTabMeasure['beats'][0] {
  return { duration, dot, notes }
}

function rawMeasure(...beats: GeminiTabMeasure['beats']): GeminiTabMeasure {
  return { beats }
}

const OPEN_MIDI_6 = [40, 45, 50, 55, 59, 64]
const OPEN_MIDI_7 = [35, 40, 45, 50, 55, 59, 64]
const OPEN_MIDI_8 = [30, 35, 40, 45, 50, 55, 59, 64]
const TS_4_4 = { numerator: 4, denominator: 4 }
const TS_3_4 = { numerator: 3, denominator: 4 }

// ─── String inversion ─────────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – string inversion', () => {
  it('maps Gemini string 1 (high E) to alphaTab string 6 on a 6-string guitar', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 5 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(6)
  })

  it('maps Gemini string 6 (low E) to alphaTab string 1 on a 6-string guitar', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 6, fret: 3 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(1)
  })

  it('maps Gemini string 3 to alphaTab string 4 on a 6-string guitar (symmetric midpoint)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 3, fret: 7 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(4)
  })

  it('maps Gemini string 1 to alphaTab string 7 on a 7-string guitar', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 0 }]))],
      120, '7-String Standard', OPEN_MIDI_7, 7, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(7)
  })

  it('maps Gemini string 7 to alphaTab string 1 on a 7-string guitar', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 7, fret: 0 }]))],
      120, '7-String Standard', OPEN_MIDI_7, 7, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(1)
  })

  it('maps Gemini string 1 to alphaTab string 8 on an 8-string guitar', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 0 }]))],
      120, '8-String Standard', OPEN_MIDI_8, 8, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(8)
  })

  it('maps Gemini string 8 to alphaTab string 1 on an 8-string guitar', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 8, fret: 0 }]))],
      120, '8-String Standard', OPEN_MIDI_8, 8, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.string).toBe(1)
  })

  it('preserves notes sorted by alphaTab string index ascending', () => {
    // Gemini string 1 (→ alphaTab 6) and Gemini string 3 (→ alphaTab 4) in the same beat
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [
        { string: 1, fret: 0 },
        { string: 3, fret: 2 },
      ]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const notes = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes
    expect(notes[0]!.string).toBeLessThan(notes[1]!.string)
  })
})

// ─── Fret clamping ────────────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – fret clamping', () => {
  it('clamps fret 25 to 24', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 25 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(24)
  })

  it('clamps fret 100 to 24', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 100 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(24)
  })

  it('clamps fret -1 to 0', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: -1 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(0)
  })

  it('clamps fret -99 to 0', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: -99 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(0)
  })

  it('preserves fret 0 unchanged', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 0 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(0)
  })

  it('preserves fret 24 unchanged', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 24 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(24)
  })

  it('preserves fret 12 unchanged', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none', [{ string: 1, fret: 12 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const note = track.measures[0]!.beats.find(b => b.notes.length > 0)!.notes[0]!
    expect(note.fret).toBe(12)
  })
})

// ─── Duration mapping ─────────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – duration mapping', () => {
  it('maps "whole" to Duration.Whole (1)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('whole', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    // whole note fills the measure – filter out any fill-rest beats
    const beat = track.measures[0]!.beats[0]!
    expect(beat.duration).toBe(Duration.Whole)
  })

  it('maps "half" to Duration.Half (2)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('half', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.Half)
  })

  it('maps "quarter" to Duration.Quarter (4)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.Quarter)
  })

  it('maps "eighth" to Duration.Eighth (8)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('eighth', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.Eighth)
  })

  it('maps "sixteenth" to Duration.Sixteenth (16)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('sixteenth', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.Sixteenth)
  })

  it('maps "thirty_second" to Duration.ThirtySecond (32)', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('thirty_second', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.ThirtySecond)
  })

  it('falls back to Duration.Quarter (4) for an unknown duration string', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('triplet_quarter', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.Quarter)
  })

  it('falls back to Duration.Quarter (4) for an empty duration string', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.duration).toBe(Duration.Quarter)
  })
})

// ─── Dot mapping ──────────────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – dot mapping', () => {
  it('maps "none" to { dotted: false, doubleDotted: false, triplet: false }', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.dot).toEqual({
      dotted: false, doubleDotted: false, triplet: false,
    })
  })

  it('maps "dotted" to { dotted: true, doubleDotted: false, triplet: false }', () => {
    // dotted quarter = 360 ticks; fits in 4/4
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'dotted'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.dot).toEqual({
      dotted: true, doubleDotted: false, triplet: false,
    })
  })

  it('maps "double_dotted" to { dotted: false, doubleDotted: true, triplet: false }', () => {
    // double-dotted quarter = 420 ticks; fits in 4/4
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'double_dotted'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.dot).toEqual({
      dotted: false, doubleDotted: true, triplet: false,
    })
  })

  it('maps "triplet" to { dotted: false, doubleDotted: false, triplet: true }', () => {
    // triplet quarter = 160 ticks; fits in 4/4
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'triplet'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.dot).toEqual({
      dotted: false, doubleDotted: false, triplet: true,
    })
  })

  it('maps any unrecognised dot string to all-false', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'unknown_value'))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures[0]!.beats[0]!.dot).toEqual({
      dotted: false, doubleDotted: false, triplet: false,
    })
  })
})

// ─── Overflow beat dropping ────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – overflow beat dropping', () => {
  it('drops the 5th quarter note that would exceed 4/4 capacity (960 ticks)', () => {
    // 4 × quarter (4 × 240 = 960) fills 4/4 exactly; a 5th beat overflows
    const fiveQuarters = [
      rawBeat('quarter', 'none', [{ string: 1, fret: 0 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 1 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 2 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 3 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 4 }]), // must be dropped
    ]
    const track = geminiResponseToTabTrack(
      [{ beats: fiveQuarters }],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    // Notes 0–3 land on frets 0–3; fret 4 from the 5th beat must be absent
    const noteBeats = track.measures[0]!.beats.filter(b => b.notes.length > 0)
    expect(noteBeats).toHaveLength(4)
    const frets = noteBeats.map(b => b.notes[0]!.fret)
    expect(frets).not.toContain(4)
  })

  it('accepts exactly capacity worth of ticks (no overflow)', () => {
    // 1 whole note = 960 ticks fills 4/4 exactly; must not be dropped
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('whole', 'none', [{ string: 1, fret: 5 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    const noteBeats = track.measures[0]!.beats.filter(b => b.notes.length > 0)
    expect(noteBeats).toHaveLength(1)
    expect(noteBeats[0]!.notes[0]!.fret).toBe(5)
  })

  it('drops the 4th quarter note that would exceed 3/4 capacity (720 ticks)', () => {
    const fourQuarters = [
      rawBeat('quarter', 'none', [{ string: 1, fret: 0 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 1 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 2 }]),
      rawBeat('quarter', 'none', [{ string: 1, fret: 9 }]), // must be dropped
    ]
    const track = geminiResponseToTabTrack(
      [{ beats: fourQuarters }],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_3_4,
    )
    const noteBeats = track.measures[0]!.beats.filter(b => b.notes.length > 0)
    expect(noteBeats).toHaveLength(3)
    expect(noteBeats.map(b => b.notes[0]!.fret)).not.toContain(9)
  })

  it('processes multiple measures independently, each dropped separately', () => {
    // Measure 0: 4 quarters (fine). Measure 1: 5 quarters (5th dropped).
    const fourQ = Array.from({ length: 4 }, (_, i) =>
      rawBeat('quarter', 'none', [{ string: 1, fret: i }]),
    )
    const fiveQ = Array.from({ length: 5 }, (_, i) =>
      rawBeat('quarter', 'none', [{ string: 1, fret: i + 10 }]),
    )
    const track = geminiResponseToTabTrack(
      [{ beats: fourQ }, { beats: fiveQ }],
      120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures).toHaveLength(2)
    const noteBeats0 = track.measures[0]!.beats.filter(b => b.notes.length > 0)
    const noteBeats1 = track.measures[1]!.beats.filter(b => b.notes.length > 0)
    expect(noteBeats0).toHaveLength(4)
    expect(noteBeats1).toHaveLength(4)
  })

  it('yields an empty beats array when the very first beat already overflows', () => {
    // A whole note (960 ticks) in a 1/8 measure (120 ticks) must be dropped immediately
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('whole', 'none', [{ string: 1, fret: 7 }]))],
      120, 'Standard', OPEN_MIDI_6, 6, 120, { numerator: 1, denominator: 8 },
    )
    const noteBeats = track.measures[0]!.beats.filter(b => b.notes.length > 0)
    expect(noteBeats).toHaveLength(0)
  })
})

// ─── BPM on masterBars ────────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – BPM on masterBars', () => {
  it('sets detectedBpm on masterBars[0].bpm when detectedBpm > 0', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none'))],
      140, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars[0]!.bpm).toBe(140)
  })

  it('falls back to bpm param when detectedBpm is 0', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none'))],
      0, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars[0]!.bpm).toBe(120)
  })

  it('falls back to bpm param when detectedBpm is negative', () => {
    const track = geminiResponseToTabTrack(
      [rawMeasure(rawBeat('quarter', 'none'))],
      -1, 'Standard', OPEN_MIDI_6, 6, 90, TS_4_4,
    )
    expect(track.masterBars[0]!.bpm).toBe(90)
  })

  it('does not set bpm on masterBars[1] (inheritance via effectiveBpmAt)', () => {
    const track = geminiResponseToTabTrack(
      [
        rawMeasure(rawBeat('quarter', 'none')),
        rawMeasure(rawBeat('quarter', 'none')),
      ],
      130, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars[0]!.bpm).toBe(130)
    expect(track.masterBars[1]!.bpm).toBeUndefined()
  })

  it('does not set bpm on any bar beyond index 0 even for many measures', () => {
    const measures = Array.from({ length: 4 }, () =>
      rawMeasure(rawBeat('quarter', 'none')),
    )
    const track = geminiResponseToTabTrack(
      measures, 100, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars).toHaveLength(4)
    track.masterBars.slice(1).forEach((mb) => {
      expect(mb.bpm).toBeUndefined()
    })
  })

  it('creates the correct number of masterBars matching the number of measures', () => {
    const measures = Array.from({ length: 3 }, () =>
      rawMeasure(rawBeat('quarter', 'none')),
    )
    const track = geminiResponseToTabTrack(
      measures, 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars).toHaveLength(3)
    expect(track.measures).toHaveLength(3)
  })

  it('sets timeSignature on every masterBar from the timeSignature argument', () => {
    const measures = Array.from({ length: 2 }, () =>
      rawMeasure(rawBeat('quarter', 'none')),
    )
    const track = geminiResponseToTabTrack(
      measures, 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_3_4,
    )
    track.masterBars.forEach((mb) => {
      expect(mb.timeSignature).toEqual(TS_3_4)
    })
  })
})

// ─── Empty measures input ─────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – empty measures array', () => {
  it('returns a track with at least 1 measure', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.measures.length).toBeGreaterThanOrEqual(1)
  })

  it('returns a track with at least 1 masterBar', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars.length).toBeGreaterThanOrEqual(1)
  })

  it('sets effective BPM on the fallback masterBar when measures is empty and detectedBpm is 0', () => {
    const track = geminiResponseToTabTrack(
      [], 0, 'Standard', OPEN_MIDI_6, 6, 90, TS_4_4,
    )
    expect(track.masterBars[0]!.bpm).toBe(90)
  })

  it('sets detectedBpm on the fallback masterBar when measures is empty and detectedBpm > 0', () => {
    const track = geminiResponseToTabTrack(
      [], 77, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.masterBars[0]!.bpm).toBe(77)
  })

  it('sets correct timeSignature on the fallback masterBar', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_3_4,
    )
    expect(track.masterBars[0]!.timeSignature).toEqual(TS_3_4)
  })
})

// ─── Track metadata ───────────────────────────────────────────────────────────

describe('geminiResponseToTabTrack – track metadata', () => {
  it('sets title to "AI Transcription"', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.title).toBe('AI Transcription')
  })

  it('sets tuningName from argument', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Drop D', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.tuningName).toBe('Drop D')
  })

  it('copies openMidi array (not same reference)', () => {
    const openMidi = [40, 45, 50, 55, 59, 64]
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', openMidi, 6, 120, TS_4_4,
    )
    expect(track.openMidi).toEqual(openMidi)
    expect(track.openMidi).not.toBe(openMidi)
  })

  it('sets stringCount from argument', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.stringCount).toBe(6)
  })

  it('sets schemaVersion to 4', () => {
    const track = geminiResponseToTabTrack(
      [], 120, 'Standard', OPEN_MIDI_6, 6, 120, TS_4_4,
    )
    expect(track.schemaVersion).toBe(4)
  })
})
