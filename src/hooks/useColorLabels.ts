import { setColorLabel } from '../api/colorLabelsApi';
import { SONG_COLOR_KEYS, type SetListView, type SongColorKey } from '../bandTypes';
import { sanitizeColorLabel } from '../bandUtils';
import { errorMessage } from '../lib/errors';
import { useOptimisticChoice } from './useOptimisticChoice';

/** Optimistic band color labels on top of a loaded set list (see `useOptimisticChoice`). */
export function useColorLabels(bandId: string, list: SetListView, fetchedAt: number) {
  const choices = useOptimisticChoice<string>(fetchedAt);

  /** The band's label per color as shown right now (pending writes win until the server catches up). */
  const labels = new Map<SongColorKey, string>();
  for (const color of SONG_COLOR_KEYS) {
    const pending = choices.pendingFor(color);
    const label = pending ? pending.value : list.colorLabels.get(color);
    if (label) labels.set(color, label);
  }

  /**
   * Writes the labels named in `next` (cleared = `''`) that differ from what is shown, all attempted
   * even if one fails. Colors absent from `next` are never touched, so a stale dialog can't overwrite
   * a rename another member made meanwhile. Rejects with a single message when any write failed so
   * the dialog can stay open.
   */
  const saveLabels = async (next: Partial<Record<SongColorKey, string>>): Promise<void> => {
    const changes = SONG_COLOR_KEYS.flatMap((color) => {
      if (next[color] === undefined) return [];
      const value = sanitizeColorLabel(next[color]);
      return value === (labels.get(color) ?? '') ? [] : [{ color, value }];
    });
    const results = await Promise.allSettled(
      changes.map(({ color, value }) => {
        const hasOwnRow = list.myLabelColors.has(color) || choices.hasWritten(color);
        return choices.run(color, value, () => setColorLabel(bandId, color, value, hasOwnRow));
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw new Error(errorMessage(failed.reason, 'Could not save the color labels'));
  };

  return { labels, saveLabels };
}
