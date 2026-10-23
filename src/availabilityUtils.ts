import {
  AVAILABILITY_LIMITS,
  type AvailabilityRead,
  type AvailabilityRecord,
  type BandRecord,
  type ValidMember,
} from './bandTypes';
import { byJoinOrder, isBandAlive, rowStamp } from './bandUtils';
import {
  DAY_MS,
  SLOTS_PER_HEX,
  applyEdits,
  decodeMask,
  encodeRow,
  horizonEndSlot,
  slotOf,
  writerWindow,
} from './availabilitySlots';

/**
 * Availability logic that decides what a row means: strict parsing, who counts, and the overlap
 * of everyone's free time. Pure and zone-free (`availabilityCalendar.ts` is the Intl side).
 * Only "free" is ever stored, so anything unmarked is "not marked", never "busy". Rows are
 * trusted for nothing: auth rules can't look inside one, so a row that isn't exactly what this
 * client writes is hidden, never repaired.
 */

const { slotsPerDay, hexPerDay, parserMaxDays, maxParticipants, formatVersion, staleDays } = AVAILABILITY_LIMITS;
/** Keeps `startDay * 48` a safe integer. */
const MAX_START_DAY = 2 ** 31;
const HEX = /^[0-9a-f]+$/;

/** Overlap keeps one bit per participant in a 32-bit int; bit 31 would make the mask negative. */
export const MAX_MASK_MEMBERS = 31;
if (maxParticipants > MAX_MASK_MEMBERS) {
  throw new Error(`AVAILABILITY_LIMITS.maxParticipants (${maxParticipants}) exceeds ${MAX_MASK_MEMBERS}`);
}

// ── Strict parsing ─────────────────────────────────────────────────────────

export interface ParsedAvailability {
  /** First slot the row speaks for. */
  startSlot: number;
  /** One past the last slot the row speaks for. */
  endSlot: number;
  free: Set<number>;
}

export type ParseFailure =
  | 'dead-band'
  /** Wrong band or owner: not the row we asked for, so never something to overwrite. */
  | 'wrong-row'
  /** Written by a newer client. */
  | 'newer-format'
  | 'invalid';

export type ParseResult = { ok: true; parsed: ParsedAvailability } | { ok: false; reason: ParseFailure };

const fail = (reason: ParseFailure): ParseResult => ({ ok: false, reason });

/**
 * Read a row for member `sub`. The length is checked before the regex so an oversized string is
 * never scanned. Rows come off the wire, so the declared field types are a hope, not a guarantee.
 */
export function parseAvailabilityRow(row: AvailabilityRecord, band: BandRecord, sub: string): ParseResult {
  if (!isBandAlive(band)) return fail('dead-band');
  if (row.bandId !== band.id || !row.owner || row.owner !== sub) return fail('wrong-row');
  if (Number.isInteger(row.format) && row.format > formatVersion) return fail('newer-format');
  if (row.format !== formatVersion) return fail('invalid');
  if (!Number.isSafeInteger(row.startDay) || row.startDay < 0 || row.startDay >= MAX_START_DAY) return fail('invalid');
  const { mask } = row;
  if (typeof mask !== 'string') return fail('invalid');
  if (mask.length === 0 || mask.length % hexPerDay !== 0 || mask.length > parserMaxDays * hexPerDay) {
    return fail('invalid');
  }
  if (!HEX.test(mask)) return fail('invalid');
  const startSlot = row.startDay * slotsPerDay;
  return { ok: true, parsed: { startSlot, endSlot: startSlot + mask.length * SLOTS_PER_HEX, free: decodeMask(row.startDay, mask) } };
}

// ── The caller's own row, and saving it ────────────────────────────────────

export type OwnRowState =
  | { kind: 'none' }
  | { kind: 'ok'; parsed: ParsedAvailability }
  /** Known format but unreadable: treated as empty and overwritten (the user is told). */
  | { kind: 'invalid' }
  /** Written by a newer client: never overwrite it. */
  | { kind: 'newer-format' }
  /** Dead band, or not our row: never overwrite it. */
  | { kind: 'unavailable' }
  /** The read itself failed: never edit blind. */
  | { kind: 'failed' };

/** How the caller's own row (or its absence) should be treated when editing and saving. */
export function classifyOwnRow(read: AvailabilityRead, band: BandRecord, sub: string): OwnRowState {
  if (read.status === 'failed') return { kind: 'failed' };
  if (!read.row) return { kind: 'none' };
  const result = parseAvailabilityRow(read.row, band, sub);
  if (result.ok) return { kind: 'ok', parsed: result.parsed };
  if (result.reason === 'invalid') return { kind: 'invalid' };
  if (result.reason === 'newer-format') return { kind: 'newer-format' };
  return { kind: 'unavailable' };
}

