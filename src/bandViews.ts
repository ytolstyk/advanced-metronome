import {
  BAND_TEXT,
  type BandRecord,
  type BandView,
  type ListAllResult,
  type MemberRecord,
  type SetListRecord,
  type SetListRows,
  type SetListView,
  type SongRecord,
  type SongTrackMetaRecord,
  type SongTrackSummary,
  type ValidSong,
} from './bandTypes';
import { mayAttachBackingTracks } from './backingTrackFormat';
import { resolveBackingTracks } from './backingTrackUtils';
import {
  buildDisplayNames,
  filterCountedVotes,
  filterValidMembers,
  filterValidSetLists,
  isBandOwner,
  isSetListShared,
  myColorSongIds,
  myLabelColors,
  mySongTrackIds,
  myVotes,
  orderSetListsForDisplay,
  partitionSongs,
  resolveColorLabels,
  resolveSongColors,
  resolveSongTracks,
  sanitizeDisplayName,
  applySongOrder,
  songIdentity,
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
  const setLists = orderSetListsForDisplay(
    filterValidSetLists(
      setListRows.filter((s): s is SetListRecord => s !== null),
      band,
    ),
    band,
  );
  const nameBySub = new Map(rows.map((r) => [r.owner, sanitizeDisplayName(r.displayName)]));
  return {
    band,
    sub,
    isOwner: isBandOwner(band, sub),
    isMember: memberSubs.has(sub),
    canUpload: memberSubs.has(sub) && mayAttachBackingTracks(band, sub),
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
  const orderedIds = new Set(setList.songOrder);
  const colorRows = rows.colors?.items ?? [];
  const labelRows = rows.labels?.items ?? [];
  const clickRows = rows.clicks?.items ?? [];
  const backingRows = rows.backingTracks?.items ?? [];
  return {
    setList,
    shared: isSetListShared(view.band, setListId),
    songs: applySongOrder(sortSongsByScore(visible, tallies), setList.songOrder),
    customOrder: visible.some((s) => orderedIds.has(s.id)),
    tallies,
    colors: resolveSongColors(colorRows, visible, view.memberSubs),
    myColorSongIds: myColorSongIds(colorRows, visible, view.memberSubs, view.sub),
    tracks: resolveSongTracks(clickRows, visible, view.memberSubs),
    myTrackSongIds: mySongTrackIds(clickRows, visible, view.memberSubs, view.sub),
    backingTracks: resolveBackingTracks(backingRows, visible, view.memberSubs, view.band, view.sub),
    colorLabels: resolveColorLabels(labelRows, view.band, view.memberSubs),
    myLabelColors: myLabelColors(labelRows, view.band, view.memberSubs, view.sub),
    myVotes: myVotes(counted, view.sub),
    // The Hidden section is owner-only; everyone else doesn't need the second list.
    hiddenSongs: view.isOwner ? hidden : [],
    incomplete:
      rows.songs.incomplete ||
      rows.votes.incomplete ||
      (rows.colors?.incomplete ?? false) ||
      (rows.labels?.incomplete ?? false) ||
      (rows.clicks?.incomplete ?? false) ||
      (rows.backingTracks?.incomplete ?? false),
  };
}

/** Valid, non-hidden songs of the band's set lists, by title. */
function visibleSongsByTitle(view: BandView, rows: SongRecord[]): ValidSong[] {
  const { visible } = partitionSongs(rows, view.band, view.setLists, view.memberSubs);
  return [...visible].sort((a, b) => a.title.localeCompare(b.title));
}

/** The songs of a set list a click track can be attached to, with which of them already have one. */
export interface SongTargets {
  /** Valid, non-hidden songs, by title. */
  songs: ValidSong[];
  tracks: Map<string, SongTrackSummary>;
  /** Songs the caller has their own click track row for: picks create vs update on save. */
  myTrackSongIds: Set<string>;
  incomplete: boolean;
}

/** Validates raw songs and click track metadata for the "Save to band" picker (no votes needed). */
export function assembleSongTargets(
  view: BandView,
  rows: { songs: ListAllResult<SongRecord>; clicks: ListAllResult<SongTrackMetaRecord> },
): SongTargets {
  const songs = visibleSongsByTitle(view, rows.songs.items);
  const visible = songs;
  return {
    songs,
    tracks: resolveSongTracks(rows.clicks.items, visible, view.memberSubs),
    myTrackSongIds: mySongTrackIds(rows.clicks.items, visible, view.memberSubs, view.sub),
    incomplete: rows.songs.incomplete || rows.clicks.incomplete,
  };
}

/** The songs of another set list that can be copied into this one. */
export type SongChoices = Pick<SongTargets, 'songs' | 'incomplete'>;

/** Validates the raw songs of a source set list for the "Add from another set list" picker. */
export function assembleSongChoices(view: BandView, songs: ListAllResult<SongRecord>): SongChoices {
  // The same title and artist twice in the source would copy as two identical suggestions: keep the first.
  const seen = new Set<string>();
  const unique = visibleSongsByTitle(view, songs.items).filter((s) => {
    const id = songIdentity(s);
    return !seen.has(id) && seen.add(id);
  });
  return { songs: unique, incomplete: songs.incomplete };
}
