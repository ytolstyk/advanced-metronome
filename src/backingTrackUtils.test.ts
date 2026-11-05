import { describe, expect, it } from 'vitest';
import { committedKey, type AudioExt } from './backingTrackFormat';
import {
  ACCEPTED_EXTENSIONS_TEXT,
  BYTES_PER_MB,
  FILE_TOO_BIG_MESSAGE,
  MAX_FILE_MB,
  backingTrackFileName,
  canRemoveBackingTrack,
  checkBackingTrackFile,
  formatTrackSize,
  inspectBackingTrackFile,
  resolveBackingTracks,
} from './backingTrackUtils';
import type { BackingTrackRecord, BandRecord, ValidSong } from './bandTypes';

const OWNER = '00000000-0000-4000-8000-000000000001';
const BOB = '00000000-0000-4000-8000-000000000002';
const MALLORY = '00000000-0000-4000-8000-000000000003';
const BAND_ID = '10000000-0000-4000-8000-000000000001';
const SONG_A = '20000000-0000-4000-8000-00000000000a';
const SONG_B = '20000000-0000-4000-8000-00000000000b';
const SET_LIST = 'sl-1';

const trackId = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: BAND_ID,
  owner: OWNER,
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: [SET_LIST],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  inviteTtlDays: 1,
  ...over,
});

const song = (id: string, over: Partial<ValidSong> = {}): ValidSong =>
  ({
    id,
    owner: OWNER,
    bandId: BAND_ID,
    setListId: SET_LIST,
    title: `Song ${id}`,
    artist: null,
    key: null,
    bpm: null,
    notes: null,
    songUrl: null,
    tabUrl: null,
    createdAt: '2026-01-02T00:00:00Z',
    ...over,
  }) as unknown as ValidSong;

const CONTENT_TYPES: Record<AudioExt, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac' };

