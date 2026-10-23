import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LIMITS } from './bandTypes';
import {
  DAY_MS,
  SLOTS_PER_HEX,
  applyEdits,
  decodeMask,
  encodeRow,
  encodeSlots,
  horizonEndSlot,
  isSlotEditable,
  SLOTS_PER_HOUR,
  slotOf,
  slotStartMs,
  utcDayOf,
  writerWindow,
} from './availabilitySlots';
import { MIDNIGHT, NOW, NOW_SLOT } from './availabilityTestHelpers';

const byNumber = (a: number, b: number): number => a - b;

describe('slots', () => {
  it('floors an instant to its half hour and back', () => {
    expect(slotOf(0)).toBe(0);
    expect(slotOf(30 * 60 * 1000 - 1)).toBe(0);
    expect(slotOf(30 * 60 * 1000)).toBe(1);
    expect(slotStartMs(NOW_SLOT)).toBeLessThanOrEqual(NOW);
    expect(utcDayOf(Date.UTC(1970, 0, 2))).toBe(1);
  });

  it('only lets slots that have not started be edited', () => {
    expect(isSlotEditable(NOW_SLOT, NOW)).toBe(false);
    expect(isSlotEditable(NOW_SLOT + 1, NOW)).toBe(true);
    // A slot that starts exactly now has started.
    expect(isSlotEditable(NOW_SLOT, slotStartMs(NOW_SLOT))).toBe(false);
  });

  it('ends the horizon 61 days of slots ahead, so 60 local days always fit', () => {
    expect(horizonEndSlot(NOW)).toBe(NOW_SLOT + 61 * 48);
  });
});

describe('slot edge cases', () => {
  it('exports the constants the wire format is built on', () => {
    expect(DAY_MS).toBe(86_400_000);
    expect(SLOTS_PER_HEX).toBe(4);
  });

  it('floors before the epoch rather than truncating toward zero', () => {
    expect(slotOf(-1)).toBe(-1);
    expect(slotOf(-30 * 60 * 1000)).toBe(-1);
    expect(utcDayOf(-1)).toBe(-1);
    expect(utcDayOf(-DAY_MS)).toBe(-1);
    expect(utcDayOf(DAY_MS - 1)).toBe(0);
  });

  it('puts every instant inside the half hour its slot starts', () => {
    for (const ms of [0, 1, 1_799_999, 1_800_000, NOW, NOW + 29 * 60 * 1000]) {
      const start = slotStartMs(slotOf(ms));
      expect(start).toBeLessThanOrEqual(ms);
      expect(ms).toBeLessThan(start + AVAILABILITY_LIMITS.slotMs);
    }
  });

  it('lets a slot be edited right up to the instant before it starts', () => {
    const next = slotStartMs(NOW_SLOT + 1);
    expect(isSlotEditable(NOW_SLOT + 1, next - 1)).toBe(true);
    expect(isSlotEditable(NOW_SLOT + 1, next)).toBe(false);
    expect(isSlotEditable(NOW_SLOT + 1, next + 1)).toBe(false);
  });

  it('measures the horizon from the current slot, whichever part of it "now" is in', () => {
    expect(horizonEndSlot(slotStartMs(NOW_SLOT))).toBe(NOW_SLOT + 61 * 48);
    expect(horizonEndSlot(slotStartMs(NOW_SLOT + 1) - 1)).toBe(NOW_SLOT + 61 * 48);
    expect(horizonEndSlot(slotStartMs(NOW_SLOT + 1))).toBe(NOW_SLOT + 1 + 61 * 48);
  });

  it('anchors the writer window to the UTC day, whatever the time of day', () => {
    const day = MIDNIGHT / DAY_MS;
    const { writerMaxDays } = AVAILABILITY_LIMITS;
    for (const now of [MIDNIGHT, MIDNIGHT + 1, MIDNIGHT + DAY_MS - 1]) {
      expect(writerWindow(now)).toEqual({ startSlot: day * 48, endSlot: (day + writerMaxDays) * 48 });
    }
    expect(writerWindow(MIDNIGHT + DAY_MS).startSlot).toBe((day + 1) * 48);
  });
});

describe('limits', () => {
  it('has two half-hour slots in an hour', () => {
    expect(SLOTS_PER_HOUR).toBe(2);
  });

  // The stored layout: changing any of these corrupts every row already written.
  it('pins the values the wire format depends on', () => {
    expect(AVAILABILITY_LIMITS).toMatchObject({ formatVersion: 1, slotMs: 1_800_000, slotsPerDay: 48, hexPerDay: 12 });
  });

  it('keeps the stored layout and the writer window consistent', () => {
    const { slotsPerDay, hexPerDay, horizonDays, writerMaxDays, parserMaxDays, slotMs } = AVAILABILITY_LIMITS;
    expect(hexPerDay * 4).toBe(slotsPerDay);
    expect(slotsPerDay * slotMs).toBe(24 * 60 * 60 * 1000);
    expect(writerMaxDays).toBeGreaterThanOrEqual(horizonDays + 2);
    expect(parserMaxDays).toBeGreaterThan(writerMaxDays);
  });
});

