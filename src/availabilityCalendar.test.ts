import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCalendarDays,
  buildHorizonDays,
  formatDayLabel,
  formatSlotTime,
  formatWindow,
  getViewerTimeZone,
  isPracticeHour,
  labelDaySlots,
  localDateKey,
  localParts,
  localWeekday,
  practiceSlots,
  repeatWeekday,
  wallClockToMs,
  zoneOffsetMs,
} from './availabilityCalendar';
import { horizonEndSlot, slotOf, slotStartMs, writerWindow } from './availabilitySlots';

// The zone cases below encode tzdata as shipped with Node/ICU; a tzdata change to one of these
// zones' rules would show up here first.
const NY = 'America/New_York';
const HOUR = 60 * 60 * 1000;
const en = 'en-US';
/** Newer ICU puts a narrow no-break space before AM/PM. */
const norm = (s: string): string => s.replace(/[\u202f\u00a0]/g, ' ');
const utc = (y: number, m: number, d: number, h = 0, min = 0): number => Date.UTC(y, m - 1, d, h, min);
const byNumber = (a: number, b: number): number => a - b;
/** No grid limit: for tests that are not about the horizon. */
const FAR_SLOT = Number.MAX_SAFE_INTEGER;

describe('getViewerTimeZone', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Make the next `new Intl.DateTimeFormat()` report `resolved` as the device options. */
  function reportZone(resolved: Partial<Intl.ResolvedDateTimeFormatOptions>): void {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementationOnce(function () {
      return { resolvedOptions: () => resolved } as unknown as Intl.DateTimeFormat;
    });
  }

  it('returns a usable IANA zone', () => {
    const zone = getViewerTimeZone();
    expect(zone.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow();
  });

  it('returns the zone the device reports when it is valid', () => {
    reportZone({ timeZone: 'Asia/Tokyo' });
    expect(getViewerTimeZone()).toBe('Asia/Tokyo');
  });

  it('falls back to UTC when the platform reports an empty or missing zone', () => {
    reportZone({ timeZone: '' });
    expect(getViewerTimeZone()).toBe('UTC');
    reportZone({});
    expect(getViewerTimeZone()).toBe('UTC');
  });

  it('falls back to UTC when the reported zone is not one Intl can use', () => {
    reportZone({ timeZone: 'Not/A_Zone' });
    expect(getViewerTimeZone()).toBe('UTC');
  });

  it('falls back to UTC when Intl itself throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementationOnce(function () {
      throw new Error('no Intl here');
    });
    expect(getViewerTimeZone()).toBe('UTC');
  });
});

