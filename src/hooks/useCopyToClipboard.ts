import { useCallback } from 'react';
import { useFlashHighlight } from './useFlashHighlight';

/**
 * `[copied, copy]`: `copy(text)` resolves `false` when the browser refuses; `copied` flashes for 2 s.
 *
 * `copy` also takes a promise for the text, for copies that need a network call first. Safari only
 * honours the click's permission across that wait if the clipboard is handed the promise up front
 * (`ClipboardItem`); elsewhere it waits for the text and then writes it. If the promise itself
 * rejects, `copy` rejects with that error (it is not reported as a refusal).
 */
export function useCopyToClipboard(flashMs = 2000) {
  const [copied, flash] = useFlashHighlight(flashMs);
  const copy = useCallback(
    async (source: string | Promise<string>): Promise<boolean> => {
      const sourceFailure: { error?: unknown; failed?: true } = {};
      try {
        if (typeof source === 'string') {
          await navigator.clipboard.writeText(source);
        } else {
          const text = source.catch((error: unknown) => {
            sourceFailure.failed = true;
            sourceFailure.error = error;
            throw error;
          });
          if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function') {
            const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
            blob.catch(() => undefined); // reported through `text`; this only silences a duplicate report
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
          } else {
            await navigator.clipboard.writeText(await text);
          }
        }
        flash();
        return true;
      } catch {
        if (sourceFailure.failed) throw sourceFailure.error;
        return false;
      }
    },
    [flash],
  );
  return [copied, copy] as const;
}
