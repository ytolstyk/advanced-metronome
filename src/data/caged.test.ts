import { describe, it, expect } from 'vitest'
import { computeCAGEDBands } from './caged'

describe('computeCAGEDBands', () => {
  it('covers C major C-A-G-E-D positions in order up the neck', () => {
    const first = computeCAGEDBands(0, 24).filter((b) => b.startFret >= -1 && b.startFret < 11)
    expect(first.map((b) => b.name)).toEqual(['C', 'A', 'G', 'E', 'D'])
    expect(first[0]).toMatchObject({ startFret: -1, endFret: 4 })
    const starts = first.map((b) => b.startFret)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('repeats every octave and clamps to the neck', () => {
    const bands = computeCAGEDBands(0, 24)
    expect(bands.some((b) => b.name === 'C' && b.startFret === 11)).toBe(true)
    expect(Math.max(...bands.map((b) => b.endFret))).toBeLessThanOrEqual(24)
  })

  it('transposes by root pitch class', () => {
    const c = computeCAGEDBands(7, 24).find((b) => b.name === 'C')!
    expect(c.startFret).toBe(6)
  })
})
