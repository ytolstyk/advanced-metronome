// Band click tracks: the strict payload format. A track attached to a band song is stored as a JSON
// string written by any member, so it is UNTRUSTED on read: `parseBandTrack` accepts only exactly what
// `encodeBandTrack` writes and reports anything else as unreadable (never repaired, never partial: a
// click track missing a bar is wrong). Pure module: no React, no AWS.

import type { AccentLevel, TrackPiece } from './audio/ClickTrackEngine';
import { measureTrack } from './audio/clickMath';
import type { SubdivisionLabel } from './audio/clickMath';
import type { SegmentGroup } from './clickTrackTypes';
import { BAND_LIMITS } from './bandTypes';
import { CLICK_BPM_MAX, CLICK_BPM_MIN } from './constants';
import { sanitizeText } from './utils/sanitizeText';

export const BAND_TRACK_FORMAT = 1;

const PIECE_COUNT_CAP = 300;

export const BAND_TRACK_LIMITS = {
  /** Serialized `track` size; well under DynamoDB's 400 KB item limit (JSON escaping adds a little). */
  maxBytes: BAND_LIMITS.trackMaxBytes,
  maxGroups: 50,
  /** Segments allowed at most; `maxBandTrackPieces()` lowers it if the worst-case segment would not fit `maxBytes`. */
  maxPieces: PIECE_COUNT_CAP,
  idMax: 16,
  labelMax: 40,
  groupNameMax: 30,
  numeratorMax: 32,
  denominatorMax: 64,
  repeatsMax: 99,
  stepSizeMax: 100,
  stepMeasuresMax: 99,
  /** Longest track that can be saved and played (the editor itself allows 30 minutes). */
  maxSeconds: 20 * 60,
  /** Clicks in the whole track. Play schedules lazily and Download renders a minute at a time, so this bounds parse work and the number of render slices. */
  maxClicks: 30_000,
  /** A hand-off from the set list page to the editor is ignored once it is older than this. */
  handoffMaxAgeMs: 60_000,
} as const;

const SUBDIVISIONS: readonly SubdivisionLabel[] = [
  'whole', 'half', 'quarter', 'eighth', 'sixteenth', 'quarter-triplet', 'eighth-triplet',
];
const ACCENT_LEVELS: readonly AccentLevel[] = ['accent', 'normal', 'ghost'];
const RAMP_MODES = ['linear', 'stepped'] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = '#94a3b8';

// Compile-time guard: adding a field to `TrackPiece` fails `tsc` here until the parser (and, for
// a stored-shape change, BAND_TRACK_FORMAT) is updated. Unknown keys on a stored piece are unreadable.
const PIECE_KEYS = {
  id: true, label: true, color: true, groupId: true, timeSignature: true, subdivision: true, bpm: true,
  repeats: true, rampEndBpm: true, rampMode: true, rampStepSize: true, rampStepMeasures: true,
  accentPattern: true,
} satisfies Record<keyof TrackPiece, true>;
const PIECE_KEY_SET: ReadonlySet<string> = new Set(Object.keys(PIECE_KEYS));
const GROUP_KEY_SET: ReadonlySet<string> = new Set(['id', 'name', 'color']);
const SIG_KEY_SET: ReadonlySet<string> = new Set(['numerator', 'denominator']);

// ── Sizes ──────────────────────────────────────────────────────────────────

/** UTF-8 length of a string in bytes (what DynamoDB stores), without relying on TextEncoder. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** JSON size of the largest segment this parser accepts (4-byte characters, a full accent pattern, every ramp field). */
export function worstCasePieceBytes(): number {
  const { idMax, labelMax, numeratorMax } = BAND_TRACK_LIMITS;
  const piece: TrackPiece = {
    id: 'x'.repeat(idMax),
    label: '😀'.repeat(labelMax),
    color: '#ffffff',
    groupId: 'x'.repeat(idMax),
    timeSignature: { numerator: numeratorMax, denominator: BAND_TRACK_LIMITS.denominatorMax },
    subdivision: 'quarter-triplet',
    bpm: CLICK_BPM_MAX,
    repeats: BAND_TRACK_LIMITS.repeatsMax,
    rampEndBpm: CLICK_BPM_MAX,
    rampMode: 'stepped',
    rampStepSize: BAND_TRACK_LIMITS.stepSizeMax,
    rampStepMeasures: BAND_TRACK_LIMITS.stepMeasuresMax,
    accentPattern: Array.from({ length: numeratorMax }, () => 'ghost' as const),
  };
  return utf8ByteLength(JSON.stringify(piece)) + 1; // + the separating comma
}

