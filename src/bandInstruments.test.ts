import { describe, expect, it } from 'vitest';
import { INSTRUMENT_OPTIONS, instrumentOptionsFor, isInstrumentKey, normalizeInstruments } from './bandInstruments';

const ALL_KEYS = ['guitar', 'bass', 'drums', 'vocals', 'keys', 'strings', 'winds', 'other'];

describe('INSTRUMENT_OPTIONS', () => {
  it('lists the eight instruments in palette order with unique keys and labels', () => {
    expect(INSTRUMENT_OPTIONS.map((o) => o.key)).toEqual(ALL_KEYS);
    expect(new Set(INSTRUMENT_OPTIONS.map((o) => o.label)).size).toBe(INSTRUMENT_OPTIONS.length);
  });

  it('gives every option a label', () => {
    for (const option of INSTRUMENT_OPTIONS) expect(option.label).not.toBe('');
  });
});

describe('isInstrumentKey', () => {
  it('accepts every known key', () => {
    for (const key of ALL_KEYS) expect(isInstrumentKey(key)).toBe(true);
  });

  it('rejects labels, wrong case, blanks and non-strings', () => {
    for (const value of ['Guitar', 'GUITAR', 'Winds & brass', '', ' guitar', 'laser-harp', 'toString', '__proto__', 1, null, undefined, {}, []]) {
      expect(isInstrumentKey(value)).toBe(false);
    }
  });
});

describe('normalizeInstruments', () => {
  it('returns [] for null, undefined and empty input', () => {
    expect(normalizeInstruments(null)).toEqual([]);
    expect(normalizeInstruments(undefined)).toEqual([]);
    expect(normalizeInstruments([])).toEqual([]);
  });

  it('keeps known keys in palette order regardless of input order', () => {
    expect(normalizeInstruments(['vocals', 'drums', 'guitar'])).toEqual(['guitar', 'drums', 'vocals']);
  });

  it('drops duplicates', () => {
    expect(normalizeInstruments(['bass', 'bass', 'bass'])).toEqual(['bass']);
  });

  it('drops unknown keys, labels, blanks and non-strings without discarding the known ones', () => {
    expect(normalizeInstruments(['laser-harp', 'Guitar', '', null, 3, {}, 'keys', undefined])).toEqual(['keys']);
  });

  it('does not mutate its input', () => {
    const raw = ['vocals', 'guitar', 'guitar'];
    normalizeInstruments(raw);
    expect(raw).toEqual(['vocals', 'guitar', 'guitar']);
  });

  it('accepts all eight at once', () => {
    expect(normalizeInstruments([...ALL_KEYS].reverse())).toEqual(ALL_KEYS);
  });

  it('only looks at a bounded prefix of a hostile huge array (valid keys past the bound are ignored)', () => {
    const bound = 32; // MAX_SCANNED_ENTRIES
    const raw = [...Array.from({ length: bound }, () => 'junk'), 'guitar'];
    expect(normalizeInstruments(raw)).toEqual([]);
    expect(normalizeInstruments([...Array.from({ length: bound - 1 }, () => 'junk'), 'guitar'])).toEqual(['guitar']);
  });
});

describe('instrumentOptionsFor', () => {
  it('returns the matching options (key, label) in palette order', () => {
    const options = instrumentOptionsFor(['winds', 'guitar']);
    expect(options.map((o) => o.key)).toEqual(['guitar', 'winds']);
    expect(options.map((o) => o.label)).toEqual(['Guitar', 'Winds & brass']);
  });

  it('ignores junk and returns [] for nothing', () => {
    expect(instrumentOptionsFor(['nope'])).toEqual([]);
    expect(instrumentOptionsFor(null)).toEqual([]);
    expect(instrumentOptionsFor(undefined)).toEqual([]);
  });
});
