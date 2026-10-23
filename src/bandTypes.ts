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
  /** An invite link stops working this many days after it was issued; the owner picks within the range. */
  inviteTtlDaysMin: 1,
  inviteTtlDaysMax: 7,
  inviteTtlDaysDefault: 1,
  /** Longest song key we accept ("F#m"). */
  keyMax: 3,
  /** Longest label a band can give a song color ("Fast thrash"). */
  colorLabelMax: 20,
} as const;

const AVAILABILITY_SLOTS_PER_DAY = 48;
const AVAILABILITY_HORIZON_DAYS = 60;

/**
 * Availability calendar: a member's free time as a UTC-anchored bitmask of 30-minute slots, one row
 * per (band, member). Client-enforced like the other limits: a row outside these bounds is hidden.
 * `formatVersion`, `slotMs`, `slotsPerDay` and `hexPerDay` are the stored bit layout: changing any
 * of them corrupts every row already written, so they need a new `formatVersion`. The rest are
 * product tunables, and the derived ones keep the horizon and the writer window from drifting apart.
 */
export const AVAILABILITY_LIMITS = {
  /** The only row `format` this client reads or writes. */
  formatVersion: 1,
  slotMs: 30 * 60 * 1000,
  slotsPerDay: AVAILABILITY_SLOTS_PER_DAY,
  /** 4 slots per hex character. */
  hexPerDay: AVAILABILITY_SLOTS_PER_DAY / 4,
  /** How many local days ahead a member can mark (today included). */
  horizonDays: AVAILABILITY_HORIZON_DAYS,
  /**
   * Every save writes exactly this many UTC days. Local days are offset from UTC by up to a day
   * either way, so covering `horizonDays` local days takes `horizonDays + 2` UTC days.
   */
  writerMaxDays: AVAILABILITY_HORIZON_DAYS + 2,
  /** Rows up to this long are still read, leaving headroom over anything the writer emits. */
  parserMaxDays: 96,
  /** Default shortest window "Best times" suggests (2 hours). */
  defaultMinSlots: 4,
  /** Read bound: members beyond this (join order, owner and caller first) are not fetched. */
  maxParticipants: 30,
  /** A row saved longer ago than this is flagged "may be out of date". */
  staleDays: 14,
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
  /** Days an invite link works after it is issued (owner-written, always 1-7: bad stored values read as the default). */
  inviteTtlDays: number;
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

export interface ColorLabelRecord {
  bandId: string;
  color: string;
  owner: string;
  /** '' = the writer cleared the label. */
  label: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AvailabilityRecord {
  bandId: string;
  owner: string;
  /** Row layout version; only `AVAILABILITY_LIMITS.formatVersion` is readable. */
  format: number;
  /** UTC day number (days since 1970-01-01) of mask bit 0. */
  startDay: number;
  /** Lowercase hex, 12 characters per UTC day; bit = 1 means the member marked that slot free. */
  mask: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The outcome of reading one member's availability row by key. */
export type AvailabilityRead = { status: 'ok'; row: AvailabilityRecord | null } | { status: 'failed' };

/** Why a participant is not free for a whole window. */
export type MissingReason =
  /** Has data for the window but didn't mark all of it free. */
  | 'not-marked'
  /** Their saved row doesn't reach the window. */
  | 'no-data'
  /** No row (or an expired one). */
  | 'not-responded'
  /** Their row couldn't be read. */
  | 'unreadable';

/** A time range (end exclusive, in slots) that several members are all free for. */
export interface BestWindow {
  startSlot: number;
  endSlot: number;
  /** Members free for the whole window, in participant order. */
  subs: string[];
  /** Everyone else, with why. */
  missing: { sub: string; reason: MissingReason }[];
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

export type InviteFailure = 'invalid-code' | 'not-found' | 'revoked' | 'expired' | 'deleted' | 'banned' | 'full';

/** Failures that mean "this link is dead, get a new one" (as opposed to banned, full, offline ...). */
export type DeadLinkReason = Extract<InviteFailure, 'expired' | 'revoked'>;

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
  /** The band's color labels (band-wide, not per set list). Absent on the public page. */
  labels?: ListAllResult<ColorLabelRecord>;
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
  /** The band's label per palette color (colors without a label are absent). */
  colorLabels: Map<SongColorKey, string>;
  /** Colors the caller has their own label row for (even an empty one): it picks create vs update. */
  myLabelColors: Set<SongColorKey>;
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