describe('zone maths', () => {
  it('reads wall-clock fields in a zone', () => {
    expect(localParts(utc(2026, 11, 3, 12, 10), NY)).toEqual({ year: 2026, month: 11, day: 3, hour: 7, minute: 10 });
    // Midnight is hour 0, never 24.
    expect(localParts(utc(2026, 11, 3, 5, 0), NY).hour).toBe(0);
  });

  it('knows each zone offset, including DST and 45-minute zones', () => {
    expect(zoneOffsetMs(utc(2026, 1, 15), NY)).toBe(-5 * HOUR);
    expect(zoneOffsetMs(utc(2026, 7, 15), NY)).toBe(-4 * HOUR);
    expect(zoneOffsetMs(utc(2026, 7, 15), 'Asia/Kolkata')).toBe(5.5 * HOUR);
    expect(zoneOffsetMs(utc(2026, 7, 15), 'Asia/Kathmandu')).toBe(5.75 * HOUR);
    expect(zoneOffsetMs(utc(2026, 7, 15), 'Pacific/Kiritimati')).toBe(14 * HOUR);
  });

  it('has no offset in UTC and half-hour offsets in zones like Newfoundland', () => {
    expect(zoneOffsetMs(utc(2026, 7, 15, 12, 34), 'UTC')).toBe(0);
    expect(zoneOffsetMs(utc(2026, 7, 15), 'America/St_Johns')).toBe(-2.5 * HOUR);
    expect(zoneOffsetMs(utc(2026, 1, 15), 'America/St_Johns')).toBe(-3.5 * HOUR);
  });

  it('ignores seconds when reading the offset', () => {
    expect(zoneOffsetMs(utc(2026, 7, 15, 12, 34) + 45_999, NY)).toBe(-4 * HOUR);
  });

  it('throws for a zone Intl does not know, rather than guessing', () => {
    expect(() => localParts(utc(2026, 7, 15), 'Not/A_Zone')).toThrow(RangeError);
  });

  it('zero-pads the month and day of a local date key, across a year boundary', () => {
    expect(localDateKey(utc(2026, 1, 5, 12), 'UTC')).toBe('2026-01-05');
    expect(localDateKey(utc(2027, 1, 1, 3), NY)).toBe('2026-12-31');
  });

  it('keys a local date by where the instant falls in the zone', () => {
    expect(localDateKey(utc(2026, 11, 3, 3, 0), NY)).toBe('2026-11-02');
    expect(localDateKey(utc(2026, 11, 3, 5, 0), NY)).toBe('2026-11-03');
  });

  it('maps a wall-clock time back to an instant', () => {
    expect(wallClockToMs({ year: 2026, month: 11, day: 3, hour: 19, minute: 0 }, NY)).toBe(utc(2026, 11, 4, 0, 0));
    expect(wallClockToMs({ year: 2026, month: 7, day: 3, hour: 19, minute: 0 }, NY)).toBe(utc(2026, 7, 3, 23, 0));
  });

  it('returns null for a time that does not exist (spring forward)', () => {
    expect(wallClockToMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY)).toBeNull();
    // The gap is [2:00, 3:00): both edges behave.
    expect(wallClockToMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 0 }, NY)).toBeNull();
    expect(wallClockToMs({ year: 2026, month: 3, day: 8, hour: 3, minute: 0 }, NY)).toBe(utc(2026, 3, 8, 7, 0));
    expect(wallClockToMs({ year: 2026, month: 3, day: 8, hour: 1, minute: 30 }, NY)).toBe(utc(2026, 3, 8, 6, 30));
  });

  it('knows the gap of a half-hour DST change (Lord Howe)', () => {
    const lh = 'Australia/Lord_Howe';
    expect(wallClockToMs({ year: 2026, month: 10, day: 4, hour: 2, minute: 15 }, lh)).toBeNull();
    expect(wallClockToMs({ year: 2026, month: 10, day: 4, hour: 2, minute: 30 }, lh)).not.toBeNull();
  });

  it('maps wall-clock times in fixed-offset and UTC zones', () => {
    expect(wallClockToMs({ year: 2026, month: 7, day: 3, hour: 19, minute: 0 }, 'UTC')).toBe(utc(2026, 7, 3, 19, 0));
    expect(wallClockToMs({ year: 2026, month: 7, day: 3, hour: 19, minute: 0 }, 'Asia/Kolkata')).toBe(utc(2026, 7, 3, 13, 30));
  });

  it('round-trips an instant through its own wall-clock fields', () => {
    for (const ms of [utc(2026, 1, 15, 3, 30), utc(2026, 7, 15, 23, 0), utc(2026, 11, 4, 0, 0)]) {
      expect(wallClockToMs(localParts(ms, NY), NY)).toBe(ms);
    }
  });

  it('takes the first occurrence of a repeated time (fall back)', () => {
    expect(wallClockToMs({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY)).toBe(utc(2026, 11, 1, 5, 30));
  });
});

