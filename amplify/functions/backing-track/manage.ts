/**
 * Everything that changes or removes tracks after they are committed: edit, remove, remove a song's
 * tracks, leave a band, and the band owner's purge. None of these is ever blocked by the upload kill
 * switch (taking content down must keep working when uploads are off).
 *
 * Order of deletes is always object first, then row: a failed object delete leaves a row the client
 * shows as "file unavailable" and can retry, never an invisible object nobody can remove.
 */
import {
  PENDING_SLOTS,
  type BackingTrackErrorCode,
  areValidTags,
  isUuid,
  parseCommittedKey,
  pendingKey,
  sanitizeLabel,
  userBandPrefix,
} from '../../../src/backingTrackFormat';
import type { Deps, TrackRow } from './ports';
import { BackingTrackError } from './rules';

/** Stay well under the function's 25 s timeout; callers get `done: false` and call again. */
const BUDGET_MS = 18_000;
/** Rows read per index query. The per-song (10) and per-band (100) caps keep this a single page. */
const PAGE = 100;
export const MAX_REMOVE_IDS = 20;

export interface BulkResult {
  /** False when the time budget ran out; the client calls again. */
  done: boolean;
  removed: number;
}

export interface RemoveResult {
  id: string;
  ok: boolean;
  code?: BackingTrackErrorCode;
}

const requireUuid = (value: unknown): string => {
  if (!isUuid(value)) throw new BackingTrackError('bad-input');
  return value;
};

async function removeRow(deps: Deps, row: TrackRow): Promise<void> {
  await deps.s3.remove(row.key);
  await deps.db.deleteTrack(row.id, row.owner);
}

/** The pending upload of a removed track must not survive, or a replayed commit could recreate it. */
async function clearPendingFor(deps: Deps, row: TrackRow): Promise<void> {
  for (let slot = 0; slot < PENDING_SLOTS; slot += 1) {
    const key = pendingKey(row.owner, slot);
    const head = await deps.s3.head(key);
    if (head?.track === row.id) await deps.s3.remove(key);
  }
}

/** `editBackingTrack`: the row's owner renames it or changes who it is for. */
export async function editTrack(
  deps: Deps,
  sub: string,
  args: { trackId?: unknown; label?: unknown; tags?: unknown },
): Promise<TrackRow> {
  const trackId = requireUuid(args.trackId);
  if (typeof args.label !== 'string') throw new BackingTrackError('bad-input');
  const label = sanitizeLabel(args.label);
  const tags = args.tags ?? [];
  if (!label || !areValidTags(tags)) throw new BackingTrackError('bad-input');

  const row = await deps.db.getTrack(trackId);
  if (!row) throw new BackingTrackError('not-found');
  if (row.owner !== sub) throw new BackingTrackError('forbidden');
  const updated = await deps.db.updateTrackMeta(trackId, sub, {
    label,
    forTags: tags,
    updatedAt: new Date(deps.now()).toISOString(),
  });
  if (!updated) throw new BackingTrackError('not-found');
  return updated;
}

/**
 * `removeBackingTracks`: by the row's owner, or by the owner of the row's band. Authorization comes
 * from each row's own stored band, never from client arguments; a batch may not span bands.
 */
export async function removeTracks(deps: Deps, sub: string, args: { trackIds?: unknown }): Promise<RemoveResult[]> {
  const ids = args.trackIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_REMOVE_IDS) throw new BackingTrackError('bad-input');
  const unique = [...new Set(ids.map(requireUuid))];

  const rows = new Map<string, TrackRow | null>();
  for (const id of unique) rows.set(id, await deps.db.getTrack(id));
  const bands = new Set([...rows.values()].filter((row): row is TrackRow => !!row).map((row) => row.bandId));
  if (bands.size > 1) throw new BackingTrackError('bad-input');

  // A batch never spans bands (checked above), so the band owner is looked up once for all of it.
  const [onlyBand] = bands;
  const bandOwnerSub = onlyBand ? (await deps.db.getBand(onlyBand))?.owner : undefined;

  const results: RemoveResult[] = [];
  for (const id of unique) {
    const row = rows.get(id);
    if (!row) {
      results.push({ id, ok: true }); // already gone is success, so a retried call converges
      continue;
    }
    if (row.owner !== sub && bandOwnerSub !== sub) {
      results.push({ id, ok: false, code: 'forbidden' });
      continue;
    }
    try {
      // Pending first: a commit retried in the gap would otherwise bring the removed track back.
      await clearPendingFor(deps, row);
      await removeRow(deps, row);
      results.push({ id, ok: true });
    } catch (error) {
      // Reported as "try again", so leave a trace: a permanent fault (IAM, config) must be findable in the logs.
      console.error('removeBackingTracks failed for', id, error);
      results.push({ id, ok: false, code: 'retry' });
    }
  }
  return results;
}