/** A row that passes every check; `over` breaks one thing at a time. */
function row(n: number, over: Partial<BackingTrackRecord> = {}, ext: AudioExt = 'mp3'): BackingTrackRecord {
  const owner = over.owner ?? BOB;
  const songId = over.songId ?? SONG_A;
  const id = over.id ?? trackId(n);
  return {
    id,
    owner,
    bandId: BAND_ID,
    setListId: SET_LIST,
    songId,
    label: `Track ${n}`,
    forTags: [],
    key: committedKey({ sub: owner, bandId: BAND_ID, songId, trackId: id, ext }),
    contentType: CONTENT_TYPES[ext],
    bytes: 1024,
    format: 1,
    createdAt: `2026-02-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
    updatedAt: '2026-02-01T00:00:00Z',
    ...over,
  };
}

const members = new Set([OWNER, BOB]);
const resolve = (rows: BackingTrackRecord[], over: { sub?: string; band?: BandRecord; songs?: ValidSong[]; members?: Set<string> } = {}) =>
  resolveBackingTracks(rows, over.songs ?? [song(SONG_A), song(SONG_B)], over.members ?? members, over.band ?? band(), over.sub ?? OWNER);

describe('resolveBackingTracks', () => {
  it('keeps a valid row, adds the file extension and groups it under its song', () => {
    const result = resolve([row(1)]);
    const tracks = result.get(SONG_A)!;
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ id: trackId(1), label: 'Track 1', ext: 'mp3', owner: BOB, bytes: 1024 });
    expect(result.has(SONG_B)).toBe(false);
  });

  it.each([
    ['mp3', 'audio/mpeg'],
    ['m4a', 'audio/mp4'],
    ['wav', 'audio/wav'],
    ['flac', 'audio/flac'],
  ] as const)('maps the %s content type (%s) to its extension', (ext, contentType) => {
    expect(resolve([row(1, { contentType }, ext)]).get(SONG_A)![0].ext).toBe(ext);
  });

  it('returns an empty map for no rows', () => {
    expect(resolve([]).size).toBe(0);
  });

  describe('hides (never repairs) a row that fails a check', () => {
    const cases: [string, BackingTrackRecord][] = [
      ['an id that is not a uuid', row(1, { id: 'not-a-uuid', key: 'bt/x' })],
      ['an unknown format', row(1, { format: 2 })],
      ['a row for another band', row(1, { bandId: 'band-other' })],
      ['an owner who is not a member', row(1, { owner: MALLORY })],
      ['an unknown song', row(1, { songId: '20000000-0000-4000-8000-0000000000ff' })],
      ['a set list that does not match the song', row(1, { setListId: 'sl-2' })],
      ['an unknown content type', row(1, { contentType: 'text/html' })],
      ['a key that is not the committed key for the row', row(1, { key: 'bt/someone/else.mp3' })],
      ['a key whose extension disagrees with the content type', row(1, { contentType: 'audio/wav' })],
      ['an empty label', row(1, { label: '' })],
      ['a label that changes when sanitised (padding)', row(1, { label: ' padded ' })],
      ['a label with a zero-width character', row(1, { label: 'a​b' })],
      ['zero bytes', row(1, { bytes: 0 })],
      ['a fractional size', row(1, { bytes: 10.5 })],
      ['a size above the cap', row(1, { bytes: 50 * 1024 * 1024 + 1 })],
      ['no server timestamp', row(1, { createdAt: undefined })],
    ];
    it.each(cases)('%s', (_name, bad) => {
      expect(resolve([bad]).size).toBe(0);
    });

    it('a banned owner (even though still in the member set)', () => {
      expect(resolve([row(1)], { band: band({ bannedSubs: [BOB] }) }).size).toBe(0);
    });

    it('a bad row does not hide the good ones next to it', () => {
      const result = resolve([row(1, { label: '' }), row(2)]);
      expect(result.get(SONG_A)!.map((t) => t.id)).toEqual([trackId(2)]);
    });

    it('accepts a size at exactly the cap and at one byte', () => {
      expect(resolve([row(1, { bytes: 50 * 1024 * 1024 }), row(2, { bytes: 1 })]).get(SONG_A)).toHaveLength(2);
    });
  });

  describe('tags', () => {
    it('keeps known instruments in palette order and drops unknown ones', () => {
      const tracks = resolve([row(1, { forTags: ['drums', 'nonsense', null, 'guitar', 'drums'] })]);
      expect(tracks.get(SONG_A)![0].forTags).toEqual(['guitar', 'drums']);
    });

    it('treats null and missing tags as for everyone', () => {
      expect(resolve([row(1, { forTags: null })]).get(SONG_A)![0].forTags).toEqual([]);
      expect(resolve([row(1, { forTags: undefined })]).get(SONG_A)![0].forTags).toEqual([]);
    });
  });

  describe('ordering and duplicates', () => {
    it('orders each song oldest first whatever order the rows arrive in', () => {
      const result = resolve([
        row(3, { createdAt: '2026-03-01T00:00:00Z' }),
        row(1, { createdAt: '2026-01-01T00:00:00Z' }),
        row(2, { createdAt: '2026-02-01T00:00:00Z' }),
      ]);
      expect(result.get(SONG_A)!.map((t) => t.id)).toEqual([trackId(1), trackId(2), trackId(3)]);
    });

    it('breaks a timestamp tie by id so the order is stable', () => {
      const same = '2026-01-01T00:00:00Z';
      const a = resolve([row(2, { createdAt: same }), row(1, { createdAt: same })]);
      const b = resolve([row(1, { createdAt: same }), row(2, { createdAt: same })]);
      expect(a.get(SONG_A)!.map((t) => t.id)).toEqual([trackId(1), trackId(2)]);
      expect(b.get(SONG_A)!.map((t) => t.id)).toEqual([trackId(1), trackId(2)]);
    });

    it('counts a row repeated by a paging quirk once (same id)', () => {
      const dup = row(1);
      expect(resolve([dup, { ...dup }]).get(SONG_A)).toHaveLength(1);
    });

    it('hides a row that borrows another row\'s key (the key must be derived from its own id)', () => {
      const first = row(1);
      const second = row(2, { key: first.key });
      expect(resolve([first, second]).get(SONG_A)!.map((t) => t.id)).toEqual([trackId(1)]);
    });

    it('groups tracks per song', () => {
      const result = resolve([row(1), row(2, { songId: SONG_B })]);
      expect(result.get(SONG_A)!.map((t) => t.id)).toEqual([trackId(1)]);
      expect(result.get(SONG_B)!.map((t) => t.id)).toEqual([trackId(2)]);
    });
  });

  describe('per-song cap', () => {
    const flood = (count: number, owner: string, startAt = 1) =>
      Array.from({ length: count }, (_, i) => row(startAt + i, { owner, createdAt: `2026-02-01T00:00:${String(startAt + i).padStart(2, '0')}Z` }));

    it('shows at most 10 of other people\'s tracks per song, oldest first', () => {
      const result = resolve(flood(12, BOB), { sub: OWNER });
      const ids = result.get(SONG_A)!.map((t) => t.id);
      expect(ids).toHaveLength(10);
      expect(ids[0]).toBe(trackId(1));
      expect(ids).not.toContain(trackId(11));
    });

    it('keeps the caller\'s own tracks visible past the cap, so a flood cannot hide them', () => {
      const rows = [...flood(10, BOB), row(11, { owner: OWNER, createdAt: '2026-02-01T00:00:11Z' })];
      const result = resolve(rows, { sub: OWNER });
      const tracks = result.get(SONG_A)!;
      expect(tracks).toHaveLength(11);
      expect(tracks[10].owner).toBe(OWNER);
    });

    it('does not keep someone else\'s tracks past the cap just because they are newer', () => {
      const rows = [...flood(10, BOB), row(11, { owner: OWNER, createdAt: '2026-02-01T00:00:11Z' })];
      expect(resolve(rows, { sub: BOB }).get(SONG_A)).toHaveLength(10);
    });

    it('applies the cap per song', () => {
      const rows = [...flood(10, BOB), ...flood(3, BOB, 20).map((r, i) => ({ ...r, songId: SONG_B, key: committedKey({ sub: BOB, bandId: BAND_ID, songId: SONG_B, trackId: trackId(20 + i), ext: 'mp3' }) }))];
      const result = resolve(rows, { sub: OWNER });
      expect(result.get(SONG_A)).toHaveLength(10);
      expect(result.get(SONG_B)).toHaveLength(3);
    });
  });
});

describe('backingTrackFileName', () => {
  it('uses the label and extension', () => {
    expect(backingTrackFileName({ label: 'No drums', ext: 'mp3' })).toBe('No drums.mp3');
  });

  it('removes characters that are unsafe in a file name', () => {
    expect(backingTrackFileName({ label: 'a/b\\c:d*e?"f<g>h|i', ext: 'wav' })).toBe('abcdefghi.wav');
  });

  it('keeps letters from any script, digits, dashes and underscores', () => {
    expect(backingTrackFileName({ label: 'Café ドラム 2-take_3', ext: 'flac' })).toBe('Café ドラム 2-take_3.flac');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(backingTrackFileName({ label: '  a   b  ', ext: 'm4a' })).toBe('a b.m4a');
  });

  it('falls back to a generic name when nothing safe is left', () => {
    expect(backingTrackFileName({ label: '///', ext: 'mp3' })).toBe('Backing track.mp3');
    expect(backingTrackFileName({ label: '', ext: 'mp3' })).toBe('Backing track.mp3');
  });

  it('cannot produce a path traversal', () => {
    const name = backingTrackFileName({ label: '../../etc/passwd', ext: 'mp3' });
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });
});

describe('formatTrackSize', () => {
  it('shows kilobytes below a megabyte', () => {
    expect(formatTrackSize(480 * 1024)).toBe('480 KB');
    expect(formatTrackSize(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('never shows 0 KB', () => {
    expect(formatTrackSize(1)).toBe('1 KB');
    expect(formatTrackSize(0)).toBe('1 KB');
  });

  it('shows megabytes with one decimal from 1 MB up', () => {
    expect(formatTrackSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatTrackSize(3.2 * 1024 * 1024)).toBe('3.2 MB');
    expect(formatTrackSize(50 * 1024 * 1024)).toBe('50.0 MB');
  });
});

describe('file limits', () => {
  it('exposes the size and extension constants the messages are built from', () => {
    expect(BYTES_PER_MB).toBe(1024 * 1024);
    expect(MAX_FILE_MB).toBe(50);
    expect(ACCEPTED_EXTENSIONS_TEXT).toBe('MP3, M4A, WAV, FLAC');
    expect(FILE_TOO_BIG_MESSAGE).toBe('Files can be up to 50 MB. Try an MP3, M4A or FLAC.');
  });
});

describe('inspectBackingTrackFile', () => {
  it.each([
    ['a.mp3', 'mp3'],
    ['a.M4A', 'm4a'],
    ['take 2.wav', 'wav'],
    ['a.b.FLAC', 'flac'],
  ] as const)('accepts %s and reports the extension %s', (name, ext) => {
    expect(inspectBackingTrackFile({ name, size: 10 })).toEqual({ ext });
  });

  it('rejects an unsupported or missing extension, listing the supported ones', () => {
    expect(inspectBackingTrackFile({ name: 'a.ogg', size: 10 })).toEqual({ problem: 'Choose a MP3, M4A, WAV, FLAC file.' });
    expect(inspectBackingTrackFile({ name: 'noextension', size: 10 })).toEqual({ problem: 'Choose a MP3, M4A, WAV, FLAC file.' });
    expect(inspectBackingTrackFile({ name: 'mp3', size: 10 })).toHaveProperty('problem');
  });

  it('checks the type before the size (a huge .txt is a type problem)', () => {
    expect(inspectBackingTrackFile({ name: 'a.txt', size: 0 })).toEqual({ problem: 'Choose a MP3, M4A, WAV, FLAC file.' });
  });

  it('rejects an empty file', () => {
    expect(inspectBackingTrackFile({ name: 'a.mp3', size: 0 })).toEqual({ problem: 'That file is empty.' });
  });

  it('accepts a 1 byte file and exactly the cap, and rejects one byte more', () => {
    const cap = 50 * 1024 * 1024;
    expect(inspectBackingTrackFile({ name: 'a.mp3', size: 1 })).toEqual({ ext: 'mp3' });
    expect(inspectBackingTrackFile({ name: 'a.mp3', size: cap })).toEqual({ ext: 'mp3' });
    expect(inspectBackingTrackFile({ name: 'a.mp3', size: cap + 1 })).toEqual({ problem: FILE_TOO_BIG_MESSAGE });
  });
});

describe('checkBackingTrackFile', () => {
  it('is null when the file can go', () => {
    for (const name of ['a.mp3', 'a.M4A', 'a.wav', 'a.FLAC']) expect(checkBackingTrackFile({ name, size: 10 })).toBeNull();
  });

  it('returns the same problem text as inspectBackingTrackFile', () => {
    for (const file of [
      { name: 'a.ogg', size: 10 },
      { name: 'a.mp3', size: 0 },
      { name: 'a.mp3', size: 50 * 1024 * 1024 + 1 },
    ]) {
      expect(checkBackingTrackFile(file)).toBe((inspectBackingTrackFile(file) as { problem: string }).problem);
    }
  });
});

describe('canRemoveBackingTrack', () => {
  const t = { owner: 'sub-bob' };

  it('lets the author remove their own track', () => {
    expect(canRemoveBackingTrack(t, 'sub-bob', false)).toBe(true);
  });

  it('lets the band owner remove anyone\'s track', () => {
    expect(canRemoveBackingTrack(t, 'sub-owner', true)).toBe(true);
  });

  it('refuses another member', () => {
    expect(canRemoveBackingTrack(t, 'sub-me', false)).toBe(false);
  });
});