function worstCaseGroupBytes(): number {
  const { idMax, groupNameMax } = BAND_TRACK_LIMITS;
  return utf8ByteLength(JSON.stringify({ id: 'x'.repeat(idMax), name: '😀'.repeat(groupNameMax), color: '#ffffff' })) + 1;
}

/** Most segments a band track may hold: 300, or fewer if the worst-case segment would push the row past `maxBytes`. */
let cachedMaxPieces: number | undefined;
export function maxBandTrackPieces(): number {
  if (cachedMaxPieces === undefined) {
    const room = BAND_TRACK_LIMITS.maxBytes - BAND_TRACK_LIMITS.maxGroups * worstCaseGroupBytes() - 64;
    cachedMaxPieces = Math.min(PIECE_COUNT_CAP, Math.floor(room / worstCasePieceBytes()));
  }
  return cachedMaxPieces;
}

// ── Strict parsing ─────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const hasOnly = (obj: Raw, keys: ReadonlySet<string>): boolean => Object.keys(obj).every((k) => keys.has(k));
const isCleanText = (v: unknown, max: number): v is string => typeof v === 'string' && sanitizeText(v, max) === v;
const isCleanId = (v: unknown): v is string => isCleanText(v, BAND_TRACK_LIMITS.idMax) && v !== '';

function parseGroup(raw: unknown): SegmentGroup | string {
  if (!isRecord(raw) || !hasOnly(raw, GROUP_KEY_SET)) return 'a group is malformed';
  const { id, name, color } = raw;
  if (!isCleanId(id)) return 'a group has a bad id';
  if (!isCleanText(name, BAND_TRACK_LIMITS.groupNameMax) || name === '') return 'a group has a bad name';
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) return 'a group has a bad color';
  return { id, name, color };
}

