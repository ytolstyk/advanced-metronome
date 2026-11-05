/**
 * The contract for song backing tracks, shared by the upload Lambda (`amplify/functions/backing-track`)
 * and the client. A pure leaf: it imports only other leaves (`sanitizeText`, `bandInstruments`), so the
 * Lambda bundle never pulls in React or the Amplify client, and the two sides cannot drift apart.
 *
 * Storage layout (see CLAUDE.md "Backing tracks"):
 *   pending/{sub}/{slot}                              up to PENDING_SLOTS objects per user, overwritten on reuse
 *   bt/{sub}/{bandId}/{songId}/{trackId}.{ext}        committed; `trackId` is also the BackingTrack row id
 */
import { normalizeInstruments, type InstrumentKey } from './bandInstruments';
import { sanitizeText } from './utils/sanitizeText';

/** Stored in `BackingTrack.format`; bump when the row shape or key layout changes. */
export const BACKING_TRACK_FORMAT = 1;

export const BACKING_TRACK_LIMITS = {
  /** Largest file S3 will accept (enforced by the presigned POST's content-length-range). */
  maxBytes: 50 * 1024 * 1024,
  /** Committed files per user across all bands. */
  maxUserFiles: 20,
  /** Committed bytes per user across all bands. */
  maxUserBytes: 600 * 1024 * 1024,
  maxPerSong: 10,
  maxPerBand: 100,
  labelMax: 30,
  /** How long an upload form stays valid. */
  uploadWindowSeconds: 120,
  /** How long a play/download link stays valid. */
  linkSeconds: 600,
  /** An unreferenced committed object younger than this may belong to a commit still in flight. */
  orphanGraceMs: 10 * 60 * 1000,
} as const;

/** Pending slots per user: a finite key space bounds in-flight uploads however many links are asked for. */
export const PENDING_SLOTS = 3;

export const AUDIO_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  flac: 'audio/flac',
} as const;

export type AudioExt = keyof typeof AUDIO_TYPES;
export type AudioContentType = (typeof AUDIO_TYPES)[AudioExt];

export const AUDIO_EXTS = Object.keys(AUDIO_TYPES) as AudioExt[];

export function isAudioExt(value: unknown): value is AudioExt {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AUDIO_TYPES, value);
}

export function contentTypeForExt(ext: AudioExt): AudioContentType {
  return AUDIO_TYPES[ext];
}

/** The extension for a canonical content type, or null for anything else. */
export function extForContentType(contentType: unknown): AudioExt | null {
  return AUDIO_EXTS.find((ext) => AUDIO_TYPES[ext] === contentType) ?? null;
}

/**
 * The audio extension of a file name, lower-cased, or null. Browsers report WAV/M4A/FLAC MIME types
 * inconsistently (`audio/x-wav`, `audio/x-m4a`, an empty string), so the extension decides the type.
 */
export function extFromFileName(fileName: string): AudioExt | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return isAudioExt(ext) ? ext : null;
}

// ---- ids and keys -------------------------------------------------------------------------------

// Cognito subs and Amplify ids are lower-case UUIDs. Strict on purpose: these go into S3 keys and
// prefixes, so a stray "/", ".." or empty string must never get through.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`);
const COMMITTED_KEY_PATTERN = new RegExp(
  `^bt/(${UUID})/(${UUID})/(${UUID})/(${UUID})\\.(${AUDIO_EXTS.join('|')})$`,
);

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PENDING_SLOTS;
}

export interface CommittedKeyParts {
  sub: string;
  bandId: string;
  songId: string;
  trackId: string;
  ext: AudioExt;
}

export function pendingKey(sub: string, slot: number): string {
  return `pending/${sub}/${slot}`;
}

export function committedKey(parts: CommittedKeyParts): string {
  return `bt/${parts.sub}/${parts.bandId}/${parts.songId}/${parts.trackId}.${parts.ext}`;
}

