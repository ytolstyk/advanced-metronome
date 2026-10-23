import {
  BAND_LIMITS,
  NO_SONG_COLOR,
  SONG_COLOR_KEYS,
  VOTE_INDEX_LAG_GRACE_MS,
  type BandRecord,
  type ColorLabelRecord,
  type MemberRecord,
  type PendingChoice,
  type PendingVote,
  type SetListRecord,
  type SongColorKey,
  type SongColorRecord,
  type SongRecord,
  type SongTally,
  type ValidMember,
  type ValidSetList,
  type ValidSong,
  type ValidVote,
  type VoteRecord,
  type VoteValue,
} from './bandTypes';

/**
 * Pure, synchronous logic for the Bands feature: invite codes, text sanitising, read-time
 * validation, vote tallies and display names (no network; pagination lives in `api/paginate.ts`).
 *
 * Amplify auth rules can only check a row's own fields on write, so any signed-in user who knows a
 * bandId can write junk rows. `Band` is the single root of trust (only its owner can write it):
 * everything shown in the UI must pass through these validators, and API modules must never hand
 * raw rows to pages.
 */

// ── Invite codes ───────────────────────────────────────────────────────────

// 32 unambiguous characters (no I, O, 0, 1) → 5 bits each, 50 bits for a 10-char code.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALPHABET_MASK = INVITE_ALPHABET.length - 1; // 31; the length is a power of two → no modulo bias

export type RandomBytes = (bytes: Uint8Array) => Uint8Array;

export function generateInviteCode(random: RandomBytes = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(BAND_LIMITS.inviteCodeLength));
  let code = '';
  for (const b of bytes) code += INVITE_ALPHABET[b & ALPHABET_MASK];
  return code;
}

/** `ABCDEFGHJK` → `ABCDE-FGHJK`. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Accepts user input ("abcde fghjk", "ABCDE-FGHJK"); returns the canonical code or null. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== BAND_LIMITS.inviteCodeLength) return null;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null;
  return code;
}

/** The shareable link for a code. The code is a capability, so only canonical codes are linked. */
export function buildInviteLink(origin: string, code: string): string | null {
  const canonical = normalizeInviteCode(code);
  return canonical ? `${origin}/bands?join=${canonical}` : null;
}

// ── Text sanitising ────────────────────────────────────────────────────────

// Control chars, soft hyphen, zero-width / invisible-operator chars, bidi overrides/isolates and
// the Hangul filler (all common in spoofed names). Written as escapes so this file stays free of
// invisible characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff]/g;

/** Whitespace (tabs, newlines, ...) becomes single spaces, then control/zero-width/bidi chars go. */
export function stripUnsafeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(UNSAFE_TEXT, '').replace(/\s+/g, ' ').trim();
}

/** Length in characters as a person counts them (an emoji is one, not two). */
export function textLength(text: string): number {
  return Array.from(text).length;
}

function clampText(text: string, max: number): string {
  return textLength(text) <= max ? text : Array.from(text).slice(0, max).join('');
}

/** Single-line text: sanitised and clamped to `max` characters (never splits a surrogate pair). */
export function sanitizeText(raw: string, max: number): string {
  // trimEnd: clamping can end on the space between two words, which would not be "clean" text.
  return clampText(stripUnsafeText(raw), max).trimEnd();
}

export const sanitizeDisplayName = (raw: string): string => sanitizeText(raw, BAND_LIMITS.displayNameMax);
/** Band and set-list names (a longer limit than display names). */
export const sanitizeName = (raw: string): string => sanitizeText(raw, BAND_LIMITS.nameMax);

/** Sanitised band/set-list name; throws a user-facing error when nothing is left. */
export function requireName(raw: string): string {
  const name = sanitizeName(raw);
  if (!name) throw new Error('A name is required');
  return name;
}

/** Sanitised display name; throws a user-facing error when nothing is left. */
export function requireDisplayName(raw: string): string {
  const name = sanitizeDisplayName(raw);
  if (!name) throw new Error('A display name is required');
  return name;
}