describe('codec', () => {
  // The wire format is pinned with literals on purpose: changing it corrupts stored rows.
  it('lays bits out big-endian per hex character, 12 characters per UTC day', () => {
    const day = 20_000;
    const base = day * 48;
    expect(encodeSlots([base], day, 1)).toBe('800000000000');
    expect(encodeSlots([base + 3], day, 1)).toBe('100000000000');
    expect(encodeSlots([base + 4], day, 1)).toBe('080000000000');
    expect(encodeSlots([base + 47], day, 1)).toBe('000000000001');
    expect(encodeSlots([], day, 2)).toBe('0'.repeat(24));
  });

  it('round-trips slots through the mask', () => {
    const day = 20_000;
    const slots = [day * 48, day * 48 + 5, day * 48 + 47, (day + 1) * 48 + 13];
    const mask = encodeSlots(slots, day, 2);
    expect(mask).toHaveLength(24);
    expect([...decodeMask(day, mask)].sort((a, b) => a - b)).toEqual(slots);
  });

  it('sets exactly the bit for each slot of a day and reads it back', () => {
    const day = 20_000;
    const base = day * 48;
    for (let i = 0; i < 48; i++) {
      const mask = encodeSlots([base + i], day, 1);
      expect(mask.replace(/0/g, '')).toHaveLength(1);
      expect([...decodeMask(day, mask)]).toEqual([base + i]);
    }
  });

  it('writes each nibble big-endian (slot 0 of a character is its high bit)', () => {
    const day = 20_000;
    const base = day * 48;
    expect(encodeSlots([base, base + 1, base + 2, base + 3], day, 1)).toBe('f00000000000');
    expect(encodeSlots([base, base + 2], day, 1)).toBe('a00000000000');
    expect(encodeSlots([base + 1, base + 5], day, 1)).toBe('440000000000');
    expect(decodeMask(0, '1')).toEqual(new Set([3]));
    expect(decodeMask(0, '2')).toEqual(new Set([2]));
    expect(decodeMask(0, '4')).toEqual(new Set([1]));
    expect(decodeMask(0, '8')).toEqual(new Set([0]));
    expect(decodeMask(0, '08')).toEqual(new Set([4]));
  });

  it('decodes an empty or all-zero mask to nothing, and anchors at the start day', () => {
    expect(decodeMask(123, '').size).toBe(0);
    expect(decodeMask(123, '0'.repeat(24)).size).toBe(0);
    expect([...decodeMask(123, 'f')].sort(byNumber)).toEqual([123 * 48, 123 * 48 + 1, 123 * 48 + 2, 123 * 48 + 3]);
  });

  it('accepts any iterable, ignores duplicates and does not care about order', () => {
    const day = 20_000;
    const base = day * 48;
    const expected = encodeSlots([base + 2, base + 9], day, 1);
    expect(encodeSlots(new Set([base + 9, base + 2]), day, 1)).toBe(expected);
    expect(encodeSlots([base + 9, base + 2, base + 9, base + 2], day, 1)).toBe(expected);
    function* gen(): Generator<number> {
      yield base + 9;
      yield base + 2;
    }
    expect(encodeSlots(gen(), day, 1)).toBe(expected);
  });

  it('writes an empty mask for zero days, and drops everything', () => {
    expect(encodeSlots([20_000 * 48], 20_000, 0)).toBe('');
  });

  it('keeps the last slot of a multi-day window and drops the one after', () => {
    const day = 20_000;
    const last = (day + 2) * 48 - 1;
    expect([...decodeMask(day, encodeSlots([last, last + 1], day, 2))]).toEqual([last]);
  });

  it('drops slots outside the window, including either edge and non-whole slots', () => {
    const day = 20_000;
    const base = day * 48;
    expect(encodeSlots([base - 1, base + 48], day, 1)).toBe('0'.repeat(12));
    expect(encodeSlots([base + 1.5, NaN, Infinity], day, 1)).toBe('0'.repeat(12));
    expect(decodeMask(day, encodeSlots([base, base + 47], day, 1)).size).toBe(2);
  });
});

