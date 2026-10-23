import { AVAILABILITY_LIMITS } from '../bandTypes';
import { MIN_LENGTH_CHOICES } from '../availabilityWindows';
import { usePersistedState } from './usePersistedState';

export interface AvailabilityPrefs {
  /** Shortest window "Best times" suggests, in half-hour slots (one of `MIN_LENGTH_CHOICES`). */
  minSlots: number;
}

const PREFS_KEY = 'availability-prefs';

/** Whatever is stored, as valid preferences (a damaged entry falls back field by field). */
export function parsePrefs(stored: unknown): AvailabilityPrefs {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Partial<AvailabilityPrefs>;
  const choice = MIN_LENGTH_CHOICES.find((c) => c.slots === raw.minSlots);
  return { minSlots: choice?.slots ?? AVAILABILITY_LIMITS.defaultMinSlots };
}

export const useAvailabilityPrefs = () => usePersistedState(PREFS_KEY, parsePrefs);

/**
 * Whether this person (on this device) has seen what saving availability shares. Nothing is written
 * to the cloud before they have.
 */
export function useDisclosureNotice(bandId: string, sub: string) {
  const [accepted, setAccepted] = usePersistedState(`availability-notice:${bandId}:${sub}`, (stored) => stored === true);
  return { accepted, accept: () => setAccepted(true) };
}