/** Why the caller's own row can't be edited (they can still delete it). */
export type SaveBlockReason = 'failed' | 'newer-format' | 'unavailable';

/** The reason editing is off for this row state, or `null` when it can be edited. */
export function blockReasonOf(state: OwnRowState): SaveBlockReason | null {
  return state.kind === 'failed' || state.kind === 'newer-format' || state.kind === 'unavailable' ? state.kind : null;
}

/** "No row yet": a stable value, so it can be a hook dependency without changing every render. */
export const NO_ROW_READ: AvailabilityRead = { status: 'ok', row: null };

export type SavePlan =
  | { kind: 'blocked'; reason: SaveBlockReason }
  /** `reset`: the stored row was unreadable and is being replaced. */
  | { kind: 'write'; row: Pick<AvailabilityRecord, 'format' | 'startDay' | 'mask'>; reset: boolean };

/** What a save should write given the row currently stored, so the API only has to execute it. */
export function planSave(state: OwnRowState, edits: ReadonlyMap<number, boolean>, nowMs: number): SavePlan {
  const reason = blockReasonOf(state);
  if (reason) return { kind: 'blocked', reason };
  const base = state.kind === 'ok' ? state.parsed.free : new Set<number>();
  return { kind: 'write', row: encodeRow(applyEdits(base, edits, nowMs), nowMs), reset: state.kind === 'invalid' };
}

// ── Who counts ─────────────────────────────────────────────────────────────

export interface Participants {
  subs: string[];
  /** Valid members beyond the read bound that were left out. */
  excluded: number;
}

/**
 * The members whose rows get fetched: the owner (always valid, even without a Member row) and the
 * caller (if a member) first, then the rest in join order, capped at `maxParticipants`. The roster
 * has no member cap of its own, so this is a read bound, not a membership rule. Callers pass
 * already-validated members, so banned and non-members never appear.
 */
export function pickParticipants(
  members: ValidMember[],
  band: BandRecord,
  sub: string,
  callerIsMember: boolean,
): Participants {
  if (!isBandAlive(band)) return { subs: [], excluded: 0 };
  const forced = [...new Set([band.owner, callerIsMember ? sub : ''].filter(Boolean))];
  const rest = members.filter((m) => !forced.includes(m.owner)).sort(byJoinOrder);
  const all = [...forced, ...rest.map((m) => m.owner)];
  const subs = all.slice(0, maxParticipants);
  return { subs, excluded: all.length - subs.length };
}

// ── Resolving everyone's rows ──────────────────────────────────────────────

export type UnreadableReason = 'read-failed' | ParseFailure;

/** What reading one member's row told us, before "now" is applied. */
export type ParsedMember =
  | { kind: 'row'; parsed: ParsedAvailability; lastSaved: string | null }
  | { kind: 'none' }
  | { kind: 'unreadable'; reason: UnreadableReason };

export interface ParsedGroup {
  participants: Participants;
  members: Map<string, ParsedMember>;
}

/**
 * Stage one: parse every participant's read. Independent of the clock and of the caller's
 * unsaved edits, so a page can compute it once per fetch and re-run only `resolveAt` per tick/edit.
 */
export function parseGroup(
  reads: ReadonlyMap<string, AvailabilityRead>,
  participants: Participants,
  band: BandRecord,
): ParsedGroup {
  const subs = participants.subs.slice(0, maxParticipants);
  const members = new Map<string, ParsedMember>();
  for (const sub of subs) {
    const read = reads.get(sub);
    if (!read || read.status === 'failed') {
      members.set(sub, { kind: 'unreadable', reason: 'read-failed' });
    } else if (!read.row) {
      members.set(sub, { kind: 'none' });
    } else {
      const result = parseAvailabilityRow(read.row, band, sub);
      members.set(
        sub,
        result.ok
          ? { kind: 'row', parsed: result.parsed, lastSaved: rowStamp(read.row) || null }
          : { kind: 'unreadable', reason: result.reason },
      );
    }
  }
  return { participants: { subs, excluded: participants.excluded + participants.subs.length - subs.length }, members };
}

/** A member's standing at a moment in time. */
export type MemberStatus =
  | {
      kind: 'available';
      /** Slots the member marked free that haven't started, before the horizon. */
      free: Set<number>;
      startSlot: number;
      endSlot: number;
      /** Server `updatedAt` (else `createdAt`) of the row; advisory, shown as "last saved". */
      lastSaved: string | null;
      /** Saved longer ago than `staleDays`: marks may no longer be true. */
      outOfDate: boolean;
    }
  /** No row, or a row whose window ran out (`expired`). */
  | { kind: 'not-responded'; lastSaved: string | null; expired: boolean }
  | { kind: 'unreadable'; reason: UnreadableReason };

