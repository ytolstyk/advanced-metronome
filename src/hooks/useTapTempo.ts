import { useRef, useCallback, useState } from "react";

const MAX_TAP_GAP_MS = 3000;
const MIN_TAPS = 2;
const MAX_TAPS = 8;
const FLASH_MS = 150;

export function useTapTempo(
  onBpm: (bpm: number) => void,
  min: number,
  max: number,
): [tap: () => void, flashing: boolean] {
  const tapsRef = useRef<number[]>([]);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashing, setFlashing] = useState(false);

  const tap = useCallback(() => {
    // Flash the button
    setFlashing(true);
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashing(false), FLASH_MS);

    const now = performance.now();
    const taps = tapsRef.current;

    // Reset if too long since last tap
    if (taps.length > 0 && now - taps[taps.length - 1] > MAX_TAP_GAP_MS) {
      tapsRef.current = [];
    }

    tapsRef.current.push(now);

    // Keep only the most recent taps
    if (tapsRef.current.length > MAX_TAPS) {
      tapsRef.current = tapsRef.current.slice(-MAX_TAPS);
    }

    if (tapsRef.current.length < MIN_TAPS) return;

    const intervals: number[] = [];
    for (let i = 1; i < tapsRef.current.length; i++) {
      intervals.push(tapsRef.current[i] - tapsRef.current[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avgInterval);
    onBpm(Math.min(max, Math.max(min, bpm)));
  }, [onBpm, min, max]);

  return [tap, flashing];
}
