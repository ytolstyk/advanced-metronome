import type { TrackPiece } from '../audio/ClickTrackEngine';
import type { BandView, SongRecord, SongTrackSummary } from '../bandTypes';
import { rowStamp } from '../bandUtils';
import { BAND_TRACK_FORMAT, encodeBandTrack, parseBandTrack } from '../clickTrackBand';
import type { SegmentGroup } from '../clickTrackTypes';
import { getCurrentUserSub } from './authUtils';
import {
  bandsClient as client,
  createIdempotent,
  deleteQuietly,
  isConflict,
  isUnauthorized,
  requireAuth,
  throwOnError,
  unwrap,
  upsertRow,
  withKeyLock,
} from './bandsShared';
import { hasSongTrackModel } from './bandReads';
import { listAll, pageOpts, runPool } from './paginate';

const CLEANUP_DELETES_AT_ONCE = 6;

/** Row fields a write echoes back: keys and metadata, never the (up to 250 KB) payload. */
const WRITE_SELECTION = ['songId', 'owner', 'setListId', 'format', 'bytes', 'createdAt', 'updatedAt'] as const;

/** The backend predates band click tracks (the frontend went live a moment before the schema). */
export class SongTrackUnavailableError extends Error {
  constructor() {
    super("Band click tracks aren't available yet. Please try again in a few minutes.");
    this.name = 'SongTrackUnavailableError';
  }
}

function requireModel(): typeof client.models.SongClickTrack {
  if (!hasSongTrackModel()) throw new SongTrackUnavailableError();
  return client.models.SongClickTrack;
}

export type SongTrackSong = Pick<SongRecord, 'id' | 'bandId' | 'setListId'>;

export type SongTrackRead =
  /** `stale`: the row differs from what the page listed (someone saved since); the track is still the one fetched. */
  | { status: 'ok'; pieces: TrackPiece[]; groups: SegmentGroup[]; stale: boolean }
  /** The row is gone or was cleared since the page loaded: reload the list. */
  | { status: 'gone' }
  | { status: 'newer' }
  | { status: 'unreadable'; reason: string };

/**
 * Fetches and strictly parses the track a song currently shows (`shown` comes from the resolved
 * view). One exact-key read; the payload never travels with the set list query. A read error throws.
 */
export async function getSongTrack(song: SongTrackSong, shown: Pick<SongTrackSummary, 'owner' | 'stamp'>): Promise<SongTrackRead> {
  await requireAuth();
  const res = await requireModel().get({ songId: song.id, owner: shown.owner });
  throwOnError(res, 'getSongTrack');
  const row = res.data;
  if (!row) return { status: 'gone' };
  // A member can write any parent ids into their own row: it only counts for this song.
  if (row.songId !== song.id || row.owner !== shown.owner || row.setListId !== song.setListId || row.bandId !== song.bandId) {
    return { status: 'unreadable', reason: 'it belongs to another song' };
  }
  const parsed = parseBandTrack({ format: row.format, bytes: row.bytes, track: row.track });
  switch (parsed.kind) {
    case 'cleared':
      return { status: 'gone' };
    case 'newer':
      return { status: 'newer' };
    case 'unreadable':
      return { status: 'unreadable', reason: parsed.reason };
    case 'ok':
      return {
        status: 'ok',
        pieces: parsed.pieces,
        groups: parsed.groups,
        stale: rowStamp({ owner: row.owner, createdAt: row.createdAt, updatedAt: row.updatedAt }) !== shown.stamp,
      };
  }
}

type RowFields = { format: number; bytes: number; track: string };

/** Writes the caller's own row for a song (create or update). `exists` only picks the first attempt. */
function writeMyRow(song: SongTrackSong, fields: RowFields, exists: boolean, failure: string): Promise<void> {
  return withKeyLock(`song-track:${song.id}`, async () => {
    await requireAuth();
    const model = requireModel();
    const owner = await getCurrentUserSub();
    const row = { songId: song.id, owner, bandId: song.bandId, setListId: song.setListId, ...fields };
    const options = { selectionSet: [...WRITE_SELECTION] };
    const create = async (): Promise<boolean> =>
      (await createIdempotent(() => model.create(row, options), 'createSongTrack')) === 'created';
    const update = async (): Promise<boolean> => {
      const res = await model.update(row, options);
      if (!res.errors?.length) return true;
      if (isConflict(res.errors) || isUnauthorized(res.errors)) return false;
      throwOnError(res, 'updateSongTrack');
      return false;
    };
    await upsertRow({ create, update }, exists, failure);
  });
}

/**
 * Attaches a click track to a song as the caller's own row (any member may; the song shows the
 * newest valid row, so this replaces whatever was shown). Throws a plain-language Error when the
 * track is over a limit or the caller can't write here.
 */
export async function saveSongTrack(
  view: Pick<BandView, 'isMember' | 'band' | 'setLists'>,
  song: SongTrackSong,
  pieces: readonly TrackPiece[],
  groups: readonly SegmentGroup[],
  exists: boolean,
): Promise<void> {
  await requireAuth();
  if (!view.isMember) throw new Error('Join the band to add a click track');
  if (song.bandId !== view.band.id || !view.setLists.some((s) => s.id === song.setListId)) throw new Error('Set list not found');
  const { track, bytes } = encodeBandTrack(pieces, groups);
  await writeMyRow(song, { format: BAND_TRACK_FORMAT, bytes, track }, exists, 'Could not save the click track. Please try again.');
}

/**
 * Removes the click track a song shows by writing the caller's own cleared row (never a delete:
 * deleting would bring back an older member's track). Any member can do it.
 */
export async function clearSongTrack(song: SongTrackSong, exists: boolean): Promise<void> {
  await requireAuth();
  await writeMyRow(song, { format: BAND_TRACK_FORMAT, bytes: 0, track: '' }, exists, 'Could not remove the click track. Please try again.');
}

/** Best-effort delete of the caller's own click track rows in a set list (cleanup after leaving a band). */
export async function deleteMyTrackRows(setListId: string, owner: string): Promise<void> {
  await requireAuth();
  if (!hasSongTrackModel()) return;
  const model = client.models.SongClickTrack;
  const selectionSet = ['songId', 'owner'] as const;
  const rows = await listAll(async (token) => {
    const res = await model.listSongClickTrackBySetList(
      { setListId, owner: { eq: owner } },
      { ...pageOpts(token), selectionSet: [...selectionSet] },
    );
    return { items: unwrap(res, 'listMyTracks'), nextToken: res.nextToken };
  });
  await runPool(CLEANUP_DELETES_AT_ONCE, rows.items, (row) =>
    deleteQuietly(() => model.delete({ songId: row.songId, owner }, { selectionSet: [...selectionSet] }), 'deleteSongTrack'),
  );
}
