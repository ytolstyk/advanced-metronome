import { Amplify } from 'aws-amplify';
import { getUrl } from 'aws-amplify/storage';
import { BACKING_TRACK_LIMITS, sanitizeLabel } from '../backingTrackFormat';
import { backingTrackUploadsOn } from '../backingTrackFlags';
import { backingTrackFileName, inspectBackingTrackFile } from '../backingTrackUtils';
import type { InstrumentKey } from '../bandInstruments';
import type { SongRecord, ValidBackingTrack } from '../bandTypes';
import { errorMessage } from '../lib/errors';
import { hasBackingTrackModel } from './bandReads';
import { bandsClient as client, requireAuth } from './bandsShared';
import { BackingTrackError, run, type BackingTrackCode } from './backingTrackProtocol';

// The error type and codes live in the protocol leaf; re-exported so callers of this module need one import.
export { BackingTrackError };
export type { BackingTrackCode };

/** Reads the app config at call time: the frontend can go live before the storage stack exists. */
export function isBackingTracksReady(): boolean {
  return hasBackingTrackModel() && !!Amplify.getConfig().Storage?.S3?.bucket;
}

/** Whether new uploads are accepted (the backend's switch, published in amplify_outputs.json). Listening, editing and removing do not depend on it. */
export const areBackingTrackUploadsOn = (): boolean => isBackingTracksReady() && backingTrackUploadsOn();

// ── Uploading ───────────────────────────────────────────────────────────────

interface UploadTicket {
  trackId: string;
  slot: number;
  url: string;
  fields: Record<string, string>;
}

const HTTP_BAD_REQUEST = 400;

/**
 * What a failed POST to storage means. A 400 is the signed size limit being exceeded. Anything else (an
 * expired or altered form, a 5xx) is cured by asking for a fresh form, which is what `retry` tells the person.
 */
function codeForStorageStatus(status: number): BackingTrackCode {
  return status === HTTP_BAD_REQUEST ? 'too-big' : 'retry';
}

/**
 * POSTs the signed form straight to S3 with progress. Resolves on 2xx. The file part must come last
 * (S3 ignores everything after it), so it is appended after the signed fields.
 */
function postToS3(ticket: UploadTicket, file: File, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Cancelled before the request even started (e.g. while the signed form was being fetched): send nothing.
    if (signal?.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));

    const xhr = new XMLHttpRequest();
    const form = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
    form.append('file', file);

    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const done = () => signal?.removeEventListener('abort', abort);

    // Whole percents only: a 50 MB upload fires progress events many times a second.
    let lastPercent = -1;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const percent = Math.round((100 * event.loaded) / event.total);
      if (percent === lastPercent) return;
      lastPercent = percent;
      onProgress?.(percent / 100);
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new BackingTrackError(codeForStorageStatus(xhr.status)));
    };
    xhr.onerror = () => {
      done();
      reject(new BackingTrackError('network'));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    xhr.open('POST', ticket.url);
    xhr.send(form);
  });
}

export interface AddBackingTrackInput {
  song: Pick<SongRecord, 'id' | 'bandId'>;
  file: File;
  label: string;
  tags: readonly InstrumentKey[];
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Waits before each re-send of a commit that came back `retry`; the length is the number of re-sends. */
export const COMMIT_BACKOFF_MS = [400, 1_200] as const;

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });

/**
 * Asks the server to verify and attach the uploaded file. The commit is idempotent per track id, so a dropped
 * response or a `retry` is simply asked again, after a short wait (a throttled backend is not helped by being
 * hammered). Rejects with an AbortError if the person cancels.
 */
