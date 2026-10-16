import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { NotSignedInError } from '../api/bandsShared';
import { isLookupSupported, lookupSongLink } from '../api/songMetadataApi';
import { normalizeHttpUrl, parseLinkInput, type RawSongInput } from '../bandUtils';

export type AutofillStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'found'; title: string; artist: string }
  | { kind: 'failed' } // the link has nothing readable
  | { kind: 'error' } // the lookup itself failed (network, throttled); worth retrying
  | { kind: 'signedOut' };

const IDLE: AutofillStatus = { kind: 'idle' };
const NO_TEXT = { title: '', artist: '' };

/**
 * Fills a song form's title and artist from a pasted music link.
 *
 * Only fields that are empty, or still hold what an earlier lookup wrote, are replaced, so text the
 * person typed is never overwritten. Each link is looked up once (failures too, except a thrown
 * error, which may be retried); links that can't be looked up cost no request. A newer link, an
 * unusable link or `reset()` discards any lookup still in flight.
 *
 * @param initialUrl the link already saved with the song (editing), which needs no lookup.
 */
export function useSongLinkAutofill(setForm: Dispatch<SetStateAction<RawSongInput>>, initialUrl?: string) {
  const [status, setStatus] = useState<AutofillStatus>(IDLE);
  const seedUrl = normalizeHttpUrl(parseLinkInput(initialUrl)) ?? '';
  const attempted = useRef(seedUrl);
  const written = useRef(NO_TEXT);
  const token = useRef(0);

  const fillFromLink = useCallback(
    async (rawLink: string | undefined) => {
      const url = normalizeHttpUrl(parseLinkInput(rawLink));
      if (!url || !isLookupSupported(url)) {
        token.current++; // a lookup for the link that was here before must not land now
        attempted.current = '';
        setStatus(IDLE);
        return;
      }
      if (url === attempted.current) return;
      attempted.current = url;
      const mine = ++token.current;
      setStatus({ kind: 'busy' });

      let found: Awaited<ReturnType<typeof lookupSongLink>>;
      try {
        found = await lookupSongLink(url);
      } catch (e) {
        if (mine !== token.current) return;
        attempted.current = ''; // thrown, so the link itself may be fine: allow another try
        setStatus({ kind: e instanceof NotSignedInError ? 'signedOut' : 'error' });
        return;
      }
      if (mine !== token.current) return;
      if (!found) {
        setStatus({ kind: 'failed' });
        return;
      }

      const previous = written.current;
      const replaceable = (current: string | undefined, auto: string) => !current?.trim() || current === auto;
      setForm((f) => ({
        ...f,
        title: replaceable(f.title, previous.title) ? found.title : f.title,
        artist: replaceable(f.artist, previous.artist) ? found.artist : f.artist,
      }));
      written.current = { title: found.title, artist: found.artist };
      setStatus({ kind: 'found', title: found.title, artist: found.artist });
    },
    [setForm],
  );

  /** Forgets the link and drops any lookup in flight (dialog closed, or the song was saved). */
  const reset = useCallback(() => {
    token.current++;
    attempted.current = seedUrl;
    written.current = NO_TEXT;
    setStatus(IDLE);
  }, [seedUrl]);

  return { status, fillFromLink, reset };
}
