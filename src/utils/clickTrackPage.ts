import { BAND_TRACK_HANDOFF_KEY, parseBandTrackHandoff, type BandTrackHandoff } from '../clickTrackBand'

/** Longest share link that survives common hosts and proxies (~8 KB). */
export const SHARE_URL_MAX_LENGTH = 8000

export const isShareTooLarge = (url: string): boolean => url.length > SHARE_URL_MAX_LENGTH

/**
 * Writes the page state to localStorage. Returns false instead of throwing when storage is full or
 * blocked (a throw inside the persisting effect would unmount the page).
 */
export function saveClickTrackState(key: string, state: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/**
 * The track the set list page left for the editor ("Open"), or null when there is none, it is
 * stale or invalid, or storage is blocked. Reading never throws. The key is NOT removed here (React
 * may run state initialisers twice); call `clearBandTrackHandoff` from an effect.
 */
export function readBandTrackHandoff(now = Date.now()): BandTrackHandoff | null {
  try {
    return parseBandTrackHandoff(sessionStorage.getItem(BAND_TRACK_HANDOFF_KEY), now)
  } catch {
    return null
  }
}

/** Forgets the hand-off so a later visit to the editor never offers it again. */
export function clearBandTrackHandoff(): void {
  try {
    sessionStorage.removeItem(BAND_TRACK_HANDOFF_KEY)
  } catch {
    /* storage blocked: nothing to forget */
  }
}