async function commitWithRetry(ticket: UploadTicket, input: AddBackingTrackInput, label: string): Promise<void> {
  const { song, tags, signal } = input;
  for (let attempt = 0; ; attempt += 1) {
    // Cancelled during the upload's last moments: do not attach the file after the person has backed out.
    signal?.throwIfAborted();
    try {
      await run<{ track: unknown }>(() =>
        client.mutations.commitBackingTrack({
          trackId: ticket.trackId,
          bandId: song.bandId,
          songId: song.id,
          slot: ticket.slot,
          label,
          tags: [...tags],
        }),
      );
      return;
    } catch (e) {
      const wait = COMMIT_BACKOFF_MS[attempt];
      const transient = e instanceof BackingTrackError && e.code === 'retry';
      if (!transient || wait === undefined) throw e;
      await pause(wait, signal);
    }
  }
}

/**
 * Request a signed form, send the file straight to storage, then ask the server to verify and attach
 * it. Validation problems are thrown as a `BackingTrackError('bad-input', message)` with a plain message.
 */
export async function addBackingTrack(input: AddBackingTrackInput): Promise<void> {
  const { file, label, onProgress, signal } = input;
  await requireAuth();
  const inspected = inspectBackingTrackFile(file);
  if ('problem' in inspected) throw new BackingTrackError('bad-input', inspected.problem);
  const cleanLabel = sanitizeLabel(label);
  if (!cleanLabel) throw new BackingTrackError('bad-input', 'Give the track a name.');

  const ticket = await run<UploadTicket>(() => client.mutations.requestBackingTrackUpload({ ext: inspected.ext, bytes: file.size }));
  await postToS3(ticket, file, onProgress, signal); // refuses to start when already cancelled
  await commitWithRetry(ticket, input, cleanLabel);
}

// ── Changing and removing ───────────────────────────────────────────────────

export async function editBackingTrack(trackId: string, label: string, tags: readonly InstrumentKey[]): Promise<void> {
  await requireAuth();
  const cleanLabel = sanitizeLabel(label);
  if (!cleanLabel) throw new BackingTrackError('bad-input', 'Give the track a name.');
  await run(() => client.mutations.editBackingTrack({ trackId, label: cleanLabel, tags: [...tags] }));
}

interface RemoveReply {
  results: { id: string; ok: boolean; code?: BackingTrackCode }[];
}

/** Removes tracks by id (the owner's own, or any in the band for the band owner). Throws if any could not be removed. */
export async function removeBackingTracks(trackIds: readonly string[]): Promise<void> {
  await requireAuth();
  const reply = await run<RemoveReply>(() => client.mutations.removeBackingTracks({ trackIds: [...trackIds] }));
  const failed = reply.results.find((r) => !r.ok);
  if (failed) throw new BackingTrackError(failed.code ?? 'retry');
}

// ── Playing and downloading ─────────────────────────────────────────────────

/** `attachment; filename="ascii.mp3"; filename*=UTF-8''encoded.mp3`, so any label downloads under its own name. */
function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export interface TrackUrlOptions {
  /** Save the file under the track's name instead of streaming it. Also checks the file exists first. */
  download?: boolean;
}

/**
 * A short-lived signed link to the stored file (any signed-in user may read; the key is unlistable).
 * The content type is forced to the track's own audio type, so a stored file is never served as a page.
 * Playing skips the existence check (the audio element reports a missing file, and costs no extra round
 * trip before the first sound); a download link does check, since following a dead one shows an XML error.
 */
export async function getBackingTrackUrl(
  track: Pick<ValidBackingTrack, 'key' | 'contentType' | 'label' | 'ext'>,
  { download = false }: TrackUrlOptions = {},
): Promise<string> {
  await requireAuth();
  try {
    const result = await getUrl({
      path: track.key,
      options: {
        expiresIn: BACKING_TRACK_LIMITS.linkSeconds,
        validateObjectExistence: download,
        contentType: track.contentType,
        ...(download ? { contentDisposition: attachmentHeader(backingTrackFileName(track)) } : {}),
      },
    });
    return result.url.toString();
  } catch (e) {
    console.warn('Could not link backing track', errorMessage(e));
    throw new BackingTrackError('not-found', "That file isn't available. It may have been removed.");
  }
}
