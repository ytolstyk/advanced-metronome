import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { BAND_LIMITS } from '../bandTypes';
import { normalizeHttpUrl, sanitizeText } from '../bandUtils';
import { planLookup } from '../../amplify/functions/song-metadata/parse';
import { requireAuth } from './bandsShared';

const client = generateClient<Schema>();

export interface SongLinkMetadata {
  title: string;
  artist: string;
}

/** Whether the link is one the lookup can read (same allow-list the server enforces), so other links cost no request. */
export const isLookupSupported = (url: string): boolean => planLookup(url) !== null;

/**
 * Title and artist read from a Spotify / YouTube / Apple Music / SoundCloud link, or `null` when
 * the link isn't one of those or has nothing readable. Signed in only (the lookup runs server-side).
 * The result is untrusted text: it is sanitised and clamped here like any typed field.
 */
export async function lookupSongLink(rawUrl: string): Promise<SongLinkMetadata | null> {
  await requireAuth();
  const url = normalizeHttpUrl(rawUrl);
  if (!url || url.length > BAND_LIMITS.urlMax || !isLookupSupported(url)) return null;

  const { data, errors } = await client.queries.lookupSongLink({ url });
  if (errors?.length) {
    console.warn('lookupSongLink failed', errors[0]?.message);
    throw new Error('Could not look up that link.');
  }
  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const { title, artist } = (parsed ?? {}) as Record<string, unknown>;
  const cleanTitle = typeof title === 'string' ? sanitizeText(title, BAND_LIMITS.titleMax) : '';
  if (!cleanTitle) return null;
  return { title: cleanTitle, artist: typeof artist === 'string' ? sanitizeText(artist, BAND_LIMITS.artistMax) : '' };
}