describe('encodeRow', () => {
  const { writerMaxDays, hexPerDay, formatVersion } = AVAILABILITY_LIMITS;

  it('writes a fixed window from today, free marks for unstarted slots only', () => {
    const encoded = encodeRow([NOW_SLOT - 5, NOW_SLOT, NOW_SLOT + 1, NOW_SLOT + 2], NOW);
    expect(encoded.format).toBe(formatVersion);
    expect(encoded.startDay).toBe(utcDayOf(NOW));
    expect(encoded.mask).toHaveLength(writerMaxDays * hexPerDay);
    expect([...decodeMask(encoded.startDay, encoded.mask)].sort((a, b) => a - b)).toEqual([NOW_SLOT + 1, NOW_SLOT + 2]);
  });

  it('discards marks beyond the window (a skewed clock cannot smuggle them in)', () => {
    const encoded = encodeRow([NOW_SLOT + 1, NOW_SLOT + 70 * 48], NOW);
    expect([...decodeMask(encoded.startDay, encoded.mask)]).toEqual([NOW_SLOT + 1]);
  });

  it('always covers the marking horizon, at every half hour of the day', () => {
    for (let half = 0; half < 96; half++) {
      const now = Date.UTC(2026, 10, 3, 0, 0) + half * 30 * 60 * 1000 + 59_000;
      const { endSlot } = writerWindow(now);
      expect(endSlot).toBeGreaterThanOrEqual(horizonEndSlot(now));
    }
  });

  it('reports the same window it writes', () => {
    const { startSlot, endSlot } = writerWindow(NOW);
    const encoded = encodeRow([], NOW);
    expect(startSlot).toBe(encoded.startDay * 48);
    expect(endSlot - startSlot).toBe(encoded.mask.length * 4);
  });
});

describe('encodeRow edges', () => {
  const { endSlot } = writerWindow(NOW);
  const decoded = (slots: Iterable<number>) => {
    const { startDay, mask } = encodeRow(slots, NOW);
    return [...decodeMask(startDay, mask)].sort(byNumber);
  };

  it('keeps the last slot of the window and drops the one after it', () => {
    expect(decoded([endSlot - 1, endSlot])).toEqual([endSlot - 1]);
  });

  it('writes the same fixed length whatever is marked', () => {
    const { writerMaxDays, hexPerDay } = AVAILABILITY_LIMITS;
    expect(encodeRow([], NOW).mask).toBe('0'.repeat(writerMaxDays * hexPerDay));
    expect(encodeRow([NOW_SLOT + 1], NOW).mask).toHaveLength(writerMaxDays * hexPerDay);
    expect(encodeRow([NOW_SLOT - 1000, endSlot + 1000], NOW).mask).toBe('0'.repeat(writerMaxDays * hexPerDay));
  });

  it('accepts any iterable and does not change what it was given', () => {
    const free = new Set([NOW_SLOT + 3, NOW_SLOT + 1]);
    expect(decoded(free)).toEqual([NOW_SLOT + 1, NOW_SLOT + 3]);
    expect([...free]).toEqual([NOW_SLOT + 3, NOW_SLOT + 1]);
    function* gen(): Generator<number> {
      yield NOW_SLOT + 2;
    }
    expect(decoded(gen())).toEqual([NOW_SLOT + 2]);
  });

  it('drops marks that are not whole slots', () => {
    expect(decoded([NOW_SLOT + 1.5, NaN, NOW_SLOT + 2])).toEqual([NOW_SLOT + 2]);
  });

  it('drops the whole of today when "now" is the last slot of the day', () => {
    const lastSlotMs = MIDNIGHT + DAY_MS - 1;
    const today = writerWindow(lastSlotMs).startSlot;
    const encoded = encodeRow(Array.from({ length: 48 }, (_, i) => today + i), lastSlotMs);
    expect([...decodeMask(encoded.startDay, encoded.mask)]).toEqual([]);
  });
});

describe('applyEdits', () => {
  it('returns a new set equal to the base when there are no edits', () => {
    const base = new Set([NOW_SLOT + 1]);
    const next = applyEdits(base, new Map(), NOW);
    expect(next).not.toBe(base);
    expect([...next]).toEqual([NOW_SLOT + 1]);
  });

  it('leaves the set alone when freeing a slot that was not marked, or marking one that is', () => {
    const next = applyEdits(new Set([NOW_SLOT + 1]), new Map([[NOW_SLOT + 7, false], [NOW_SLOT + 1, true]]), NOW);
    expect([...next]).toEqual([NOW_SLOT + 1]);
  });

  it('cannot clear a mark on a slot that has started', () => {
    const next = applyEdits(new Set([NOW_SLOT]), new Map([[NOW_SLOT, false]]), NOW);
    expect(next.has(NOW_SLOT)).toBe(true);
  });

  it('applies edits to a copy', () => {
    const base = new Set([NOW_SLOT + 1, NOW_SLOT + 2, NOW_SLOT + 3]);
    const next = applyEdits(base, new Map([[NOW_SLOT + 2, false], [NOW_SLOT + 9, true]]), NOW);
    expect([...next].sort((a, b) => a - b)).toEqual([NOW_SLOT + 1, NOW_SLOT + 3, NOW_SLOT + 9]);
    expect(base.size).toBe(3);
  });

  it('ignores edits to slots that have started, so the editor shows what a save keeps', () => {
    const next = applyEdits(new Set(), new Map([[NOW_SLOT, true], [NOW_SLOT - 4, true], [NOW_SLOT + 1, true]]), NOW);
    expect([...next]).toEqual([NOW_SLOT + 1]);
  });
});
