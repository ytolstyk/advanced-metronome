import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKING_TRACK_LIMITS,
  PENDING_SLOTS,
  committedKey,
  pendingKey,
  userPrefix,
} from '../../../src/backingTrackFormat';
import { commitTrack, requestUpload } from './core';
import type { Deps, TrackRow } from './ports';
import { BAND, FakeDb, FakeS3, HTML, LIST, MP3, OTHER, SONG, SUB, TRACK } from './fakes';

let s3: FakeS3;
let db: FakeDb;
let ids = 0;
let deps: Deps;

const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

beforeEach(() => {
  s3 = new FakeS3();
  db = new FakeDb();
  ids = 0;
  deps = { s3, db, now: () => 1_700_000_000_000, random: () => 0.5, newId, enabled: true };
});

/** What the browser's POST leaves behind. */
function upload(slot = 1, options: { track?: string; body?: Uint8Array; contentType?: string; size?: number } = {}) {
  s3.put(pendingKey(SUB, slot), options.body ?? MP3, {
    contentType: options.contentType ?? 'audio/mpeg',
    track: options.track ?? TRACK,
    size: options.size,
  });
}

const commit = (overrides: Record<string, unknown> = {}, sub = SUB) =>
  commitTrack(deps, sub, { trackId: TRACK, bandId: BAND, songId: SONG, slot: 1, label: 'Drums only', tags: ['guitar'], ...overrides });

const KEY = committedKey({ sub: SUB, bandId: BAND, songId: SONG, trackId: TRACK, ext: 'mp3' });

describe('requestUpload', () => {
  it('returns a ticket for one pending slot, valid for 120 seconds', async () => {
    const ticket = await requestUpload(deps, SUB, { ext: 'mp3', bytes: 1000 });
    expect(ticket.trackId).toMatch(/^00000000-/);
    expect(ticket.slot).toBe(1);
    expect(ticket.url).toContain('/120');
    expect(ticket.fields.key).toBe(pendingKey(SUB, 1));
    expect(ticket.fields['x-amz-meta-track']).toBe(ticket.trackId);
    expect(ticket.fields['Content-Type']).toBe('audio/mpeg');
  });

  it('only ever signs one of the three pending keys, however many tickets are asked for', async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const ticket = await requestUpload({ ...deps, random: Math.random }, SUB, { ext: 'wav', bytes: 10 });
      keys.add(ticket.fields.key);
    }
    expect(keys.size).toBeLessThanOrEqual(PENDING_SLOTS);
    for (const key of keys) expect(key).toMatch(new RegExp(`^pending/${SUB}/[0-2]$`));
  });

  it('refuses when uploads are disabled', async () => {
    await expect(requestUpload({ ...deps, enabled: false }, SUB, { ext: 'mp3', bytes: 1 })).rejects.toMatchObject({ code: 'uploads-disabled' });
  });

  it('refuses an unsupported type and an oversize file', async () => {
    await expect(requestUpload(deps, SUB, { ext: 'exe', bytes: 1 })).rejects.toMatchObject({ code: 'bad-input' });
    await expect(requestUpload(deps, SUB, { ext: 'mp3', bytes: BACKING_TRACK_LIMITS.maxBytes + 1 })).rejects.toMatchObject({ code: 'too-big' });
  });

  it('refuses when the user is already at the file cap', async () => {
    s3.now = deps.now(); // recent files: nothing for the reconcile to clear
    for (let i = 0; i < BACKING_TRACK_LIMITS.maxUserFiles; i += 1) s3.put(`${userPrefix(SUB)}x/${i}.mp3`, MP3);
    await expect(requestUpload(deps, SUB, { ext: 'mp3', bytes: 1 })).rejects.toMatchObject({ code: 'over-quota' });
    // Another user is unaffected.
    await expect(requestUpload(deps, OTHER, { ext: 'mp3', bytes: 1 })).resolves.toBeDefined();
  });
});

describe('commitTrack: happy path', () => {
  it('copies the verified upload, writes the row and clears the pending object', async () => {
    upload();
    const row = await commit();

    expect(row).toMatchObject({
      id: TRACK,
      owner: SUB,
      bandId: BAND,
      setListId: LIST,
      songId: SONG,
      label: 'Drums only',
      forTags: ['guitar'],
      key: KEY,
      contentType: 'audio/mpeg',
      bytes: MP3.length,
      format: 1,
    });
    expect(db.tracks.get(TRACK)).toEqual(row);
    expect(s3.objects.has(KEY)).toBe(true);
    expect(s3.objects.get(KEY)?.contentType).toBe('audio/mpeg');
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(false);
  });

  it('sanitises the label and rejects bad input', async () => {
    upload();
    expect((await commit({ label: '  No   drums​ ' })).label).toBe('No drums');
    for (const bad of [{ label: '' }, { label: '​' }, { label: 7 }, { tags: ['kazoo'] }, { tags: ['guitar', 'guitar'] }, { trackId: 'nope' }, { bandId: '../x' }, { songId: undefined }, { slot: 3 }, { slot: -1 }]) {
      await expect(commit(bad)).rejects.toMatchObject({ code: 'bad-input' });
    }
  });

  it('refuses when uploads are disabled', async () => {
    upload();
    await expect(commitTrack({ ...deps, enabled: false }, SUB, {})).rejects.toMatchObject({ code: 'uploads-disabled' });
  });
});