describe('buildHorizonDays', () => {
  const now = utc(2026, 10, 30, 16, 0);

  it('returns the requested number of local days, today first', () => {
    const days = buildHorizonDays(now, NY);
    expect(days).toHaveLength(60);
    expect(days[0].key).toBe('2026-10-30');
    expect(days[1].key).toBe('2026-10-31');
  });

  it('starts today at its first slot even though earlier slots are past', () => {
    const [today] = buildHorizonDays(now, NY);
    expect(today.slots[0]).toBeLessThan(slotOf(now));
    expect(localDateKey(slotStartMs(today.slots[0]), NY)).toBe('2026-10-30');
    expect(localDateKey(slotStartMs(today.slots[0] - 1), NY)).toBe('2026-10-29');
    expect(today.slots).toHaveLength(48);
  });

  it('lays days out back to back with no gaps or overlaps', () => {
    const all = buildHorizonDays(now, NY).flatMap((d) => d.slots);
    for (let i = 1; i < all.length; i++) expect(all[i]).toBe(all[i - 1] + 1);
  });

  it('gives a fall-back day 50 slots and a spring-forward day 46', () => {
    expect(buildHorizonDays(now, NY).find((d) => d.key === '2026-11-01')?.slots).toHaveLength(50);
    expect(buildHorizonDays(utc(2026, 3, 5, 16), NY).find((d) => d.key === '2026-03-08')?.slots).toHaveLength(46);
  });

  it('builds the grid when "now" is itself inside the repeated fall-back hour', () => {
    for (const ms of [utc(2026, 11, 1, 5, 40), utc(2026, 11, 1, 6, 40)]) {
      const days = buildHorizonDays(ms, NY);
      expect(days[0].key).toBe('2026-11-01');
      expect(days[0].slots).toHaveLength(50);
      expect(days[0].slots).toContain(slotOf(ms));
    }
  });

  it('handles a DST change of only 30 minutes (Lord Howe)', () => {
    const day = buildHorizonDays(utc(2026, 4, 1, 12), 'Australia/Lord_Howe').find((d) => d.key === '2026-04-05');
    expect(day?.slots).toHaveLength(49);
  });

  it('handles a zone whose DST gap swallows midnight (Havana)', () => {
    const day = buildHorizonDays(utc(2026, 3, 5, 12), 'America/Havana').find((d) => d.key === '2026-03-08');
    expect(day?.slots).toHaveLength(46);
    expect(labelDaySlots(day!, 'America/Havana', en).map(norm)[0]).toBe('1:00 AM');
  });

  it('keeps whole days in 45-minute and extreme-offset zones', () => {
    for (const zone of ['Asia/Kathmandu', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
      const days = buildHorizonDays(now, zone);
      expect(days).toHaveLength(60);
      expect(days.every((d) => d.slots.length === 48)).toBe(true);
      expect(days[0].slots).toContain(slotOf(now));
    }
  });

  it('honours a custom day count', () => {
    expect(buildHorizonDays(now, NY, 7)).toHaveLength(7);
    expect(buildHorizonDays(now, NY, 1)).toHaveLength(1);
  });

  it('returns no days for a day count of zero', () => {
    expect(buildHorizonDays(now, NY, 0)).toEqual([]);
  });

  it('starts a UTC viewer at midnight and rolls over the year with zero-padded keys', () => {
    const days = buildHorizonDays(utc(2026, 12, 30, 12), 'UTC', 4);
    expect(days.map((d) => d.key)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(slotStartMs(days[0].slots[0])).toBe(utc(2026, 12, 30));
    expect(days[0].slots).toHaveLength(48);
  });

  // The UI shows these days; the resolver clips to `horizonEndSlot` and a save writes `writerWindow`.
  // If either were too short, marks on a visible day would silently vanish.
  it('never shows a slot the resolver or a save would drop', () => {
    const zones = [NY, 'UTC', 'Pacific/Kiritimati', 'Etc/GMT+12', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'America/Havana'];
    const times = [utc(2026, 3, 7, 23, 59), utc(2026, 10, 31, 23, 30), utc(2026, 11, 3, 0, 0), utc(2026, 11, 3, 23, 59)];
    for (const zone of zones) {
      for (const now of times) {
        const last = buildHorizonDays(now, zone).at(-1)!.slots.at(-1)!;
        expect(last, `${zone} @ ${new Date(now).toISOString()}`).toBeLessThan(horizonEndSlot(now));
        expect(last, `${zone} @ ${new Date(now).toISOString()}`).toBeLessThan(writerWindow(now).endSlot);
      }
    }
  });
});

describe('labels', () => {
  it('does not mark a time on a fall-back day that occurs only once', () => {
    expect(norm(formatSlotTime(slotOf(utc(2026, 11, 1, 17, 0)), NY, en))).toBe('12:00 PM');
    expect(norm(formatSlotTime(slotOf(utc(2026, 11, 1, 4, 30)), NY, en))).toBe('12:30 AM');
  });

  it('labels a spring-forward day without the skipped hour and every normal day once', () => {
    const spring = buildHorizonDays(utc(2026, 3, 5, 16), NY).find((d) => d.key === '2026-03-08')!;
    const springLabels = labelDaySlots(spring, NY, en).map(norm);
    expect(springLabels).toHaveLength(46);
    expect(springLabels).not.toContain('2:00 AM');
    expect(springLabels).not.toContain('2:30 AM');
    expect(springLabels.some((l) => l.endsWith('(2nd)'))).toBe(false);

    const normal = buildHorizonDays(utc(2026, 10, 30, 16), NY)[0];
    const labels = labelDaySlots(normal, NY, en).map(norm);
    expect(labels).toHaveLength(48);
    expect(labels[0]).toBe('12:00 AM');
    expect(labels[47]).toBe('11:30 PM');
    expect(new Set(labels).size).toBe(48);
  });

  it('formats in the requested locale, and caches per locale', () => {
    const slot = slotOf(utc(2026, 11, 4, 0, 0)); // 7 PM in New York
    expect(norm(formatSlotTime(slot, NY, 'en-US'))).toBe('7:00 PM');
    expect(formatSlotTime(slot, NY, 'de-DE')).toBe('19:00');
    expect(norm(formatSlotTime(slot, NY, 'en-US'))).toBe('7:00 PM');
    expect(formatDayLabel(slot, NY, 'de-DE')).not.toBe(formatDayLabel(slot, NY, 'en-US'));
  });

  it('formats a slot time in the zone', () => {
    expect(norm(formatSlotTime(slotOf(utc(2026, 11, 4, 0, 0)), NY, en))).toBe('7:00 PM');
    expect(norm(formatSlotTime(slotOf(utc(2026, 11, 4, 0, 0)), 'UTC', en))).toBe('12:00 AM');
  });

  it('shows 45-minute zones honestly (:15 / :45 labels)', () => {
    expect(norm(formatSlotTime(slotOf(utc(2026, 11, 4, 0, 0)), 'Asia/Kathmandu', en))).toBe('5:45 AM');
  });

  it('formats a day label', () => {
    expect(formatDayLabel(slotOf(utc(2026, 11, 7, 20, 0)), NY, en)).toBe('Sat, Nov 7');
  });

  it('marks the second pass through the repeated fall-back hour, in a grid and on its own', () => {
    const day = buildHorizonDays(utc(2026, 10, 30, 16), NY).find((d) => d.key === '2026-11-01')!;
    const labels = labelDaySlots(day, NY, en).map(norm);
    expect(labels).toHaveLength(50);
    expect(labels.filter((l) => l === '1:00 AM')).toHaveLength(1);
    expect(labels).toContain('1:00 AM (2nd)');
    expect(labels).toContain('1:30 AM (2nd)');
    expect(new Set(labels).size).toBe(labels.length);
    // The standalone formatter agrees with the grid for every slot of the day.
    expect(day.slots.map((slot) => norm(formatSlotTime(slot, NY, en)))).toEqual(labels);
  });

  it('formats a same-day window and one that crosses midnight', () => {
    const start = slotOf(utc(2026, 11, 7, 0, 0)); // Fri 7 PM in New York
    expect(norm(formatWindow(start, start + 4, NY, en))).toBe('Fri, Nov 6, 7:00 PM – 9:00 PM');
    expect(norm(formatWindow(start + 8, start + 12, NY, en))).toBe('Fri, Nov 6, 11:00 PM – Sat, Nov 7, 1:00 AM');
  });

  it('adds the end day when a window crosses into a new month', () => {
    const start = slotOf(utc(2026, 11, 1, 3, 0)); // Sat 31 Oct 11 PM EDT
    expect(norm(formatWindow(start, start + 4, NY, en))).toBe('Sat, Oct 31, 11:00 PM – Sun, Nov 1, 1:00 AM');
  });

  it('keeps a window that ends exactly at midnight on its own day', () => {
    const start = slotOf(utc(2026, 11, 7, 3, 0)); // Fri 10 PM in New York
    expect(norm(formatWindow(start, start + 4, NY, en))).toBe('Fri, Nov 6, 10:00 PM – 12:00 AM');
  });

  it('tells the two passes through the repeated hour apart in a window', () => {
    const first = slotOf(utc(2026, 11, 1, 5, 0)); // 1:00 AM EDT
    expect(norm(formatWindow(first, first + 2, NY, en))).toBe('Sun, Nov 1, 1:00 AM – 1:00 AM (2nd)');
    expect(norm(formatWindow(first + 2, first + 4, NY, en))).toBe('Sun, Nov 1, 1:00 AM (2nd) – 2:00 AM');
  });
});

describe('repeatWeekday', () => {
  it('repeats the same weekday and wall-clock time for each following week', () => {
    // Mon 2 Nov 7 PM EST.
    const source = slotOf(utc(2026, 11, 3, 0, 0));
    const repeated = [...repeatWeekday([source], 3, NY, FAR_SLOT)].map(slotStartMs).sort(byNumber);
    expect(repeated).toEqual([utc(2026, 11, 10, 0, 0), utc(2026, 11, 17, 0, 0), utc(2026, 11, 24, 0, 0)]);
  });

  it('keeps 7 PM at 7 PM across the fall-back change', () => {
    // Sat 31 Oct 7 PM EDT -> Sat 7 Nov 7 PM EST (a plain +7*24h would land on 6 PM).
    const source = slotOf(utc(2026, 10, 31, 23, 0));
    const [target] = [...repeatWeekday([source], 1, NY, FAR_SLOT)];
    expect(slotStartMs(target)).toBe(utc(2026, 11, 8, 0, 0));
    expect(slotStartMs(target) - slotStartMs(source)).toBe(7 * 24 * HOUR + HOUR);
  });

  it('skips a target time that does not exist (spring-forward gap)', () => {
    // Sun 1 Mar 2:30 AM EST; 8 Mar 2:30 AM does not exist; 15 Mar does.
    const source = slotOf(utc(2026, 3, 1, 7, 30));
    const repeated = [...repeatWeekday([source], 2, NY, FAR_SLOT)];
    expect(repeated).toHaveLength(1);
    expect(slotStartMs(repeated[0])).toBe(utc(2026, 3, 15, 6, 30));
  });

  it('uses the first occurrence of a repeated fall-back time', () => {
    // Sun 25 Oct 1:30 AM EDT -> Sun 1 Nov 1:30 AM, first pass (EDT).
    const source = slotOf(utc(2026, 10, 25, 5, 30));
    const [target] = [...repeatWeekday([source], 1, NY, FAR_SLOT)];
    expect(slotStartMs(target)).toBe(utc(2026, 11, 1, 5, 30));
  });

  it('rolls into the next month and year correctly', () => {
    const source = slotOf(utc(2026, 12, 29, 17, 0)); // Tue 29 Dec noon EST
    const [target] = [...repeatWeekday([source], 1, NY, FAR_SLOT)];
    expect(localDateKey(slotStartMs(target), NY)).toBe('2027-01-05');
  });

  it('never returns the source slots, even when sources are a week apart', () => {
    const a = slotOf(utc(2026, 11, 3, 0, 0));
    const b = slotOf(utc(2026, 11, 10, 0, 0));
    const repeated = repeatWeekday([a, b], 1, NY, FAR_SLOT);
    expect(repeated.has(a)).toBe(false);
    expect(repeated.has(b)).toBe(false);
    expect(repeated.size).toBe(1);
  });

  it('repeats in UTC and fixed-offset zones with no DST adjustment', () => {
    const source = slotOf(utc(2026, 11, 3, 12, 0));
    const repeated = [...repeatWeekday([source], 2, 'UTC', FAR_SLOT)].map(slotStartMs).sort(byNumber);
    expect(repeated).toEqual([utc(2026, 11, 10, 12), utc(2026, 11, 17, 12)]);
    const india = [...repeatWeekday([slotOf(utc(2026, 7, 3, 13, 30))], 1, 'Asia/Kolkata', FAR_SLOT)];
    expect(india.map(slotStartMs)).toEqual([utc(2026, 7, 10, 13, 30)]);
  });

  it('repeats the second pass through the fall-back hour as an ordinary 1:30 AM', () => {
    // Sun 1 Nov 1:30 AM EST (the second 1:30) -> Sun 8 Nov 1:30 AM EST.
    const secondPass = slotOf(utc(2026, 11, 1, 6, 30));
    const [target] = [...repeatWeekday([secondPass], 1, NY, FAR_SLOT)];
    expect(slotStartMs(target)).toBe(utc(2026, 11, 8, 6, 30));
  });

  it('handles leap days and month ends when rolling the date forward', () => {
    const leap = [...repeatWeekday([slotOf(utc(2028, 2, 22, 12))], 1, 'UTC', FAR_SLOT)];
    expect(localDateKey(slotStartMs(leap[0]), 'UTC')).toBe('2028-02-29');
    const monthEnd = [...repeatWeekday([slotOf(utc(2026, 1, 30, 12))], 2, 'UTC', FAR_SLOT)].map((s) => localDateKey(slotStartMs(s), 'UTC'));
    expect(monthEnd.sort()).toEqual(['2026-02-06', '2026-02-13']);
  });

  it('keeps each source at its own time of day', () => {
    const morning = slotOf(utc(2026, 11, 3, 15, 0)); // 10 AM EST
    const night = slotOf(utc(2026, 11, 4, 1, 30)); // 8:30 PM EST
    const local = [...repeatWeekday([morning, night], 1, NY, FAR_SLOT)].map((s) => norm(formatSlotTime(s, NY, en))).sort();
    expect(local).toEqual(['10:00 AM', '8:30 PM']);
  });

  it('returns nothing for no sources and accepts any iterable, ignoring duplicates', () => {
    expect(repeatWeekday([], 3, NY, FAR_SLOT).size).toBe(0);
    const source = slotOf(utc(2026, 11, 3, 12, 0));
    function* twice(): Generator<number> {
      yield source;
      yield source;
    }
    expect(repeatWeekday(twice(), 2, 'UTC', FAR_SLOT).size).toBe(2);
    expect(repeatWeekday(new Set([source]), 2, 'UTC', FAR_SLOT).size).toBe(2);
  });

  it('chains sources a week apart without re-adding either, across several weeks', () => {
    const a = slotOf(utc(2026, 11, 3, 12, 0));
    const b = slotOf(utc(2026, 11, 10, 12, 0));
    const repeated = [...repeatWeekday([a, b], 2, 'UTC', FAR_SLOT)].map(slotStartMs).sort(byNumber);
    // a -> Nov 10 (a source: skipped), Nov 17; b -> Nov 17 (duplicate), Nov 24.
    expect(repeated).toEqual([utc(2026, 11, 17, 12), utc(2026, 11, 24, 12)]);
  });

  it('allows exactly as many whole weeks as fit the horizon', () => {
    const source = slotOf(utc(2026, 11, 3, 12, 0));
    const maxWeeks = Math.floor((60 - 1) / 7);
    expect(repeatWeekday([source], maxWeeks - 1, 'UTC', FAR_SLOT).size).toBe(maxWeeks - 1);
    expect(repeatWeekday([source], maxWeeks, 'UTC', FAR_SLOT).size).toBe(maxWeeks);
    expect(repeatWeekday([source], maxWeeks + 1, 'UTC', FAR_SLOT).size).toBe(maxWeeks);
    expect(repeatWeekday([source], Infinity, 'UTC', FAR_SLOT).size).toBe(0);
  });

  it('returns nothing for zero, negative or fractional weeks, and caps a huge count at the horizon', () => {
    const source = slotOf(utc(2026, 11, 3));
    for (const weeks of [0, -2, 1.5, NaN]) expect(repeatWeekday([source], weeks, NY, FAR_SLOT).size).toBe(0);
    expect(repeatWeekday([source], 10_000, NY, FAR_SLOT).size).toBe(Math.floor((60 - 1) / 7));
  });

  // Marks past the last day the grid shows would be stored and counted but could never be seen or unmarked.
  it('never stores a mark the grid cannot show', () => {
    const now = utc(2026, 11, 3, 12, 10);
    for (const zone of [NY, 'UTC', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
      const days = buildHorizonDays(now, zone);
      const lastSlot = days.at(-1)!.slots.at(-1)!;
      // Every slot of the fifth local day, repeated as far as allowed.
      const repeated = repeatWeekday(days[4].slots, 20, zone, lastSlot);
      expect(repeated.size).toBeGreaterThan(0);
      expect(Math.max(...repeated), zone).toBeLessThanOrEqual(lastSlot);
      expect(Math.max(...repeated), zone).toBeLessThan(horizonEndSlot(now));
    }
  });

  it('skips targets past the given last slot, keeping the earlier weeks', () => {
    const source = slotOf(utc(2026, 11, 3, 12, 0));
    const second = slotOf(utc(2026, 11, 17, 12, 0));
    const repeated = repeatWeekday([source], 5, 'UTC', second);
    expect([...repeated].sort(byNumber)).toEqual([slotOf(utc(2026, 11, 10, 12, 0)), second]);
  });
});

describe('isPracticeHour', () => {
  it('is true from 8 AM to just before 10 PM local time', () => {
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 7, 30)), 'UTC')).toBe(false);
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 8, 0)), 'UTC')).toBe(true);
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 21, 30)), 'UTC')).toBe(true);
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 22, 0)), 'UTC')).toBe(false);
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 23, 30)), 'UTC')).toBe(false);
  });

  it('judges by the viewer’s local hour, not UTC', () => {
    // 12:00 UTC is 7 AM in New York (before practice) but 5:30 PM in Kolkata.
    const noon = slotOf(utc(2026, 11, 3, 12, 0));
    expect(isPracticeHour(noon, NY)).toBe(false);
    expect(isPracticeHour(noon, 'Asia/Kolkata')).toBe(true);
  });
});