/** Multi-line text (song notes): lines are sanitised individually; runs of blank lines collapse. */
export function sanitizeNotes(raw: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map(stripUnsafeText);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Rows written by this app are always already clean, so a field that changes when cleaned was
 * written by something else (zero-width spoofing, bidi tricks, padding): hide it, don't repair it.
 */
export function isCleanText(text: string | null | undefined, max: number, required: boolean): boolean {
  const value = text ?? '';
  if (value === '') return !required;
  return stripUnsafeText(value) === value && textLength(value) <= max;
}

// ── Validators ─────────────────────────────────────────────────────────────

export function isBandAlive(band: BandRecord): boolean {
  return !band.deletedAt;
}

export function isBandOwner(band: BandRecord, sub: string): boolean {
  return sub !== '' && band.owner === sub;
}

export function isBanned(band: BandRecord, sub: string): boolean {
  return !isBandOwner(band, sub) && band.bannedSubs.includes(sub);
}

/** Earliest join first; ties broken by owner so the order is deterministic. */
export function byJoinOrder(a: MemberRecord, b: MemberRecord): number {
  return a.createdAt.localeCompare(b.createdAt) || a.owner.localeCompare(b.owner);
}

/**
 * Members valid for a band: not banned (the owner can't be), a clean display name, one row per
 * owner (earliest wins). Out-of-bounds rows are hidden, not truncated.
 */
export function filterValidMembers(members: MemberRecord[], band: BandRecord): ValidMember[] {
  if (!isBandAlive(band)) return [];
  const seen = new Set<string>();
  const valid: MemberRecord[] = [];
  for (const m of [...members].sort(byJoinOrder)) {
    if (m.bandId !== band.id || !m.owner || seen.has(m.owner)) continue;
    if (isBanned(band, m.owner)) continue;
    if (!isCleanText(m.displayName, BAND_LIMITS.displayNameMax, true)) continue;
    seen.add(m.owner);
    valid.push(m);
  }
  return valid as ValidMember[];
}

/** Subs allowed to author songs/votes: valid members plus the band owner (always valid). */
export function validMemberSubs(members: ValidMember[], band: BandRecord): Set<string> {
  const subs = new Set(members.map((m) => m.owner));
  if (isBandAlive(band) && band.owner) subs.add(band.owner);
  return subs;
}

/** Valid iff its id is in `Band.setListIds` (owner-written), parents match and it isn't archived. */
export function filterValidSetLists(setLists: SetListRecord[], band: BandRecord): ValidSetList[] {
  if (!isBandAlive(band)) return [];
  // A hostile owner can write any number of ids; only the first `maxSetLists` count.
  const allowed = new Set(band.setListIds.slice(0, BAND_LIMITS.maxSetLists));
  return setLists.filter(
    (s) =>
      allowed.has(s.id) &&
      s.bandId === band.id &&
      !s.archivedAt &&
      s.owner !== '' &&
      s.owner === band.owner &&
      isCleanText(s.name, BAND_LIMITS.nameMax, true),
  ) as ValidSetList[];
}

/**
 * Whether the owner shares this set list with anyone who has its link (the band must be alive and
 * the list one of its first `maxSetLists` ids, so a hostile owner's long arrays are bounded).
 */
export function isSetListShared(band: BandRecord, setListId: string): boolean {
  return (
    isBandAlive(band) &&
    band.setListIds.slice(0, BAND_LIMITS.maxSetLists).includes(setListId) &&
    band.sharedSetListIds.slice(0, BAND_LIMITS.maxSetLists).includes(setListId)
  );
}

const SONG_KEY = /^[A-G][#b]?m?$/;

export function isValidSongKey(key: string | null | undefined): boolean {
  return !key || SONG_KEY.test(key);
}

/**
 * Canonical form of a web link, or null if it isn't one. Only http(s) without embedded credentials
 * is accepted (the result is used as an `href`, so `javascript:` and friends must never get through).
 * Canonicalised on write and again at render; read-time validation does not require the stored text
 * to be byte-identical to it (URL serialisation differs slightly between browsers).
 */
export function normalizeHttpUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

function isStoredUrl(value: string | null | undefined): boolean {
  // `length` first: hostile rows can hold megabytes and `textLength`/`new URL` walk the whole string.
  return !value || (value.length <= BAND_LIMITS.urlMax * 2 && textLength(value) <= BAND_LIMITS.urlMax && stripUnsafeText(value) === value && normalizeHttpUrl(value) !== null);
}

interface SongFields {
  title: string;
  artist?: string | null;
  key?: string | null;
  bpm?: number | null;
  notes?: string | null;
  songUrl?: string | null;
  tabUrl?: string | null;
}

/** The one definition of song bounds, shared by the form (write) and the validators (read). */
export function songFieldError(f: SongFields): string | null {
  if (!f.title.trim()) return 'Title is required';
  if (textLength(f.title) > BAND_LIMITS.titleMax) return `Title must be at most ${BAND_LIMITS.titleMax} characters`;
  if (textLength(f.artist ?? '') > BAND_LIMITS.artistMax) return `Artist must be at most ${BAND_LIMITS.artistMax} characters`;
  if (textLength(f.notes ?? '') > BAND_LIMITS.notesMax) return `Notes must be at most ${BAND_LIMITS.notesMax} characters`;
  if (!isValidSongKey(f.key)) return 'Key must look like C, F#, Bb or Am';
  if (!isStoredUrl(f.songUrl)) return `Song link must be a web address (http or https) of at most ${BAND_LIMITS.urlMax} characters`;
  if (!isStoredUrl(f.tabUrl)) return `Tab link must be a web address (http or https) of at most ${BAND_LIMITS.urlMax} characters`;
  if (f.bpm != null && (!Number.isInteger(f.bpm) || f.bpm < BAND_LIMITS.bpmMin || f.bpm > BAND_LIMITS.bpmMax)) {
    return `BPM must be a whole number from ${BAND_LIMITS.bpmMin} to ${BAND_LIMITS.bpmMax}`;
  }
  return null;
}

function songRowIsWellFormed(song: SongRecord): boolean {
  return (
    songFieldError(song) === null &&
    isCleanText(song.title, BAND_LIMITS.titleMax, true) &&
    isCleanText(song.artist, BAND_LIMITS.artistMax, false) &&
    (song.notes ?? '') === sanitizeNotes(song.notes ?? '')
  );
}

/**
 * Songs that belong here: the band is alive, the song is in a valid set list of this band, its
 * creator is a valid member and its fields are well formed. Moderation (hidden songs) is separate.
 */
function structurallyValidSongs(
  songs: SongRecord[],
  band: BandRecord,
  setLists: ValidSetList[],
  memberSubs: Set<string>,
): ValidSong[] {
  if (!isBandAlive(band)) return [];
  const setListIds = new Set(setLists.map((s) => s.id));
  return songs.filter(
    (s) =>
      s.bandId === band.id && setListIds.has(s.setListId) && memberSubs.has(s.owner) && songRowIsWellFormed(s),
  ) as ValidSong[];
}

/** Valid songs the owner has not hidden. */
export function filterValidSongs(
  songs: SongRecord[],
  band: BandRecord,
  setLists: ValidSetList[],
  memberSubs: Set<string>,
): ValidSong[] {
  const hidden = new Set(band.hiddenSongIds);
  return structurallyValidSongs(songs, band, setLists, memberSubs).filter((s) => !hidden.has(s.id));
}

/** Splits valid songs into what everyone sees and what the owner hid (one validation pass). */
export function partitionSongs(
  songs: SongRecord[],
  band: BandRecord,
  setLists: ValidSetList[],
  memberSubs: Set<string>,
): { visible: ValidSong[]; hidden: ValidSong[] } {
  const hiddenIds = new Set(band.hiddenSongIds);
  const valid = structurallyValidSongs(songs, band, setLists, memberSubs);
  return { visible: valid.filter((s) => !hiddenIds.has(s.id)), hidden: valid.filter((s) => hiddenIds.has(s.id)) };
}

// ── Song colors ────────────────────────────────────────────────────────────

export function isSongColorKey(value: string): value is SongColorKey {
  return (SONG_COLOR_KEYS as readonly string[]).includes(value);
}

export type Stamped = { owner: string; createdAt?: string; updatedAt?: string };
export const rowStamp = (r: Stamped): string => r.updatedAt ?? r.createdAt ?? '';
const isNewerRow = (a: Stamped, b: Stamped): boolean =>
  (rowStamp(a).localeCompare(rowStamp(b)) || a.owner.localeCompare(b.owner)) > 0;

/** Color rows that count: the song is valid, the parents match it and the writer is a valid member. */
function countedColorRows(rows: SongColorRecord[], songs: ValidSong[], memberSubs: Set<string>): SongColorRecord[] {
  const songById = new Map(songs.map((s) => [s.id, s]));
  return rows.filter((row) => {
    const song = songById.get(row.songId);
    return !!song && row.setListId === song.setListId && row.bandId === song.bandId && memberSubs.has(row.owner);
  });
}

/**
 * The shared color per song: the newest row (by server `updatedAt`, then owner for a stable tie)
 * written by a valid member with a palette color; `none` is the newest "no color" and leaves the
 * song uncolored. Rows from strangers, banned users or forged parents never count.
 */
export function resolveSongColors(
  rows: SongColorRecord[],
  songs: ValidSong[],
  memberSubs: Set<string>,
): Map<string, SongColorKey> {
  const latest = new Map<string, SongColorRecord>();
  for (const row of countedColorRows(rows, songs, memberSubs)) {
    if (!isSongColorKey(row.color) && row.color !== NO_SONG_COLOR) continue;
    const prev = latest.get(row.songId);
    if (!prev || isNewerRow(row, prev)) latest.set(row.songId, row);
  }
  const colors = new Map<string, SongColorKey>();
  for (const [songId, row] of latest) if (isSongColorKey(row.color)) colors.set(songId, row.color);
  return colors;
}

/** Songs the caller has a (valid) color row for, `none` included: picks create vs update for the next write. */
export function myColorSongIds(rows: SongColorRecord[], songs: ValidSong[], memberSubs: Set<string>, sub: string): Set<string> {
  return new Set(countedColorRows(rows, songs, memberSubs).filter((r) => r.owner === sub).map((r) => r.songId));
}

// ── Color labels ───────────────────────────────────────────────────────────

export const sanitizeColorLabel = (raw: string): string => sanitizeText(raw, BAND_LIMITS.colorLabelMax);

/** Label rows that count: a palette color, the band's own, a valid member's, and clean text (or empty = cleared). */
function countedLabelRows(rows: ColorLabelRecord[], band: BandRecord, memberSubs: Set<string>): ColorLabelRecord[] {
  return rows.filter(
    (row) =>
      row.bandId === band.id &&
      isSongColorKey(row.color) &&
      memberSubs.has(row.owner) &&
      isCleanText(row.label, BAND_LIMITS.colorLabelMax, false),
  );
}

/**
 * The band's label per color: the newest row (by server `updatedAt`, then owner for a stable tie)
 * written by a valid member; an empty newest label leaves the color unlabeled. Rows from strangers,
 * banned users, other bands or with spoofed text never count (hidden, not repaired).
 */
export function resolveColorLabels(
  rows: ColorLabelRecord[],
  band: BandRecord,
  memberSubs: Set<string>,
): Map<SongColorKey, string> {
  const latest = new Map<string, ColorLabelRecord>();
  for (const row of countedLabelRows(rows, band, memberSubs)) {
    const prev = latest.get(row.color);
    if (!prev || isNewerRow(row, prev)) latest.set(row.color, row);
  }
  const labels = new Map<SongColorKey, string>();
  for (const [color, row] of latest) if (row.label && isSongColorKey(color)) labels.set(color, row.label);
  return labels;
}

/** Colors the caller has a (valid) label row for, empty ones included: picks create vs update for the next write. */
export function myLabelColors(rows: ColorLabelRecord[], band: BandRecord, memberSubs: Set<string>, sub: string): Set<SongColorKey> {
  const mine = countedLabelRows(rows, band, memberSubs).filter((r) => r.owner === sub);
  return new Set(mine.map((r) => r.color).filter(isSongColorKey));
}

// ── Votes ──────────────────────────────────────────────────────────────────

export function isVoteValue(value: string): value is VoteValue {
  return value === 'up' || value === 'down';
}

/**
 * Votes that count: value is up/down, the voter is a valid member, the song is valid, and the
 * vote's bandId/setListId match the song's (a forged row can't be pointed at another list).
 * At most one per (song, voter); if the backend ever returns more, the latest wins.
 */
export function filterCountedVotes(
  votes: VoteRecord[],
  songs: ValidSong[],
  memberSubs: Set<string>,
): ValidVote[] {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const latest = new Map<string, VoteRecord>();
  for (const v of votes) {
    const song = songById.get(v.songId);
    if (!song || !isVoteValue(v.value) || !memberSubs.has(v.owner)) continue;
    if (v.setListId !== song.setListId || v.bandId !== song.bandId) continue;
    const key = JSON.stringify([v.songId, v.owner]);
    const prev = latest.get(key);
    const stamp = v.updatedAt ?? v.createdAt ?? '';
    if (!prev || stamp >= (prev.updatedAt ?? prev.createdAt ?? '')) latest.set(key, v);
  }
  return [...latest.values()] as ValidVote[];
}

export const EMPTY_TALLY: Readonly<SongTally> = Object.freeze({ up: 0, down: 0, score: 0 });

export function tallyVotes(counted: ValidVote[], songs: ValidSong[]): Map<string, SongTally> {
  const tallies = new Map<string, SongTally>(songs.map((s) => [s.id, { ...EMPTY_TALLY }]));
  for (const v of counted) {
    const t = tallies.get(v.songId);
    if (!t) continue;
    if (v.value === 'up') t.up += 1;
    else t.down += 1;
    t.score = t.up - t.down;
  }
  return tallies;
}

/** The caller's own counted vote per song. */
export function myVotes(counted: ValidVote[], sub: string): Map<string, VoteValue> {
  const mine = new Map<string, VoteValue>();
  for (const v of counted) if (v.owner === sub) mine.set(v.songId, v.value);
  return mine;
}

/**
 * Re-applies the caller's pending (optimistic) vote on top of a server tally: removes what the
 * server counted for them and adds what they just chose (`null` = retracted).
 */
export function adjustTally(
  tally: SongTally,
  serverMine: VoteValue | undefined,
  nextMine: VoteValue | null | undefined,
): SongTally {
  if (nextMine === undefined) return tally;
  let { up, down } = tally;
  if (serverMine === 'up') up -= 1;
  if (serverMine === 'down') down -= 1;
  if (nextMine === 'up') up += 1;
  if (nextMine === 'down') down += 1;
  return { up, down, score: up - down };
}

/**
 * The pending choice to trust over the server's answer: while its request is in flight, or until
 * `graceMs` after it finished when the data was fetched before that (the index can lag). `undefined`
 * means the server's answer should be used.
 */
export function activePending<T>(
  pending: PendingChoice<T> | undefined,
  fetchedAt: number,
  graceMs: number = VOTE_INDEX_LAG_GRACE_MS,
): PendingChoice<T> | undefined {
  return pending && (pending.settledAt === null || fetchedAt <= pending.settledAt + graceMs) ? pending : undefined;
}

/** Which vote to show for a song: the caller's pending choice if `activePending`, else the server's. */
export function resolveMyVote(
  pendingVote: PendingVote | undefined,
  fetchedAt: number,
  serverMine: VoteValue | undefined,
  graceMs: number = VOTE_INDEX_LAG_GRACE_MS,
): { mine: VoteValue | undefined; pending: VoteValue | null | undefined } {
  const active = activePending(pendingVote, fetchedAt, graceMs);
  if (!active) return { mine: serverMine, pending: undefined };
  return { mine: active.value ?? undefined, pending: active.value };
}

/** Score desc, then createdAt asc, then id (stable, deterministic). */
export function sortSongsByScore(songs: ValidSong[], tallies: Map<string, SongTally>): ValidSong[] {
  return [...songs].sort((a, b) => {
    const diff = (tallies.get(b.id)?.score ?? 0) - (tallies.get(a.id)?.score ?? 0);
    return diff || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

// ── Display names ──────────────────────────────────────────────────────────

/** owner → unique label; clashes (case-insensitive) become "Mike (2)", in join order. */
export function buildDisplayNames(members: ValidMember[]): Map<string, string> {
  const used = new Set<string>();
  const labels = new Map<string, string>();
  for (const m of [...members].sort(byJoinOrder)) {
    const base = sanitizeDisplayName(m.displayName);
    let label = base;
    for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} (${n})`;
    used.add(label.toLowerCase());
    labels.set(m.owner, label);
  }
  return labels;
}

// ── Song input (form → API) ────────────────────────────────────────────────

export interface SongInput {
  title: string;
  artist: string | null;
  key: string | null;
  bpm: number | null;
  notes: string | null;
  songUrl: string | null;
  tabUrl: string | null;
}

export interface RawSongInput {
  title: string;
  artist?: string;
  key?: string;
  bpm?: string | number | null;
  notes?: string;
  songUrl?: string;
  tabUrl?: string;
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** "localhost:3000/x" looks like a scheme but is a host and port. */
const HOST_WITH_PORT = /^[^/]+:\d+(\/|$)/;

/** Text without a scheme ("example.com/x", "localhost:3000") is assumed to be https. */
function withDefaultScheme(text: string): string {
  return HAS_SCHEME.test(text) && !HOST_WITH_PORT.test(text) ? text : `https://${text}`;
}

/**
 * A link typed into the form: "example.com/x" gets `https://`. Returns the canonical link, `''`
 * when empty, or the raw text when it isn't a valid link (so `songFieldError` reports it).
 */
export function parseLinkInput(raw: string | undefined): string {
  const text = stripUnsafeText(raw ?? '');
  if (!text) return '';
  return normalizeHttpUrl(withDefaultScheme(text)) ?? text;
}

/** Validates/normalizes a suggest-song form with the same bounds the read-time validators enforce. */
export function parseSongInput(raw: RawSongInput): { value: SongInput } | { error: string } {
  const title = stripUnsafeText(raw.title);
  const artist = stripUnsafeText(raw.artist ?? '');
  const key = stripUnsafeText(raw.key ?? '');
  const notes = sanitizeNotes(raw.notes ?? '');
  const bpmText = typeof raw.bpm === 'number' ? String(raw.bpm) : (raw.bpm ?? '').trim();
  const bpm = bpmText === '' ? null : Number(bpmText);

  const songUrl = parseLinkInput(raw.songUrl);
  const tabUrl = parseLinkInput(raw.tabUrl);

  const error = songFieldError({ title, artist, key, bpm, notes, songUrl, tabUrl });
  if (error) return { error };
  return {
    value: { title, artist: artist || null, key: key || null, bpm, notes: notes || null, songUrl: songUrl || null, tabUrl: tabUrl || null },
  };
}

// ── Links in text ──────────────────────────────────────────────────────────

export interface TextPart {
  text: string;
  /** Present for a clickable web link (canonical, http(s) only). */
  href?: string;
}

const TRAILING_PUNCTUATION_CHAR = /[.,;:!?)\]}]/;
const NON_ASCII = /[\u0080-\uffff]/; // astral characters are surrogate pairs, so they match too
const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/gi;

/** Drops sentence punctuation after a link, keeping a closing ")" that balances one inside it. */
function trimTrailingPunctuation(url: string): string {
  let open = 0;
  let close = 0;
  for (const ch of url) {
    if (ch === '(') open += 1;
    else if (ch === ')') close += 1;
  }
  let end = url.length;
  while (end > 0 && TRAILING_PUNCTUATION_CHAR.test(url[end - 1])) {
    if (url[end - 1] === ')') {
      if (close <= open) break;
      close -= 1;
    }
    end -= 1;
  }
  return url.slice(0, end);
}

/** Splits text into plain and link parts so URLs can be rendered as anchors (never via innerHTML). */
export function splitTextWithLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  const push = (t: string, href?: string) => {
    if (t) parts.push(href ? { text: t, href } : { text: t });
  };
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const start = match.index;
    const candidate = trimTrailingPunctuation(match[0]);
    // Non-ASCII text could display one host while linking to another (homographs): leave it plain.
    const href = NON_ASCII.test(candidate) ? null : normalizeHttpUrl(candidate);
    if (!href) continue;
    push(text.slice(last, start));
    push(candidate, href);
    last = start + candidate.length;
  }
  push(text.slice(last));
  return parts;
}