export interface AvailabilityResolution {
  nowSlot: number;
  horizonEndSlot: number;
  /** Participants in the order they were picked (this order drives bit positions in `Overlap`). */
  participants: string[];
  /** Participants left out by the read bound. */
  excluded: number;
  statuses: ReadonlyMap<string, MemberStatus>;
}

type Available = Extract<MemberStatus, { kind: 'available' }>;

function isOutOfDate(lastSaved: string | null, nowMs: number): boolean {
  if (!lastSaved) return false;
  const savedMs = Date.parse(lastSaved);
  return Number.isFinite(savedMs) && nowMs - savedMs > staleDays * DAY_MS;
}

/** The caller's own marks, as the page holds them (saved plus unsaved edits). */
export interface OwnMarks {
  sub: string;
  free: ReadonlySet<number>;
  lastSaved?: string | null;
}

/** The slots strictly after now and before the horizon. */
function keepWithinHorizon(slots: Iterable<number>, nowMs: number): Set<number> {
  const nowSlot = slotOf(nowMs);
  const horizon = horizonEndSlot(nowMs);
  const kept = new Set<number>();
  for (const slot of slots) if (slot > nowSlot && slot < horizon) kept.add(slot);
  return kept;
}

/** The caller's status from their own marks. Their row may be older than what they just saved, so they report their own timestamp. */
function mineStatus(group: ParsedGroup, nowMs: number, mine: OwnMarks): MemberStatus {
  const parsed = group.members.get(mine.sub);
  const storedAt = parsed?.kind === 'row' ? parsed.lastSaved : null;
  return {
    kind: 'available',
    free: keepWithinHorizon(mine.free, nowMs),
    ...writerWindow(nowMs),
    lastSaved: mine.lastSaved !== undefined ? mine.lastSaved : storedAt,
    outOfDate: false,
  };
}

/**
 * The same result as `resolveAt(group, nowMs, mine)` for a `resolution` made without `mine`, but
 * only the caller's entry is rebuilt, so every painted cell doesn't re-filter everyone else's marks.
 */
export function overlayMine(resolution: AvailabilityResolution, group: ParsedGroup, nowMs: number, mine: OwnMarks): AvailabilityResolution {
  if (!resolution.participants.includes(mine.sub)) return resolution;
  const statuses = new Map(resolution.statuses);
  statuses.set(mine.sub, mineStatus(group, nowMs, mine));
  return { ...resolution, statuses };
}

/**
 * Stage two: apply "now" to a parsed group. `mine` overrides the caller's own row with their
 * optimistic marks (so the group view reflects edits before they are saved) and counts them as
 * having a row even before their first save. A slot that has started never counts. Only pass
 * `mine` when the caller can actually save (`planSave` would write): not for a row from a newer
 * client, a row that isn't theirs, or a failed read.
 */
export function resolveAt(group: ParsedGroup, nowMs: number, mine?: OwnMarks): AvailabilityResolution {
  const nowSlot = slotOf(nowMs);
  const horizon = horizonEndSlot(nowMs);
  const withinHorizon = (slots: Iterable<number>) => keepWithinHorizon(slots, nowMs);
  const statuses = new Map<string, MemberStatus>();

  for (const sub of group.participants.subs) {
    const parsed = group.members.get(sub);
    if (mine && mine.sub === sub) {
      statuses.set(sub, mineStatus(group, nowMs, mine));
    } else if (!parsed || parsed.kind === 'unreadable') {
      statuses.set(sub, { kind: 'unreadable', reason: parsed?.kind === 'unreadable' ? parsed.reason : 'read-failed' });
    } else if (parsed.kind === 'none') {
      statuses.set(sub, { kind: 'not-responded', lastSaved: null, expired: false });
    } else if (parsed.parsed.startSlot >= horizon) {
      // A writer always starts at today's UTC day, so a start beyond the horizon is never ours.
      statuses.set(sub, { kind: 'unreadable', reason: 'invalid' });
    } else if (parsed.parsed.endSlot <= nowSlot) {
      statuses.set(sub, { kind: 'not-responded', lastSaved: parsed.lastSaved, expired: true });
    } else {
      statuses.set(sub, {
        kind: 'available',
        free: withinHorizon(parsed.parsed.free),
        startSlot: parsed.parsed.startSlot,
        endSlot: parsed.parsed.endSlot,
        lastSaved: parsed.lastSaved,
        outOfDate: isOutOfDate(parsed.lastSaved, nowMs),
      });
    }
  }
  return {
    nowSlot,
    horizonEndSlot: horizon,
    participants: group.participants.subs,
    excluded: group.participants.excluded,
    statuses,
  };
}