describe('practiceSlots', () => {
  it('keeps the 28 half hours from 8 AM to 10 PM of a day', () => {
    const [day] = buildHorizonDays(utc(2026, 11, 3, 12), 'UTC');
    const slots = practiceSlots(day, 'UTC');
    expect(slots).toHaveLength(28);
    expect(slots[0]).toBe(slotOf(utc(2026, 11, 3, 8)));
    expect(slots[27]).toBe(slotOf(utc(2026, 11, 3, 21, 30)));
  });

  it('is 28 slots on a daylight-saving change day too (the change happens overnight)', () => {
    const fall = buildHorizonDays(utc(2026, 10, 30, 16), NY).find((d) => d.key === '2026-11-01')!;
    expect(fall.slots).toHaveLength(50);
    expect(practiceSlots(fall, NY)).toHaveLength(28);
    const spring = buildHorizonDays(utc(2027, 3, 12, 16), NY).find((d) => d.key === '2027-03-14')!;
    expect(spring.slots).toHaveLength(46);
    expect(practiceSlots(spring, NY)).toHaveLength(28);
  });

  it('starts at :15 in a zone with a :45 offset', () => {
    const [day] = buildHorizonDays(utc(2026, 11, 3, 12), 'Asia/Kathmandu');
    const slots = practiceSlots(day, 'Asia/Kathmandu');
    expect(slots).toHaveLength(28);
    expect(norm(formatSlotTime(slots[0], 'Asia/Kathmandu', en))).toBe('8:15 AM');
  });

  it('is empty for a day that has no practice hours in range', () => {
    expect(practiceSlots({ key: 'x', slots: [] }, 'UTC')).toEqual([]);
  });
});

