import { describe, it, expect } from 'vitest'
import { tabTrackToClickTrackPieces } from './tabToClickTrack'
import { CLICK_RUN_PALETTE } from './barRuns'
import type { MasterBar, TabTrack } from '../tabEditorTypes'

// Only `masterBars` and `measures.length` are read, so a minimal cast track is enough.
function track(masterBars: MasterBar[]): TabTrack {
  return { masterBars, measures: masterBars.map((_, i) => ({ id: `m${i}`, beats: [] })) } as unknown as TabTrack
}

const sig = (numerator: number, denominator: number) => ({ numerator, denominator })

describe('tabTrackToClickTrackPieces', () => {
  it('returns no pieces for an empty track', () => {
    expect(tabTrackToClickTrackPieces({ masterBars: [], measures: [] } as unknown as TabTrack)).toEqual([])
  })

  it('merges consecutive identical bars into one piece with a repeat count', () => {
    const pieces = tabTrackToClickTrackPieces(track([
      { timeSignature: sig(4, 4), bpm: 120 },
      { timeSignature: sig(4, 4) },
      { timeSignature: sig(4, 4) },
    ]))
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toMatchObject({
      label: '4/4 ♩=120',
      timeSignature: sig(4, 4),
      bpm: 120,
      repeats: 3,
      subdivision: 'quarter',
      groupId: null,
    })
  })

  it('splits on a tempo change and on a time-signature change, carrying the tempo forward', () => {
    const pieces = tabTrackToClickTrackPieces(track([
      { timeSignature: sig(4, 4), bpm: 100 },
      { timeSignature: sig(3, 4) },
      { timeSignature: sig(3, 4), bpm: 140 },
    ]))
    expect(pieces.map(p => [p.timeSignature.numerator, p.timeSignature.denominator, p.bpm, p.repeats])).toEqual([
      [4, 4, 100, 1],
      [3, 4, 100, 1],
      [3, 4, 140, 1],
    ])
  })

  it('cycles the 8-colour palette and does not cap repeats at 99', () => {
    const many = Array.from({ length: 150 }, () => ({ timeSignature: sig(4, 4) } as MasterBar))
    many[0] = { timeSignature: sig(4, 4), bpm: 90 }
    const [single] = tabTrackToClickTrackPieces(track(many))
    expect(single!.repeats).toBe(150)

    const alternating = Array.from({ length: 10 }, (_, i) => ({ timeSignature: sig(i % 2 ? 3 : 4, 4) } as MasterBar))
    alternating[0] = { timeSignature: sig(4, 4), bpm: 90 }
    const colors = tabTrackToClickTrackPieces(track(alternating)).map(p => p.color)
    expect(colors).toHaveLength(10)
    expect(colors[8]).toBe(colors[0])
    expect(new Set(colors.slice(0, 8)).size).toBe(8)
  })

  it('gives every piece a unique id', () => {
    const pieces = tabTrackToClickTrackPieces(track([
      { timeSignature: sig(4, 4), bpm: 100 },
      { timeSignature: sig(3, 4) },
    ]))
    expect(new Set(pieces.map(p => p.id)).size).toBe(2)
  })
  it('gives every piece a non-empty id and a colour from the shared run palette', () => {
    const pieces = tabTrackToClickTrackPieces(track([
      { timeSignature: sig(4, 4), bpm: 100 },
      { timeSignature: sig(3, 4) },
      { timeSignature: sig(4, 4) },
    ]))
    expect(pieces).toHaveLength(3)
    pieces.forEach((p, i) => {
      expect(p.id).toMatch(/^[a-z0-9]+$/)
      expect(p.color).toBe(CLICK_RUN_PALETTE[i])
    })
  })

  it('defaults to 120 BPM when the first bar has no tempo', () => {
    const [piece] = tabTrackToClickTrackPieces(track([{ timeSignature: sig(4, 4) }]))
    expect(piece).toMatchObject({ bpm: 120, label: '4/4 ♩=120' })
  })

  it('only reads as many bars as there are measures', () => {
    const t = {
      masterBars: [{ timeSignature: sig(4, 4), bpm: 100 }, { timeSignature: sig(3, 4) }, { timeSignature: sig(2, 4) }],
      measures: [{ id: 'm0', beats: [] }, { id: 'm1', beats: [] }],
    } as unknown as TabTrack
    expect(tabTrackToClickTrackPieces(t).map(p => p.timeSignature.numerator)).toEqual([4, 3])
  })

  it('ignores extra measures that have no master bar', () => {
    const t = {
      masterBars: [{ timeSignature: sig(4, 4), bpm: 100 }],
      measures: [{ id: 'm0', beats: [] }, { id: 'm1', beats: [] }],
    } as unknown as TabTrack
    expect(tabTrackToClickTrackPieces(t)).toHaveLength(1)
    expect(tabTrackToClickTrackPieces(t)[0]!.repeats).toBe(1)
  })

  it('merges a bar that restates the same tempo into the run', () => {
    const pieces = tabTrackToClickTrackPieces(track([
      { timeSignature: sig(4, 4), bpm: 100 },
      { timeSignature: sig(4, 4), bpm: 100 },
    ]))
    expect(pieces).toHaveLength(1)
    expect(pieces[0]!.repeats).toBe(2)
  })
})