describe('commitTrack: replay and idempotency', () => {
  it('returns the existing row when the commit is retried after the pending object is gone', async () => {
    upload();
    const first = await commit();
    const second = await commit();
    expect(second).toEqual(first);
    expect(db.tracks.size).toBe(1);
    expect([...s3.objects.keys()].filter((k) => k.startsWith('bt/'))).toEqual([KEY]);
  });

  it('answers a replay at the cap, without copying or counting', async () => {
    upload();
    await commit();
    for (let i = 0; i < BACKING_TRACK_LIMITS.maxPerSong; i += 1) {
      db.tracks.set(`f${i}`, { ...db.tracks.get(TRACK)!, id: `f${i}`, key: `bt/f${i}` });
    }
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
  });

  it('refuses a replay from a different user or for a different song, and never returns that row', async () => {
    upload();
    await commit();
    db.members.set(`${BAND}/${OTHER}`, { bandId: BAND, owner: OTHER });
    await expect(commit({}, OTHER)).rejects.toMatchObject({ code: 'conflict' });
    await expect(commit({ songId: 'f6a7b8c9-7777-4777-8777-777777777777' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('50 parallel commits of one trackId leave exactly one row, and the object still exists', async () => {
    upload();
    const results = await Promise.all(Array.from({ length: 50 }, () => commit()));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(db.tracks.size).toBe(1);
    expect(s3.objects.has(KEY)).toBe(true);
    expect([...s3.objects.keys()].filter((k) => k.startsWith('bt/'))).toHaveLength(1);
  });

  it('restores a missing object from the pending upload when the row survived', async () => {
    upload();
    await commit();
    s3.objects.delete(KEY);
    upload(); // the same upload is still sitting in the slot (post-commit delete had failed)
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
    expect(s3.objects.has(KEY)).toBe(true);
  });

  it('drops a row whose object is gone for good, so the user can upload again', async () => {
    upload();
    await commit();
    s3.objects.delete(KEY);
    await expect(commit()).rejects.toMatchObject({ code: 'not-found' });
    expect(db.tracks.size).toBe(0);
  });

  it('does not delete a newer upload that shares the slot when cleaning up after a replay', async () => {
    upload();
    await commit();
    upload(1, { track: 'ffffffff-8888-4888-8888-888888888888' }); // a different upload now owns slot 1
    await commit();
    expect(s3.objects.get(pendingKey(SUB, 1))?.track).toBe('ffffffff-8888-4888-8888-888888888888');
  });
});

describe('commitTrack: verifying the upload', () => {
  it('reports not-found when nothing was uploaded', async () => {
    await expect(commit()).rejects.toMatchObject({ code: 'not-found' });
  });

  it('reports replaced, and leaves the object alone, when another upload owns the slot', async () => {
    upload(1, { track: 'ffffffff-8888-4888-8888-888888888888' });
    await expect(commit()).rejects.toMatchObject({ code: 'replaced' });
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(true);
    expect(db.tracks.size).toBe(0);
  });

  it('deletes and refuses a file whose content is not audio (an HTML page sent as mp3)', async () => {
    upload(1, { body: HTML });
    await expect(commit()).rejects.toMatchObject({ code: 'bad-file' });
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(false);
    expect(db.tracks.size).toBe(0);
  });

  it('deletes and refuses an object with the wrong content type or size', async () => {
    upload(1, { contentType: 'text/html' });
    await expect(commit()).rejects.toMatchObject({ code: 'bad-file' });
    upload(1, { size: BACKING_TRACK_LIMITS.maxBytes + 1 });
    await expect(commit()).rejects.toMatchObject({ code: 'bad-file' });
    upload(1, { size: 0 });
    await expect(commit()).rejects.toMatchObject({ code: 'bad-file' });
    expect(db.tracks.size).toBe(0);
  });

  it('reports replaced when the upload is swapped between the check and the copy', async () => {
    upload();
    const realRead = s3.readStart.bind(s3);
    s3.readStart = async (key, length, ifMatch) => {
      const result = await realRead(key, length, ifMatch);
      upload(1); // a re-POST of the same policy lands after the sniff: new ETag
      return result;
    };
    await expect(commit()).rejects.toMatchObject({ code: 'replaced' });
    expect(db.tracks.size).toBe(0);
    expect(s3.objects.has(KEY)).toBe(false);
  });
});

describe('commitTrack: authorization chain', () => {
  beforeEach(() => upload());

  it.each([
    ['a missing band', () => { db.band = null; }, 'not-found'],
    ['a deleted band', () => { db.band!.deletedAt = '2026-01-01T00:00:00Z'; }, 'not-found'],
    ['a banned caller', () => { db.band!.bannedSubs = [SUB]; }, 'banned'],
    ['a caller with no Member row', () => { db.members.clear(); }, 'not-member'],
    ['a member the owner has not allowed to upload', () => { db.band!.uploaderSubs = []; }, 'not-allowed'],
    ['a band row from before uploader permissions existed', () => { delete db.band!.uploaderSubs; }, 'not-allowed'],
    ['a missing song', () => { db.song = null; }, 'not-found'],
    ['a song of another band', () => { db.song!.bandId = OTHER; }, 'not-found'],
    ['a hidden song', () => { db.band!.hiddenSongIds = [SONG]; }, 'not-found'],
    ['a set list the band does not list', () => { db.band!.setListIds = []; }, 'not-found'],
    ['an archived set list id', () => { db.band!.archivedSetListIds = [LIST]; }, 'not-found'],
    ['a set list row of another band', () => { db.setList!.bandId = OTHER; }, 'not-found'],
    ['an archived set list row', () => { db.setList!.archivedAt = '2026-01-01T00:00:00Z'; }, 'not-found'],
  ])('refuses %s', async (_name, arrange, code) => {
    arrange();
    await expect(commit()).rejects.toMatchObject({ code });
    expect(db.tracks.size).toBe(0);
    expect(s3.objects.has(KEY)).toBe(false);
  });
});

describe('commitTrack: who may upload', () => {
  beforeEach(() => upload());

  it('lets the band owner upload without being on the list', async () => {
    db.band!.uploaderSubs = [];
    db.band!.owner = SUB;
    await expect(commit()).resolves.toBeDefined();
    expect(db.tracks.size).toBe(1);
  });

  it('taking the permission away after the upload does not remove a finished track', async () => {
    db.onCreate = () => { db.band!.uploaderSubs = []; };
    await expect(commit()).resolves.toBeDefined();
    expect(db.tracks.size).toBe(1);
    expect(s3.objects.has(KEY)).toBe(true);
  });
});

describe('commitTrack: caps', () => {
  beforeEach(() => upload());

  const addRows = (count: number, patch: Partial<TrackRow>) => {
    for (let i = 0; i < count; i += 1) {
      db.tracks.set(`r${i}-${patch.songId ?? ''}`, { ...patch, id: `r${i}-${patch.songId ?? ''}` } as TrackRow);
    }
  };

  it('refuses the 11th track on a song', async () => {
    addRows(BACKING_TRACK_LIMITS.maxPerSong, { songId: SONG, bandId: BAND });
    await expect(commit()).rejects.toMatchObject({ code: 'song-full' });
  });

  it('refuses the 101st track in a band', async () => {
    addRows(BACKING_TRACK_LIMITS.maxPerBand, { songId: 'other-song', bandId: BAND });
    await expect(commit()).rejects.toMatchObject({ code: 'band-full' });
  });

  it('refuses when the user has no storage left, but not because of its own earlier copy', async () => {
    s3.now = deps.now();
    for (let i = 0; i < BACKING_TRACK_LIMITS.maxUserFiles; i += 1) s3.put(`${userPrefix(SUB)}x/${i}.mp3`, MP3);
    await expect(commit()).rejects.toMatchObject({ code: 'over-quota' });

    // 19 other files plus this commit's own orphan from a crashed attempt: still fits.
    s3.objects.delete(`${userPrefix(SUB)}x/0.mp3`);
    s3.put(KEY, MP3, { contentType: 'audio/mpeg' });
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
  });
});

describe('commitTrack: copy and row-create races', () => {
  const rowFor = (over: Partial<TrackRow> = {}): TrackRow => ({
    id: TRACK, owner: SUB, bandId: BAND, setListId: LIST, songId: SONG, label: 'Drums only', forTags: ['guitar'],
    key: KEY, contentType: 'audio/mpeg', bytes: MP3.length, format: 1, createdAt: 'x', updatedAt: 'x', ...over,
  });

  it('a copy that finds the pending file changed is `replaced`, and deletes nothing', async () => {
    upload();
    s3.copy = async () => 'changed';
    await expect(commit()).rejects.toMatchObject({ code: 'replaced' });
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(true);
    expect(db.tracks.size).toBe(0);
  });

  it('a copy that finds the pending file gone is `not-found`', async () => {
    upload();
    s3.copy = async () => 'missing';
    await expect(commit()).rejects.toMatchObject({ code: 'not-found' });
  });

  it('a failed copy because the twin request just finished returns the twin\'s track', async () => {
    upload();
    s3.copy = async () => {
      db.tracks.set(TRACK, rowFor());
      s3.put(KEY, MP3, { contentType: 'audio/mpeg' });
      return 'missing';
    };
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
  });

  it('losing the conditional create to our own twin returns the winner\'s row', async () => {
    upload();
    db.createTrack = async () => {
      db.tracks.set(TRACK, rowFor());
      return false;
    };
    await expect(commit()).resolves.toMatchObject({ id: TRACK, key: KEY });
  });

  it('losing the create to a row with another key is a conflict, never someone else\'s track', async () => {
    upload();
    db.createTrack = async () => {
      db.tracks.set(TRACK, rowFor({ key: `${KEY}.other` }));
      return false;
    };
    await expect(commit()).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('commitTrack: revalidation after the row exists', () => {
  it('removes the object and row when the caller is banned just after the create', async () => {
    upload();
    db.onCreate = () => { db.band!.bannedSubs = [SUB]; };
    await expect(commit()).rejects.toMatchObject({ code: 'gone' });
    expect(db.tracks.size).toBe(0);
    expect(s3.objects.has(KEY)).toBe(false);
  });

  it('removes the object and row when the song is deleted just after the create', async () => {
    upload();
    db.onCreate = () => { db.song = null; };
    await expect(commit()).rejects.toMatchObject({ code: 'gone' });
    expect(db.tracks.size).toBe(0);
    expect(s3.objects.has(KEY)).toBe(false);
  });

  it('a revalidation read that merely fails keeps the upload and its pending file, and a second commit finishes it', async () => {
    upload();
    db.onCreate = () => { db.failReads = true; };
    await expect(commit()).rejects.toMatchObject({ code: 'retry' });
    // Nothing was destroyed: the row, the committed file and the pending upload are all still there.
    expect(db.tracks.has(TRACK)).toBe(true);
    expect(s3.objects.has(KEY)).toBe(true);
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(true);

    db.failReads = false;
    db.onCreate = null;
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
    expect(s3.objects.has(KEY)).toBe(true);
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(false);
  });

  it('a failed read during a replay does not delete a track that has been live for a while', async () => {
    upload();
    await commit();
    db.failReads = true;
    await expect(commit()).rejects.toMatchObject({ code: 'retry' });
    db.failReads = false;
    expect(db.tracks.has(TRACK)).toBe(true);
    expect(s3.objects.has(KEY)).toBe(true);
  });

  it('a definite answer (banned just after the create) also clears the pending upload', async () => {
    upload();
    db.onCreate = () => { db.band!.bannedSubs = [SUB]; };
    await expect(commit()).rejects.toMatchObject({ code: 'gone' });
    expect(s3.objects.has(pendingKey(SUB, 1))).toBe(false);
  });

  it('a double click whose twin finished between the Head and the sniff returns the finished track', async () => {
    upload();
    // The twin commits in the gap: its row and committed file appear, its pending file is removed.
    s3.readStart = async () => {
      s3.objects.delete(pendingKey(SUB, 1));
      db.tracks.set(TRACK, {
        id: TRACK, owner: SUB, bandId: BAND, setListId: LIST, songId: SONG, label: 'Drums only', forTags: ['guitar'],
        key: KEY, contentType: 'audio/mpeg', bytes: MP3.length, format: 1, createdAt: 'x', updatedAt: 'x',
      });
      s3.put(KEY, MP3, { contentType: 'audio/mpeg' });
      return null;
    };
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
  });

  it('hiding the song (or archiving its list) after the create does NOT destroy the finished upload', async () => {
    upload();
    db.onCreate = () => { db.band!.hiddenSongIds = [SONG]; };
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
    expect(db.tracks.has(TRACK)).toBe(true);
    expect(s3.objects.has(KEY)).toBe(true);
  });

  it('a replay after the song was hidden keeps the track too', async () => {
    upload();
    await commit();
    db.band!.hiddenSongIds = [SONG];
    db.band!.archivedSetListIds = [LIST];
    await expect(commit()).resolves.toMatchObject({ id: TRACK });
    expect(s3.objects.has(KEY)).toBe(true);
  });

  it('but a NEW track cannot be attached to a hidden song', async () => {
    upload();
    db.band!.hiddenSongIds = [SONG];
    await expect(commit()).rejects.toMatchObject({ code: 'not-found' });
    expect(db.tracks.size).toBe(0);
  });

  it('revalidates on a replay too, so a user banned since the first commit loses the track', async () => {
    upload();
    await commit();
    db.band!.bannedSubs = [SUB];
    await expect(commit()).rejects.toMatchObject({ code: 'gone' });
    expect(db.tracks.size).toBe(0);
    expect(s3.objects.has(KEY)).toBe(false);
  });
});
