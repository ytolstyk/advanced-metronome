// Helpers for the Scales page "custom" mode: a user-chosen set of semitone
// offsets from the root. The root (0) is always included.

export const CUSTOM_MODE = 'custom';
export const CUSTOM_INTERVALS_KEY = 'scales-customIntervals';
export const ROOT_INTERVAL = 0;
export const SEMITONES_PER_OCTAVE = 12;

const MAX_INTERVAL = SEMITONES_PER_OCTAVE - 1;
const MODE_PREFIX = `${CUSTOM_MODE}:`;

/** Coerces untrusted input into a sorted, de-duplicated interval list that always contains the root. */
export function normalizeCustomIntervals(raw: unknown): number[] {
  const valid = Array.isArray(raw)
    ? raw.filter((n): n is number => Number.isInteger(n) && n > ROOT_INTERVAL && n <= MAX_INTERVAL)
    : [];
  return [ROOT_INTERVAL, ...Array.from(new Set(valid)).sort((a, b) => a - b)];
}

/** Adds the interval if absent, removes it if present. The root can never be removed. */
export function toggleCustomInterval(intervals: number[], semitones: number): number[] {
  if (semitones === ROOT_INTERVAL) return intervals;
  return normalizeCustomIntervals(
    intervals.includes(semitones) ? intervals.filter((n) => n !== semitones) : [...intervals, semitones],
  );
}

/** Serialises a custom scale into a mode string (e.g. "custom:0,3,7") for share links and cloud tracks. */
export function encodeCustomMode(intervals: number[]): string {
  return `${MODE_PREFIX}${normalizeCustomIntervals(intervals).join(',')}`;
}

/** Parses a mode string produced by `encodeCustomMode`; returns null for anything else. */
export function parseCustomMode(mode: string): number[] | null {
  if (!mode.startsWith(MODE_PREFIX)) return null;
  const parts = mode.slice(MODE_PREFIX.length).split(',').map(Number);
  return normalizeCustomIntervals(parts);
}
