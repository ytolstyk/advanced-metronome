import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBandTrackHandoff, isShareTooLarge, readBandTrackHandoff, saveClickTrackState, SHARE_URL_MAX_LENGTH } from './clickTrackPage'
import { BAND_TRACK_HANDOFF_KEY, serializeBandTrackHandoff } from '../clickTrackBand'
import type { TrackPiece } from '../audio/ClickTrackEngine'

describe('isShareTooLarge', () => {
  it('allows a link up to the limit and refuses one character more', () => {
    expect(isShareTooLarge('x'.repeat(SHARE_URL_MAX_LENGTH))).toBe(false)
    expect(isShareTooLarge('x'.repeat(SHARE_URL_MAX_LENGTH + 1))).toBe(true)
  })
})

describe('saveClickTrackState', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('stores the JSON and returns true', () => {
    expect(saveClickTrackState('k', { a: 1 })).toBe(true)
    expect(localStorage.getItem('k')).toBe('{"a":1}')
  })

  it('returns false instead of throwing when storage rejects the write, and recovers afterwards', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(saveClickTrackState('k', { a: 1 })).toBe(false)
    expect(saveClickTrackState('k', { a: 2 })).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(2)
  })
})

describe('band track hand-off storage', () => {
  const piece: TrackPiece = {
    id: 'p1', label: 'Verse', color: '#8b5cf6', groupId: null, timeSignature: { numerator: 4, denominator: 4 },
    subdivision: 'quarter', bpm: 120, repeats: 4,
  }
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('reads a fresh hand-off without removing it, and clear forgets it', () => {
    sessionStorage.setItem(BAND_TRACK_HANDOFF_KEY, serializeBandTrackHandoff({ pieces: [piece], groups: [] }, 'Black Dog', 1_000))
    expect(readBandTrackHandoff(1_500)).toEqual({ pieces: [piece], groups: [], title: 'Black Dog' })
    expect(readBandTrackHandoff(1_500)).not.toBeNull() // reading is repeatable (state initialisers may run twice)
    clearBandTrackHandoff()
    expect(sessionStorage.getItem(BAND_TRACK_HANDOFF_KEY)).toBeNull()
    expect(readBandTrackHandoff(1_500)).toBeNull()
  })

  it('is null for nothing, a stale entry or garbage', () => {
    expect(readBandTrackHandoff()).toBeNull()
    sessionStorage.setItem(BAND_TRACK_HANDOFF_KEY, serializeBandTrackHandoff({ pieces: [piece], groups: [] }, 'x', 1_000))
    expect(readBandTrackHandoff(1_000 + 10 * 60_000)).toBeNull()
    sessionStorage.setItem(BAND_TRACK_HANDOFF_KEY, '{oops')
    expect(readBandTrackHandoff()).toBeNull()
  })

  it('never throws when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readBandTrackHandoff()).toBeNull()
    expect(() => clearBandTrackHandoff()).not.toThrow()
  })
})