/** One segment, or the reason it is unreadable. `groupIds` are the ids of the track's groups. */
export function parseTrackPiece(raw: unknown, groupIds: ReadonlySet<string>): TrackPiece | string {
  if (!isRecord(raw) || !hasOnly(raw, PIECE_KEY_SET)) return 'a segment is malformed';
  const { id, label, color, groupId, timeSignature, subdivision, bpm, repeats } = raw;
  if (!isCleanId(id)) return 'a segment has a bad id';
  if (!isCleanText(label, BAND_TRACK_LIMITS.labelMax)) return 'a segment has a bad label';
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) return 'a segment has a bad color';
  if (groupId !== null && !(typeof groupId === 'string' && groupIds.has(groupId))) return 'a segment names a missing group';
  if (!isRecord(timeSignature) || !hasOnly(timeSignature, SIG_KEY_SET)) return 'a segment has a bad time signature';
  const { numerator, denominator } = timeSignature;
  if (!isInt(numerator, 1, BAND_TRACK_LIMITS.numeratorMax) || !isInt(denominator, 1, BAND_TRACK_LIMITS.denominatorMax)) {
    return 'a segment has an unsupported time signature';
  }
  if (typeof subdivision !== 'string' || !(SUBDIVISIONS as readonly string[]).includes(subdivision)) {
    return 'a segment has a bad subdivision';
  }
  if (!isInt(bpm, CLICK_BPM_MIN, CLICK_BPM_MAX)) return 'a segment has a bad tempo';
  if (!isInt(repeats, 1, BAND_TRACK_LIMITS.repeatsMax)) return 'a segment has a bad repeat count';

  const piece: TrackPiece = {
    id,
    label,
    color,
    groupId,
    timeSignature: { numerator, denominator },
    subdivision: subdivision as SubdivisionLabel,
    bpm,
    repeats,
  };

  const { rampMode, rampEndBpm, rampStepSize, rampStepMeasures, accentPattern } = raw;
  if ((rampMode === undefined) !== (rampEndBpm === undefined)) return 'a segment has half a tempo ramp';
  if (rampMode !== undefined) {
    if (typeof rampMode !== 'string' || !(RAMP_MODES as readonly string[]).includes(rampMode)) return 'a segment has a bad ramp';
    if (!isInt(rampEndBpm, CLICK_BPM_MIN, CLICK_BPM_MAX)) return 'a segment has a bad ramp tempo';
    piece.rampMode = rampMode as 'linear' | 'stepped';
    piece.rampEndBpm = rampEndBpm;
    if (rampStepSize !== undefined) {
      if (!isInt(rampStepSize, 1, BAND_TRACK_LIMITS.stepSizeMax)) return 'a segment has a bad ramp step';
      piece.rampStepSize = rampStepSize;
    }
    if (rampStepMeasures !== undefined) {
      if (!isInt(rampStepMeasures, 1, BAND_TRACK_LIMITS.stepMeasuresMax)) return 'a segment has a bad ramp step';
      piece.rampStepMeasures = rampStepMeasures;
    }
  } else if (rampStepSize !== undefined || rampStepMeasures !== undefined) {
    return 'a segment has ramp steps without a ramp';
  }

  if (accentPattern !== undefined) {
    if (
      !Array.isArray(accentPattern) ||
      accentPattern.length !== numerator ||
      !accentPattern.every((a) => (ACCENT_LEVELS as readonly unknown[]).includes(a))
    ) {
      return 'a segment has a bad accent pattern';
    }
    piece.accentPattern = [...accentPattern] as AccentLevel[];
  }
  return piece;
}

export type TrackParts = { pieces: TrackPiece[]; groups: SegmentGroup[]; seconds: number; clicks: number };

/** Validates a whole {pieces, groups} pair (counts, ids, group references, duration and click caps). */
function parseParts(rawPieces: unknown, rawGroups: unknown): TrackParts | string {
  if (!Array.isArray(rawPieces) || !Array.isArray(rawGroups)) return 'the track is malformed';
  if (rawPieces.length === 0) return 'the track has no segments';
  if (rawPieces.length > maxBandTrackPieces()) return 'the track has too many segments';
  if (rawGroups.length > BAND_TRACK_LIMITS.maxGroups) return 'the track has too many groups';

  const groups: SegmentGroup[] = [];
  const groupIds = new Set<string>();
  for (const raw of rawGroups) {
    const group = parseGroup(raw);
    if (typeof group === 'string') return group;
    if (groupIds.has(group.id)) return 'two groups share an id';
    groupIds.add(group.id);
    groups.push(group);
  }

  const pieces: TrackPiece[] = [];
  const pieceIds = new Set<string>();
  for (const raw of rawPieces) {
    const piece = parseTrackPiece(raw, groupIds);
    if (typeof piece === 'string') return piece;
    if (pieceIds.has(piece.id)) return 'two segments share an id';
    pieceIds.add(piece.id);
    pieces.push(piece);
  }

  const { seconds, clicks } = measureTrack(pieces);
  if (seconds > BAND_TRACK_LIMITS.maxSeconds) return 'the track is too long';
  if (clicks > BAND_TRACK_LIMITS.maxClicks) return 'the track has too many clicks';
  return { pieces, groups, seconds, clicks };
}

export type BandTrackParse =
  | ({ kind: 'ok' } & TrackParts)
  | { kind: 'cleared' }
  | { kind: 'newer' }
  | { kind: 'unreadable'; reason: string };

export interface BandTrackRowFields {
  format: number | null | undefined;
  bytes: number | null | undefined;
  track: string | null | undefined;
}

/**
 * Reads a stored row. Never throws and never repairs: anything that is not exactly what
 * `encodeBandTrack` writes is `unreadable`; a higher `format` (written by a newer app) is `newer`.
 * The real UTF-8 length of `track` must equal the claimed `bytes` before it is parsed, so a forged
 * small `bytes` cannot make a client parse a huge string.
 */