describe('isPracticeHour and practiceSlots: gaps', () => {
  it('judges a :15/:45 zone by the hour each half hour starts in', () => {
    const KTM = 'Asia/Kathmandu'; // UTC+5:45, so slots start at :15 and :45
    // 02:00 UTC is 7:45 AM there (hour 7, before practice); 02:30 UTC is 8:15 AM.
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 2, 0)), KTM)).toBe(false);
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 2, 30)), KTM)).toBe(true);
    // 16:00 UTC is 9:45 PM there (the last practice slot); 16:30 UTC is 10:15 PM.
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 16, 0)), KTM)).toBe(true);
    expect(isPracticeHour(slotOf(utc(2026, 11, 3, 16, 30)), KTM)).toBe(false);
  });

  it('excludes the small hours, midnight included', () => {
    for (const h of [0, 1, 4, 7]) expect(isPracticeHour(slotOf(utc(2026, 11, 3, h, 0)), 'UTC')).toBe(false);
  });

  it('keeps the slots of a day in order and only from that day', () => {
    const [day] = buildHorizonDays(utc(2026, 11, 3, 12), 'UTC');
    const slots = practiceSlots(day, 'UTC');
    expect(slots).toEqual([...slots].sort(byNumber));
    expect(slots.every((slot) => day.slots.includes(slot))).toBe(true);
    expect(slots.every((slot, i) => i === 0 || slot === slots[i - 1] + 1)).toBe(true); // one unbroken run
  });

  it('uses the zone’s own local day, so the same instants fall in different practice rows elsewhere', () => {
    const [utcDay] = buildHorizonDays(utc(2026, 11, 3, 12), 'UTC');
    const [kolkataDay] = buildHorizonDays(utc(2026, 11, 3, 12), 'Asia/Kolkata');
    const inKolkata = practiceSlots(kolkataDay, 'Asia/Kolkata');
    expect(inKolkata).toHaveLength(28);
    expect(inKolkata[0]).toBe(slotOf(utc(2026, 11, 3, 2, 30))); // 8:00 AM IST
    expect(inKolkata[0]).not.toBe(practiceSlots(utcDay, 'UTC')[0]);
  });
});

