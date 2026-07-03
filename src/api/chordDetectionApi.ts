import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { ROOT_NOTES, CHORD_TYPES } from '../data/chords';
import type { RootNote, ChordType } from '../data/chords';
import { isAuthenticated } from './authUtils';
import { isYoutubeShorts, extractVideoId } from '../utils/youtubeUrl';

const client = generateClient<Schema>();

export interface ChordDetectionResult {
  /** Raw validated chords from Gemini — may be more than 8; callers decide how many to use */
  chords: Array<{ root: RootNote; type: ChordType }>;
  detectedBpm: number;
  /** Validated key root, e.g. "A". Empty string if Gemini was uncertain or returned an invalid value. */
  detectedKeyRoot: string;
  /** "major" or "minor". Empty string if unknown. */
  detectedKeyMode: string;
}

type ChordDetectionStatus = 'ok' | 'no_chords' | 'video_unavailable' | 'error';

const CHORD_STATUS_MESSAGES: Record<ChordDetectionStatus, string> = {
  ok: '',
  no_chords: 'No chords detected in this section — try a different time range.',
  video_unavailable: 'Could not access this video. Check that it is public and try again.',
  error: 'Analysis failed — please try again.',
};

function validateChordList(rawChords: unknown[]): Array<{ root: RootNote; type: ChordType }> {
  return rawChords.flatMap((c) => {
    if (typeof c !== 'object' || c === null) return [];
    const { root, type } = c as Record<string, unknown>;
    if (typeof root !== 'string' || typeof type !== 'string') return [];
    if (!(ROOT_NOTES as readonly string[]).includes(root)) return [];
    if (!(CHORD_TYPES as readonly string[]).includes(type)) return [];
    return [{ root: root as RootNote, type: type as ChordType }];
  });
}

function parseDetectedKey(raw: unknown): { detectedKeyRoot: string; detectedKeyMode: string } {
  const keyStr = typeof raw === 'string' ? raw : '';
  const [keyRoot = '', keyMode = ''] = keyStr.split(' ');
  const valid =
    (ROOT_NOTES as readonly string[]).includes(keyRoot) &&
    (['major', 'minor'] as readonly string[]).includes(keyMode);
  return valid
    ? { detectedKeyRoot: keyRoot, detectedKeyMode: keyMode }
    : { detectedKeyRoot: '', detectedKeyMode: '' };
}

export async function detectChordProgression(
  url: string,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
): Promise<ChordDetectionResult> {
  if (!(await isAuthenticated())) throw new Error('Sign in to use chord detection.');

  if (isYoutubeShorts(url)) {
    throw new Error('YouTube Shorts links are not supported — use a standard youtube.com/watch link.');
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Please enter a valid YouTube URL (e.g. https://youtube.com/watch?v=...)');
  }
  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // AppSync has a ~30s ceiling; race against it so the UI never waits indefinitely
  const CHORD_CLIENT_TIMEOUT_MS = 30_000;
  const queryPromise = client.queries.detectChordProgression({ url: cleanUrl, startSec, endSec });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Analysis timed out — try a shorter clip or try again.')),
      CHORD_CLIENT_TIMEOUT_MS,
    );
    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Analysis cancelled', 'AbortError'));
    }, { once: true });
  });
  // .finally() clears the timer whether the query resolves or rejects, preventing a leak
  const { data, errors } = await Promise.race([queryPromise, timeoutPromise])
    .finally(() => clearTimeout(timeoutId));

  if (errors?.length) throw new Error(CHORD_STATUS_MESSAGES.error);
  if (!data) throw new Error('No response from analysis service.');

  let parsed: { status: string; detectedBpm: number; detectedKey: string; chords: unknown[] };
  try {
    parsed = JSON.parse(data) as typeof parsed;
  } catch {
    throw new Error(CHORD_STATUS_MESSAGES.error);
  }

  const status = parsed.status as ChordDetectionStatus;
  if (status !== 'ok') {
    throw new Error(CHORD_STATUS_MESSAGES[status] ?? CHORD_STATUS_MESSAGES.error);
  }

  const chords = validateChordList(Array.isArray(parsed.chords) ? parsed.chords : []);

  if (chords.length === 0) {
    throw new Error('No recognizable chords in this section — try a different time range or a section with clearer harmony.');
  }

  return {
    chords,
    detectedBpm: typeof parsed.detectedBpm === 'number' ? parsed.detectedBpm : 0,
    ...parseDetectedKey(parsed.detectedKey),
  };
}
