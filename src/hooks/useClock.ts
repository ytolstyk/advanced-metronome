import { useEffect, useState } from 'react';

/** A ticking "now" so a page can disable slots as they start and move a time horizon (default: every minute). */
export function useClock(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
