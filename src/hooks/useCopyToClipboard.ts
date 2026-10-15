import { useCallback } from 'react';
import { useFlashHighlight } from './useFlashHighlight';

/** `[copied, copy]`: `copy(text)` resolves `false` when the browser refuses; `copied` flashes for 2 s. */
export function useCopyToClipboard(flashMs = 2000) {
  const [copied, flash] = useFlashHighlight(flashMs);
  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        flash();
        return true;
      } catch {
        return false;
      }
    },
    [flash],
  );
  return [copied, copy] as const;
}
