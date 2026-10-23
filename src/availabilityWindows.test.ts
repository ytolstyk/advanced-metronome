import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LIMITS, type AvailabilityRead, type AvailabilityRecord } from './bandTypes';
import { buildOverlap, resolveAvailability } from './availabilityUtils';
import { encodeSlots, horizonEndSlot, utcDayOf } from './availabilitySlots';
import { findBestWindows, type BestWindowsOptions } from './availabilityWindows';
import { BOB, CAT, DAN, NOW, NOW_DAY, NOW_SLOT, OWNER, band, everyone, ok, range, resolveMarks, row } from './availabilityTestHelpers';

const S = NOW_SLOT;

function windows(marks: Record<string, number[]>, options: BestWindowsOptions = {}, notResponded: string[] = []) {
  return findBestWindows(buildOverlap(resolveMarks(marks, notResponded)), options);
}

describe('findBestWindows', () => {
  it('finds the stretch two members share', () => {
    const { best } = windows({ [OWNER]: range(S + 1, S + 9), [BOB]: range(S + 5, S + 13) });
    expect(best).toEqual([{ startSlot: S + 5, endSlot: S + 9, subs: [OWNER, BOB], missing: [] }]);
  });

  it('prefers the larger group even when a smaller one is free longer', () => {
    const { best, alsoClose } = windows({
      [OWNER]: range(S + 1, S + 21),
      [BOB]: range(S + 1, S + 21),
      [CAT]: range(S + 1, S + 5),
    });
    expect(best).toMatchObject([{ startSlot: S + 1, endSlot: S + 5, subs: [OWNER, BOB, CAT] }]);
    expect(alsoClose).toMatchObject([{ startSlot: S + 1, endSlot: S + 21, subs: [OWNER, BOB] }]);
    expect(alsoClose[0].missing).toEqual([{ sub: CAT, reason: 'not-marked' }]);
  });

  it('does not repeat as "also close" a window a best window already covers', () => {
    // The two-way windows are all inside the three-way one.
    const { alsoClose } = windows({
      [OWNER]: range(S + 1, S + 9),
      [BOB]: range(S + 1, S + 9),
      [CAT]: range(S + 1, S + 9),
    });
    expect(alsoClose).toEqual([]);
  });

  it('has nothing "also close" when the best group is already the smallest', () => {
    const result = windows({ [OWNER]: range(S + 1, S + 9), [BOB]: range(S + 1, S + 9), [CAT]: range(S + 40, S + 48) });
    expect(result.best).toHaveLength(1);
    expect(result.alsoClose).toEqual([]);
  });

  it('only suggests windows of at least the minimum length', () => {
    const marks = { [OWNER]: range(S + 1, S + 4), [BOB]: range(S + 1, S + 4) };
    expect(windows(marks, { minSlots: 4 }).best).toEqual([]);
    expect(windows(marks, { minSlots: 3 }).best).toHaveLength(1);
  });

  it('defaults the minimum to two hours', () => {
    const marks = { [OWNER]: range(S + 1, S + 4), [BOB]: range(S + 1, S + 4) };
    expect(AVAILABILITY_LIMITS.defaultMinSlots).toBe(4);
    expect(windows(marks).best).toEqual([]);
  });

  it('is empty unless two members overlap', () => {
    expect(windows({ [OWNER]: range(S + 1, S + 9), [BOB]: range(S + 20, S + 28) })).toEqual({ best: [], alsoClose: [] });
    expect(windows({ [OWNER]: range(S + 1, S + 9) }).best).toEqual([]);
  });

  it('never suggests a window that has already started', () => {
    // The writer drops started slots, so hand-build rows that still mark the current slot.
    const withStarted = (sub: string) =>
      row(sub, [], { mask: encodeSlots(range(S, S + 9), utcDayOf(NOW), AVAILABILITY_LIMITS.writerMaxDays) });
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(withStarted(OWNER))], [BOB, ok(withStarted(BOB))]]);
    const overlap = buildOverlap(resolveAvailability(reads, everyone(OWNER, BOB), band(), NOW));
    expect(overlap.countAt(S)).toBe(0);
    const { best } = findBestWindows(overlap, { fromSlot: 0, minSlots: 2 });
    expect(best[0].startSlot).toBe(S + 1);
  });

  it('only counts a member for the stretch where they stay free', () => {
    // Bob is free for the first half, Cat for the second: no 3-way window, but two 2-way ones.
    const { best } = windows({
      [OWNER]: range(S + 1, S + 9),
      [BOB]: range(S + 1, S + 5),
      [CAT]: range(S + 5, S + 9),
    });
    expect(best.map((w) => w.subs)).toEqual([[OWNER, BOB], [OWNER, CAT]]);
  });

  it('ranks by size, then length, then start and honours the limit', () => {
    const free = [...range(S + 1, S + 5), ...range(S + 10, S + 16), ...range(S + 30, S + 34)];
    const { best } = windows({ [OWNER]: free, [BOB]: free }, { limit: 2 });
    expect(best.map((w) => [w.startSlot, w.endSlot])).toEqual([[S + 10, S + 16], [S + 1, S + 5]]);
  });

  it('restricts the search to the requested range', () => {
    const marks = { [OWNER]: range(S + 1, S + 60), [BOB]: range(S + 1, S + 60) };
    expect(windows(marks, { fromSlot: S + 10, toSlot: S + 20 }).best).toMatchObject([{ startSlot: S + 10, endSlot: S + 20 }]);
    expect(windows(marks, { fromSlot: S + 30, toSlot: S + 32 }).best).toEqual([]);
  });

  it('collapses a fully open calendar to a single window', () => {
    const open = range(S + 1, S + 61 * 48);
    const marks: Record<string, number[]> = {};
    for (let i = 0; i < AVAILABILITY_LIMITS.maxParticipants; i++) marks[`sub-m${i}`] = open;
    const { best, alsoClose } = windows(marks);
    expect(best).toHaveLength(1);
    expect(best[0].subs).toHaveLength(AVAILABILITY_LIMITS.maxParticipants);
    expect(alsoClose).toEqual([]);
  });
});

