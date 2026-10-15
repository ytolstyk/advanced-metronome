import {
  BAND_TEXT,
  type BandRecord,
  type BandView,
  type MemberRecord,
  type SetListRecord,
  type SetListRows,
  type SetListView,
} from './bandTypes';
import {
  buildDisplayNames,
  filterCountedVotes,
  filterValidMembers,
  filterValidSetLists,
  isBandOwner,
  myVotes,
  partitionSongs,
  sanitizeDisplayName,
  sortSongsByScore,
  tallyVotes,
  validMemberSubs,
} from './bandUtils';

/**
 * Pure view assembly: raw rows in, validated views out. Everything the pages render comes from
 * here, so the "no raw rows reach the UI" rule is enforced in one place (and is testable without
 * mocking the network).
 */

export interface BandViewInput {
  band: BandRecord;
  sub: string;
  rosterRows: MemberRecord[];
  rosterIncomplete: boolean;
  /** The caller's own Member row, read by primary key (the roster index can lag). */
  ownRow: MemberRecord | null;
  /** `null` = the id in `Band.setListIds` has no row. */
  setListRows: (SetListRecord | null)[];
}

export function assembleBandView({
  band,
  sub,
  rosterRows,
  rosterIncomplete,
  ownRow,
  setListRows,
}: BandViewInput): BandView {
  const rows = ownRow ? [...rosterRows, ownRow] : rosterRows;
  const members = filterValidMembers(rows, band);
  const memberSubs = validMemberSubs(members, band);
  const setLists = filterValidSetLists(
    setListRows.filter((s): s is SetListRecord => s !== null),
    band,
  );
  const nameBySub = new Map(rows.map((r) => [r.owner, sanitizeDisplayName(r.displayName)]));
  return {
    band,
    sub,
    isOwner: isBandOwner(band, sub),
    isMember: memberSubs.has(sub),
    members,
    memberSubs,
    displayNames: buildDisplayNames(members),
    setLists,
    removedMembers: band.bannedSubs.map((banned) => ({
      sub: banned,
      name: nameBySub.get(banned) || BAND_TEXT.formerMemberName,
    })),
    incomplete: rosterIncomplete,
  };
}

/** Validates fetched rows against the already-validated band view and ranks the songs. */
export function assembleSetListView(view: BandView, setListId: string, rows: SetListRows): SetListView | null {
  const setList = view.setLists.find((s) => s.id === setListId);
  if (!setList) return null;

  const { visible, hidden } = partitionSongs(rows.songs.items, view.band, view.setLists, view.memberSubs);
  const counted = filterCountedVotes(rows.votes.items, visible, view.memberSubs);
  const tallies = tallyVotes(counted, visible);
  return {
    setList,
    songs: sortSongsByScore(visible, tallies),
    tallies,
    myVotes: myVotes(counted, view.sub),
    // The Hidden section is owner-only; everyone else doesn't need the second list.
    hiddenSongs: view.isOwner ? hidden : [],
    incomplete: rows.songs.incomplete || rows.votes.incomplete,
  };
}
