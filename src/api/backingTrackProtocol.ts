/**
 * How the app talks to the backing-track Lambda: its codes with their plain-language messages, the error the
 * app throws, and the transport (`run`) that turns the Lambda's JSON-string reply into a result or an error.
 * A leaf (no Amplify config, no storage): the cleanup helpers that `bandsApi` and `setListsApi` import build on it.
 * The codes themselves are defined once in `src/backingTrackFormat.ts`, shared with the Lambda.
 */
import {
  BACKING_TRACK_LIMITS,
  isBackingTrackErrorCode,
  type BackingTrackErrorCode,
} from '../backingTrackFormat';
import { FILE_TOO_BIG_MESSAGE } from '../backingTrackUtils';

export type BackingTrackCode = BackingTrackErrorCode;

export const CODE_MESSAGES: Record<BackingTrackCode, string> = {
  'uploads-disabled': 'Adding backing tracks is switched off for now.',
  'bad-input': "That file or name wasn't accepted.",
  'too-big': FILE_TOO_BIG_MESSAGE,
  'bad-file': "That doesn't look like a valid MP3, M4A, WAV or FLAC file.",
  'not-member': 'Only band members can add backing tracks.',
  banned: "You can't add backing tracks to this band.",
  'over-quota': `You've used up your backing track storage (${BACKING_TRACK_LIMITS.maxUserFiles} files). Remove some of yours first.`,
  'song-full': `This song already has ${BACKING_TRACK_LIMITS.maxPerSong} backing tracks.`,
  'band-full': `This band already has ${BACKING_TRACK_LIMITS.maxPerBand} backing tracks.`,
  'not-found': "That song or track isn't available any more.",
  replaced: 'Another upload took over. Please try again.',
  conflict: 'Something went wrong with that upload. Please try again.',
  forbidden: "You can't change that track.",
  gone: "You can't add to this song any more.",
  retry: "That didn't go through. Please try again in a moment.",
};

/** Not a Lambda code: the browser lost its connection to storage. */
export type BackingTrackFailure = BackingTrackCode | 'network';

export class BackingTrackError extends Error {
  readonly code: BackingTrackFailure;
  constructor(code: BackingTrackFailure, message?: string) {
    super(message ?? (code === 'network' ? 'The connection dropped. Check it and try again.' : CODE_MESSAGES[code]));
    this.name = 'BackingTrackError';
    this.code = code;
  }
}

type Reply<T> = ({ ok: true } & T) | { ok: false; code: BackingTrackCode };

/** Parses the Lambda's JSON-string reply; a transport failure becomes a plain `retry`, never a raw GraphQL error. */
export async function run<T>(call: () => Promise<{ data?: string | null; errors?: readonly unknown[] | null }>): Promise<T> {
  let res;
  try {
    res = await call();
  } catch (e) {
    console.warn('Backing track call failed', e);
    throw new BackingTrackError('retry');
  }
  if (!res.data) {
    console.warn('Backing track call returned no data', res.errors);
    throw new BackingTrackError('retry');
  }
  let reply: Reply<T>;
  try {
    reply = JSON.parse(res.data) as Reply<T>;
  } catch {
    throw new BackingTrackError('retry');
  }
  if (!reply.ok) throw new BackingTrackError(isBackingTrackErrorCode(reply.code) ? reply.code : 'retry');
  return reply;
}
