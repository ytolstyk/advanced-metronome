import { describe, expect, it, vi } from 'vitest';
import type { InstrumentKey } from './bandInstruments';
import { instrumentCoverage } from './instrumentCoverage';

const lookup = (table: Record<string, readonly unknown[]>) => (sub: string) => (table[sub] ?? []) as readonly InstrumentKey[];

describe('instrumentCoverage', () => {
  it('splits the band instruments into covered (someone free plays it) and missing (nobody free does)', () => {
    const of = lookup({ a: ['guitar'], b: ['bass'], c: ['drums'] });
    expect(instrumentCoverage(['a', 'b'], ['a', 'b', 'c'], of)).toEqual({
      covered: ['guitar', 'bass'],
      missing: ['drums'],
      unknown: false,
    });
  });

  it('has nothing missing when everyone is free', () => {
    const of = lookup({ a: ['guitar'], b: ['vocals'] });
    expect(instrumentCoverage(['a', 'b'], ['a', 'b'], of)).toEqual({ covered: ['guitar', 'vocals'], missing: [], unknown: false });
  });

  it('has nothing covered when nobody is free, and every band instrument missing', () => {
    const of = lookup({ a: ['guitar'], b: ['keys'] });
    expect(instrumentCoverage([], ['a', 'b'], of)).toEqual({ covered: [], missing: ['guitar', 'keys'], unknown: false });
  });

  it('is unknown when nobody in the band lists an instrument', () => {
    const of = lookup({});
    expect(instrumentCoverage(['a'], ['a', 'b'], of)).toEqual({ covered: [], missing: [], unknown: true });
  });

  it('is unknown for an empty band', () => {
    expect(instrumentCoverage([], [], lookup({}))).toEqual({ covered: [], missing: [], unknown: true });
  });

  it('is not unknown when only someone who is not free plays something', () => {
    const of = lookup({ a: [], b: ['drums'] });
    const result = instrumentCoverage(['a'], ['a', 'b'], of);
    expect(result.unknown).toBe(false);
    expect(result.covered).toEqual([]);
    expect(result.missing).toEqual(['drums']);
  });

  it('lists instruments in palette order whatever order they come in', () => {
    const of = lookup({ a: ['other', 'vocals', 'guitar'], b: ['winds', 'bass'] });
    expect(instrumentCoverage(['a'], ['a', 'b'], of)).toEqual({
      covered: ['guitar', 'vocals', 'other'],
      missing: ['bass', 'winds'],
      unknown: false,
    });
  });

  it('counts an instrument once when several people play it', () => {
    const of = lookup({ a: ['guitar', 'guitar'], b: ['guitar'], c: ['guitar'] });
    expect(instrumentCoverage(['a', 'b'], ['a', 'b', 'c'], of)).toEqual({ covered: ['guitar'], missing: [], unknown: false });
  });

  it('treats an instrument as covered if any one free person plays it, even when others who play it are not free', () => {
    const of = lookup({ a: ['guitar'], b: ['guitar', 'drums'] });
    expect(instrumentCoverage(['a'], ['a', 'b'], of)).toEqual({ covered: ['guitar'], missing: ['drums'], unknown: false });
  });

  it('ignores keys it does not know', () => {
    const of = lookup({ a: ['theremin', 42, null, 'bass'], b: ['kazoo'] });
    expect(instrumentCoverage(['a'], ['a', 'b'], of)).toEqual({ covered: ['bass'], missing: [], unknown: false });
  });

  it('is unknown when every listed key is junk', () => {
    const of = lookup({ a: ['theremin'], b: [7] });
    expect(instrumentCoverage(['a'], ['a', 'b'], of).unknown).toBe(true);
  });

  it('asks about each sub it is given', () => {
    const of = vi.fn(lookup({ a: ['guitar'] }));
    instrumentCoverage(['a'], ['a', 'b'], of);
    expect(of).toHaveBeenCalledWith('a');
    expect(of).toHaveBeenCalledWith('b');
  });

  it('does not mutate the arrays it is given', () => {
    const free = Object.freeze(['a']);
    const all = Object.freeze(['a', 'b']);
    const mine = Object.freeze(['bass', 'guitar'] as InstrumentKey[]);
    expect(() => instrumentCoverage(free, all, () => mine)).not.toThrow();
    expect(mine).toEqual(['bass', 'guitar']);
  });
});
