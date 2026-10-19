import { useState } from 'react';
import { setSongColor } from '../api/songColorsApi';
import type { SetListView, SongColorKey, SongRecord } from '../bandTypes';
import { errorMessage } from '../lib/errors';
import { useOptimisticChoice } from './useOptimisticChoice';

/** Optimistic song colors on top of a loaded set list (see `useOptimisticChoice`). */
export function useSongColors(list: SetListView, fetchedAt: number) {
  const choices = useOptimisticChoice<SongColorKey>(fetchedAt);
  const [error, setError] = useState<string | null>(null);

  const colorFor = (songId: string): SongColorKey | undefined => {
    const pending = choices.pendingFor(songId);
    return pending ? (pending.value ?? undefined) : list.colors.get(songId);
  };

  const setColor = async (song: Pick<SongRecord, 'id' | 'bandId' | 'setListId'>, color: SongColorKey | null) => {
    setError(null);
    const hasOwnRow = list.myColorSongIds.has(song.id) || choices.hasWritten(song.id);
    try {
      await choices.run(song.id, color, () => setSongColor(song, color, hasOwnRow));
    } catch (e) {
      setError(errorMessage(e, 'Could not save the song color'));
    }
  };

  return { colorFor, setColor, error };
}
