import { useEffect, useRef } from 'react';

export function usePracticeTimer(isActive: boolean, onTick: () => void): void {
  const onTickRef = useRef(onTick);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => { onTickRef.current(); }, 1000);
    return () => clearInterval(id);
  }, [isActive]);
}
