import { beforeEach, describe, expect, it } from 'vitest';
import { BACKING_TRACK_LIMITS, committedKey, pendingKey, userPrefix } from '../../../src/backingTrackFormat';
import { requestUpload } from './core';
import { BAND, FakeDb, FakeS3, LIST, MP3, OTHER, SONG, SUB } from './fakes';
import { editTrack, leaveMine, removeForBand, removeSongTracks, removeTracks } from './manage';
import type { Deps, TrackRow } from './ports';

const STRANGER = 'a1b2c3d4-9999-4999-8999-999999999999';
const BAND_B = 'b2c3d4e5-8888-4888-8888-888888888888';
const SONG_B = 'c3d4e5f6-7777-4777-8777-777777777777';
const NOW = 1_700_000_000_000;
const OLD = NOW - 60 * 60 * 1000;
let n = 0;
const uuid = () => `f0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

let s3: FakeS3;
let db: FakeDb;
let deps: Deps;

beforeEach(() => {
  n = 0;
  s3 = new FakeS3();
  db = new FakeDb(); // SUB is a member of BAND, OTHER owns the band
  deps = { s3, db, now: () => NOW, random: () => 0.5, newId: uuid, enabled: true };
});

/** A committed track: object plus row. */
function seed(options: { id?: string; owner?: string; bandId?: string; songId?: string; old?: boolean } = {}): TrackRow {
  const id = options.id ?? uuid();
  const owner = options.owner ?? SUB;
  const bandId = options.bandId ?? BAND;
  const songId = options.songId ?? SONG;
  const key = committedKey({ sub: owner, bandId, songId, trackId: id, ext: 'mp3' });
  s3.now = options.old ? OLD : NOW;
  s3.put(key, MP3, { contentType: 'audio/mpeg' });
  const row: TrackRow = {
    id, owner, bandId, setListId: LIST, songId, label: 'Drums only', forTags: [], key,
    contentType: 'audio/mpeg', bytes: MP3.length, format: 1, createdAt: 'x', updatedAt: 'x',
  };
  db.tracks.set(id, row);
  return row;
}

describe('editTrack', () => {
  it('lets the owner rename and retag', async () => {
    const row = seed();
    const updated = await editTrack(deps, SUB, { trackId: row.id, label: '  No   drums ', tags: ['guitar'] });
    expect(updated).toMatchObject({ label: 'No drums', forTags: ['guitar'] });
    expect(db.tracks.get(row.id)?.label).toBe('No drums');
  });

  it('refuses another member, even the band owner, and a missing row', async () => {
    const row = seed();
    await expect(editTrack(deps, OTHER, { trackId: row.id, label: 'x', tags: [] })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(editTrack(deps, SUB, { trackId: uuid(), label: 'x', tags: [] })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects bad input without touching the row', async () => {
    const row = seed();
    await expect(editTrack(deps, SUB, { trackId: row.id, label: '   ', tags: [] })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(editTrack(deps, SUB, { trackId: row.id, label: 'ok', tags: ['not-an-instrument'] })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(editTrack(deps, SUB, { trackId: 'nope', label: 'ok', tags: [] })).rejects.toMatchObject({ code: 'bad-input' });
    expect(db.tracks.get(row.id)?.label).toBe('Drums only');
  });
});

describe('removeTracks', () => {
  it('lets the owner remove their own track: object first, row too', async () => {
    const row = seed();
    expect(await removeTracks(deps, SUB, { trackIds: [row.id] })).toEqual([{ id: row.id, ok: true }]);
    expect(s3.objects.has(row.key)).toBe(false);
    expect(db.tracks.has(row.id)).toBe(false);
  });

  it('lets the band owner remove someone else\'s track, but not another member', async () => {
    db.members.set(`${BAND}/${STRANGER}`, { bandId: BAND, owner: STRANGER });
    const row = seed();
    expect(await removeTracks(deps, STRANGER, { trackIds: [row.id] })).toEqual([{ id: row.id, ok: false, code: 'forbidden' }]);
    expect(db.tracks.has(row.id)).toBe(true);
    expect(await removeTracks(deps, OTHER, { trackIds: [row.id] })).toEqual([{ id: row.id, ok: true }]);
    expect(db.tracks.has(row.id)).toBe(false);
  });

  it('treats an already-removed track as success so a retry converges', async () => {
    expect(await removeTracks(deps, SUB, { trackIds: [uuid()] })).toEqual([{ id: expect.any(String), ok: true }]);
  });

  it('judges each row by its own stored band, never by client arguments', async () => {
    const mine = seed();
    const theirs = seed({ owner: STRANGER, bandId: BAND_B, songId: SONG_B });
    await expect(removeTracks(deps, SUB, { trackIds: [mine.id, theirs.id] })).rejects.toMatchObject({ code: 'bad-input' });
    expect(db.tracks.size).toBe(2);
    expect(await removeTracks(deps, SUB, { trackIds: [theirs.id] })).toEqual([{ id: theirs.id, ok: false, code: 'forbidden' }]);
    expect(db.tracks.has(theirs.id)).toBe(true);
  });

  it('keeps the row when the object cannot be deleted, so the removal can be retried', async () => {
    const row = seed();
    s3.remove = async () => { throw new Error('S3 down'); };
    expect(await removeTracks(deps, SUB, { trackIds: [row.id] })).toEqual([{ id: row.id, ok: false, code: 'retry' }]);
    expect(db.tracks.has(row.id)).toBe(true);
  });

  it('deletes the owner\'s pending upload for that track so a replayed commit cannot bring it back', async () => {
    const row = seed();
    s3.put(pendingKey(SUB, 2), MP3, { track: row.id, contentType: 'audio/mpeg' });
    s3.put(pendingKey(SUB, 1), MP3, { track: uuid(), contentType: 'audio/mpeg' });
    await removeTracks(deps, SUB, { trackIds: [row.id] });
    expect(s3.objects.has(pendingKey(SUB, 2))).toBe(false);
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(true); // someone else's upload is left alone
  });

  it('rejects an empty, oversized or malformed id list', async () => {
    await expect(removeTracks(deps, SUB, { trackIds: [] })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(removeTracks(deps, SUB, { trackIds: Array.from({ length: 21 }, uuid) })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(removeTracks(deps, SUB, { trackIds: ['x'] })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(removeTracks(deps, SUB, {})).rejects.toMatchObject({ code: 'bad-input' });
  });
});

describe('leaveMine', () => {
  it('removes every file the caller has in the band, and only theirs', async () => {
    const a = seed();
    const b = seed({ songId: SONG_B });
    const theirs = seed({ owner: OTHER });
    const elsewhere = seed({ bandId: BAND_B, songId: SONG_B });
    expect(await leaveMine(deps, SUB, { bandId: BAND })).toEqual({ done: true, removed: 2 });
    for (const row of [a, b]) {
      expect(s3.objects.has(row.key)).toBe(false);
      expect(db.tracks.has(row.id)).toBe(false);
    }
    expect(db.tracks.has(theirs.id)).toBe(true);
    expect(db.tracks.has(elsewhere.id)).toBe(true);
  });

  it('needs no membership: a banned user can still clean up', async () => {
    db.band!.bannedSubs = [SUB];
    db.members.clear();
    const row = seed();
    expect((await leaveMine(deps, SUB, { bandId: BAND })).done).toBe(true);
    expect(db.tracks.has(row.id)).toBe(false);
  });

  it('also removes a row whose object is already gone', async () => {
    const row = seed();
    s3.objects.delete(row.key);
    await leaveMine(deps, SUB, { bandId: BAND });
    expect(db.tracks.has(row.id)).toBe(false);
  });

  it('stops at its time budget and reports it is not done', async () => {
    seed();
    seed();
    let t = NOW;
    const slow = { ...deps, now: () => (t += 10_000) };
    const result = await leaveMine(slow, SUB, { bandId: BAND });
    expect(result.done).toBe(false);
  });
});

describe('removeForBand', () => {
  it('lets only the band owner purge one member, even a banned one', async () => {
    db.band!.bannedSubs = [SUB];
    const mine = seed();
    const other = seed({ owner: OTHER });
    await expect(removeForBand(deps, SUB, { bandId: BAND, mode: 'member', memberSub: SUB })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await removeForBand(deps, OTHER, { bandId: BAND, mode: 'member', memberSub: SUB })).toEqual({ done: true, removed: 1 });
    expect(db.tracks.has(mine.id)).toBe(false);
    expect(db.tracks.has(other.id)).toBe(true);
  });

  it('removes every file of a deleted band in mode all', async () => {
    db.band!.deletedAt = '2026-01-01T00:00:00Z';
    seed();
    seed({ owner: STRANGER });
    expect(await removeForBand(deps, OTHER, { bandId: BAND, mode: 'all' })).toEqual({ done: true, removed: 2 });
    expect(db.tracks.size).toBe(0);
    expect(s3.objects.size).toBe(0);
  });

  it('rejects an unknown mode, a missing member and an unknown band', async () => {
    await expect(removeForBand(deps, OTHER, { bandId: BAND, mode: 'everything' })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(removeForBand(deps, OTHER, { bandId: BAND, mode: 'member' })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(removeForBand(deps, OTHER, { bandId: BAND_B, mode: 'all' })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('removeSongTracks', () => {
  beforeEach(() => {
    db.song = { id: SONG, bandId: BAND, setListId: LIST, owner: SUB };
  });

  it('lets the song owner clear every member\'s tracks on it', async () => {
    seed();
    seed({ owner: STRANGER });
    seed({ songId: SONG_B });
    expect(await removeSongTracks(deps, SUB, { songId: SONG })).toEqual({ done: true, removed: 2 });
    expect([...db.tracks.values()].every((row) => row.songId === SONG_B)).toBe(true);
  });

  it('lets the band owner, but not an ordinary member or a departed song owner', async () => {
    seed();
    await expect(removeSongTracks(deps, STRANGER, { songId: SONG })).rejects.toMatchObject({ code: 'forbidden' });
    db.members.clear(); // the song owner left the band
    await expect(removeSongTracks(deps, SUB, { songId: SONG })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await removeSongTracks(deps, OTHER, { songId: SONG })).removed).toBe(1);
  });

  it('after the song row is gone, only the band owner may clear what is left', async () => {
    seed();
    db.song = null;
    await expect(removeSongTracks(deps, SUB, { songId: SONG })).rejects.toMatchObject({ code: 'forbidden' });
    expect((await removeSongTracks(deps, OTHER, { songId: SONG })).removed).toBe(1);
  });

  it('is a no-op for a song with no tracks', async () => {
    expect(await removeSongTracks(deps, SUB, { songId: SONG })).toEqual({ done: true, removed: 0 });
  });
});

describe('per-user reconcile when the quota looks full', () => {
  const fill = (count: number, options: { old: boolean }) => {
    for (let i = 0; i < count; i += 1) {
      s3.now = options.old ? OLD : NOW;
      s3.put(committedKey({ sub: SUB, bandId: BAND, songId: SONG, trackId: uuid(), ext: 'mp3' }), MP3);
    }
  };
  const request = () => requestUpload(deps, SUB, { ext: 'mp3', bytes: 10 });

  it('clears old files no row owns, then lets the upload through', async () => {
    fill(BACKING_TRACK_LIMITS.maxUserFiles, { old: true });
    await expect(request()).resolves.toBeDefined();
    expect(await s3.list(userPrefix(SUB))).toHaveLength(0);
  });

  it('never touches recent files: they may belong to a commit that is still running', async () => {
    fill(BACKING_TRACK_LIMITS.maxUserFiles, { old: false });
    await expect(request()).rejects.toMatchObject({ code: 'over-quota' });
    expect(await s3.list(userPrefix(SUB))).toHaveLength(BACKING_TRACK_LIMITS.maxUserFiles);
  });

  it('keeps a track that is live and clears one whose song was deleted', async () => {
    const live = seed({ old: true });
    const orphaned = seed({ old: true, songId: SONG_B });
    fill(BACKING_TRACK_LIMITS.maxUserFiles - 2, { old: false });
    await expect(request()).resolves.toBeDefined(); // 20 files, one freed: room for the new one
    expect(s3.objects.has(live.key)).toBe(true);
    expect(s3.objects.has(orphaned.key)).toBe(false);
    expect(db.tracks.has(orphaned.id)).toBe(false);
    expect(db.tracks.has(live.id)).toBe(true);
  });

  it('clears the files of a band the user is no longer in', async () => {
    const gone = seed({ old: true });
    db.members.clear();
    fill(BACKING_TRACK_LIMITS.maxUserFiles - 1, { old: false });
    await expect(request()).resolves.toBeDefined();
    expect(s3.objects.has(gone.key)).toBe(false);
    expect(db.tracks.has(gone.id)).toBe(false);
  });

  it('does not delete an object that was re-copied between the listing and the delete', async () => {
    const orphan = seed({ old: true });
    db.tracks.delete(orphan.id);
    fill(BACKING_TRACK_LIMITS.maxUserFiles - 1, { old: false });
    const realHead = s3.head.bind(s3);
    s3.head = async (key: string) => {
      if (key === orphan.key) s3.objects.get(key)!.lastModified = NOW; // a retried commit just copied it again
      return realHead(key);
    };
    await expect(request()).rejects.toMatchObject({ code: 'over-quota' });
    expect(s3.objects.has(orphan.key)).toBe(true);
  });
});