describe('findBestWindows against a brute-force reference', () => {
  /** Small seeded PRNG so a failure is reproducible. */
  function rng(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /** Every maximal run (cannot be extended either way) where the largest possible group stays free. */
  function reference(schedules: Record<string, Set<number>>, from: number, to: number, minSlots: number): string[] {
    const subs = Object.keys(schedules);
    const freeAt = (slot: number) => subs.filter((sub) => schedules[sub].has(slot));
    const together = (s: number, e: number) => {
      let group = freeAt(s);
      for (let slot = s + 1; slot < e; slot++) group = group.filter((sub) => schedules[sub].has(slot));
      return group;
    };
    let best = 0;
    for (let s = from; s < to; s++) {
      for (let e = s + minSlots; e <= to; e++) best = Math.max(best, together(s, e).length);
    }
    if (best < 2) return [];
    const found: string[] = [];
    for (let s = from; s < to; s++) {
      for (let e = s + minSlots; e <= to; e++) {
        const group = together(s, e);
        if (group.length !== best) continue;
        const growsLeft = s > from && together(s - 1, e).length === best;
        const growsRight = e < to && together(s, e + 1).length === best;
        if (!growsLeft && !growsRight) found.push(`${s}-${e}:${group.join(',')}`);
      }
    }
    return found.sort();
  }

  it('returns the same windows as the reference on random schedules', () => {
    const minSlots = 3;
    for (let seed = 1; seed <= 60; seed++) {
      const next = rng(seed);
      const density = 0.45 + next() * 0.5;
      const names = ['sub-a', 'sub-b', 'sub-c', 'sub-d', 'sub-e'].slice(0, 2 + Math.floor(next() * 4));
      const schedules: Record<string, Set<number>> = {};
      for (const name of names) {
        schedules[name] = new Set(range(S + 1, S + 41).filter(() => next() < density));
      }
      const marks = Object.fromEntries(names.map((name) => [name, [...schedules[name]]]));
      const overlap = buildOverlap(resolveMarks(marks));
      const { best } = findBestWindows(overlap, { minSlots, limit: 1000 });
      const actual = best.map((w) => `${w.startSlot}-${w.endSlot}:${w.subs.join(',')}`).sort();
      expect(actual, `seed ${seed}`).toEqual(reference(schedules, S + 1, S + 41, minSlots));
    }
  });
});

describe('who is missing from a window', () => {
  it('says why each other participant is not free', () => {
    const marks = { [OWNER]: range(S + 1, S + 9), [BOB]: range(S + 1, S + 9), [CAT]: [S + 20] };
    const reads = new Map<string, AvailabilityRead>();
    for (const [sub, free] of Object.entries(marks)) reads.set(sub, ok(row(sub, free)));
    reads.set(DAN, ok(null));
    reads.set('sub-eve', { status: 'failed' });
    reads.set('sub-fay', ok(row('sub-fay', [], { startDay: utcDayOf(NOW) - 100 })));
    const subs = [OWNER, BOB, CAT, DAN, 'sub-eve', 'sub-fay'];
    const overlap = buildOverlap(resolveAvailability(reads, everyone(...subs), band(), NOW));
    const { best } = findBestWindows(overlap);
    expect(best[0].missing).toEqual([
      { sub: CAT, reason: 'not-marked' },
      { sub: DAN, reason: 'not-responded' },
      { sub: 'sub-eve', reason: 'unreadable' },
      { sub: 'sub-fay', reason: 'not-responded' },
    ]);
  });

  it('reports no-data for a member whose saved row does not reach the window', () => {
    // Bob saved long ago: his row (61 days back, 62 long) ends at the next UTC midnight, so he
    // says nothing about the stretch Owner and Cat share after it.
    const startDay = utcDayOf(NOW) - 61;
    const old = row(BOB, [], { startDay, mask: encodeSlots([S + 1], startDay, AVAILABILITY_LIMITS.writerMaxDays) });
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, range(S + 30, S + 40)))],
      [CAT, ok(row(CAT, range(S + 30, S + 40)))],
      [BOB, ok(old)],
    ]);
    const overlap = buildOverlap(resolveAvailability(reads, everyone(OWNER, BOB, CAT), band(), NOW));
    const { best } = findBestWindows(overlap);
    expect(best).toMatchObject([{ startSlot: S + 30, endSlot: S + 40, subs: [OWNER, CAT] }]);
    expect(best[0].missing).toEqual([{ sub: BOB, reason: 'no-data' }]);
  });
});

