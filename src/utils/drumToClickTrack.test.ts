import { describe, it, expect } from 'vitest'
import { drumToClickTrackPieces } from './drumToClickTrack'
import { CLICK_RUN_PALETTE } from './barRuns'
import { INSTRUMENT_IDS } from '../constants'
import type { Measure, Pattern } from '../types'

const measure = (beats: number, subdivision = 4, stepsPerBeat?: number): Measure => ({
  timeSignature: { beats, subdivision, ...(stepsPerBeat !== undefined && { stepsPerBeat }) },
})

function emptyPattern(steps: number): Pattern {
  return Object.fromEntries(INSTRUMENT_IDS.map((id) => [id, Array<boolean>(steps).fill(false)])) as Pattern
}

describe('drumToClickTrackPieces', () => {
  it('returns no pieces for no measures', () => {
    expect(drumToClickTrackPieces([], emptyPattern(0), 120)).toEqual([])
  })

  it('collapses identical consecutive measures into one piece with a repeat count', () => {
    const pieces = drumToClickTrackPieces([measure(4), measure(4), measure(4)], emptyPattern(12), 96)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toMatchObject({
      label: '',
      groupId: null,
      timeSignature: { numerator: 4, denominator: 4 },
      subdivision: 'quarter',
      bpm: 96,
      repeats: 3,
    })
  })

  it('gives each piece a non-empty id, unique within the track', () => {
    const pieces = drumToClickTrackPieces([measure(4), measure(3)], emptyPattern(7), 120)
    expect(pieces).toHaveLength(2)
    for (const p of pieces) expect(p.id).toMatch(/^[a-z0-9]+$/)
    expect(new Set(pieces.map((p) => p.id)).size).toBe(2)
  })

  it('colours pieces from the shared run palette in order, cycling after its length', () => {
    const count = CLICK_RUN_PALETTE.length + 2
    const measures = Array.from({ length: count }, (_, i) => measure(i + 1))
    const total = measures.reduce((n, m) => n + m.timeSignature.beats, 0)
    const pieces = drumToClickTrackPieces(measures, emptyPattern(total), 120)
    expect(pieces).toHaveLength(count)
    pieces.forEach((p, i) => expect(p.color).toBe(CLICK_RUN_PALETTE[i % CLICK_RUN_PALETTE.length]))
    expect(pieces[CLICK_RUN_PALETTE.length]!.color).toBe(pieces[0]!.color)
  })

  it('splits measures that have the same time signature but a different hit pattern', () => {
    const pattern = emptyPattern(8)
    pattern.kick[4] = true // first beat of the second measure only
    const pieces = drumToClickTrackPieces([measure(4), measure(4)], pattern, 120)
    expect(pieces.map((p) => p.repeats)).toEqual([1, 1])
  })

  it('splits on a time signature change', () => {
    const pieces = drumToClickTrackPieces([measure(4), measure(4), measure(3)], emptyPattern(11), 120)
    expect(pieces.map((p) => [p.timeSignature.numerator, p.repeats])).toEqual([[4, 2], [3, 1]])
  })

  it.each([
    [undefined, 'quarter'],
    [1, 'quarter'],
    [2, 'eighth'],
    [3, 'eighth-triplet'],
    [4, 'sixteenth'],
  ] as const)('maps %s steps per beat to the %s subdivision', (stepsPerBeat, expected) => {
    const m = measure(4, 4, stepsPerBeat)
    const [piece] = drumToClickTrackPieces([m], emptyPattern(4 * (stepsPerBeat ?? 1)), 120)
    expect(piece!.subdivision).toBe(expected)
  })

  it('treats steps past the end of a pattern row as empty rather than failing', () => {
    const pieces = drumToClickTrackPieces([measure(4), measure(4)], emptyPattern(4), 120)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]!.repeats).toBe(2)
  })
})
