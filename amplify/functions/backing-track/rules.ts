/**
 * Pure rules for the backing-track Lambda: no AWS SDK, no I/O, so every decision here is unit-tested
 * with plain values. The handler core (injected S3 / DynamoDB clients) composes these.
 *
 * Shared contract (limits, key layout, labels, tags) lives in `src/backingTrackFormat.ts`.
 */
import {
  AUDIO_TYPES,
  BACKING_TRACK_LIMITS,
  PENDING_SLOTS,
  isAudioExt,
  type AudioContentType,
  type BackingTrackErrorCode,
  type AudioExt,
} from '../../../src/backingTrackFormat';

/**
 * A failure the client can show in plain language; `code` is the contract (defined and documented in the
 * shared `src/backingTrackFormat.ts`), `message` is for logs.
 */
export class BackingTrackError extends Error {
  readonly code: BackingTrackErrorCode;

  constructor(code: BackingTrackErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BackingTrackError';
    this.code = code;
  }
}

// ---- upload request -----------------------------------------------------------------------------

export interface UploadRequest {
  ext: AudioExt;
  bytes: number;
  contentType: AudioContentType;
}

/** Validates the `requestBackingTrackUpload` arguments. Throws `bad-input` / `too-big`. */
export function parseUploadRequest(args: { ext?: unknown; bytes?: unknown }): UploadRequest {
  if (!isAudioExt(args.ext)) throw new BackingTrackError('bad-input', 'unsupported file type');
  const { bytes } = args;
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1) {
    throw new BackingTrackError('bad-input', 'bad size');
  }
  if (bytes > BACKING_TRACK_LIMITS.maxBytes) throw new BackingTrackError('too-big');
  return { ext: args.ext, bytes, contentType: AUDIO_TYPES[args.ext] };
}

/** A pending slot chosen uniformly; `random` is injected so tests are deterministic. */
export function pickSlot(random: () => number = Math.random): number {
  return Math.min(PENDING_SLOTS - 1, Math.floor(random() * PENDING_SLOTS));
}

export interface UploadPolicyInput {
  key: string;
  contentType: AudioContentType;
  trackId: string;
  bytes: number;
}

export type PostCondition =
  | ['content-length-range', number, number]
  | ['eq', string, string]
  | Record<string, string>;

export interface UploadPolicy {
  fields: Record<string, string>;
  conditions: PostCondition[];
}

/**
 * What the signed upload form pins. S3 rejects any POST that differs: a different key, a different
 * content type, another `x-amz-meta-track`, or a body outside 1..bytes. Size is the real control (a
 * presigned PUT cannot cap it); the exact `Content-Type` and `trackId` are how `commit` later knows
 * the object is the one this request issued.
 */
export function buildUploadPolicy(input: UploadPolicyInput): UploadPolicy {
  return {
    fields: {
      key: input.key,
      'Content-Type': input.contentType,
      'x-amz-meta-track': input.trackId,
    },
    conditions: [
      { key: input.key },
      { 'Content-Type': input.contentType },
      ['eq', '$x-amz-meta-track', input.trackId],
      ['content-length-range', 1, input.bytes],
    ],
  };
}

// ---- file sniffing ------------------------------------------------------------------------------

/** Bytes read from the start of the object for the sniff. */
/**
 * How much of the file's start is read: enough for every header below and for the markup check. Anything a
 * signed GET could serve inline as a page (an `<html>` document hiding behind a valid-looking header) is refused.
 */
export const MAGIC_BYTES = 512;

// Not `<?xml`: broadcast WAV files legitimately carry an iXML chunk, and `<svg` already covers an XML image.
const MARKUP = ['<html', '<script', '<svg', '<!doctype', '<iframe'] as const;

/** True when the start of the file contains something a browser could render as a page. */
export function looksLikeMarkup(head: Uint8Array): boolean {
  const text = String.fromCharCode(...head.subarray(0, MAGIC_BYTES)).toLowerCase();
  return MARKUP.some((tag) => text.includes(tag));
}

function asciiAt(head: Uint8Array, offset: number, text: string): boolean {
  if (head.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (head[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * A light check that the start of the file looks like the type it claims. It is a speed bump, not a
 * security control: anything can start with a valid header, and playback is forced to `audio/*`.
 * An `ID3` tag is accepted on its own for MP3 and FLAC (its length is variable, so what follows is
 * not looked at); an MP3 that starts with padding rather than ID3 or a frame sync is refused.
 */
export function matchesAudioMagic(ext: AudioExt, head: Uint8Array): boolean {
  if (looksLikeMarkup(head)) return false;
  switch (ext) {
    case 'mp3':
      return asciiAt(head, 0, 'ID3') || (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case 'm4a':
      return asciiAt(head, 4, 'ftyp');
    case 'wav':
      return asciiAt(head, 0, 'RIFF') && asciiAt(head, 8, 'WAVE');
    case 'flac':
      return asciiAt(head, 0, 'fLaC') || asciiAt(head, 0, 'ID3');
  }
}

// ---- quota and orphans --------------------------------------------------------------------------

export interface StoredObject {
  key: string;
  size: number;
  /** Epoch milliseconds. */
  lastModified: number;
}

export interface Usage {
  files: number;
  bytes: number;
}

/** What a user has committed. `excludeKey` leaves out this commit's own object so a retry is not refused by its own orphan. */
export function userUsage(objects: readonly StoredObject[], excludeKey?: string): Usage {
  let files = 0;
  let bytes = 0;
  for (const object of objects) {
    if (object.key === excludeKey) continue;
    files += 1;
    bytes += object.size;
  }
  return { files, bytes };
}

/** True when adding one more file of `incomingBytes` would pass either per-user cap. */
export function wouldExceedQuota(usage: Usage, incomingBytes: number): boolean {
  return (
    usage.files + 1 > BACKING_TRACK_LIMITS.maxUserFiles ||
    usage.bytes + incomingBytes > BACKING_TRACK_LIMITS.maxUserBytes
  );
}

/**
 * Whether the per-user reconcile may delete a committed object: it is past the grace period (an
 * in-flight commit's copy is younger) and either no row owns it or the row names a different key.
 */
export function isReconcilableOrphan(
  object: StoredObject,
  row: { key: string } | null,
  now: number,
): boolean {
  if (now - object.lastModified < BACKING_TRACK_LIMITS.orphanGraceMs) return false;
  return row === null || row.key !== object.key;
}