/** "today", "yesterday" or "N days ago" for a server timestamp; `null` when there isn't a usable one. */
export function describeAge(lastSaved: string | null, nowMs: number): string | null {
  if (!lastSaved) return null;
  const savedMs = Date.parse(lastSaved);
  if (!Number.isFinite(savedMs)) return null;
  const days = Math.floor((nowMs - savedMs) / DAY_MS);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Whether `sub` has a row that still speaks for some upcoming time (the page opens on the group view for them). */
export function hasCurrentRow(group: ParsedGroup, sub: string, nowMs: number): boolean {
  const member = group.members.get(sub);
  return member?.kind === 'row' && member.parsed.endSlot > slotOf(nowMs) && member.parsed.startSlot < horizonEndSlot(nowMs);
}

/** Both stages in one call (fine for tests and one-shot use). */
export function resolveAvailability(
  reads: ReadonlyMap<string, AvailabilityRead>,
  participants: Participants,
  band: BandRecord,
  nowMs: number,
  mine?: { sub: string; free: ReadonlySet<number> },
): AvailabilityResolution {
  return resolveAt(parseGroup(reads, participants, band), nowMs, mine);
}

/** Participants of one kind, in participant order. */
export function subsOfKind<K extends MemberStatus['kind']>(
  resolution: AvailabilityResolution,
  kind: K,
): string[] {
  return resolution.participants.filter((sub) => resolution.statuses.get(sub)?.kind === kind);
}

export function availableStatus(resolution: AvailabilityResolution, sub: string): Available | undefined {
  const status = resolution.statuses.get(sub);
  return status?.kind === 'available' ? status : undefined;
}

// ── Overlap ────────────────────────────────────────────────────────────────

const bitOf = (index: number): number => 1 << index;

export function popcount(value: number): number {
  let v = value;
  let count = 0;
  while (v) {
    v &= v - 1;
    count++;
  }
  return count;
}

/** The members in both sets. */
export const intersect = (a: number, b: number): number => a & b;

export interface Overlap {
  resolution: AvailabilityResolution;
  /** Participants who have a row, in participant order. */
  subs: string[];
  /** The most members free at any one slot. */
  maxCount: number;
  countAt(slot: number): number;
  freeAt(slot: number): string[];
  /** The members free at a slot, as an opaque set (see `membersIn`, `intersect`, `popcount`). */
  maskAt(slot: number): number;
  membersIn(mask: number): string[];
}

/** Who is free when, across everyone with a row. Owns the bit layout; callers use the methods. */
export function buildOverlap(resolution: AvailabilityResolution): Overlap {
  const subs = subsOfKind(resolution, 'available');
  const masks = new Map<number, number>();
  subs.forEach((sub, index) => {
    // `subs` only holds available members, so the status is always there.
    for (const slot of availableStatus(resolution, sub)!.free) masks.set(slot, (masks.get(slot) ?? 0) | bitOf(index));
  });
  let maxCount = 0;
  for (const mask of masks.values()) maxCount = Math.max(maxCount, popcount(mask));
  const maskAt = (slot: number): number => masks.get(slot) ?? 0;
  const membersIn = (mask: number): string[] => subs.filter((_, index) => mask & bitOf(index));
  return {
    resolution,
    subs,
    maxCount,
    maskAt,
    membersIn,
    countAt: (slot) => popcount(maskAt(slot)),
    freeAt: (slot) => membersIn(maskAt(slot)),
  };
}

export interface SlotDetail {
  free: string[];
  /** Has a row covering this slot but didn't mark it free. */
  notMarked: string[];
  /** Nothing to go on: no row, or the row doesn't reach this slot. */
  noData: string[];
  unreadable: string[];
}

/** Who is free / not marked / without data at one slot (for the cell detail panel). */
export function describeSlot(overlap: Overlap, slot: number): SlotDetail {
  const detail: SlotDetail = { free: overlap.freeAt(slot), notMarked: [], noData: [], unreadable: [] };
  const free = new Set(detail.free);
  for (const sub of overlap.resolution.participants) {
    const status = overlap.resolution.statuses.get(sub);
    if (status?.kind === 'unreadable') detail.unreadable.push(sub);
    else if (status?.kind === 'not-responded') detail.noData.push(sub);
    else if (status?.kind === 'available' && !free.has(sub)) {
      (slot >= status.startSlot && slot < status.endSlot ? detail.notMarked : detail.noData).push(sub);
    }
  }
  return detail;
}
