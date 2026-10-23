import { AVAILABILITY_LIMITS } from './bandTypes';
import { DAY_MS, slotOf, slotStartMs } from './availabilitySlots';

/**
 * The Intl side of availability: turning absolute half-hour slots into a viewer's local days and
 * labels, and mapping wall-clock times back to instants. Every function takes an explicit IANA
 * `timeZone` (and optional `locale`) so behaviour is deterministic in tests; the page passes
 * `getViewerTimeZone()` and the browser locale. Slots are bucketed by formatting each slot's start
 * instant, never by adding 24 hours, so DST days simply have 46 or 50 slots.
 */

const { slotsPerDay, horizonDays } = AVAILABILITY_LIMITS;
const MINUTE_MS = 60 * 1000;
const DAYS_PER_WEEK = 7;
/** Whole weeks after today that fit the horizon (today's week-day is day 1 of `horizonDays`). */
const MAX_REPEAT_WEEKS = Math.floor((horizonDays - 1) / DAYS_PER_WEEK);
/** Longest DST shift of any zone (Troll Station's is 2 hours), in slots. */
const MAX_DST_SHIFT_SLOTS = 4;
/** The longest local day is 24 hours plus a DST shift. */
const MAX_SLOTS_PER_LOCAL_DAY = slotsPerDay + MAX_DST_SHIFT_SLOTS;
/** How far back a repeated wall-clock time can have been seen (a 4 hour shift is beyond any zone). */
const MAX_REPEAT_LOOKBACK_SLOTS = 8;
const SECOND_PASS_SUFFIX = ' (2nd)';

/** The device's IANA zone, or UTC when the platform can't tell us. */
export function getViewerTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return zone;
    }
  } catch {
    // fall through to UTC
  }
  return 'UTC';
}

// ── Formatter cache ────────────────────────────────────────────────────────

/** The options for each kind of formatter; the cache key is derived from the kind, never free-form. */
const FORMATS = {
  parts: { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  day: { weekday: 'short', month: 'short', day: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, locale: string | undefined, kind: keyof typeof FORMATS): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${timeZone}|${kind}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { timeZone, ...FORMATS[kind] });
    formatters.set(key, cached);
  }
  return cached;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Wall-clock fields of an instant in a zone (`h23`, so midnight is hour 0). */
