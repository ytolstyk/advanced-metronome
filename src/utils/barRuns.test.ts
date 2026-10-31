import { describe, it, expect } from 'vitest'
import { groupBarRuns, CLICK_RUN_PALETTE, newPieceId, type BarShape } from './barRuns'

const bar = (numerator: number, denominator: number, bpm: number, extra: Record<string, unknown> = {}): BarShape & Record<string, unknown> =>
  ({ numerator, denominator, bpm, ...extra })

describe('groupBarRuns', () => {
  it('returns no runs for no bars', () => {
    expect(groupBarRuns([])).toEqual([])
  })

  it('groups consecutive bars of the same signature and tempo', () => {
    const runs = groupBarRuns([bar(4, 4, 120), bar(4, 4, 120), bar(3, 4, 120), bar(3, 4, 90), bar(3, 4, 90)])
    expect(runs.map(r => [r.start, r.repeats])).toEqual([[0, 2], [2, 1], [3, 2]])
  })

  it('does not merge equal bars that are separated by a different one', () => {
    const runs = groupBarRuns([bar(5, 8, 109), bar(7, 8, 109), bar(5, 8, 109), bar(7, 8, 109)])
    expect(runs).toHaveLength(4)
  })

  it('chunks long runs at maxRepeats', () => {
    const bars = Array.from({ length: 250 }, () => bar(4, 4, 123))
    const runs = groupBarRuns(bars, { maxRepeats: 99 })
    expect(runs.map(r => [r.start, r.repeats])).toEqual([[0, 99], [99, 99], [198, 52]])
  })

  it('forces a new run where breakBefore says so, even for an identical bar', () => {
    const bars = [bar(4, 4, 120), bar(4, 4, 120, { cut: true }), bar(4, 4, 120)]
    const runs = groupBarRuns(bars, { breakBefore: (b) => 'cut' in b })
    expect(runs.map(r => [r.start, r.repeats])).toEqual([[0, 1], [1, 2]])
  })

  it('passes the previous bar to breakBefore', () => {
    const bars = [bar(4, 4, 120, { pickup: true }), bar(4, 4, 120), bar(4, 4, 120)]
    const runs = groupBarRuns(bars, { breakBefore: (_b, _i, prev) => 'pickup' in prev })
    expect(runs.map(r => [r.start, r.repeats])).toEqual([[0, 1], [1, 2]])
  })

  it('exposes an 8-colour palette', () => {
    expect(CLICK_RUN_PALETTE).toHaveLength(8)
  })
})

describe('groupBarRuns edge cases', () => {
  it('makes one run of one bar for a single bar', () => {
    const runs = groupBarRuns([bar(4, 4, 120)])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ start: 0, repeats: 1 })
  })

  it('keeps the first bar of each run as `first`', () => {
    const a = bar(4, 4, 120, { id: 'a' })
    const b = bar(4, 4, 120, { id: 'b' })
    const c = bar(3, 4, 120, { id: 'c' })
    const runs = groupBarRuns([a, b, c])
    expect(runs[0]!.first).toBe(a)
    expect(runs[1]!.first).toBe(c)
  })

  it('never calls breakBefore for the first bar (there is no previous bar)', () => {
    const calls: number[] = []
    groupBarRuns([bar(4, 4, 120), bar(4, 4, 120)], { breakBefore: (_b, i) => { calls.push(i); return false } })
    expect(calls).toEqual([1])
  })

  it('does not ask breakBefore when the shape already differs', () => {
    let asked = 0
    groupBarRuns([bar(4, 4, 120), bar(4, 4, 121)], { breakBefore: () => { asked++; return false } })
    expect(asked).toBe(0)
  })

  it('treats a different denominator or tempo as a different shape', () => {
    expect(groupBarRuns([bar(4, 4, 120), bar(4, 8, 120)])).toHaveLength(2)
    expect(groupBarRuns([bar(4, 4, 120), bar(4, 4, 119)])).toHaveLength(2)
    expect(groupBarRuns([bar(4, 4, 120), bar(2, 4, 120)])).toHaveLength(2)
  })

  it('starts a fresh run of the same shape after maxRepeats, and keeps counting into it', () => {
    const runs = groupBarRuns(Array.from({ length: 5 }, () => bar(4, 4, 100)), { maxRepeats: 2 })
    expect(runs.map(r => [r.start, r.repeats])).toEqual([[0, 2], [2, 2], [4, 1]])
  })

  it('applies maxRepeats of exactly the run length without splitting', () => {
    const runs = groupBarRuns(Array.from({ length: 3 }, () => bar(4, 4, 100)), { maxRepeats: 3 })
    expect(runs.map(r => r.repeats)).toEqual([3])
  })

  it('combines maxRepeats and breakBefore', () => {
    const bars = Array.from({ length: 6 }, (_, i) => bar(4, 4, 100, { cut: i === 3 }))
    const runs = groupBarRuns(bars, { maxRepeats: 2, breakBefore: (b) => b.cut === true })
    expect(runs.map(r => [r.start, r.repeats])).toEqual([[0, 2], [2, 1], [3, 2], [5, 1]])
  })

  it('does not mutate the input', () => {
    const bars = Object.freeze([bar(4, 4, 120), bar(4, 4, 120)])
    expect(() => groupBarRuns(bars)).not.toThrow()
  })
})

describe('newPieceId', () => {
  it('returns a short alphanumeric id', () => {
    for (let i = 0; i < 20; i++) expect(newPieceId()).toMatch(/^[a-z0-9]{1,8}$/)
  })

  it('does not collide across a few hundred ids', () => {
    expect(new Set(Array.from({ length: 300 }, () => newPieceId())).size).toBe(300)
  })
})

describe('CLICK_RUN_PALETTE', () => {
  it('holds distinct hex colours', () => {
    expect(new Set(CLICK_RUN_PALETTE).size).toBe(CLICK_RUN_PALETTE.length)
    for (const c of CLICK_RUN_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })
})
