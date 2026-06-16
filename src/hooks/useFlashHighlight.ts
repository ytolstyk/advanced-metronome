import { useCallback, useEffect, useRef, useState } from 'react';

// Briefly lights up a clicked card (chord/arpeggio grids) before fading back.
export function useFlashHighlight(durationMs = 400) {
  const [lit, setLit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLit(true);
    timerRef.current = setTimeout(() => setLit(false), durationMs);
  }, [durationMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return [lit, trigger] as const;
}
