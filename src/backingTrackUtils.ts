import {
  AUDIO_EXTS,
  BACKING_TRACK_FORMAT,
  BACKING_TRACK_LIMITS,
  committedKey,
  extForContentType,
  extFromFileName,
  isCleanLabel,
  isUuid,
  normalizeTags,
  type AudioExt,
} from './backingTrackFormat';
import type { BackingTrackRecord, BandRecord, ValidBackingTrack, ValidSong } from './bandTypes';

export const BYTES_PER_MB = 1024 * 1024;

/**
 * Backing-track rows are written only by the Lambda, but the client still treats them as untrusted
 * (a bug or a future writer must not be able to put a foreign key, a stranger's file or markup on
 * screen). A row that fails any check is hidden, never repaired.
 */
function toValid(
  row: BackingTrackRecord,
  songById: Map<string, ValidSong>,
  memberSubs: Set<string>,
  band: BandRecord,
): ValidBackingTrack | null {
  if (!isUuid(row.id) || row.format !== BACKING_TRACK_FORMAT || row.bandId !== band.id) return null;
  if (!memberSubs.has(row.owner) || band.bannedSubs.includes(row.owner)) return null;
  const song = songById.get(row.songId);
  if (!song || row.setListId !== song.setListId) return null;

  const ext = extForContentType(row.contentType);
  if (!ext) return null;
  const expectedKey = committedKey({ sub: row.owner, bandId: row.bandId, songId: row.songId, trackId: row.id, ext });
  if (row.key !== expectedKey) return null;
  if (!isCleanLabel(row.label)) return null;
  if (!Number.isInteger(row.bytes) || row.bytes < 1 || row.bytes > BACKING_TRACK_LIMITS.maxBytes) return null;
  if (typeof row.createdAt !== 'string') return null; // no server stamp: cannot be ordered, fail closed

  return {
    ...row,
    // Tags are cosmetic: unknown ones are dropped rather than hiding the track.
    forTags: normalizeTags(Array.isArray(row.forTags) ? row.forTags : []),
    ext,
    createdAt: row.createdAt,
  } as ValidBackingTrack;
}

const byAge = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * The tracks each song shows, oldest first. Past the per-song cap only the caller's own tracks stay
 * visible, so a flood of rows can't hide what the caller added themselves. A repeated id
 * (a row returned twice by a paging quirk) counts once.
 */
export function resolveBackingTracks(
  rows: BackingTrackRecord[],
  songs: ValidSong[],
  memberSubs: Set<string>,
  band: BandRecord,
  sub: string,
): Map<string, ValidBackingTrack[]> {
  const songById = new Map(songs.map((song) => [song.id, song]));
  const valid: ValidBackingTrack[] = [];
  for (const row of rows) {
    const track = toValid(row, songById, memberSubs, band);
    if (track) valid.push(track);
  }
  valid.sort(byAge);

  // A row's key is derived from its own id, so one id seen twice (a paging quirk) is the only duplicate possible.
  const seenIds = new Set<string>();
  const bySong = new Map<string, ValidBackingTrack[]>();
  for (const track of valid) {
    if (seenIds.has(track.id)) continue;
    seenIds.add(track.id);
    const list = bySong.get(track.songId) ?? [];
    if (list.length >= BACKING_TRACK_LIMITS.maxPerSong && track.owner !== sub) continue;
    list.push(track);
    bySong.set(track.songId, list);
  }
  return bySong;
}

/** A safe download name: the label with anything that is not a letter, digit, space, dash or underscore removed. */
export function backingTrackFileName(track: Pick<ValidBackingTrack, 'label' | 'ext'>): string {
  const base = track.label.replace(/[^\p{L}\p{N} _-]+/gu, '').replace(/\s+/g, ' ').trim();
  return `${base || 'Backing track'}.${track.ext}`;
}

/** "3.2 MB" / "480 KB" for a stored size. */
export function formatTrackSize(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const MAX_FILE_MB = BACKING_TRACK_LIMITS.maxBytes / BYTES_PER_MB;

/** Shown for an oversize file, before sending and when the server or storage says no. */
export const FILE_TOO_BIG_MESSAGE = `Files can be up to ${MAX_FILE_MB} MB. Try an MP3, M4A or FLAC.`;

/** The accepted extensions as a list for messages: "MP3, M4A, WAV, FLAC". */
export const ACCEPTED_EXTENSIONS_TEXT = AUDIO_EXTS.map((ext) => ext.toUpperCase()).join(', ');

export type FileInspection = { ext: AudioExt } | { problem: string };

/** What the picker checks before anything is sent: the audio type (from the name) and the size. */
export function inspectBackingTrackFile(file: Pick<File, 'name' | 'size'>): FileInspection {
  const ext = extFromFileName(file.name);
  if (!ext) return { problem: `Choose a ${ACCEPTED_EXTENSIONS_TEXT} file.` };
  if (file.size < 1) return { problem: 'That file is empty.' };
  if (file.size > BACKING_TRACK_LIMITS.maxBytes) return { problem: FILE_TOO_BIG_MESSAGE };
  return { ext };
}

/** `inspectBackingTrackFile` as a plain problem message, or null when the file can go. */
export const checkBackingTrackFile = (file: Pick<File, 'name' | 'size'>): string | null => {
  const result = inspectBackingTrackFile(file);
  return 'problem' in result ? result.problem : null;
};

/** Whether the caller may remove a track: its author, or the band owner (the server decides again from its own data). */
export const canRemoveBackingTrack = (track: Pick<ValidBackingTrack, 'owner'>, viewerSub: string, isBandOwner: boolean): boolean =>
  track.owner === viewerSub || isBandOwner;
