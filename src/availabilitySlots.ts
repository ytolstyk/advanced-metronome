import { AVAILABILITY_LIMITS, type AvailabilityRecord } from './bandTypes';

/**
 * Slot maths and the stored bit layout. A "slot" is a global half hour, `floor(epochMs / 30min)`,
 * so it means the same instant for every member whatever their zone. A row's `mask` is lowercase
 * hex: slot `startDay * 48 + i` is bit `3 - (i & 3)` of character `i >> 2`. This is the wire format
 * (see `AVAILABILITY_LIMITS`); nothing here depends on a time zone.
 */

const { slotMs, slotsPerDay, horizonDays, writerMaxDays, formatVersion } = AVAILABILITY_LIMITS;

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Half-hour slots in an hour. */
export const SLOTS_PER_HOUR = slotsPerDay / 24;
/** Slots covered by one hex character of the mask. */
export const SLOTS_PER_HEX = 4;
/** Bit that slot `n` (0-3) of a hex character sets; slot 0 is the high bit. */
const nibbleBit = (n: number): number => 8 >> n;

export const slotOf = (ms: number): number => Math.floor(ms / slotMs);
export const slotStartMs = (slot: number): number => slot * slotMs;
export const utcDayOf = (ms: number): number => Math.floor(ms / DAY_MS);

/**
 * A slot that has started can't be edited or suggested. The slot containing `nowMs` has always
 * started, so this is the same as `slot > slotOf(nowMs)`; resolution and suggestions use that rule.
 */
export const isSlotEditable = (slot: number, nowMs: number): boolean => slotStartMs(slot) > nowMs;

/**
 * One past the last slot a viewer can have marks in. A local day is offset from UTC by up to a
 * day either way, so 60 local days of slots always fit inside 61 days of slots from now (the real
 * last selectable slot is a day or so earlier; `buildHorizonDays` decides what the UI shows).
 */
export const horizonEndSlot = (nowMs: number): number => slotOf(nowMs) + (horizonDays + 1) * slotsPerDay;

/** The slots the row a save writes at `nowMs` speaks for (end exclusive). */
export function writerWindow(nowMs: number): { startSlot: number; endSlot: number } {
  const startSlot = utcDayOf(nowMs) * slotsPerDay;
  return { startSlot, endSlot: startSlot + writerMaxDays * slotsPerDay };
}

// ── Codec ──────────────────────────────────────────────────────────────────

/** Free slots in a mask. Callers validate the hex first (`parseAvailabilityRow`). */
export function decodeMask(startDay: number, mask: string): Set<number> {
  const free = new Set<number>();
  const base = startDay * slotsPerDay;
  for (let n = 0; n < mask.length; n++) {
    const nibble = parseInt(mask[n], 16);
    if (!nibble) continue;
    for (let b = 0; b < SLOTS_PER_HEX; b++) if (nibble & nibbleBit(b)) free.add(base + n * SLOTS_PER_HEX + b);
  }
  return free;
}

/** Hex mask of `days` UTC days from `startDay`; slots outside that window (or not whole) are dropped. */
export function encodeSlots(free: Iterable<number>, startDay: number, days: number): string {
  const nibbles = new Uint8Array(days * AVAILABILITY_LIMITS.hexPerDay);
  const base = startDay * slotsPerDay;
  const bits = days * slotsPerDay;
  for (const slot of free) {
    const offset = slot - base;
    if (!Number.isInteger(offset) || offset < 0 || offset >= bits) continue;
    nibbles[Math.floor(offset / SLOTS_PER_HEX)] |= nibbleBit(offset % SLOTS_PER_HEX);
  }
  return Array.from(nibbles, (v) => v.toString(16)).join('');
}

/**
 * The row a save writes: a fixed window from today's UTC day, free marks only for slots that
 * haven't started. Marks outside the window (past, or beyond the horizon) are dropped, which also
 * discards junk left by a skewed clock.
 */
export function encodeRow(
  free: Iterable<number>,
  nowMs: number,
): Pick<AvailabilityRecord, 'format' | 'startDay' | 'mask'> {
  const startDay = utcDayOf(nowMs);
  const editable = [...free].filter((slot) => isSlotEditable(slot, nowMs));
  return { format: formatVersion, startDay, mask: encodeSlots(editable, startDay, writerMaxDays) };
}

/**
 * Apply edits (slot -> free?) to a base set, returning a new set. Edits to slots that have
 * started are ignored, so what the editor shows is what a save will keep.
 */
export function applyEdits(
  base: ReadonlySet<number>,
  edits: ReadonlyMap<number, boolean>,
  nowMs: number,
): Set<number> {
  const next = new Set(base);
  for (const [slot, free] of edits) {
    if (!isSlotEditable(slot, nowMs)) continue;
    if (free) next.add(slot);
    else next.delete(slot);
  }
  return next;
}