describe('localWeekday', () => {
  it('numbers Sunday 0 through Saturday 6', () => {
    // 2026-11-01 is a Sunday.
    for (let d = 0; d < 7; d++) expect(localWeekday(utc(2026, 11, 1 + d, 12), 'UTC')).toBe(d);
  });

  it('uses the local date, not the UTC date', () => {
    const lateSaturdayNy = utc(2026, 11, 8, 3, 30); // Sunday Nov 8 UTC, still Saturday Nov 7 in New York
    expect(localWeekday(lateSaturdayNy, 'UTC')).toBe(0);
    expect(localWeekday(lateSaturdayNy, NY)).toBe(6);
    const earlyMondayTokyo = utc(2026, 11, 8, 16, 0); // Sunday UTC, already Monday in Tokyo
    expect(localWeekday(earlyMondayTokyo, 'Asia/Tokyo')).toBe(1);
  });
});

describe('buildCalendarDays', () => {
  /** 2026-11-01 (Sunday) to 2026-11-07 (Saturday), at midday. */
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, now: utc(2026, 11, 1 + d, 17, 0) }));

  it.each(weekdays)('starts on a Sunday when now is weekday $weekday', ({ weekday, now }) => {
    const days = buildCalendarDays(now, NY);
    expect(localWeekday(slotStartMs(days[0].slots[0]), NY)).toBe(0);
    expect(days[0].key).toBe(`2026-11-01`);
    expect(days[weekday].key).toBe(localDateKey(now, NY));
  });

  it.each(weekdays)('puts today at index $weekday and spans the horizon plus the days before it', ({ weekday, now }) => {
    const days = buildCalendarDays(now, NY);
    expect(days).toHaveLength(60 + weekday);
    expect(days[weekday].key).toBe(localDateKey(now, NY));
    expect(days[days.length - 1].key).toBe(buildHorizonDays(now, NY).at(-1)!.key);
  });

  it('is exactly the horizon when today is a Sunday', () => {
    const now = utc(2026, 11, 1, 17);
    expect(buildCalendarDays(now, NY).map((d) => d.key)).toEqual(buildHorizonDays(now, NY).map((d) => d.key));
  });

  it('honours a custom number of days', () => {
    const days = buildCalendarDays(utc(2026, 11, 4, 17), NY, 10); // Wednesday
    expect(days).toHaveLength(13);
    expect(days[3].key).toBe('2026-11-04');
  });

  it('lays slots out contiguously with no gaps or overlaps', () => {
    for (const { now } of weekdays) {
      const all = buildCalendarDays(now, NY).flatMap((d) => d.slots);
      for (let i = 1; i < all.length; i++) expect(all[i]).toBe(all[i - 1] + 1);
    }
  });

  it('keeps pages of 7 aligned Sunday to Saturday', () => {
    const days = buildCalendarDays(utc(2026, 11, 5, 17), NY);
    for (let i = 0; i < days.length; i += 7) expect(localWeekday(slotStartMs(days[i].slots[0]), NY)).toBe(0);
  });

  it('works across the fall-back week in America/New_York (Sunday Nov 1 has 50 slots)', () => {
    for (const now of [utc(2026, 11, 1, 17), utc(2026, 11, 3, 17), utc(2026, 11, 7, 17)]) {
      const days = buildCalendarDays(now, NY);
      expect(days[0].key).toBe('2026-11-01');
      expect(days[0].slots).toHaveLength(50);
    }
  });

  it('steps back over the fall-back day when now is the Monday after it', () => {
    const days = buildCalendarDays(utc(2026, 11, 2, 17), NY);
    expect(days.slice(0, 2).map((d) => d.key)).toEqual(['2026-11-01', '2026-11-02']);
    expect(days[0].slots).toHaveLength(50);
  });

  it('works across the spring-forward week (Sunday Mar 8 has 46 slots)', () => {
    for (const now of [utc(2026, 3, 8, 17), utc(2026, 3, 11, 17)]) {
      const days = buildCalendarDays(now, NY);
      expect(days[0].key).toBe('2026-03-08');
      expect(days[0].slots).toHaveLength(46);
    }
  });

  it('starts on the Sunday before when the week began before a spring-forward shift', () => {
    const days = buildCalendarDays(utc(2026, 3, 9, 17), NY); // Monday after the shift
    expect(days.slice(0, 2).map((d) => d.key)).toEqual(['2026-03-08', '2026-03-09']);
  });

  it('uses the local weekday when it differs from the UTC one', () => {
    const now = utc(2026, 11, 8, 3, 30); // Saturday evening in New York, Sunday in UTC
    expect(buildCalendarDays(now, NY)[6].key).toBe('2026-11-07');
    expect(buildCalendarDays(now, NY)[0].key).toBe('2026-11-01');
    expect(buildCalendarDays(now, 'UTC')[0].key).toBe('2026-11-08');
  });
});
