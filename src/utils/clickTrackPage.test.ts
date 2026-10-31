import { afterEach, describe, expect, it, vi } from 'vitest'
import { isShareTooLarge, saveClickTrackState, SHARE_URL_MAX_LENGTH } from './clickTrackPage'

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
