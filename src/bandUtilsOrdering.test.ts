import { describe, expect, it } from 'vitest';
import type { MemberRecord } from './bandTypes';
import { byJoinOrder, rowStamp, type Stamped } from './bandUtils';

const member = (owner: string, createdAt: string): MemberRecord => ({
  bandId: 'band-1',
  owner,
  displayName: owner,
  createdAt,
});

describe('byJoinOrder', () => {
  it('puts the earlier joiner first', () => {
    const early = member('sub-z', '2026-01-01T00:00:00Z');
    const late = member('sub-a', '2026-01-02T00:00:00Z');
    expect(byJoinOrder(early, late)).toBeLessThan(0);
    expect(byJoinOrder(late, early)).toBeGreaterThan(0);
  });

  it('breaks a tie by account, in both directions', () => {
    const a = member('sub-a', '2026-01-01T00:00:00Z');
    const b = member('sub-b', '2026-01-01T00:00:00Z');
    expect(byJoinOrder(a, b)).toBeLessThan(0);
    expect(byJoinOrder(b, a)).toBeGreaterThan(0);
  });

  it('is zero only for the same join time and account', () => {
    const a = member('sub-a', '2026-01-01T00:00:00Z');
    expect(byJoinOrder(a, { ...a })).toBe(0);
  });

  it('sorts a roster deterministically whatever order it arrives in', () => {
    const roster = [
      member('sub-c', '2026-01-02T00:00:00Z'),
      member('sub-b', '2026-01-01T00:00:00Z'),
      member('sub-d', '2026-01-03T00:00:00Z'),
      member('sub-a', '2026-01-01T00:00:00Z'),
    ];
    const expected = ['sub-a', 'sub-b', 'sub-c', 'sub-d'];
    expect([...roster].sort(byJoinOrder).map((m) => m.owner)).toEqual(expected);
    expect([...roster].reverse().sort(byJoinOrder).map((m) => m.owner)).toEqual(expected);
  });
});

describe('rowStamp', () => {
  const base: Stamped = { owner: 'sub-a' };

  it('prefers the last update', () => {
    expect(rowStamp({ ...base, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' })).toBe('2026-02-01T00:00:00Z');
  });

  it('falls back to the creation time', () => {
    expect(rowStamp({ ...base, createdAt: '2026-01-01T00:00:00Z' })).toBe('2026-01-01T00:00:00Z');
  });

  it('is an empty string for a row with no timestamps', () => {
    expect(rowStamp(base)).toBe('');
  });

  it('can order rows by their stamps', () => {
    const older: Stamped = { ...base, createdAt: '2026-01-01T00:00:00Z' };
    const newer: Stamped = { ...base, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' };
    expect(rowStamp(newer).localeCompare(rowStamp(older))).toBeGreaterThan(0);
  });
});