export function localParts(ms: number, timeZone: string): LocalParts {
  const out: LocalParts = { year: NaN, month: NaN, day: NaN, hour: NaN, minute: NaN };
  for (const part of formatter(timeZone, 'en-US', 'parts').formatToParts(ms)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day' || part.type === 'hour' || part.type === 'minute') {
      out[part.type] = Number(part.value);
    }
  }
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of the local calendar date containing an instant. */
export function localDateKey(ms: number, timeZone: string): string {
  const { year, month, day } = localParts(ms, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Offset of a zone from UTC at an instant, in ms (positive east of UTC). */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const { year, month, day, hour, minute } = localParts(ms, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute) - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

const sameWallClock = (a: LocalParts, b: LocalParts): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;

/**
 * The instant at which the zone's wall clock reads `wanted`, or null when that time doesn't
 * exist (a spring-forward gap). For a repeated time (fall back) the first occurrence. The zone's
 * offset a day either side of the guess brackets any DST change near it, so one of the two
 * candidates is right whenever the time exists.
 */
export function wallClockToMs(wanted: LocalParts, timeZone: string): number | null {
  const guess = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute);
  const offsets = new Set([zoneOffsetMs(guess - DAY_MS, timeZone), zoneOffsetMs(guess + DAY_MS, timeZone)]);
  const matches = [...offsets]
    .map((offset) => guess - offset)
    .filter((candidate) => sameWallClock(localParts(candidate, timeZone), wanted));
  return matches.length ? Math.min(...matches) : null;
}

// ── Local days ─────────────────────────────────────────────────────────────

export interface LocalDay {
  /** `YYYY-MM-DD` in the viewer's zone. */
  key: string;
  /** Every slot that starts on this local date, in order (46 / 48 / 50 around DST changes). */
  slots: number[];
}

/** The first slot of the local date `key` that `slot` falls on. */
function firstSlotOfLocalDay(slot: number, key: string, timeZone: string): number {
  let first = slot;
  while (slot - first < MAX_SLOTS_PER_LOCAL_DAY && localDateKey(slotStartMs(first - 1), timeZone) === key) first--;
  return first;
}

/**
 * Today and the following local days up to the horizon, each with its actual slot list. Today
 * starts at its first slot even if that is already past (past slots show disabled). It makes about
 * 2,900 Intl calls, so a page should memoize it on today's date key and the zone, not on the clock.
 */
export function buildHorizonDays(nowMs: number, timeZone: string, days: number = horizonDays): LocalDay[] {
  let slot = firstSlotOfLocalDay(slotOf(nowMs), localDateKey(nowMs, timeZone), timeZone);
  const result: LocalDay[] = [];
  let current: LocalDay | null = null;
  for (;;) {
    const key = localDateKey(slotStartMs(slot), timeZone);
    if (!current || current.key !== key) {
      if (result.length >= days) break;
      current = { key, slots: [] };
      result.push(current);
    }
    current.slots.push(slot);
    slot++;
  }
  return result;
}

/**
 * The band practices between these local hours (8 AM to 10 PM) and nowhere else, so the calendar
 * shows, and can mark, only these. Slots outside them are never created by the UI.
 */
export const PRACTICE_START_HOUR = 8;
export const PRACTICE_END_HOUR = 22;

/** Whether a slot starts inside the practice hours (8:00 AM up to, not including, 10:00 PM). */
export const isPracticeHour = (slot: number, timeZone: string): boolean => {
  const { hour } = localParts(slotStartMs(slot), timeZone);
  return hour >= PRACTICE_START_HOUR && hour < PRACTICE_END_HOUR;
};

/**
 * The day's slots inside the practice hours, in order: 28 on an ordinary day. They are the rows of
 * that day's column, matched across days by position (the n-th slot of each), so a zone whose
 * half-hours fall on :15/:45 still lines up, and a daylight-saving day just shifts its labels.
 */
export const practiceSlots = (day: LocalDay, timeZone: string): number[] => {
  const cached = practiceCache.get(day);
  if (cached?.timeZone === timeZone) return cached.slots;
  const slots = day.slots.filter((slot) => isPracticeHour(slot, timeZone));
  practiceCache.set(day, { timeZone, slots });
  return slots;
};
// Each filter costs one Intl call per slot and is asked for on every render; a day object never changes.
const practiceCache = new WeakMap<LocalDay, { timeZone: string; slots: number[] }>();

// ── Labels ─────────────────────────────────────────────────────────────────

const plainTime = (slot: number, timeZone: string, locale?: string): string =>
  formatter(timeZone, locale, 'time').format(slotStartMs(slot));

/** Whether this slot is the second pass through a wall-clock time that a fall-back change repeats. */
function isSecondPass(slot: number, timeZone: string): boolean {
  const here = localParts(slotStartMs(slot), timeZone);
  for (let back = 1; back <= MAX_REPEAT_LOOKBACK_SLOTS; back++) {
    if (sameWallClock(localParts(slotStartMs(slot - back), timeZone), here)) return true;
  }
  return false;
}

/** "7:00 PM" in the viewer's zone; the repeated hour of a fall-back day reads "1:00 AM (2nd)". */
export function formatSlotTime(slot: number, timeZone: string, locale?: string): string {
  const label = plainTime(slot, timeZone, locale);
  return isSecondPass(slot, timeZone) ? `${label}${SECOND_PASS_SUFFIX}` : label;
}

/** One label per slot of a day, marking the second pass through a repeated hour. */
export function labelDaySlots(day: LocalDay, timeZone: string, locale?: string): string[] {
  const seen = new Set<string>();
  return day.slots.map((slot) => {
    const label = plainTime(slot, timeZone, locale);
    if (!seen.has(label)) {
      seen.add(label);
      return label;
    }
    return `${label}${SECOND_PASS_SUFFIX}`;
  });
}

/** "Fri, Nov 7" for the local date of a slot. */
export function formatDayLabel(slot: number, timeZone: string, locale?: string): string {
  return formatter(timeZone, locale, 'day').format(slotStartMs(slot));
}

/**
 * "Fri, Nov 7, 7:00 PM – 9:00 PM" (end exclusive); adds the end day when the window runs past
 * midnight. A window ending exactly at midnight stays on its day and reads "– 12:00 AM".
 */
export function formatWindow(startSlot: number, endSlot: number, timeZone: string, locale?: string): string {
  const startDay = `${formatDayLabel(startSlot, timeZone, locale)}, ${formatSlotTime(startSlot, timeZone, locale)}`;
  const sameDay = localDateKey(slotStartMs(startSlot), timeZone) === localDateKey(slotStartMs(endSlot - 1), timeZone);
  const end = formatSlotTime(endSlot, timeZone, locale);
  return `${startDay} – ${sameDay ? end : `${formatDayLabel(endSlot, timeZone, locale)}, ${end}`}`;
}

// ── Repeating a week's times ───────────────────────────────────────────────

/**
 * Copy free marks to the same weekday and wall-clock time for the next `weeks` weeks (at most as
 * many whole weeks as fit the horizon). Matching on wall-clock time (not +7*24h) keeps a 7 PM
 * rehearsal at 7 PM across a DST change; a time that doesn't exist on the target date is skipped.
 * `lastSlot` is the last slot the grid can show (the last slot of `buildHorizonDays`): later
 * targets are skipped, so nothing is stored that the person cannot see and unmark. Returns only
 * the new slots (never the sources).
 */
export function repeatWeekday(slots: Iterable<number>, weeks: number, timeZone: string, lastSlot: number): Set<number> {
  const added = new Set<number>();
  const sources = new Set(slots);
  const count = Number.isInteger(weeks) ? Math.min(weeks, MAX_REPEAT_WEEKS) : 0;
  for (const slot of sources) {
    const { year, month, day, hour, minute } = localParts(slotStartMs(slot), timeZone);
    for (let week = 1; week <= count; week++) {
      // Date.UTC rolls an overflowing day-of-month into the next month, which is what we want.
      const target = new Date(Date.UTC(year, month - 1, day + DAYS_PER_WEEK * week));
      const ms = wallClockToMs(
        { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate(), hour, minute },
        timeZone,
      );
      if (ms === null) continue;
      const repeated = slotOf(ms);
      if (repeated > lastSlot) break;
      if (!sources.has(repeated)) added.add(repeated);
    }
  }
  return added;
}
