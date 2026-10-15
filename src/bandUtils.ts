import {
  BAND_LIMITS,
  VOTE_INDEX_LAG_GRACE_MS,
  type BandRecord,
  type MemberRecord,
  type PendingVote,
  type SetListRecord,
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
function isCleanText(text: string | null | undefined, max: number, required: boolean): boolean {
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
function byJoinOrder(a: MemberRecord, b: MemberRecord): number {
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

const SONG_KEY = /^[A-G][#b]?m?$/;

export function isValidSongKey(key: string | null | undefined): boolean {
  return !key || SONG_KEY.test(key);
}

interface SongFields {
  title: string;
  artist?: string | null;
  key?: string | null;
  bpm?: number | null;
  notes?: string | null;
}

/** The one definition of song bounds, shared by the form (write) and the validators (read). */
export function songFieldError(f: SongFields): string | null {
  if (!f.title.trim()) return 'Title is required';
  if (textLength(f.title) > BAND_LIMITS.titleMax) return `Title must be at most ${BAND_LIMITS.titleMax} characters`;
  if (textLength(f.artist ?? '') > BAND_LIMITS.artistMax) return `Artist must be at most ${BAND_LIMITS.artistMax} characters`;
  if (textLength(f.notes ?? '') > BAND_LIMITS.notesMax) return `Notes must be at most ${BAND_LIMITS.notesMax} characters`;
  if (!isValidSongKey(f.key)) return 'Key must look like C, F#, Bb or Am';
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
 * Which vote to show for a song: the caller's pending choice while it is in flight, or until
 * `graceMs` after it finished when the data was fetched before that (the vote index can lag);
 * otherwise what the server says. `pending` is `undefined` when the server's answer should be used.
 */
export function resolveMyVote(
  pendingVote: PendingVote | undefined,
  fetchedAt: number,
  serverMine: VoteValue | undefined,
  graceMs: number = VOTE_INDEX_LAG_GRACE_MS,
): { mine: VoteValue | undefined; pending: VoteValue | null | undefined } {
  const active =
    pendingVote && (pendingVote.settledAt === null || fetchedAt <= pendingVote.settledAt + graceMs)
      ? pendingVote
      : undefined;
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
}

export interface RawSongInput {
  title: string;
  artist?: string;
  key?: string;
  bpm?: string | number | null;
  notes?: string;
}

/** Validates/normalizes a suggest-song form with the same bounds the read-time validators enforce. */
export function parseSongInput(raw: RawSongInput): { value: SongInput } | { error: string } {
  const title = stripUnsafeText(raw.title);
  const artist = stripUnsafeText(raw.artist ?? '');
  const key = stripUnsafeText(raw.key ?? '');
  const notes = sanitizeNotes(raw.notes ?? '');
  const bpmText = typeof raw.bpm === 'number' ? String(raw.bpm) : (raw.bpm ?? '').trim();
  const bpm = bpmText === '' ? null : Number(bpmText);

  const error = songFieldError({ title, artist, key, bpm, notes });
  if (error) return { error };
  return { value: { title, artist: artist || null, key: key || null, bpm, notes: notes || null } };
}