export function parseBandTrack(row: BandTrackRowFields): BandTrackParse {
  const { format, bytes, track } = row;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return { kind: 'unreadable', reason: 'unknown format' };
  if (format > BAND_TRACK_FORMAT) return { kind: 'newer' };
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0) return { kind: 'unreadable', reason: 'bad size' };
  if (bytes === 0) {
    return track === undefined || track === null || track === '' ? { kind: 'cleared' } : { kind: 'unreadable', reason: 'size mismatch' };
  }
  if (typeof track !== 'string') return { kind: 'unreadable', reason: 'missing data' };
  if (bytes > BAND_TRACK_LIMITS.maxBytes || track.length > BAND_TRACK_LIMITS.maxBytes) return { kind: 'unreadable', reason: 'too large' };
  if (utf8ByteLength(track) !== bytes) return { kind: 'unreadable', reason: 'size mismatch' };

  let json: unknown;
  try {
    json = JSON.parse(track);
  } catch {
    return { kind: 'unreadable', reason: 'not valid data' };
  }
  if (!isRecord(json) || !hasOnly(json, new Set(['pieces', 'groups']))) return { kind: 'unreadable', reason: 'the track is malformed' };
  const parts = parseParts(json.pieces, json.groups);
  return typeof parts === 'string' ? { kind: 'unreadable', reason: parts } : { kind: 'ok', ...parts };
}

// ── Encoding ───────────────────────────────────────────────────────────────

/** Copies a piece through the parser's whitelist, tidying text and colors so editor/importer output round-trips. */
function normalisePiece(piece: TrackPiece, index: number): Raw {
  const label = sanitizeText(typeof piece.label === 'string' ? piece.label : '', BAND_TRACK_LIMITS.labelMax);
  const out: Raw = {
    id: typeof piece.id === 'string' ? sanitizeText(piece.id, BAND_TRACK_LIMITS.idMax) || `s${index + 1}` : `s${index + 1}`,
    label,
    color: typeof piece.color === 'string' && HEX_COLOR.test(piece.color) ? piece.color : FALLBACK_COLOR,
    groupId: piece.groupId ?? null,
    timeSignature: { numerator: piece.timeSignature?.numerator, denominator: piece.timeSignature?.denominator },
    subdivision: piece.subdivision,
    bpm: piece.bpm,
    repeats: piece.repeats,
  };
  if (piece.rampMode !== undefined && piece.rampEndBpm !== undefined) {
    out.rampMode = piece.rampMode;
    out.rampEndBpm = piece.rampEndBpm;
    if (piece.rampMode === 'stepped') {
      if (piece.rampStepSize !== undefined) out.rampStepSize = piece.rampStepSize;
      if (piece.rampStepMeasures !== undefined) out.rampStepMeasures = piece.rampStepMeasures;
    }
  }
  if (piece.accentPattern !== undefined) out.accentPattern = piece.accentPattern;
  return out;
}

function normaliseGroup(group: SegmentGroup, index: number): Raw {
  return {
    id: typeof group.id === 'string' ? sanitizeText(group.id, BAND_TRACK_LIMITS.idMax) || `g${index + 1}` : `g${index + 1}`,
    name: sanitizeText(typeof group.name === 'string' ? group.name : '', BAND_TRACK_LIMITS.groupNameMax) || `Group ${index + 1}`,
    color: typeof group.color === 'string' && HEX_COLOR.test(group.color) ? group.color : FALLBACK_COLOR,
  };
}

/** Rewrites ids so they stay unique after being clamped (a repeat gets a position-based id). */
function uniqueIds(items: Raw[], prefix: string): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    let id = item.id as string;
    for (let n = 1; seen.has(id); n++) id = `${prefix}${i + 1}${n > 1 ? `-${n}` : ''}`;
    seen.add(id);
    item.id = id;
  });
}

/**
 * The stored `track` string and its UTF-8 size for a band row. Throws an Error with a plain-language
 * message when the track is over a limit (segments, size, length, clicks) or cannot be stored.
 */
