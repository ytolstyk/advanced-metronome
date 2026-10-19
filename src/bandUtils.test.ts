import { describe, expect, it } from 'vitest';
import {
  BAND_LIMITS,
  SONG_COLOR_KEYS,
  VOTE_INDEX_LAG_GRACE_MS,
  type BandRecord,
  type MemberRecord,
  type PendingChoice,
  type PendingVote,
  type SetListRecord,
  type SongColorRecord,
  type SongRecord,
  type VoteRecord,
} from './bandTypes';
import {
  activePending,
  adjustTally,
  buildDisplayNames,
  buildInviteLink,
  filterCountedVotes,
  filterValidMembers,
  filterValidSetLists,
  filterValidSongs,
  formatInviteCode,
  generateInviteCode,
  isBanned,
  isCleanText,
  isSetListShared,
  isSongColorKey,
  isVoteValue,
  myColorSongIds,
  myVotes,
  normalizeHttpUrl,
  normalizeInviteCode,
  parseSongInput,
  partitionSongs,
  requireDisplayName,
  requireName,
  resolveMyVote,
  resolveSongColors,
  sanitizeDisplayName,
  sanitizeName,
  sanitizeNotes,
  songFieldError,
  sortSongsByScore,
  splitTextWithLinks,
  stripUnsafeText,
  tallyVotes,
  textLength,
  validMemberSubs,
} from './bandUtils';

const OWNER = 'sub-owner';
const BOB = 'sub-bob';
const CAT = 'sub-cat';
const MALLORY = 'sub-mallory';

const band = (over: Partial<BandRecord> = {}): BandRecord => ({
  id: 'band-1',
  owner: OWNER,
  name: 'The Band',
  inviteCode: 'ABCDEFGHJK',
  deletedAt: null,
  version: 1,
  setListIds: ['sl-1'],
  archivedSetListIds: [],
  bannedSubs: [],
  hiddenSongIds: [],
  sharedSetListIds: [],
  ...over,
});
const member = (owner: string, over: Partial<MemberRecord> = {}): MemberRecord => ({
  bandId: 'band-1',
  owner,
  displayName: owner.replace('sub-', ''),
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});
const setList = (over: Partial<SetListRecord> = {}): SetListRecord => ({
  id: 'sl-1',
  owner: OWNER,
  bandId: 'band-1',
  name: 'Main Set',
  archivedAt: null,
  ...over,
});
const song = (id: string, owner: string, over: Partial<SongRecord> = {}): SongRecord => ({
  id,
  owner,
  bandId: 'band-1',
  setListId: 'sl-1',
  title: `Song ${id}`,
  artist: null,
  key: null,
  bpm: null,
  notes: null,
  songUrl: null,
  tabUrl: null,
  createdAt: '2026-01-02T00:00:00Z',
  ...over,
});
const vote = (songId: string, owner: string, value: string, over: Partial<VoteRecord> = {}): VoteRecord => ({
  songId,
  owner,
  value,
  bandId: 'band-1',
  setListId: 'sl-1',
  ...over,
});

/** Build the validated world the pages see. */
function world(b: BandRecord, members: MemberRecord[], setLists: SetListRecord[], songs: SongRecord[]) {
  const validMembers = filterValidMembers(members, b);
  const subs = validMemberSubs(validMembers, b);
  const validSetLists = filterValidSetLists(setLists, b);
  const validSongs = filterValidSongs(songs, b, validSetLists, subs);
  return { validMembers, subs, validSetLists, validSongs };
}

describe('invite codes', () => {
  it('generates 10 chars from the 32-char alphabet', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(BAND_LIMITS.inviteCodeLength);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  });

  it('maps bytes without modulo bias (b & 31) and never emits ambiguous characters', () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, i) => i * 25); // spread over 0..225
    const code = generateInviteCode(() => bytes);
    expect(code).toHaveLength(10);
    expect(code).not.toMatch(/[IO01]/);
    const all = generateInviteCode(() => Uint8Array.from({ length: 10 }, (_, i) => 255 - i * 13));
    expect(all).toMatch(/^[A-Z2-9]{10}$/);
  });

  it('formats and normalizes user input', () => {
    expect(formatInviteCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(normalizeInviteCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeInviteCode(' abcde fghjk ')).toBe('ABCDEFGHJK');
  });

  it('rejects wrong length or ambiguous characters', () => {
    expect(normalizeInviteCode('ABCDE')).toBeNull();
    expect(normalizeInviteCode('ABCDE-FGHJKL')).toBeNull();
    expect(normalizeInviteCode('ABCDE-FGHJ0')).toBeNull(); // zero
    expect(normalizeInviteCode('ABCDE-FGHJO')).toBeNull(); // letter O
    expect(normalizeInviteCode('')).toBeNull();
  });
});

describe('sanitizeDisplayName', () => {
  it('trims, collapses whitespace and clamps length', () => {
    expect(sanitizeDisplayName('  Mike   Jones ')).toBe('Mike Jones');
    expect(sanitizeDisplayName('x'.repeat(100))).toHaveLength(BAND_LIMITS.displayNameMax);
  });

  it('strips control, zero-width and bidi characters', () => {
    expect(sanitizeDisplayName('Mi\u0000ke\u200b\u202e')).toBe('Mike');
    expect(sanitizeDisplayName('\u2066Eve\u2069')).toBe('Eve');
  });

  it('can end up empty', () => {
    expect(sanitizeDisplayName(' \u200b ')).toBe('');
  });
});

describe('filterValidMembers', () => {
  it('drops banned members but never the owner', () => {
    const b = band({ bannedSubs: [BOB, OWNER] });
    const valid = filterValidMembers([member(OWNER), member(BOB), member(CAT)], b);
    expect(valid.map((m) => m.owner).sort()).toEqual([CAT, OWNER]);
  });

  it('drops rows for another band, empty owner, duplicates (earliest wins) and bad names', () => {
    const rows = [
      member(BOB, { createdAt: '2026-01-05T00:00:00Z', displayName: 'Late Bob' }),
      member(BOB, { createdAt: '2026-01-02T00:00:00Z', displayName: 'Early Bob' }),
      member(CAT, { bandId: 'other-band' }),
      member('', {}),
      member('sub-dan', { displayName: '   ' }),
      member('sub-eve', { displayName: 'x'.repeat(31) }),
    ];
    const valid = filterValidMembers(rows, band());
    expect(valid).toHaveLength(1);
    expect(valid[0].displayName).toBe('Early Bob');
  });

  it('returns nothing for a tombstoned band', () => {
    expect(filterValidMembers([member(OWNER)], band({ deletedAt: '2026-02-01T00:00:00Z' }))).toEqual([]);
  });
});

describe('validMemberSubs', () => {
  it('always includes the owner, even without a Member row', () => {
    const subs = validMemberSubs(filterValidMembers([member(BOB)], band()), band());
    expect(subs.has(OWNER)).toBe(true);
    expect(subs.has(BOB)).toBe(true);
  });

  it('is empty for a tombstoned band', () => {
    const dead = band({ deletedAt: '2026-02-01T00:00:00Z' });
    expect(validMemberSubs([], dead).size).toBe(0);
  });
});

