import { useCallback, useEffect, useState } from 'react';
import { loadFromStorage } from '../api/storageUtils';
import {
  CUSTOM_INTERVALS_KEY,
  normalizeCustomIntervals,
  toggleCustomInterval,
} from '../utils/customScale';

/** Persisted (localStorage) custom-scale interval set for the Scales page. */
export function useCustomScaleIntervals() {
  const [intervals, setIntervals] = useState<number[]>(() =>
    normalizeCustomIntervals(loadFromStorage<unknown>(CUSTOM_INTERVALS_KEY, [])),
  );

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_INTERVALS_KEY, JSON.stringify(intervals));
    } catch { /* storage unavailable or full — selection just won't persist */ }
  }, [intervals]);

  const toggle = useCallback(
    (semitones: number) => setIntervals((prev) => toggleCustomInterval(prev, semitones)),
    [],
  );
  const replace = useCallback((next: number[]) => setIntervals(normalizeCustomIntervals(next)), []);

  return { intervals, toggle, replace };
}