export function encodeBandTrack(
  pieces: readonly TrackPiece[],
  groups: readonly SegmentGroup[],
): { track: string; bytes: number } {
  const maxPieces = maxBandTrackPieces();
  if (pieces.length === 0) throw new Error('There is nothing to save: add at least one segment.');
  if (pieces.length > maxPieces) {
    throw new Error(`Band click tracks hold up to ${maxPieces} segments; this one has ${pieces.length}. Remove ${pieces.length - maxPieces}.`);
  }
  if (groups.length > BAND_TRACK_LIMITS.maxGroups) {
    throw new Error(`Band click tracks hold up to ${BAND_TRACK_LIMITS.maxGroups} groups; this one has ${groups.length}.`);
  }
  const { seconds, clicks } = measureTrack(pieces);
  if (seconds > BAND_TRACK_LIMITS.maxSeconds) {
    throw new Error(`Band click tracks can be up to ${BAND_TRACK_LIMITS.maxSeconds / 60} minutes; this one is ${Math.ceil(seconds / 60)}.`);
  }
  if (clicks > BAND_TRACK_LIMITS.maxClicks) {
    throw new Error(`This track has ${clicks} clicks; band click tracks hold up to ${BAND_TRACK_LIMITS.maxClicks}.`);
  }

  const rawGroups = groups.map(normaliseGroup);
  uniqueIds(rawGroups, 'g');
  // A piece's `groupId` is the group's original id; point it at the (possibly tidied) stored id, or drop a dangling one.
  const storedGroupId = new Map<string, string>();
  groups.forEach((g, i) => {
    if (!storedGroupId.has(g.id)) storedGroupId.set(g.id, rawGroups[i]!.id as string);
  });
  const rawPieces = pieces.map(normalisePiece);
  rawPieces.forEach((piece, i) => {
    const original = pieces[i]!.groupId;
    piece.groupId = original ? (storedGroupId.get(original) ?? null) : null;
  });
  uniqueIds(rawPieces, 's');

  const track = JSON.stringify({ pieces: rawPieces, groups: rawGroups });
  const bytes = utf8ByteLength(track);
  if (bytes > BAND_TRACK_LIMITS.maxBytes) {
    throw new Error(`This track is too big to store (${Math.ceil(bytes / 1000)} KB; the limit is ${BAND_TRACK_LIMITS.maxBytes / 1000} KB). Remove some segments.`);
  }
  const check = parseBandTrack({ format: BAND_TRACK_FORMAT, bytes, track });
  if (check.kind !== 'ok') {
    throw new Error(`This track can't be saved to a band: ${check.kind === 'unreadable' ? check.reason : 'it is not valid'}.`);
  }
  return { track, bytes };
}

// ── Hand-off to the editor ─────────────────────────────────────────────────

export const BAND_TRACK_HANDOFF_KEY = 'band-to-click-import';

export interface BandTrackHandoff {
  pieces: TrackPiece[];
  groups: SegmentGroup[];
  title: string;
}

/** What the set list page leaves in sessionStorage for `/click-track` to pick up. */
export function serializeBandTrackHandoff(parts: { pieces: TrackPiece[]; groups: SegmentGroup[] }, title: string, now = Date.now()): string {
  return JSON.stringify({ pieces: parts.pieces, groups: parts.groups, title: sanitizeText(title, 100), at: now });
}

/** Reads and validates the hand-off; null when it is missing, stale, oversized or not a valid band track. */
export function parseBandTrackHandoff(raw: string | null, now = Date.now()): BandTrackHandoff | null {
  if (!raw || raw.length > BAND_TRACK_LIMITS.maxBytes + 1000) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(json) || typeof json.at !== 'number' || typeof json.title !== 'string') return null;
  if (!(now - json.at >= -5_000 && now - json.at <= BAND_TRACK_LIMITS.handoffMaxAgeMs)) return null;
  const parts = parseParts(json.pieces, json.groups);
  if (typeof parts === 'string') return null;
  return { pieces: parts.pieces, groups: parts.groups, title: sanitizeText(json.title, 100) };
}