describe('filterValidSetLists', () => {
  it('requires the id to be in Band.setListIds', () => {
    const forged = setList({ id: 'sl-forged', owner: MALLORY });
    expect(filterValidSetLists([setList(), forged], band())).toHaveLength(1);
  });

  it('rejects owner mismatch, wrong band, archived and bad names', () => {
    const b = band({ setListIds: ['a', 'b', 'c', 'd', 'e'] });
    const rows = [
      setList({ id: 'a', owner: MALLORY }),
      setList({ id: 'b', bandId: 'other' }),
      setList({ id: 'c', archivedAt: '2026-02-01T00:00:00Z' }),
      setList({ id: 'd', name: ' ' }),
      setList({ id: 'e' }),
    ];
    expect(filterValidSetLists(rows, b).map((s) => s.id)).toEqual(['e']);
  });

  it('returns nothing for a tombstoned band', () => {
    expect(filterValidSetLists([setList()], band({ deletedAt: '2026-02-01T00:00:00Z' }))).toEqual([]);
  });
});

describe('filterValidSongs', () => {
  const b = band();
  const members = [member(BOB)];

  it('keeps songs by valid members in valid set lists', () => {
    const w = world(b, members, [setList()], [song('s1', BOB), song('s2', OWNER)]);
    expect(w.validSongs.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('hides songs by non-members, banned members and outsiders', () => {
    const banned = band({ bannedSubs: [BOB] });
    const w = world(banned, members, [setList()], [song('s1', BOB), song('s2', MALLORY)]);
    expect(w.validSongs).toEqual([]);
  });

  it('hides songs pointing at an unknown / forged / archived set list or another band', () => {
    const songs = [
      song('s1', BOB, { setListId: 'sl-forged' }),
      song('s2', BOB, { bandId: 'other-band' }),
      song('s3', BOB, { setListId: 'sl-archived' }),
    ];
    const lists = [setList(), setList({ id: 'sl-archived', archivedAt: '2026-02-01T00:00:00Z' })];
    const b2 = band({ setListIds: ['sl-1', 'sl-archived'] });
    expect(world(b2, members, lists, songs).validSongs).toEqual([]);
  });

  it('hides songs the owner hid (and restoring the id shows them again)', () => {
    const hidden = band({ hiddenSongIds: ['s1'] });
    expect(world(hidden, members, [setList()], [song('s1', BOB)]).validSongs).toEqual([]);
    expect(world(band(), members, [setList()], [song('s1', BOB)]).validSongs).toHaveLength(1);
  });

  it('hides out-of-bounds fields instead of truncating them', () => {
    const rows = [
      song('long-title', BOB, { title: 'x'.repeat(101) }),
      song('blank-title', BOB, { title: '  ' }),
      song('long-artist', BOB, { artist: 'x'.repeat(101) }),
      song('long-notes', BOB, { notes: 'x'.repeat(501) }),
      song('bad-key', BOB, { key: 'H' }),
      song('low-bpm', BOB, { bpm: 39 }),
      song('high-bpm', BOB, { bpm: 301 }),
      song('frac-bpm', BOB, { bpm: 120.5 }),
      song('ok', BOB, { key: 'F#m', bpm: 120, artist: 'Someone', notes: 'capo 2' }),
    ];
    expect(world(b, members, [setList()], rows).validSongs.map((s) => s.id)).toEqual(['ok']);
  });

  it('accepts all 12-note key spellings', () => {
    const keys = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Am', 'F#m'];
    const rows = keys.map((k, i) => song(`k${i}`, BOB, { key: k }));
    expect(world(b, members, [setList()], rows).validSongs).toHaveLength(keys.length);
  });

  it('returns nothing for a tombstoned band', () => {
    const dead = band({ deletedAt: '2026-02-01T00:00:00Z' });
    expect(filterValidSongs([song('s1', BOB)], dead, [], new Set([BOB]))).toEqual([]);
  });
});

describe('votes', () => {
  const b = band();
  const members = [member(BOB), member(CAT)];
  const songs = [song('s1', BOB), song('s2', CAT)];
  const w = world(b, members, [setList()], songs);

  const counted = (votes: VoteRecord[]) => filterCountedVotes(votes, w.validSongs, w.subs);

  it('counts one vote per member per song and tallies up/down', () => {
    const c = counted([vote('s1', OWNER, 'up'), vote('s1', BOB, 'up'), vote('s1', CAT, 'down')]);
    const t = tallyVotes(c, w.validSongs).get('s1');
    expect(t).toEqual({ up: 2, down: 1, score: 1 });
  });

  it('ignores votes from non-members and banned members', () => {
    const banned = world(band({ bannedSubs: [BOB] }), members, [setList()], songs);
    const c = filterCountedVotes(
      [vote('s2', MALLORY, 'down'), vote('s2', BOB, 'down'), vote('s2', CAT, 'up')],
      banned.validSongs,
      banned.subs,
    );
    expect(tallyVotes(c, banned.validSongs).get('s2')).toEqual({ up: 1, down: 0, score: 1 });
  });

  it('ignores votes whose bandId/setListId disagree with the song', () => {
    const c = counted([
      vote('s1', BOB, 'up', { setListId: 'sl-other' }),
      vote('s1', CAT, 'up', { bandId: 'band-other' }),
    ]);
    expect(c).toEqual([]);
  });

  it('ignores votes on unknown/hidden songs and invalid values', () => {
    const hidden = world(band({ hiddenSongIds: ['s1'] }), members, [setList()], songs);
    const c = filterCountedVotes(
      [vote('s1', BOB, 'up'), vote('s2', BOB, 'sideways'), vote('nope', BOB, 'up'), vote('s2', CAT, '')],
      hidden.validSongs,
      hidden.subs,
    );
    expect(c).toEqual([]);
  });

  it('keeps only the latest row if a (song, voter) pair ever appears twice', () => {
    const c = counted([
      vote('s1', BOB, 'up', { updatedAt: '2026-03-01T00:00:00Z' }),
      vote('s1', BOB, 'down', { updatedAt: '2026-03-02T00:00:00Z' }),
      vote('s1', CAT, 'up', { updatedAt: '2026-03-03T00:00:00Z' }),
      vote('s1', CAT, 'down', { updatedAt: '2026-03-01T00:00:00Z' }),
    ]);
    const t = tallyVotes(c, w.validSongs).get('s1');
    expect(t).toEqual({ up: 1, down: 1, score: 0 });
  });

  it('tally lists every valid song, even with no votes', () => {
    const t = tallyVotes([], w.validSongs);
    expect(t.get('s1')).toEqual({ up: 0, down: 0, score: 0 });
    expect(t.get('s2')).toEqual({ up: 0, down: 0, score: 0 });
  });

  it('myVotes returns only the caller\'s counted votes', () => {
    const c = counted([vote('s1', BOB, 'up'), vote('s2', BOB, 'down'), vote('s1', CAT, 'down')]);
    expect(myVotes(c, BOB)).toEqual(new Map([['s1', 'up'], ['s2', 'down']]));
    expect(myVotes(c, MALLORY).size).toBe(0);
  });

  it('isVoteValue accepts only up/down', () => {
    expect(isVoteValue('up')).toBe(true);
    expect(isVoteValue('down')).toBe(true);
    expect(isVoteValue('UP')).toBe(false);
    expect(isVoteValue('')).toBe(false);
  });
});

describe('sortSongsByScore', () => {
  it('sorts by score desc, then createdAt asc, then id', () => {
    const b = band();
    const songs = [
      song('c', BOB, { createdAt: '2026-01-03T00:00:00Z' }),
      song('a', BOB, { createdAt: '2026-01-03T00:00:00Z' }),
      song('b', BOB, { createdAt: '2026-01-01T00:00:00Z' }),
      song('top', BOB, { createdAt: '2026-01-09T00:00:00Z' }),
    ];
    const w = world(b, [member(BOB), member(CAT)], [setList()], songs);
    const counted = filterCountedVotes(
      [vote('top', BOB, 'up'), vote('top', CAT, 'up'), vote('c', BOB, 'down')],
      w.validSongs,
      w.subs,
    );
    const tallies = tallyVotes(counted, w.validSongs);
    expect(sortSongsByScore(w.validSongs, tallies).map((s) => s.id)).toEqual(['top', 'b', 'a', 'c']);
  });

  it('does not mutate its input', () => {
    const w = world(band(), [member(BOB)], [setList()], [song('b', BOB), song('a', BOB)]);
    const before = w.validSongs.map((s) => s.id);
    sortSongsByScore(w.validSongs, tallyVotes([], w.validSongs));
    expect(w.validSongs.map((s) => s.id)).toEqual(before);
  });
});

describe('buildDisplayNames', () => {
  it('suffixes duplicates case-insensitively in createdAt then owner order', () => {
    const members = filterValidMembers(
      [
        member('sub-z', { displayName: 'mike', createdAt: '2026-01-03T00:00:00Z' }),
        member('sub-a', { displayName: 'Mike', createdAt: '2026-01-02T00:00:00Z' }),
        member('sub-b', { displayName: 'MIKE', createdAt: '2026-01-02T00:00:00Z' }),
        member('sub-c', { displayName: 'Cat', createdAt: '2026-01-01T00:00:00Z' }),
      ],
      band(),
    );
    const names = buildDisplayNames(members);
    expect(names.get('sub-c')).toBe('Cat');
    expect(names.get('sub-a')).toBe('Mike');
    expect(names.get('sub-b')).toBe('MIKE (2)');
    expect(names.get('sub-z')).toBe('mike (3)');
  });
});

describe('parseSongInput', () => {
  it('normalizes a full valid form', () => {
    expect(parseSongInput({ title: '  Wonderwall ', artist: ' Oasis ', key: 'F#m', bpm: '87', notes: ' capo 2 ' })).toEqual({
      value: { title: 'Wonderwall', artist: 'Oasis', key: 'F#m', bpm: 87, notes: 'capo 2', songUrl: null, tabUrl: null },
    });
  });

  it('treats blank optional fields as null and accepts numeric bpm', () => {
    expect(parseSongInput({ title: 'x', artist: ' ', key: '', bpm: '', notes: '' })).toEqual({
      value: { title: 'x', artist: null, key: null, bpm: null, notes: null, songUrl: null, tabUrl: null },
    });
    expect(parseSongInput({ title: 'x', bpm: 120 })).toMatchObject({ value: { bpm: 120 } });
    expect(parseSongInput({ title: 'x', bpm: null })).toMatchObject({ value: { bpm: null } });
  });

  it('requires a non-blank title within bounds', () => {
    expect(parseSongInput({ title: '   ' })).toEqual({ error: 'Title is required' });
    expect(parseSongInput({ title: 'x'.repeat(101) })).toHaveProperty('error');
    expect(parseSongInput({ title: 'x'.repeat(100) })).toHaveProperty('value');
  });

  it('rejects over-long artist/notes and bad keys', () => {
    expect(parseSongInput({ title: 'x', artist: 'a'.repeat(101) })).toHaveProperty('error');
    expect(parseSongInput({ title: 'x', notes: 'n'.repeat(501) })).toHaveProperty('error');
    expect(parseSongInput({ title: 'x', key: 'H' })).toEqual({ error: 'Key must look like C, F#, Bb or Am' });
  });

  it('rejects bpm outside 40-300 or not a whole number', () => {
    for (const bpm of ['39', '301', '120.5', 'fast', '-5']) {
      expect(parseSongInput({ title: 'x', bpm })).toHaveProperty('error');
    }
    expect(parseSongInput({ title: 'x', bpm: '40' })).toHaveProperty('value');
    expect(parseSongInput({ title: 'x', bpm: '300' })).toHaveProperty('value');
  });

  it('strips control and bidi characters from text fields', () => {
    const bs = String.fromCharCode(92);
    const dirty = `Ti${String.fromCharCode(0)}tle${String.fromCharCode(0x202e)}`;
    expect(bs).toBe('\\');
    expect(parseSongInput({ title: dirty })).toEqual({
      value: { title: 'Title', artist: null, key: null, bpm: null, notes: null, songUrl: null, tabUrl: null },
    });
  });
});

describe('adjustTally', () => {
  const base = { up: 2, down: 1, score: 1 };

  it('leaves the tally alone when there is no pending vote', () => {
    expect(adjustTally(base, 'up', undefined)).toBe(base);
  });

  it('adds a first vote, switches a vote and retracts a vote', () => {
    expect(adjustTally(base, undefined, 'up')).toEqual({ up: 3, down: 1, score: 2 });
    expect(adjustTally(base, undefined, 'down')).toEqual({ up: 2, down: 2, score: 0 });
    expect(adjustTally(base, 'up', 'down')).toEqual({ up: 1, down: 2, score: -1 });
    expect(adjustTally(base, 'down', 'up')).toEqual({ up: 3, down: 0, score: 3 });
    expect(adjustTally(base, 'up', null)).toEqual({ up: 1, down: 1, score: 0 });
    expect(adjustTally(base, undefined, null)).toEqual({ up: 2, down: 1, score: 1 });
  });

  it('is a no-op when the pending vote equals what the server already counted', () => {
    expect(adjustTally(base, 'up', 'up')).toEqual(base);
  });
});

const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);
const SMILE = String.fromCodePoint(0x1f600);

describe('text sanitising', () => {
  it('turns tabs and newlines into spaces instead of gluing words together', () => {
    expect(stripUnsafeText('capo 2\nplay softly')).toBe('capo 2 play softly');
    expect(sanitizeDisplayName('Mike\tJones')).toBe('Mike Jones');
    expect(sanitizeDisplayName('A\r\nB')).toBe('A B');
  });

  it('band and set-list names keep up to 50 characters; display names stop at 30', () => {
    const forty = 'a'.repeat(40);
    expect(sanitizeName(forty)).toBe(forty); // regression: names used to be cut to 30
    expect(sanitizeDisplayName(forty)).toHaveLength(30);
    expect(sanitizeName('a'.repeat(80))).toHaveLength(BAND_LIMITS.nameMax);
  });

  it('clamps by characters and never splits an emoji', () => {
    const out = sanitizeDisplayName('x'.repeat(29) + SMILE + SMILE);
    expect(textLength(out)).toBe(30);
    expect(Array.from(out).at(-1)).toBe(SMILE);
    expect(textLength(SMILE)).toBe(1);
    expect(SMILE.length).toBe(2);
  });

  it('requireName / requireDisplayName throw a user-facing error when nothing is left', () => {
    expect(requireName('  Gig  ')).toBe('Gig');
    expect(() => requireName(' ' + ZWSP)).toThrow('A name is required');
    expect(requireDisplayName(' Bob ')).toBe('Bob');
    expect(() => requireDisplayName('')).toThrow('A display name is required');
  });

  it('notes keep single line breaks, collapse blank runs and strip unsafe characters per line', () => {
    expect(sanitizeNotes('line1\r\n\r\n\r\nline2\tindent')).toBe('line1\n\nline2 indent');
    expect(sanitizeNotes(`a${ZWSP}b\n${RLO}c`)).toBe('ab\nc');
    expect(sanitizeNotes('  \n  ')).toBe('');
  });
});

describe('read-time text integrity (rows that changed when cleaned were not written by this app)', () => {
  const b = band();
  const members = [member(BOB)];

  it('hides members whose name has zero-width padding or is only invisible characters', () => {
    const rows = [
      member('sub-a', { displayName: 'Bob' + ZWSP }),
      member('sub-b', { displayName: ZWSP }),
      member('sub-c', { displayName: 'Ok' }),
    ];
    expect(filterValidMembers(rows, b).map((m) => m.owner)).toEqual(['sub-c']);
  });

  it('hides songs with bidi/zero-width titles, artists or notes, but allows real multi-line notes', () => {
    const rows = [
      song('rlo', BOB, { title: 'Evil' + RLO }),
      song('zw-artist', BOB, { artist: 'A' + ZWSP }),
      song('bad-notes', BOB, { notes: 'x' + ZWSP }),
      song('multi', BOB, { notes: 'verse\nchorus' }),
    ];
    expect(world(b, members, [setList()], rows).validSongs.map((s) => s.id)).toEqual(['multi']);
  });

  it('hides set lists with invisible characters in the name', () => {
    expect(filterValidSetLists([setList({ name: 'Main' + ZWSP })], b)).toEqual([]);
  });
});

describe('hostile band data', () => {
  it('only the first maxSetLists ids in Band.setListIds count', () => {
    const ids = Array.from({ length: BAND_LIMITS.maxSetLists + 5 }, (_, i) => `sl-${i}`);
    const b = band({ setListIds: ids });
    const rows = ids.map((id) => setList({ id }));
    const valid = filterValidSetLists(rows, b).map((s) => s.id);
    expect(valid).toHaveLength(BAND_LIMITS.maxSetLists);
    expect(valid).not.toContain(`sl-${BAND_LIMITS.maxSetLists}`);
  });

  it('an empty owner never validates anything (missing owner must not match a missing owner)', () => {
    const noOwner = band({ owner: '' });
    expect(filterValidSetLists([setList({ owner: '' })], noOwner)).toEqual([]);
    expect(validMemberSubs([], noOwner).has('')).toBe(false);
  });

  it('the owner is never banned, even if listed in bannedSubs', () => {
    const b = band({ bannedSubs: [OWNER, BOB] });
    expect(isBanned(b, OWNER)).toBe(false);
    expect(isBanned(b, BOB)).toBe(true);
    expect(isBanned(b, CAT)).toBe(false);
  });
});

describe('partitionSongs', () => {
  it('splits valid songs into visible and owner-hidden in one pass, ignoring invalid ones', () => {
    const b = band({ hiddenSongIds: ['h', 'forged-hidden'] });
    const lists = filterValidSetLists([setList()], b);
    const subs = new Set([OWNER, BOB]);
    const { visible, hidden } = partitionSongs(
      [song('v', BOB), song('h', BOB), song('x', MALLORY), song('forged-hidden', MALLORY)],
      b,
      lists,
      subs,
    );
    expect(visible.map((s) => s.id)).toEqual(['v']);
    expect(hidden.map((s) => s.id)).toEqual(['h']);
  });
});

describe('songFieldError (one definition of the bounds for forms and validators)', () => {
  it('returns null for a good song and a message for each violation', () => {
    expect(songFieldError({ title: 'x' })).toBeNull();
    expect(songFieldError({ title: ' ' })).toBe('Title is required');
    expect(songFieldError({ title: 'x'.repeat(101) })).toContain('Title');
    expect(songFieldError({ title: 'x', artist: 'a'.repeat(101) })).toContain('Artist');
    expect(songFieldError({ title: 'x', notes: 'n'.repeat(501) })).toContain('Notes');
    expect(songFieldError({ title: 'x', key: 'H' })).toContain('Key');
    expect(songFieldError({ title: 'x', bpm: 39 })).toContain('BPM');
    expect(songFieldError({ title: 'x', bpm: Number.NaN })).toContain('BPM');
  });

  it('counts emoji as one character', () => {
    expect(songFieldError({ title: SMILE.repeat(100) })).toBeNull();
    expect(songFieldError({ title: SMILE.repeat(101) })).toContain('Title');
  });
});

describe('resolveMyVote (optimistic voting rule)', () => {
  const inFlight = (value: 'up' | 'down' | null): PendingVote => ({ value, settledAt: null });
  const settled = (value: 'up' | 'down' | null, at: number): PendingVote => ({ value, settledAt: at });

  it('uses the server vote when nothing is pending', () => {
    expect(resolveMyVote(undefined, 1000, 'up')).toEqual({ mine: 'up', pending: undefined });
    expect(resolveMyVote(undefined, 1000, undefined)).toEqual({ mine: undefined, pending: undefined });
  });

  it('trusts an in-flight choice over any fetch, including a retraction', () => {
    expect(resolveMyVote(inFlight('down'), 9_999_999, 'up')).toEqual({ mine: 'down', pending: 'down' });
    expect(resolveMyVote(inFlight(null), 9_999_999, 'up')).toEqual({ mine: undefined, pending: null });
  });

  it('keeps a settled choice while the data was fetched before the grace period ended', () => {
    expect(resolveMyVote(settled('up', 10_000), 10_000, undefined)).toEqual({ mine: 'up', pending: 'up' }); // fetched as the vote finished
    expect(resolveMyVote(settled('up', 10_000), 15_000, undefined)).toEqual({ mine: 'up', pending: 'up' }); // boundary: still inside
    expect(resolveMyVote(settled('up', 10_000), 5_000, undefined)).toEqual({ mine: 'up', pending: 'up' }); // fetched before the vote
  });

  it('falls back to the server once a later fetch is past the grace period', () => {
    expect(resolveMyVote(settled('up', 10_000), 15_001, 'down')).toEqual({ mine: 'down', pending: undefined });
    expect(resolveMyVote(settled('up', 10_000), 15_001, undefined)).toEqual({ mine: undefined, pending: undefined });
  });

  it('honours a custom grace period', () => {
    expect(resolveMyVote(settled('up', 0), 100, 'down', 50).pending).toBeUndefined();
    expect(resolveMyVote(settled('up', 0), 40, 'down', 50).pending).toBe('up');
  });
});

describe('buildInviteLink', () => {
  it('links only canonical codes', () => {
    expect(buildInviteLink('https://x.test', 'abcde-fghjk')).toBe('https://x.test/bands?join=ABCDEFGHJK');
    expect(buildInviteLink('https://x.test', 'nope')).toBeNull();
    expect(buildInviteLink('https://x.test', 'ABCDEFGHJK&x=1')).toBeNull();
    expect(buildInviteLink('https://x.test', '')).toBeNull();
  });
});

describe('buildDisplayNames uniqueness', () => {
  it('never produces two identical labels, even when a real name looks like a suffix', () => {
    const members = filterValidMembers(
      [
        member('sub-a', { displayName: 'Bob', createdAt: '2026-01-01T00:00:01Z' }),
        member('sub-b', { displayName: 'Bob', createdAt: '2026-01-01T00:00:02Z' }),
        member('sub-c', { displayName: 'Bob (2)', createdAt: '2026-01-01T00:00:03Z' }),
      ],
      band(),
    );
    const labels = [...buildDisplayNames(members).values()];
    expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(3);
    expect(labels).toContain('Bob');
    expect(labels).toContain('Bob (2)');
  });
});

describe('parseSongInput notes', () => {
  it('keeps line breaks, never glues words, and stays within the notes limit by characters', () => {
    expect(parseSongInput({ title: 'x', notes: 'verse\r\nchorus\tbridge' })).toMatchObject({
      value: { notes: 'verse\nchorus bridge' },
    });
    expect(parseSongInput({ title: 'x', notes: SMILE.repeat(BAND_LIMITS.notesMax) })).toHaveProperty('value');
    expect(parseSongInput({ title: 'x', notes: SMILE.repeat(BAND_LIMITS.notesMax + 1) })).toHaveProperty('error');
  });
});

describe('vote value narrowing', () => {
  it('counted votes expose a typed value', () => {
    const w = world(band(), [member(BOB)], [setList()], [song('s1', BOB)]);
    const counted = filterCountedVotes([vote('s1', BOB, 'up')], w.validSongs, w.subs);
    expect(counted[0].value).toBe('up');
    expect(myVotes(counted, BOB).get('s1')).toBe('up');
    expect(isVoteValue(counted[0].value)).toBe(true);
  });
});

describe('sanitising edge cases', () => {
  it('a clamp that ends on a space leaves no trailing space (the result stays "clean")', () => {
    const out = sanitizeDisplayName('abcdefghijklmnopqrstuvwxyz123 456');
    expect(out).toBe('abcdefghijklmnopqrstuvwxyz123');
    expect(stripUnsafeText(out)).toBe(out);
    expect(sanitizeName('a'.repeat(49) + ' b')).toBe('a'.repeat(49));
  });

  it('strips soft hyphens, invisible operators and the Hangul filler too', () => {
    const invisible = [0xad, 0x61c, 0x2060, 0x2062, 0x2064, 0x3164].map((c) => String.fromCharCode(c)).join('');
    expect(stripUnsafeText(`a${invisible}b`)).toBe('ab');
    expect(sanitizeDisplayName(invisible)).toBe('');
    const rows = [member('sub-a', { displayName: 'Bob' + String.fromCharCode(0x3164) }), member('sub-b', { displayName: 'Ok' })];
    expect(filterValidMembers(rows, band()).map((m) => m.owner)).toEqual(['sub-b']);
  });
});

describe('normalizeHttpUrl', () => {
  it('accepts http and https and returns the canonical href', () => {
    expect(normalizeHttpUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(normalizeHttpUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeHttpUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
    expect(normalizeHttpUrl('https://example.com:8080/x')).toBe('https://example.com:8080/x');
  });

  it('rejects script, data, file and other non-web schemes', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'mailto:a@example.com',
      'vbscript:msgbox(1)',
    ]) {
      expect(normalizeHttpUrl(bad), bad).toBeNull();
    }
  });

  it('rejects embedded credentials', () => {
    expect(normalizeHttpUrl('https://user@example.com/')).toBeNull();
    expect(normalizeHttpUrl('https://user:pw@example.com/')).toBeNull();
    expect(normalizeHttpUrl('http://:pw@example.com/')).toBeNull();
  });

  it('rejects text that is not a URL at all', () => {
    expect(normalizeHttpUrl('')).toBeNull();
    expect(normalizeHttpUrl('example.com/x')).toBeNull();
    expect(normalizeHttpUrl('not a url')).toBeNull();
    expect(normalizeHttpUrl('https://')).toBeNull();
  });
});

describe('parseSongInput links', () => {
  const link = (raw: { songUrl?: string; tabUrl?: string }) => parseSongInput({ title: 'x', ...raw });

  it('gives a bare host/path the https scheme', () => {
    expect(link({ songUrl: 'example.com/x', tabUrl: 'tabs.example.com/y?z=1' })).toMatchObject({
      value: { songUrl: 'https://example.com/x', tabUrl: 'https://tabs.example.com/y?z=1' },
    });
  });

  it('treats host:port as a host, not a scheme', () => {
    expect(link({ songUrl: 'localhost:3000/x' })).toMatchObject({ value: { songUrl: 'https://localhost:3000/x' } });
    expect(link({ songUrl: 'example.com:8080' })).toMatchObject({ value: { songUrl: 'https://example.com:8080/' } });
  });

  it('keeps an explicit http or https scheme and canonicalises it', () => {
    expect(link({ songUrl: 'http://example.com' })).toMatchObject({ value: { songUrl: 'http://example.com/' } });
    expect(link({ songUrl: 'HTTPS://Example.com/A' })).toMatchObject({ value: { songUrl: 'https://example.com/A' } });
  });

  it('trims surrounding whitespace and strips control characters', () => {
    expect(link({ songUrl: '  https://example.com/x  ' })).toMatchObject({ value: { songUrl: 'https://example.com/x' } });
    expect(link({ songUrl: 'https://exam\u200bple.com/x' })).toMatchObject({ value: { songUrl: 'https://example.com/x' } });
  });

  it('maps empty or blank links to null', () => {
    expect(link({})).toMatchObject({ value: { songUrl: null, tabUrl: null } });
    expect(link({ songUrl: '', tabUrl: '   ' })).toMatchObject({ value: { songUrl: null, tabUrl: null } });
  });

  it('reports an error naming the offending field for invalid links', () => {
    expect(link({ songUrl: 'javascript:alert(1)' })).toEqual({ error: expect.stringContaining('Song link') });
    expect(link({ tabUrl: 'data:text/html,hi' })).toEqual({ error: expect.stringContaining('Tab link') });
    expect(link({ songUrl: 'ftp://example.com/x' })).toHaveProperty('error');
    expect(link({ songUrl: 'mailto:a@example.com' })).toHaveProperty('error');
    expect(link({ tabUrl: 'https://user:pw@example.com/' })).toEqual({ error: expect.stringContaining('Tab link') });
    expect(link({ songUrl: 'not a url' })).toHaveProperty('error');
  });

  it('rejects links longer than the limit but accepts exactly the limit', () => {
    const prefix = 'https://example.com/';
    const atLimit = prefix + 'a'.repeat(BAND_LIMITS.urlMax - prefix.length);
    expect(link({ songUrl: atLimit })).toMatchObject({ value: { songUrl: atLimit } });
    expect(link({ songUrl: atLimit + 'a' })).toEqual({ error: expect.stringContaining('300 characters') });
  });
});

describe('songFieldError links (read-time rule)', () => {
  const err = (songUrl: string | null | undefined, tabUrl?: string | null) =>
    songFieldError({ title: 'x', songUrl, tabUrl });

  it('accepts absent, null and empty links', () => {
    expect(err(undefined)).toBeNull();
    expect(err(null, null)).toBeNull();
    expect(err('', '')).toBeNull();
  });

  it('accepts valid http(s) links, canonical or not byte-identical to the canonical form', () => {
    expect(err('https://example.com/x')).toBeNull();
    expect(err('https://example.com')).toBeNull();
    expect(err('HTTP://Example.com/x', 'https://example.com:8080/y')).toBeNull();
  });

  it('rejects non-web schemes, credentials and garbage with a field-specific message', () => {
    expect(err('javascript:alert(1)')).toContain('Song link');
    expect(err(null, 'data:text/html,x')).toContain('Tab link');
    expect(err('https://user:pw@example.com/')).toContain('Song link');
    expect(err(null, 'example.com/no-scheme')).toContain('Tab link');
  });

  it('rejects links with hidden characters or padding instead of repairing them', () => {
    expect(err(' https://example.com/x')).toContain('Song link');
    expect(err(null, 'https://example.com/x ')).toContain('Tab link');
    expect(err('https://exam\u200bple.com/x')).toContain('Song link');
    expect(err('https://example.com/\u202ex')).toContain('Song link');
  });

  it('enforces the character limit and a cheap raw-length cap', () => {
    const prefix = 'https://example.com/';
    expect(err(prefix + 'a'.repeat(BAND_LIMITS.urlMax - prefix.length))).toBeNull();
    expect(err(prefix + 'a'.repeat(BAND_LIMITS.urlMax - prefix.length + 1))).toContain('Song link');
    expect(err(prefix + 'a'.repeat(BAND_LIMITS.urlMax * 2))).toContain('Song link');
    expect(err(null, prefix + 'a'.repeat(1_000_000))).toContain('Tab link');
  });
});

describe('filterValidSongs hides songs with bad stored links', () => {
  const b = band();
  const members = [member(BOB)];
  const visible = (rows: SongRecord[]) => world(b, members, [setList()], rows).validSongs.map((s) => s.id);

  it('keeps songs with null, canonical or merely valid links', () => {
    expect(
      visible([
        song('none', BOB),
        song('canon', BOB, { songUrl: 'https://example.com/x', tabUrl: 'https://tabs.example.com/y' }),
        song('bare', BOB, { songUrl: 'https://example.com' }),
      ]),
    ).toEqual(['none', 'canon', 'bare']);
  });

  it('hides javascript:, data:, credentialed, schemeless, padded and invisible-character links', () => {
    const rows = [
      song('js', BOB, { songUrl: 'javascript:alert(1)' }),
      song('data', BOB, { tabUrl: 'data:text/html,x' }),
      song('creds', BOB, { songUrl: 'https://user:pw@example.com/' }),
      song('schemeless', BOB, { tabUrl: 'example.com/x' }),
      song('padded', BOB, { songUrl: ' https://example.com/x' }),
      song('zwsp', BOB, { songUrl: 'https://exam\u200bple.com/x' }),
      song('long', BOB, { tabUrl: 'https://example.com/' + 'a'.repeat(BAND_LIMITS.urlMax) }),
      song('huge', BOB, { songUrl: 'https://example.com/' + 'a'.repeat(1_000_000) }),
      song('ok', BOB, { songUrl: 'https://example.com/ok' }),
    ];
    expect(visible(rows)).toEqual(['ok']);
  });
});

describe('splitTextWithLinks', () => {
  it('returns a single plain part when there are no links', () => {
    expect(splitTextWithLinks('Capo 2, half-time outro')).toEqual([{ text: 'Capo 2, half-time outro' }]);
    expect(splitTextWithLinks('')).toEqual([]);
  });

  it('splits text around a link', () => {
    expect(splitTextWithLinks('See https://example.com/a now')).toEqual([
      { text: 'See ' },
      { text: 'https://example.com/a', href: 'https://example.com/a' },
      { text: ' now' },
    ]);
  });

  it('finds multiple links and keeps all the text in order', () => {
    const text = 'A https://one.example/x, B http://two.example/y; C';
    const parts = splitTextWithLinks(text);
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual(['https://one.example/x', 'http://two.example/y']);
    expect(parts.map((p) => p.text).join('')).toBe(text);
  });

  it('handles a link at the very start or end and back-to-back links', () => {
    expect(splitTextWithLinks('https://a.example/ https://b.example/')).toEqual([
      { text: 'https://a.example/', href: 'https://a.example/' },
      { text: ' ' },
      { text: 'https://b.example/', href: 'https://b.example/' },
    ]);
  });

  it('keeps trailing sentence punctuation out of the link', () => {
    for (const [text, url] of [
      ['Try https://example.com/x.', 'https://example.com/x'],
      ['Try https://example.com/x,', 'https://example.com/x'],
      ['Really https://example.com/x?!', 'https://example.com/x'],
      ['Items: https://example.com/x;', 'https://example.com/x'],
      ['Wait https://example.com/x...', 'https://example.com/x'],
      ['(see https://example.com/x)', 'https://example.com/x'],
      ['[https://example.com/x]', 'https://example.com/x'],
    ] as const) {
      const parts = splitTextWithLinks(text);
      expect(parts.find((p) => p.href)?.text, text).toBe(url);
      expect(parts.map((p) => p.text).join(''), text).toBe(text);
    }
  });

  it('keeps a trailing ")" that balances a "(" inside the link', () => {
    expect(splitTextWithLinks('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
    ]);
    expect(splitTextWithLinks('(https://en.wikipedia.org/wiki/Foo_(bar)).')).toEqual([
      { text: '(' },
      { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
      { text: ').' },
    ]);
  });

  it('does not link javascript:, data: or other non-http text', () => {
    for (const text of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com/x', 'mailto:a@example.com', 'example.com/x']) {
      expect(splitTextWithLinks(text), text).toEqual([{ text }]);
    }
  });

  it('does not link a URL carrying credentials', () => {
    expect(splitTextWithLinks('https://user:pw@example.com/x')).toEqual([{ text: 'https://user:pw@example.com/x' }]);
  });

  it('leaves URLs containing non-ASCII characters unlinked (homograph guard)', () => {
    const cyrillicA = String.fromCharCode(0x0430);
    for (const text of [`https://ex${cyrillicA}mple.com/x`, 'https://example.com/caf\u00e9']) {
      expect(splitTextWithLinks(text), text).toEqual([{ text }]);
    }
    expect(splitTextWithLinks(`bad https://ex${cyrillicA}mple.com ok https://example.com/ fine`).filter((p) => p.href)).toEqual([
      { text: 'https://example.com/', href: 'https://example.com/' },
    ]);
  });

  it('does not swallow angle brackets or quotes into the link', () => {
    expect(splitTextWithLinks('<https://example.com/x>')).toEqual([
      { text: '<' },
      { text: 'https://example.com/x', href: 'https://example.com/x' },
      { text: '>' },
    ]);
    expect(splitTextWithLinks('"https://example.com/x"').filter((p) => p.href)).toHaveLength(1);
  });
});

describe('isSetListShared', () => {
  const shared = (over: Partial<BandRecord> = {}) =>
    band({ setListIds: ['sl-1', 'sl-2'], sharedSetListIds: ['sl-1'], ...over });

  it('is true for an alive band whose id is in both setListIds and sharedSetListIds', () => {
    expect(isSetListShared(shared(), 'sl-1')).toBe(true);
  });

  it('is false for a set list the owner has not shared', () => {
    expect(isSetListShared(shared(), 'sl-2')).toBe(false);
  });

  it('is false for an id only in sharedSetListIds (not one of the band\'s set lists)', () => {
    expect(isSetListShared(shared({ setListIds: ['sl-2'], sharedSetListIds: ['sl-1'] }), 'sl-1')).toBe(false);
  });

  it('is false for an archived id (moved out of setListIds) even if still listed as shared', () => {
    expect(isSetListShared(shared({ setListIds: [], archivedSetListIds: ['sl-1'] }), 'sl-1')).toBe(false);
  });

  it('is false for an unknown id and for the empty id', () => {
    expect(isSetListShared(shared(), 'sl-nope')).toBe(false);
    expect(isSetListShared(shared({ sharedSetListIds: [''], setListIds: [''] }), 'sl-1')).toBe(false);
  });

  it('is false once the band is deleted', () => {
    expect(isSetListShared(shared({ deletedAt: '2026-02-01T00:00:00Z' }), 'sl-1')).toBe(false);
  });

  it('ignores ids beyond the maxSetLists prefix of EITHER array (hostile owner-written arrays are bounded)', () => {
    const filler = Array.from({ length: BAND_LIMITS.maxSetLists }, (_, i) => `f${i}`);
    expect(isSetListShared(band({ setListIds: ['sl-1'], sharedSetListIds: [...filler, 'sl-1'] }), 'sl-1')).toBe(false);
    expect(isSetListShared(band({ setListIds: [...filler, 'sl-1'], sharedSetListIds: ['sl-1'] }), 'sl-1')).toBe(false);
  });

  it('still honours an id sitting exactly at the last allowed position', () => {
    const filler = Array.from({ length: BAND_LIMITS.maxSetLists - 1 }, (_, i) => `f${i}`);
    expect(isSetListShared(band({ setListIds: [...filler, 'sl-1'], sharedSetListIds: [...filler, 'sl-1'] }), 'sl-1')).toBe(true);
  });
});

describe('isCleanText', () => {
  it('accepts normal text within the limit', () => {
    expect(isCleanText('The Band', 50, true)).toBe(true);
    expect(isCleanText('x'.repeat(50), 50, true)).toBe(true);
  });

  it('rejects text over the limit, counting characters rather than UTF-16 units', () => {
    expect(isCleanText('x'.repeat(51), 50, true)).toBe(false);
    expect(isCleanText('\u{1F3B8}'.repeat(50), 50, true)).toBe(true);
  });

  it('rejects zero-width characters, bidi overrides and padding (rows written by something else)', () => {
    expect(isCleanText('The\u200BBand', 50, true)).toBe(false);
    expect(isCleanText('\u202Eband', 50, true)).toBe(false);
    expect(isCleanText(' The Band', 50, true)).toBe(false);
    expect(isCleanText('The  Band', 50, true)).toBe(false);
  });

  it('empty or missing text is valid only when not required', () => {
    expect(isCleanText('', 50, true)).toBe(false);
    expect(isCleanText(null, 50, true)).toBe(false);
    expect(isCleanText(undefined, 50, false)).toBe(true);
    expect(isCleanText('', 50, false)).toBe(true);
  });
});

describe('isSongColorKey', () => {
  it.each(SONG_COLOR_KEYS)('accepts the palette color %s', (key) => {
    expect(isSongColorKey(key)).toBe(true);
  });

  it.each(['none', '', 'Red', 'RED', ' red', 'red ', 'magenta', '#ef4444', '__proto__', 'constructor', 'toString'])(
    'rejects %j',
    (value) => {
      expect(isSongColorKey(value)).toBe(false);
    },
  );
});

describe('resolveSongColors', () => {
  const b = band();
  const w = world(b, [member(BOB), member(CAT)], [setList()], [song('s1', BOB), song('s2', CAT)]);
  const colorRow = (songId: string, color: string, over: Partial<SongColorRecord> = {}): SongColorRecord => ({
    songId,
    owner: BOB,
    bandId: 'band-1',
    setListId: 'sl-1',
    color,
    createdAt: '2026-02-01T00:00:00Z',
    ...over,
  });
  const resolve = (rows: SongColorRecord[], songs = w.validSongs, subs = w.subs) => resolveSongColors(rows, songs, subs);

  it('maps each valid song to its palette color', () => {
    const colors = resolve([colorRow('s1', 'red'), colorRow('s2', 'teal')]);
    expect(colors).toEqual(new Map([['s1', 'red'], ['s2', 'teal']]));
  });

  it('returns an empty map for no rows, and for no songs', () => {
    expect(resolve([]).size).toBe(0);
    expect(resolve([colorRow('s1', 'red')], []).size).toBe(0);
  });

  it('treats the stored "none" (a cleared color) as no color', () => {
    expect(resolve([colorRow('s1', 'none')]).has('s1')).toBe(false);
  });

  it('ignores colors outside the palette (a signed-in user can write any string)', () => {
    const colors = resolve([colorRow('s1', 'javascript:alert(1)'), colorRow('s2', 'Red'), colorRow('s1', '')]);
    expect(colors.size).toBe(0);
  });

  it('ignores rows for unknown or non-valid songs', () => {
    const hidden = world(band({ hiddenSongIds: ['s1'] }), [member(BOB), member(CAT)], [setList()], [song('s1', BOB), song('s2', CAT)]);
    const colors = resolveSongColors(
      [colorRow('s1', 'red'), colorRow('nope', 'blue'), colorRow('s2', 'green')],
      hidden.validSongs,
      hidden.subs,
    );
    expect(colors).toEqual(new Map([['s2', 'green']]));
  });

  it('ignores rows whose bandId or setListId disagree with the song', () => {
    const colors = resolve([colorRow('s1', 'red', { setListId: 'sl-other' }), colorRow('s2', 'red', { bandId: 'band-other' })]);
    expect(colors.size).toBe(0);
  });

  describe('member filtering', () => {
    it('ignores rows whose owner is not a valid member', () => {
      expect(resolve([colorRow('s1', 'red', { owner: MALLORY })]).size).toBe(0);
    });

    it('ignores rows from banned members', () => {
      const banned = world(band({ bannedSubs: [CAT] }), [member(BOB), member(CAT)], [setList()], [song('s1', BOB)]);
      expect(resolveSongColors([colorRow('s1', 'red', { owner: CAT })], banned.validSongs, banned.subs).size).toBe(0);
    });

    it('counts the band owner as a member', () => {
      expect(resolve([colorRow('s1', 'blue', { owner: OWNER })]).get('s1')).toBe('blue');
    });

    it('a stranger newer row cannot shadow a member row', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', 'none', { owner: MALLORY, updatedAt: '2026-04-01T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('red');
    });

    it('uses the explicit memberSubs argument, not the song set', () => {
      expect(resolveSongColors([colorRow('s1', 'red')], w.validSongs, new Set([CAT])).size).toBe(0);
      expect(resolveSongColors([colorRow('s1', 'red')], w.validSongs, new Set([BOB])).get('s1')).toBe('red');
    });
  });

  describe('newest row wins across owners', () => {
    it('keeps the latest row by updatedAt across different members', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-02T00:00:00Z' }),
        colorRow('s1', 'blue', { owner: CAT, updatedAt: '2026-03-01T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('red');
    });

    it('is independent of row order', () => {
      const older = colorRow('s1', 'blue', { owner: CAT, updatedAt: '2026-03-01T00:00:00Z' });
      const newer = colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-02T00:00:00Z' });
      expect(resolve([older, newer]).get('s1')).toBe('red');
      expect(resolve([newer, older]).get('s1')).toBe('red');
    });

    it('prefers updatedAt over createdAt when both are present', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-03-05T00:00:00Z' }),
        colorRow('s1', 'blue', { owner: CAT, createdAt: '2026-03-01T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('red');
    });

    it('falls back to createdAt when updatedAt is absent, and a later createdAt beats an earlier one', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, createdAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', 'blue', { owner: CAT, createdAt: '2026-03-05T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('blue');
    });

    it('breaks equal stamps by owner (greater owner wins), regardless of row order', () => {
      const a = colorRow('s1', 'red', { owner: BOB });
      const c = colorRow('s1', 'blue', { owner: CAT });
      expect(CAT.localeCompare(BOB)).toBeGreaterThan(0);
      expect(resolve([a, c]).get('s1')).toBe('blue');
      expect(resolve([c, a]).get('s1')).toBe('blue');
    });

    it('a newest "none" row leaves the song uncolored even if an older member picked a color', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', 'none', { owner: CAT, updatedAt: '2026-03-02T00:00:00Z' }),
      ]);
      expect(colors.has('s1')).toBe(false);
    });

    it('an older "none" row does not hide a newer color from another member', () => {
      const colors = resolve([
        colorRow('s1', 'none', { owner: CAT, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', 'green', { owner: BOB, updatedAt: '2026-03-02T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('green');
    });

    it('resolves each song independently', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-02T00:00:00Z' }),
        colorRow('s1', 'blue', { owner: CAT, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s2', 'blue', { owner: BOB, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s2', 'teal', { owner: CAT, updatedAt: '2026-03-02T00:00:00Z' }),
      ]);
      expect(colors).toEqual(new Map([['s1', 'red'], ['s2', 'teal']]));
    });
  });

  describe('invalid palette keys', () => {
    it('are ignored before comparing: a newer invalid row does not shadow an older valid one', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', 'bogus', { owner: CAT, updatedAt: '2026-03-02T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('red');
    });

    it('an invalid row from the same owner does not shadow their earlier valid row either', () => {
      const colors = resolve([
        colorRow('s1', 'red', { owner: BOB, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', '__proto__', { owner: BOB, updatedAt: '2026-03-02T00:00:00Z' }),
      ]);
      expect(colors.get('s1')).toBe('red');
    });

    it('a newer invalid row does not undo an older "none" either (song stays uncolored)', () => {
      const colors = resolve([
        colorRow('s1', 'none', { owner: BOB, updatedAt: '2026-03-01T00:00:00Z' }),
        colorRow('s1', 'bogus', { owner: CAT, updatedAt: '2026-03-02T00:00:00Z' }),
      ]);
      expect(colors.has('s1')).toBe(false);
    });
  });
});

describe('myColorSongIds', () => {
  const b = band();
  const w = world(b, [member(BOB), member(CAT)], [setList()], [song('s1', BOB), song('s2', CAT), song('s3', BOB)]);
  const colorRow = (songId: string, color: string, over: Partial<SongColorRecord> = {}): SongColorRecord => ({
    songId,
    owner: BOB,
    bandId: 'band-1',
    setListId: 'sl-1',
    color,
    createdAt: '2026-02-01T00:00:00Z',
    ...over,
  });
  const mine = (rows: SongColorRecord[], sub = BOB, songs = w.validSongs, subs = w.subs) =>
    myColorSongIds(rows, songs, subs, sub);

  it('is empty for no rows', () => {
    expect(mine([]).size).toBe(0);
  });

  it('returns the songs the caller has a row for', () => {
    expect(mine([colorRow('s1', 'red'), colorRow('s2', 'blue')])).toEqual(new Set(['s1', 's2']));
  });

  it('includes songs whose own row is "none" (a cleared color still exists)', () => {
    expect(mine([colorRow('s1', 'none')])).toEqual(new Set(['s1']));
  });

  it('excludes rows written by other members', () => {
    expect(mine([colorRow('s1', 'red', { owner: CAT }), colorRow('s2', 'red', { owner: BOB })])).toEqual(new Set(['s2']));
  });

  it('excludes rows for unknown or non-valid songs', () => {
    expect(mine([colorRow('nope', 'red'), colorRow('s1', 'red')])).toEqual(new Set(['s1']));
  });

  it('excludes rows whose parents disagree with the song', () => {
    expect(mine([colorRow('s1', 'red', { setListId: 'sl-x' }), colorRow('s2', 'red', { bandId: 'band-x' })]).size).toBe(0);
  });

  it('is empty when the caller is not a valid member (e.g. banned)', () => {
    const banned = world(band({ bannedSubs: [BOB] }), [member(BOB), member(CAT)], [setList()], [song('s1', CAT)]);
    expect(mine([colorRow('s1', 'red')], BOB, banned.validSongs, banned.subs).size).toBe(0);
  });

  it('counts the caller own row even if it is not the newest or has an unknown palette key', () => {
    const rows = [
      colorRow('s1', 'bogus', { owner: BOB }),
      colorRow('s2', 'red', { owner: BOB, updatedAt: '2026-01-01T00:00:00Z' }),
      colorRow('s2', 'blue', { owner: CAT, updatedAt: '2026-05-01T00:00:00Z' }),
    ];
    expect(mine(rows)).toEqual(new Set(['s1', 's2']));
  });

  it('does not depend on which row is newest across owners', () => {
    expect(mine([colorRow('s3', 'red', { owner: CAT, updatedAt: '2026-09-01T00:00:00Z' })])).toEqual(new Set());
  });
});

describe('activePending', () => {
  const inFlight = <T,>(value: T | null): PendingChoice<T> => ({ value, settledAt: null });
  const settled = <T,>(value: T | null, at: number): PendingChoice<T> => ({ value, settledAt: at });

  it('is undefined when nothing is pending', () => {
    expect(activePending(undefined, 1000)).toBeUndefined();
  });

  it('returns an in-flight choice regardless of fetchedAt', () => {
    const p = inFlight('red');
    expect(activePending(p, 9_999_999)).toBe(p);
    expect(activePending(p, 0)).toBe(p);
  });

  it('keeps a null (cleared) in-flight choice', () => {
    const p = inFlight<string>(null);
    expect(activePending(p, 9_999_999)).toBe(p);
  });

  it('returns a settled choice while fetchedAt is inside the grace period (inclusive boundary)', () => {
    const p = settled('red', 10_000);
    expect(activePending(p, 5_000)).toBe(p);
    expect(activePending(p, 10_000)).toBe(p);
    expect(activePending(p, 10_000 + VOTE_INDEX_LAG_GRACE_MS)).toBe(p);
  });

  it('drops a settled choice once fetchedAt is past the grace period', () => {
    expect(activePending(settled('red', 10_000), 10_000 + VOTE_INDEX_LAG_GRACE_MS + 1)).toBeUndefined();
  });

  it('honours a custom grace period', () => {
    expect(activePending(settled('red', 0), 100, 50)).toBeUndefined();
    expect(activePending(settled('red', 0), 50, 50)).toEqual({ value: 'red', settledAt: 0 });
  });

  it('is what resolveMyVote delegates to (same grace default)', () => {
    expect(resolveMyVote(settled('up', 10_000), 10_000 + VOTE_INDEX_LAG_GRACE_MS + 1, 'down').pending).toBeUndefined();
    expect(resolveMyVote(settled('up', 10_000), 10_000 + VOTE_INDEX_LAG_GRACE_MS, 'down').pending).toBe('up');
  });
});
