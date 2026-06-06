import { describe, it, expect } from 'vitest'
import { getBpmAtRepetition } from '../ClickTrackEngine'
import type { TrackPiece } from '../ClickTrackEngine'

function makePiece(overrides: Partial<TrackPiece> = {}): TrackPiece {
  return {
    id: 'test',
    label: 'Test',
    color: '#000',
    groupId: null,
    timeSignature: { numerator: 4, denominator: 4 },
    subdivision: 'quarter',
    bpm: 120,
    repeats: 8,
    ...overrides,
  }
}

describe('getBpmAtRepetition', () => {
  // ── Fixed tempo ──────────────────────────────────────────────────────────

  it('returns piece.bpm unchanged when rampMode is undefined', () => {
    const piece = makePiece({ bpm: 120 })
    expect(getBpmAtRepetition(piece, 0)).toBe(120)
    expect(getBpmAtRepetition(piece, 4)).toBe(120)
    expect(getBpmAtRepetition(piece, 7)).toBe(120)
  })

  it('returns piece.bpm unchanged when rampEndBpm is undefined even if rampMode is set', () => {
    const piece = makePiece({ bpm: 100, rampMode: 'linear' })
    expect(getBpmAtRepetition(piece, 0)).toBe(100)
    expect(getBpmAtRepetition(piece, 3)).toBe(100)
  })

  it('returns piece.bpm unchanged when rampEndBpm is undefined and mode is stepped', () => {
    const piece = makePiece({ bpm: 80, rampMode: 'stepped' })
    expect(getBpmAtRepetition(piece, 0)).toBe(80)
    expect(getBpmAtRepetition(piece, 7)).toBe(80)
  })

  // ── Linear ramp ──────────────────────────────────────────────────────────

  it('linear: rep=0 returns startBpm exactly', () => {
    const piece = makePiece({ bpm: 80, rampEndBpm: 160, rampMode: 'linear', repeats: 9 })
    expect(getBpmAtRepetition(piece, 0)).toBe(80)
  })

  it('linear: rep=repeats-1 returns endBpm exactly', () => {
    const piece = makePiece({ bpm: 80, rampEndBpm: 160, rampMode: 'linear', repeats: 9 })
    expect(getBpmAtRepetition(piece, 8)).toBe(160)
  })

  it('linear: middle rep interpolates correctly', () => {
    // repeats=5 → t at rep=2 is 2/4=0.5 → 80 + (160-80)*0.5 = 120
    const piece = makePiece({ bpm: 80, rampEndBpm: 160, rampMode: 'linear', repeats: 5 })
    expect(getBpmAtRepetition(piece, 2)).toBeCloseTo(120)
  })

  it('linear: quarter-point interpolation', () => {
    // repeats=5 → t at rep=1 is 1/4=0.25 → 80 + 80*0.25 = 100
    const piece = makePiece({ bpm: 80, rampEndBpm: 160, rampMode: 'linear', repeats: 5 })
    expect(getBpmAtRepetition(piece, 1)).toBeCloseTo(100)
  })

  it('linear: ramp down interpolates correctly', () => {
    // startBpm=160, endBpm=80, repeats=5, rep=2 → t=0.5 → 160 + (80-160)*0.5 = 120
    const piece = makePiece({ bpm: 160, rampEndBpm: 80, rampMode: 'linear', repeats: 5 })
    expect(getBpmAtRepetition(piece, 2)).toBeCloseTo(120)
  })

  it('linear: repeats=1 always returns startBpm (no divide-by-zero)', () => {
    const piece = makePiece({ bpm: 100, rampEndBpm: 200, rampMode: 'linear', repeats: 1 })
    expect(getBpmAtRepetition(piece, 0)).toBe(100)
  })

  it('linear: repeats=1 is stable for non-zero repetition values', () => {
    // Edge: caller passes rep > 0 even though repeats=1 — should still return startBpm
    const piece = makePiece({ bpm: 100, rampEndBpm: 200, rampMode: 'linear', repeats: 1 })
    expect(getBpmAtRepetition(piece, 5)).toBe(100)
  })

  // ── Stepped ramp ─────────────────────────────────────────────────────────

  it('stepped: rep=0 returns startBpm', () => {
    const piece = makePiece({
      bpm: 100, rampEndBpm: 140, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 4, repeats: 16,
    })
    expect(getBpmAtRepetition(piece, 0)).toBe(100)
  })

  it('stepped: first step boundary (rep=stepMeasures) increments by stepSize', () => {
    // reps 0-3 → step 0 → 100; reps 4-7 → step 1 → 105
    const piece = makePiece({
      bpm: 100, rampEndBpm: 140, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 4, repeats: 16,
    })
    expect(getBpmAtRepetition(piece, 3)).toBe(100)
    expect(getBpmAtRepetition(piece, 4)).toBe(105)
    expect(getBpmAtRepetition(piece, 7)).toBe(105)
  })

  it('stepped: second step boundary increments again', () => {
    // reps 8-11 → step 2 → 110
    const piece = makePiece({
      bpm: 100, rampEndBpm: 140, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 4, repeats: 16,
    })
    expect(getBpmAtRepetition(piece, 8)).toBe(110)
  })

  it('stepped: clamps to endBpm when ramp goes up', () => {
    // startBpm=100, endBpm=110, stepSize=5, stepMeasures=4
    // step 0→100, step 1→105, step 2 would be 110 (clamped), step 3 also 110
    const piece = makePiece({
      bpm: 100, rampEndBpm: 110, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 4, repeats: 20,
    })
    expect(getBpmAtRepetition(piece, 8)).toBe(110)   // step 2 → raw 110, clamped 110
    expect(getBpmAtRepetition(piece, 12)).toBe(110)  // step 3 → raw 115, clamped to 110
    expect(getBpmAtRepetition(piece, 16)).toBe(110)  // step 4 → raw 120, clamped to 110
  })

  it('stepped: ramp down applies negative direction and clamps to endBpm', () => {
    // startBpm=140, endBpm=100, stepSize=5 (direction=-1)
    // step 0→140, step 1→135, step 2→130 ... clamped at 100
    const piece = makePiece({
      bpm: 140, rampEndBpm: 100, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 4, repeats: 20,
    })
    expect(getBpmAtRepetition(piece, 0)).toBe(140)
    expect(getBpmAtRepetition(piece, 4)).toBe(135)
    expect(getBpmAtRepetition(piece, 8)).toBe(130)
  })

  it('stepped: ramp down clamps to endBpm (does not go below it)', () => {
    // startBpm=110, endBpm=100, stepSize=5, stepMeasures=4
    // step 0→110, step 1→105, step 2 raw=100 (exact), step 3 raw=95 clamped to 100
    const piece = makePiece({
      bpm: 110, rampEndBpm: 100, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 4, repeats: 20,
    })
    expect(getBpmAtRepetition(piece, 8)).toBe(100)   // step 2 exact
    expect(getBpmAtRepetition(piece, 12)).toBe(100)  // step 3 clamped
  })

  it('stepped: uses default stepSize=5 when not specified', () => {
    // No rampStepSize provided → defaults to 5
    // stepMeasures defaults to 4 → rep 4 should be startBpm + 5
    const piece = makePiece({
      bpm: 100, rampEndBpm: 160, rampMode: 'stepped',
      repeats: 20,
    })
    expect(getBpmAtRepetition(piece, 0)).toBe(100)
    expect(getBpmAtRepetition(piece, 4)).toBe(105)
  })

  it('stepped: uses default stepMeasures=4 when not specified', () => {
    // No rampStepMeasures provided → defaults to 4
    // rep 3 → floor(3/4)=0 → startBpm; rep 4 → floor(4/4)=1 → startBpm + stepSize
    const piece = makePiece({
      bpm: 100, rampEndBpm: 160, rampMode: 'stepped',
      rampStepSize: 10, repeats: 20,
    })
    expect(getBpmAtRepetition(piece, 3)).toBe(100)
    expect(getBpmAtRepetition(piece, 4)).toBe(110)
  })

  it('stepped: stepMeasures=0 is treated as 1 (no infinite loop)', () => {
    // rampStepMeasures=0 → Math.max(1, 0) = 1 → each rep increments
    const piece = makePiece({
      bpm: 100, rampEndBpm: 160, rampMode: 'stepped',
      rampStepSize: 5, rampStepMeasures: 0, repeats: 8,
    })
    expect(getBpmAtRepetition(piece, 0)).toBe(100)
    expect(getBpmAtRepetition(piece, 1)).toBe(105)
    expect(getBpmAtRepetition(piece, 2)).toBe(110)
  })
})
