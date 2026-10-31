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
