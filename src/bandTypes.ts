import { MAX_BPM, MIN_BPM } from './constants';

export type VoteValue = 'up' | 'down';

/** Colors a member can give a song. `none` (stored, since rows are never deleted) means no color. */
export const SONG_COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type SongColorKey = (typeof SONG_COLOR_KEYS)[number];
export const NO_SONG_COLOR = 'none';

/** Client-enforced limits (the API cannot enforce them; validators hide out-of-bounds rows). */
export const BAND_LIMITS = {
  nameMax: 50,
  displayNameMax: 30,
  titleMax: 100,
  artistMax: 100,
  notesMax: 500,
  urlMax: 300,
  bpmMin: MIN_BPM,
  bpmMax: MAX_BPM,
  maxMembers: 15,
  maxSetLists: 10,
  maxArchivedSetLists: 50,
  maxSongsPerSetList: 100,
  maxBannedSubs: 200,
  maxHiddenSongs: 1000,
  maxOwnedBands: 10,
  inviteCodeLength: 10,
  /** Longest song key we accept ("F#m"). */
  keyMax: 3,
} as const;

/**
 * Names written into rows. `deletedName` doubles as the "already scrubbed" marker that makes
 * `deleteBand` re-runnable, so every writer and checker must use this constant.
 */
export const BAND_TEXT = {
  deletedName: 'Deleted',
  archivedSetListName: 'Archived',
  defaultSetListName: 'Main Set',
  formerMemberName: 'Former member',
} as const;

/** Page titles for a band the caller can no longer open. */
export const BAND_GONE_TITLES = {
  removed: 'You were removed from this band',
  deleted: 'This band was deleted',
  'not-found': 'Band not found',
} as const;

/** `identityPool` is the signed-out guest role; only shared set lists are meant to be read that way. */
export type ReadAuthMode = 'userPool' | 'identityPool';

/**
 * Page caps for the PUBLIC set list page. A valid list is tiny (<= 100 songs, <= 15 members, so
 * <= 1500 votes at 250 rows a page), so anything beyond this is a junk flood. This only keeps our
 * own page cheap: the API itself is not capped, and a flood can push real rows off the page (the
 * `incomplete` banner then shows).
 */
export const PUBLIC_READ_PAGES = { songs: 3, votes: 7, roster: 4 } as const;

/** The `sub` of a signed-out visitor: never a member or owner (validators reject an empty sub). */
export const ANONYMOUS_SUB = '';

/** A just-cast vote is trusted over a refetch for this long (the vote index can lag a moment). */
export const VOTE_INDEX_LAG_GRACE_MS = 5_000;

/** AppSync/DynamoDB cap responses at 1 MB; 250 rows of max-length songs fit comfortably. */
export const LIST_PAGE_SIZE = 250;
export const MAX_LIST_PAGES = 50;

export interface BandRecord {
  id: string;
  owner: string;
  name: string;
  inviteCode: string;
  deletedAt: string | null;
  version: number;
  setListIds: string[];
  archivedSetListIds: string[];
  bannedSubs: string[];
  hiddenSongIds: string[];
  /** Set lists anyone with the link may read, signed in or not (owner-written; a subset of `setListIds`). */
  sharedSetListIds: string[];
}

export interface MemberRecord {
  bandId: string;
  owner: string;
  displayName: string;
  createdAt: string;
}

export interface SetListRecord {
  id: string;
  owner: string;
  bandId: string;
  name: string;
  archivedAt: string | null;
}

export interface SongRecord {
  id: string;
  owner: string;
  bandId: string;
  setListId: string;
  title: string;
  artist: string | null;
  key: string | null;
  bpm: number | null;
  notes: string | null;
  songUrl: string | null;
  tabUrl: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SongColorRecord {
  songId: string;
  owner: string;
  bandId: string;
  setListId: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VoteRecord {
  songId: string;
  owner: string;
  value: string;
  bandId: string;
  setListId: string;
  createdAt?: string;
  updatedAt?: string;
}

declare const validated: unique symbol;
/** A record that passed read-time validation against its Band (never construct it by hand). */
export type Validated<T> = T & { readonly [validated]: true };

export type ValidMember = Validated<MemberRecord>;
export type ValidSetList = Validated<SetListRecord>;
export type ValidSong = Validated<SongRecord>;
export type ValidVote = Validated<Omit<VoteRecord, 'value'> & { value: VoteValue }>;

export interface SongTally {
  up: number;
  down: number;
  score: number;
}

export interface ListAllResult<T> {
  items: T[];
  /** True when the page cap was hit before the last page (data may be missing). */
  incomplete: boolean;
}

export type InviteFailure = 'invalid-code' | 'not-found' | 'revoked' | 'deleted' | 'banned' | 'full';

export interface InvitePreview {
  bandId: string;
  bandName: string;
  memberCount: number;
  alreadyMember: boolean;
}

export interface MyBandEntry {
  band: BandRecord;
  /** `removed`: the owner banned you (offer Dismiss). */
  status: 'active' | 'removed';
  isOwner: boolean;
}

/** Everything a band page needs, already validated (built by `assembleBandView`). */
export interface BandView {
  band: BandRecord;
  sub: string;
  isOwner: boolean;
  /** Owner, or has a valid Member row. */
  isMember: boolean;
  members: ValidMember[];
  memberSubs: Set<string>;
  displayNames: Map<string, string>;
  setLists: ValidSetList[];
  /** Banned subs with the name they used (for the owner's "Removed" section / restore). */
  removedMembers: { sub: string; name: string }[];
  /** True when the roster hit the page cap (some members may be missing). */
  incomplete: boolean;
}

export type BandLoadResult =
  | { status: 'ok'; view: BandView }
  | { status: 'removed'; band: BandRecord }
  | { status: 'deleted' }
  | { status: 'not-found' };

/** Raw (unvalidated) rows for one set list. Never render these; pass them to `assembleSetListView`. */
export interface SetListRows {
  songs: ListAllResult<SongRecord>;
  votes: ListAllResult<VoteRecord>;
  /** Absent on the public page, which doesn't show song colors. */
  colors?: ListAllResult<SongColorRecord>;
}

export interface SetListView {
  setList: ValidSetList;
  /** The owner shares this set list with anyone who has its link. */
  shared: boolean;
  /** Valid, non-hidden songs, ranked by score. */
  songs: ValidSong[];
  tallies: Map<string, SongTally>;
  /** Valid, non-hidden songs that have a color (songs without one are absent). */
  colors: Map<string, SongColorKey>;
  /** Songs the caller has their own color row for (even `none`): it picks create vs update. */
  myColorSongIds: Set<string>;
  myVotes: Map<string, VoteValue>;
  /** Valid songs the owner hid (for the owner's "Hidden" section). */
  hiddenSongs: ValidSong[];
  /** A page cap was hit: some songs or votes may be missing. */
  incomplete: boolean;
}

/** The caller's pending (optimistic) choice for one song. */
export interface PendingChoice<T> {
  /** `null` = the caller cleared it (retracted the vote, removed the color). */
  value: T | null;
  /** When the request finished; `null` while it is still in flight. */
  settledAt: number | null;
}

export type PendingVote = PendingChoice<VoteValue>;

/** What the public (signed-out friendly) set list page gets. */
export type SharedSetListResult =
  /** Missing, archived, deleted or not shared: deliberately indistinguishable to a visitor. */
  | { status: 'unavailable' }
  | { status: 'ok'; view: BandView; list: SetListView };
