import { describe, it, expect } from 'vitest';
import { parseMmSs } from './timeUtils';

describe('parseMmSs', () => {
  // ── mm:ss format ──────────────────────────────────────────────────────────

  it('parses "1:30" as 90 seconds', () => {
    expect(parseMmSs('1:30')).toBe(90);
  });

  it('parses "0:00" as 0 seconds', () => {
    expect(parseMmSs('0:00')).toBe(0);
  });

  it('parses "0:20" as 20 seconds', () => {
    expect(parseMmSs('0:20')).toBe(20);
  });

  it('parses "10:05" as 605 seconds', () => {
    expect(parseMmSs('10:05')).toBe(605);
  });

  it('parses "2:00" as 120 seconds', () => {
    expect(parseMmSs('2:00')).toBe(120);
  });

  it('parses "59:59" as 3599 seconds', () => {
    expect(parseMmSs('59:59')).toBe(3599);
  });

  it('parses mm:ss with decimal seconds "1:30.5" as 90.5', () => {
    expect(parseMmSs('1:30.5')).toBe(90.5);
  });

  it('parses "0:45.75" as 45.75 seconds', () => {
    expect(parseMmSs('0:45.75')).toBe(45.75);
  });

  it('parses "1:60" as 120 seconds (seconds can exceed 59)', () => {
    expect(parseMmSs('1:60')).toBe(120);
  });

  // ── Plain seconds (no colon) ───────────────────────────────────────────────

  it('parses "90" as 90 seconds', () => {
    expect(parseMmSs('90')).toBe(90);
  });

  it('parses "0" as 0 seconds', () => {
    expect(parseMmSs('0')).toBe(0);
  });

  it('parses "45.5" as 45.5 seconds', () => {
    expect(parseMmSs('45.5')).toBe(45.5);
  });

  it('parses "300" as 300 seconds', () => {
    expect(parseMmSs('300')).toBe(300);
  });

  it('parses "0.25" as 0.25 seconds', () => {
    expect(parseMmSs('0.25')).toBe(0.25);
  });

  // ── Invalid / empty input ──────────────────────────────────────────────────

  it('returns 0 for empty string', () => {
    expect(parseMmSs('')).toBe(0);
  });

  it('returns 0 for a fully non-numeric string "abc"', () => {
    expect(parseMmSs('abc')).toBe(0);
  });

  it('returns 0 when minutes part is non-numeric "abc:30"', () => {
    // parseInt('abc') = NaN → falls through to parseFloat('abc:30') = NaN → 0
    expect(parseMmSs('abc:30')).toBe(0);
  });

  it('returns 0 for a string of only colons', () => {
    expect(parseMmSs(':')).toBe(0);
  });

  it('returns 0 for "::"', () => {
    // More than one colon: parts.length > 2 → falls through → parseFloat('::') = NaN
    expect(parseMmSs('::')).toBe(0);
  });
});