/** Everything `owner` has in `bandId`: the S3 prefix drives it (strongly consistent), the index only finds rows whose object is gone. */
async function removeOwnedInBand(deps: Deps, owner: string, bandId: string, deadline: number): Promise<BulkResult> {
  let removed = 0;
  for (const object of await deps.s3.list(userBandPrefix(owner, bandId))) {
    if (deps.now() > deadline) return { done: false, removed };
    await deps.s3.remove(object.key);
    const parts = parseCommittedKey(object.key);
    if (parts) await deps.db.deleteTrack(parts.trackId, owner);
    removed += 1;
  }
  for (const row of await deps.db.listTracks({ bandId }, PAGE)) {
    if (row.owner !== owner) continue;
    if (deps.now() > deadline) return { done: false, removed };
    await removeRow(deps, row);
    removed += 1;
  }
  return { done: true, removed };
}

/** `leaveMyBackingTracks`: the caller's own files in a band. Needs no membership, so leavers and banned users can clean up. */
export async function leaveMine(deps: Deps, sub: string, args: { bandId?: unknown }): Promise<BulkResult> {
  return removeOwnedInBand(deps, sub, requireUuid(args.bandId), deps.now() + BUDGET_MS);
}

async function removeRows(deps: Deps, rows: TrackRow[], deadline: number): Promise<BulkResult> {
  let removed = 0;
  for (const row of rows) {
    if (deps.now() > deadline) return { done: false, removed };
    await removeRow(deps, row);
    removed += 1;
  }
  // One page is the whole set under the caps; a full page means there may be more.
  return { done: rows.length < PAGE, removed };
}

/**
 * `removeMemberBackingTracks`: the band owner clears one member's files (`member`, used when banning) or
 * every file of the band (`all`, used when deleting it; also valid on a tombstoned band).
 */
export async function removeForBand(
  deps: Deps,
  sub: string,
  args: { bandId?: unknown; mode?: unknown; memberSub?: unknown },
): Promise<BulkResult> {
  const bandId = requireUuid(args.bandId);
  if (args.mode !== 'member' && args.mode !== 'all') throw new BackingTrackError('bad-input');
  const memberSub = args.mode === 'member' ? requireUuid(args.memberSub) : null;

  const band = await deps.db.getBand(bandId);
  if (!band) throw new BackingTrackError('not-found');
  if (band.owner !== sub) throw new BackingTrackError('forbidden');

  const deadline = deps.now() + BUDGET_MS;
  if (memberSub) return removeOwnedInBand(deps, memberSub, bandId, deadline);
  return removeRows(deps, await deps.db.listTracks({ bandId }, PAGE), deadline);
}

/**
 * `removeSongBackingTracks`: every track on a song, run before the song is deleted. Allowed for the song's owner
 * (while a member) and the band owner; if the song row is already gone, only the band owner, judged by
 * each row's own band. Finds rows by the song index, so hidden or over-cap rows are included.
 */
export async function removeSongTracks(deps: Deps, sub: string, args: { songId?: unknown }): Promise<BulkResult> {
  const songId = requireUuid(args.songId);
  const rows = await deps.db.listTracks({ songId }, PAGE);
  const song = await deps.db.getSong(songId);

  if (song) {
    const band = await deps.db.getBand(song.bandId);
    const isBandOwner = !!band && band.owner === sub;
    const isSongOwner = song.owner === sub && !!(await deps.db.getMember(song.bandId, sub));
    if (!isBandOwner && !isSongOwner) throw new BackingTrackError('forbidden');
  } else {
    for (const bandId of new Set(rows.map((row) => row.bandId))) {
      const band = await deps.db.getBand(bandId);
      if (!band || band.owner !== sub) throw new BackingTrackError('forbidden');
    }
  }
  return removeRows(deps, rows, deps.now() + BUDGET_MS);
}