/** Everything a user has committed, across bands. */
export function userPrefix(sub: string): string {
  return `bt/${sub}/`;
}

/** Everything a user has committed in one band. */
export function userBandPrefix(sub: string, bandId: string): string {
  return `bt/${sub}/${bandId}/`;
}

/** The parts of a committed key, or null if `key` is not exactly the shape this feature writes. */
export function parseCommittedKey(key: unknown): CommittedKeyParts | null {
  if (typeof key !== 'string') return null;
  const match = COMMITTED_KEY_PATTERN.exec(key);
  if (!match) return null;
  const [, sub, bandId, songId, trackId, ext] = match;
  return { sub, bandId, songId, trackId, ext: ext as AudioExt };
}

// ---- label and tags -----------------------------------------------------------------------------

/** Single-line label: sanitised and clamped. Empty if nothing printable is left. */
export function sanitizeLabel(raw: string): string {
  return sanitizeText(raw, BACKING_TRACK_LIMITS.labelMax);
}

/** True when `label` is non-empty and sanitising would not change it (the repo's "hide, don't repair" rule). */
export function isCleanLabel(label: unknown): label is string {
  return typeof label === 'string' && label.length > 0 && sanitizeLabel(label) === label;
}

/** A starting label from a file name: a known audio extension and underscores removed, then sanitised. */
export function labelFromFileName(fileName: string): string {
  const stem = extFromFileName(fileName) ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  return sanitizeLabel(stem.replace(/_+/g, ' ')) || 'Backing track';
}

/** The "for whom" tags: known instrument keys only, once each, in palette order. Empty means everyone. */
export function normalizeTags(raw: readonly unknown[] | null | undefined): InstrumentKey[] {
  return normalizeInstruments(raw);
}

/** True when `raw` is an array whose every entry is a known tag, with no repeats (used to reject, not repair, on write). */
export function areValidTags(raw: unknown): raw is InstrumentKey[] {
  if (!Array.isArray(raw)) return false;
  const clean = normalizeTags(raw);
  return clean.length === raw.length;
}

// ---- error codes (the wire contract between the Lambda and the app) -----------------------------

/**
 * Every code the backing-track Lambda can answer with, defined once for both ends. The client has a
 * plain-language message for each (a `Record` over this tuple, so a new code cannot compile without one),
 * and an unknown code from a newer server is treated as `retry`.
 *
 *  - `uploads-disabled`: the kill switch is off (blocks request and commit only).
 *  - `bad-input` / `too-big` / `bad-file`: a malformed request, over 50 MB, or first bytes that are not audio.
 *  - `not-member` / `banned`: the caller is not in the band, or was removed from it.
 *  - `over-quota` / `song-full` / `band-full`: a cap was hit.
 *  - `not-found`: the song, set list, band or track is gone, hidden or archived.
 *  - `replaced`: another upload owns the pending slot now (never deletes it: it is not ours).
 *  - `conflict`: the track id belongs to someone else or to another song.
 *  - `forbidden`: the caller may not change that track.
 *  - `gone`: a definite answer after the row existed (banned, left, song or band deleted); file and row were removed.
 *  - `retry`: transient or unclassified; NOTHING was destroyed and re-sending is safe.
 */
export const BACKING_TRACK_ERROR_CODES = [
  'uploads-disabled',
  'bad-input',
  'too-big',
  'bad-file',
  'not-member',
  'banned',
  'over-quota',
  'song-full',
  'band-full',
  'not-found',
  'replaced',
  'conflict',
  'forbidden',
  'gone',
  'retry',
] as const;

export type BackingTrackErrorCode = (typeof BACKING_TRACK_ERROR_CODES)[number];

export const isBackingTrackErrorCode = (value: unknown): value is BackingTrackErrorCode =>
  typeof value === 'string' && (BACKING_TRACK_ERROR_CODES as readonly string[]).includes(value);
