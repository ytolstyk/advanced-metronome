import { describe, it, expect } from 'vitest';
import {
  normalizeCustomIntervals,
  toggleCustomInterval,
  encodeCustomMode,
  parseCustomMode,
} from './customScale';

describe('normalizeCustomIntervals', () => {
  it('always includes the root', () => {
    expect(normalizeCustomIntervals([])).toEqual([0]);
    expect(normalizeCustomIntervals(null)).toEqual([0]);
    expect(normalizeCustomIntervals('x')).toEqual([0]);
  });
  it('sorts, dedupes and drops out-of-range or non-integer values', () => {
    expect(normalizeCustomIntervals([7, 3, 3, 12, -1, 2.5, '4', 0])).toEqual([0, 3, 7]);
  });
});

describe('toggleCustomInterval', () => {
  it('adds and removes intervals in sorted order', () => {
    const added = toggleCustomInterval([0, 7], 4);
    expect(added).toEqual([0, 4, 7]);
    expect(toggleCustomInterval(added, 4)).toEqual([0, 7]);
  });
  it('never removes the root', () => {
    expect(toggleCustomInterval([0, 4], 0)).toEqual([0, 4]);
  });
});

describe('encodeCustomMode / parseCustomMode', () => {
  it('round-trips', () => {
    expect(encodeCustomMode([0, 3, 7])).toBe('custom:0,3,7');
    expect(parseCustomMode('custom:0,3,7')).toEqual([0, 3, 7]);
  });
  it('sanitizes hostile input', () => {
    expect(parseCustomMode('custom:99,abc,5')).toEqual([0, 5]);
  });
  it('returns null for non-custom modes', () => {
    expect(parseCustomMode('major')).toBeNull();
    expect(parseCustomMode('custom')).toBeNull();
  });
});