describe('findBestWindows options and edges', () => {
  it('finds single-slot windows when the minimum is one', () => {
    const { best } = windows({ [OWNER]: [S + 3], [BOB]: [S + 3] }, { minSlots: 1 });
    expect(best).toEqual([{ startSlot: S + 3, endSlot: S + 4, subs: [OWNER, BOB], missing: [] }]);
  });

  it('is empty when no one overlaps, however short the minimum', () => {
    expect(windows({ [OWNER]: [S + 3], [BOB]: [S + 4] }, { minSlots: 1 })).toEqual({ best: [], alsoClose: [] });
  });

  it('is empty when no one has a row', () => {
    const overlap = buildOverlap(resolveMarks({}, [OWNER, BOB]));
    expect(findBestWindows(overlap)).toEqual({ best: [], alsoClose: [] });
  });

  it('is empty when the minimum is longer than the range searched', () => {
    const marks = { [OWNER]: range(S + 1, S + 30), [BOB]: range(S + 1, S + 30) };
    expect(windows(marks, { fromSlot: S + 1, toSlot: S + 4, minSlots: 4 })).toEqual({ best: [], alsoClose: [] });
    expect(windows(marks, { fromSlot: S + 10, toSlot: S + 5 })).toEqual({ best: [], alsoClose: [] });
    expect(windows(marks, { minSlots: 10_000 })).toEqual({ best: [], alsoClose: [] });
  });

  it('never searches past the horizon, whatever end is asked for', () => {
    const open = range(S + 1, horizonEndSlot(NOW) + 100);
    const { best } = windows({ [OWNER]: open, [BOB]: open }, { toSlot: S + 100_000 });
    expect(best).toHaveLength(1);
    expect(best[0].endSlot).toBe(horizonEndSlot(NOW));
  });

  it('never starts a search before the first slot that can still be booked', () => {
    const marks = { [OWNER]: range(S + 1, S + 9), [BOB]: range(S + 1, S + 9) };
    expect(windows(marks, { fromSlot: -50 }).best[0].startSlot).toBe(S + 1);
  });

  it('defaults to three windows and applies the limit to each tier', () => {
    const stretches = [1, 10, 20, 30, 40].flatMap((offset) => range(S + offset, S + offset + 4));
    const marks = { [OWNER]: range(S + 1, S + 50), [BOB]: range(S + 1, S + 50), [CAT]: stretches };
    const unlimited = windows(marks, { limit: 100 });
    expect(unlimited.best).toHaveLength(5);
    expect(windows(marks).best).toHaveLength(3);
    expect(windows(marks, { limit: 2 }).best).toHaveLength(2);
    expect(windows(marks, { limit: 1 }).best).toHaveLength(1);
    expect(windows(marks, { limit: 0 })).toEqual({ best: [], alsoClose: [] });
  });

  it('orders equally good windows by when they start', () => {
    const free = [...range(S + 20, S + 24), ...range(S + 1, S + 5), ...range(S + 40, S + 44)];
    const { best } = windows({ [OWNER]: free, [BOB]: free });
    expect(best.map((w) => w.startSlot)).toEqual([S + 1, S + 20, S + 40]);
  });

  it('ranks a longer window of the same size first', () => {
    const { best } = windows({
      [OWNER]: [...range(S + 1, S + 5), ...range(S + 20, S + 30)],
      [BOB]: [...range(S + 1, S + 5), ...range(S + 20, S + 30)],
    });
    expect(best.map((w) => w.endSlot - w.startSlot)).toEqual([10, 4]);
  });

  it('lists a different group\'s windows separately when they are the same size', () => {
    const { best } = windows({
      [OWNER]: range(S + 1, S + 9),
      [BOB]: range(S + 1, S + 5),
      [CAT]: range(S + 5, S + 9),
      [DAN]: range(S + 1, S + 9),
    });
    expect(best.map((w) => w.subs)).toEqual([[OWNER, BOB, DAN], [OWNER, CAT, DAN]]);
  });

  it('counts the caller\'s unsaved marks', () => {
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(row(OWNER, range(S + 1, S + 9)))]]);
    const resolution = resolveAvailability(reads, everyone(OWNER, BOB), band(), NOW, { sub: BOB, free: new Set(range(S + 2, S + 8)) });
    expect(findBestWindows(buildOverlap(resolution)).best).toMatchObject([
      { startSlot: S + 2, endSlot: S + 8, subs: [OWNER, BOB], missing: [] },
    ]);
  });

  it('lists the "also close" tier\'s window with the one member it is missing', () => {
    const { best, alsoClose } = windows({
      [OWNER]: range(S + 1, S + 9),
      [BOB]: range(S + 1, S + 9),
      [CAT]: range(S + 5, S + 9),
    });
    expect(best).toMatchObject([{ startSlot: S + 5, endSlot: S + 9, subs: [OWNER, BOB, CAT] }]);
    expect(alsoClose).toMatchObject([{ startSlot: S + 1, endSlot: S + 9, subs: [OWNER, BOB], missing: [{ sub: CAT, reason: 'not-marked' }] }]);
  });
});

