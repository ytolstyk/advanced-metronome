import { describe, expect, it } from 'vitest';
import type { BandRecord, MemberRecord, SetListRecord, SetListRows, SongRecord, VoteRecord } from './bandTypes';
import { assembleBandView, assembleSetListView } from './bandViews';

const OWNER = 'sub-owner';
const ME = 'sub-me';
const BOB = 'sub-bob';
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
const member = (owner: string, displayName = owner, createdAt = '2026-01-01T00:00:00Z'): MemberRecord => ({
  bandId: 'band-1',
  owner,
  displayName,
  createdAt,
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
const vote = (songId: string, owner: string, value: string): VoteRecord => ({
  songId,
  owner,
  value,
  bandId: 'band-1',
  setListId: 'sl-1',
  createdAt: '2026-01-03T00:00:00Z',
});

function bandView(over: Partial<Parameters<typeof assembleBandView>[0]> = {}) {
  return assembleBandView({
    band: band(),
    sub: ME,
    rosterRows: [member(OWNER, 'Olivia'), member(BOB, 'Bob')],
    rosterIncomplete: false,
    ownRow: member(ME, 'Me'),
    setListRows: [setList()],
    ...over,
  });
}

describe('assembleBandView', () => {
  it('builds a validated view for a member', () => {
    const view = bandView();
    expect(view.isMember).toBe(true);
    expect(view.isOwner).toBe(false);
    expect(view.members.map((m) => m.owner).sort()).toEqual([BOB, ME, OWNER]);
    expect(view.displayNames.get(BOB)).toBe('Bob');
    expect(view.setLists.map((s) => s.id)).toEqual(['sl-1']);
    expect(view.incomplete).toBe(false);
  });

  it('merges the caller\'s own row when the roster index lags, without duplicating it', () => {
    expect(bandView({ rosterRows: [member(OWNER)] }).isMember).toBe(true);
    const both = bandView({ rosterRows: [member(OWNER), member(ME, 'Me')] });
    expect(both.members.filter((m) => m.owner === ME)).toHaveLength(1);
  });

  it('a non-member (no own row) is not a member, but the owner always is', () => {
    expect(bandView({ ownRow: null }).isMember).toBe(false);
    const asOwner = bandView({ sub: OWNER, ownRow: null, rosterRows: [] });
    expect(asOwner.isOwner).toBe(true);
    expect(asOwner.isMember).toBe(true);
  });

  it('lists removed members by the name they used, or a placeholder when it is unknown', () => {
    const view = bandView({
      band: band({ bannedSubs: [BOB, 'sub-ghost'] }),
      rosterRows: [member(OWNER), member(BOB, 'Bob')],
    });
    expect(view.removedMembers).toEqual([
      { sub: BOB, name: 'Bob' },
      { sub: 'sub-ghost', name: 'Former member' },
    ]);
    expect(view.members.map((m) => m.owner)).not.toContain(BOB);
  });

  it('drops missing, forged and archived set lists and passes the roster flag through', () => {
    const view = bandView({
      band: band({ setListIds: ['sl-1', 'sl-2', 'sl-3'] }),
      setListRows: [setList(), null, setList({ id: 'sl-3', owner: MALLORY })],
      rosterIncomplete: true,
    });
    expect(view.setLists.map((s) => s.id)).toEqual(['sl-1']);
    expect(view.incomplete).toBe(true);
  });
});

describe('assembleSetListView', () => {
  const rows = (songs: SongRecord[], votes: VoteRecord[], flags = { s: false, v: false }): SetListRows => ({
    songs: { items: songs, incomplete: flags.s },
    votes: { items: votes, incomplete: flags.v },
  });

  it('returns null for a set list the band does not have', () => {
    expect(assembleSetListView(bandView(), 'sl-nope', rows([], []))).toBeNull();
  });

  it('shows valid songs ranked by score and counts only valid votes', () => {
    const view = bandView();
    const result = assembleSetListView(
      view,
      'sl-1',
      rows(
        [song('a', BOB, { createdAt: '2026-01-01T00:00:00Z' }), song('b', ME), song('forged', MALLORY)],
        [vote('b', BOB, 'up'), vote('b', ME, 'up'), vote('a', BOB, 'down'), vote('b', MALLORY, 'down')],
      ),
    )!;
    expect(result.songs.map((s) => s.id)).toEqual(['b', 'a']);
    expect(result.tallies.get('b')).toEqual({ up: 2, down: 0, score: 2 });
    expect(result.tallies.get('a')).toEqual({ up: 0, down: 1, score: -1 });
    expect(result.myVotes).toEqual(new Map([['b', 'up']]));
  });

  it('hidden songs: only the owner is given the list, nobody sees them ranked or tallied', () => {
    const hiddenBand = band({ hiddenSongIds: ['a'] });
    const songs = [song('a', BOB), song('b', BOB)];
    const votes = [vote('a', ME, 'up')];

    const member = assembleSetListView(bandView({ band: hiddenBand }), 'sl-1', rows(songs, votes))!;
    expect(member.songs.map((s) => s.id)).toEqual(['b']);
    expect(member.hiddenSongs).toEqual([]);
    expect(member.tallies.has('a')).toBe(false);

    const owner = assembleSetListView(
      bandView({ band: hiddenBand, sub: OWNER, ownRow: null }),
      'sl-1',
      rows(songs, votes),
    )!;
    expect(owner.songs.map((s) => s.id)).toEqual(['b']);
    expect(owner.hiddenSongs.map((s) => s.id)).toEqual(['a']);
  });

  it('is incomplete if either page cap was hit', () => {
    const view = bandView();
    expect(assembleSetListView(view, 'sl-1', rows([], [], { s: true, v: false }))!.incomplete).toBe(true);
    expect(assembleSetListView(view, 'sl-1', rows([], [], { s: false, v: true }))!.incomplete).toBe(true);
    expect(assembleSetListView(view, 'sl-1', rows([], []))!.incomplete).toBe(false);
  });

  it('marks the list shared only when the owner shared it (band-level, independent of who is asking)', () => {
    expect(assembleSetListView(bandView(), 'sl-1', rows([], []))!.shared).toBe(false);
    const sharedBand = band({ sharedSetListIds: ['sl-1'] });
    expect(assembleSetListView(bandView({ band: sharedBand }), 'sl-1', rows([], []))!.shared).toBe(true);
    expect(assembleSetListView(bandView({ band: sharedBand, sub: '', ownRow: null }), 'sl-1', rows([], []))!.shared).toBe(true);
  });

  it('a shared id that is not one of the band\'s set lists yields no list at all', () => {
    const view = bandView({ band: band({ setListIds: ['sl-1'], sharedSetListIds: ['sl-2'] }), setListRows: [setList()] });
    expect(assembleSetListView(view, 'sl-2', rows([], []))).toBeNull();
    expect(assembleSetListView(view, 'sl-1', rows([], []))!.shared).toBe(false);
  });
});
