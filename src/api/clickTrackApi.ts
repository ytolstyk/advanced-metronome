import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { TrackPiece } from '../audio/ClickTrackEngine';
import { getCurrentUserSub, isAuthenticated } from './authUtils';
import { listAll } from './paginate';

import type { SegmentGroup } from '../clickTrackTypes';
export type { SegmentGroup };

const client = generateClient<Schema>();

export interface CloudClickTrack {
  id: string;
  name: string;
  pieces: TrackPiece[];
  groups: SegmentGroup[];
}

function serializeTrack(pieces: TrackPiece[], groups: SegmentGroup[]) {
  return { piecesJson: JSON.stringify(pieces), groupsJson: JSON.stringify(groups) };
}

export async function loadCloudClickTracks(): Promise<CloudClickTrack[]> {
  if (!(await isAuthenticated())) return [];
  try {
    // Every band song saved adds a row, so one page (100) is not enough; follow the pages (capped by listAll).
    const { items: tracks } = await listAll(async (nextToken) => {
      const page = await client.models.ClickTrack.list({ nextToken });
      return { items: page.data ?? [], nextToken: page.nextToken };
    });
    const good: CloudClickTrack[] = [];
    for (const t of tracks) {
      if (t == null) continue;
      try {
        good.push({
          id: t.id,
          name: t.name,
          pieces: JSON.parse(t.piecesJson) as TrackPiece[],
          groups: JSON.parse(t.groupsJson) as SegmentGroup[],
        });
      } catch {
        void client.models.ClickTrack.delete({ id: t.id }).catch(() => {});
      }
    }
    return good;
  } catch {
    return [];
  }
}

export async function saveCloudClickTrack(
  name: string,
  pieces: TrackPiece[],
  groups: SegmentGroup[],
): Promise<CloudClickTrack | null> {
  if (!(await isAuthenticated())) return null;
  try {
    const { data: created } = await client.models.ClickTrack.create({
      name,
      ...serializeTrack(pieces, groups),
    });
    if (!created) return null;
    return { id: created.id, name: created.name, pieces, groups };
  } catch {
    return null;
  }
}

/** One key per account, so two people sharing a browser never see each other's mapping. */
const bandCopyIdsKey = (sub: string) => `band-song-cloud-track-ids:${sub}`;

/** Which cloud track holds the copy made for each band song: song id -> ClickTrack id (this browser only). */
function readBandCopyIds(sub: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(bandCopyIdsKey(sub)) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberBandCopyId(sub: string, songId: string, trackId: string): void {
  try {
    localStorage.setItem(bandCopyIdsKey(sub), JSON.stringify({ ...readBandCopyIds(sub), [songId]: trackId }));
  } catch { /* storage full or blocked: the next save just makes a new copy */ }
}

/** Copies in flight per account and song; a second save of the same song waits for the first, so they can't both create. */
const copiesInFlight = new Map<string, Promise<boolean>>();

/**
 * Keeps a copy of a track the user saved to a band song in their own cloud tracks, named `name`.
 * The copy is found by song id, never by name, so it can't overwrite a track the user saved themselves and
 * needs no table scan (`ClickTrack` has no index). Saving the same song again updates its copy (and renames it
 * to `name`); if that copy was deleted meanwhile, a new one is made. Another browser has no remembered id and
 * makes its own copy. An update that fails for another reason (throttle, offline)
 * makes no new copy and reports false.
 * The pieces and groups are stored as the editor holds them, not as the band payload normalises them.
 * Returns whether a copy exists afterwards.
 */
export async function saveCloudCopyForSong(
  songId: string,
  name: string,
  pieces: TrackPiece[],
  groups: SegmentGroup[],
): Promise<boolean> {
  if (!(await isAuthenticated())) return false;
  try {
    const sub = await getCurrentUserSub();
    const key = `${sub}:${songId}`;
    const run = (copiesInFlight.get(key) ?? Promise.resolve(false)).then(() => copyOnce(sub, songId, name, pieces, groups));
    copiesInFlight.set(key, run);
    try {
      return await run;
    } finally {
      if (copiesInFlight.get(key) === run) copiesInFlight.delete(key);
    }
  } catch {
    return false;
  }
}

/** Amplify reports a deleted or foreign row as an Unauthorized / not-found error; anything else is a passing failure. */
function rowIsGone(errors: ReadonlyArray<{ message?: string; errorType?: string }> | undefined): boolean {
  if (!errors?.length) return true;
  return errors.every((e) => /unauthorized|not.?found|conditional/i.test(`${e.errorType ?? ''} ${e.message ?? ''}`));
}

async function copyOnce(sub: string, songId: string, name: string, pieces: TrackPiece[], groups: SegmentGroup[]): Promise<boolean> {
  try {
    const knownId = readBandCopyIds(sub)[songId];
    if (knownId) {
      const { data: updated, errors } = await client.models.ClickTrack.update({ id: knownId, name, ...serializeTrack(pieces, groups) });
      if (updated) return true;
      if (!rowIsGone(errors)) return false; // throttled or offline: keep the existing copy rather than add a second one
    }
    const created = await saveCloudClickTrack(name, pieces, groups);
    if (created) rememberBandCopyId(sub, songId, created.id);
    return created !== null;
  } catch {
    return false;
  }
}

export async function deleteCloudClickTrack(id: string): Promise<void> {
  if (!(await isAuthenticated())) return;
  try { await client.models.ClickTrack.delete({ id }); } catch { /* silent */ }
}