describe('missing reasons at the edge of a member\'s window', () => {
  /** Bob's row covers [(day - 61) * 48, (day + 1) * 48): it ends at the next UTC midnight. */
  const endsAt = (NOW_DAY + 1) * 48;
  const missingBob = (shared: number[], bobRow: AvailabilityRecord) => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, shared))],
      [CAT, ok(row(CAT, shared))],
      [BOB, ok(bobRow)],
    ]);
    const overlap = buildOverlap(resolveAvailability(reads, everyone(OWNER, BOB, CAT), band(), NOW));
    return findBestWindows(overlap).best[0].missing;
  };
  const oldRow = (): AvailabilityRecord => {
    const startDay = NOW_DAY - 61;
    return row(BOB, [], { startDay, mask: encodeSlots([], startDay, AVAILABILITY_LIMITS.writerMaxDays) });
  };

  it('says "not marked" when the window ends exactly where the row does', () => {
    expect(endsAt).toBe(S + 24);
    expect(missingBob(range(S + 1, endsAt), oldRow())).toEqual([{ sub: BOB, reason: 'not-marked' }]);
  });

  it('says "no data" when the window runs one slot past the row', () => {
    expect(missingBob(range(S + 1, endsAt + 1), oldRow())).toEqual([{ sub: BOB, reason: 'no-data' }]);
  });

  it('says "no data" when the window starts before the row does', () => {
    const later = row(BOB, [], { startDay: NOW_DAY + 3 });
    expect(missingBob(range(S + 1, S + 9), later)).toEqual([{ sub: BOB, reason: 'no-data' }]);
  });

  it('says "not marked" for someone whose row covers the whole window but has no free time in it', () => {
    expect(missingBob(range(S + 1, S + 9), row(BOB, [S + 20]))).toEqual([{ sub: BOB, reason: 'not-marked' }]);
  });
});
