import { describe, it, expect } from 'vitest';
import type { ChordSlot, DetectedKey } from './chordTheory';
import {
  chordPitchClasses,
  detectKey,
  toRomanNumeral,
  suggestScales,
  parseRomanNumeralInput,
} from './chordTheory';

// ── chordPitchClasses ─────────────────────────────────────────────────────────

describe('chordPitchClasses', () => {
  it('returns {0,4,7} for C major', () => {
    const result = chordPitchClasses('C', 'major');
    expect(result).toEqual(new Set([0, 4, 7]));
  });

  it('returns {7,11,2} for G major', () => {
    const result = chordPitchClasses('G', 'major');
    expect(result).toEqual(new Set([7, 11, 2]));
  });

  it('returns {9,0,4} for A minor', () => {
    const result = chordPitchClasses('A', 'minor');
    // A=9, minor=[0,3,7] → 9, 0 (9+3=12→0), 4 (9+7=16→4)
    expect(result).toEqual(new Set([9, 0, 4]));
  });

  it('returns {5,9,0} for F major', () => {
    const result = chordPitchClasses('F', 'major');
    // F=5, major=[0,4,7] → 5, 9, 0
    expect(result).toEqual(new Set([5, 9, 0]));
  });

  it('returns {2,6,9} for D minor', () => {
    const result = chordPitchClasses('D', 'minor');
    // D=2, minor=[0,3,7] → 2, 5, 9
    expect(result).toEqual(new Set([2, 5, 9]));
  });

  it('returns {7,11,2,5} for G dominant 7', () => {
    const result = chordPitchClasses('G', '7');
    // G=7, dom7=[0,4,7,10] → 7, 11, 2, 5
    expect(result).toEqual(new Set([7, 11, 2, 5]));
  });

  it('returns {11,3,5} for B diminished', () => {
    const result = chordPitchClasses('B', 'dim');
    // B=11, dim=[0,3,6] → 11, 2, 5
    expect(result).toEqual(new Set([11, 2, 5]));
  });

  it('pitch classes are always in range 0–11', () => {
    const result = chordPitchClasses('A#', 'major');
    for (const pc of result) {
      expect(pc).toBeGreaterThanOrEqual(0);
      expect(pc).toBeLessThanOrEqual(11);
    }
  });
});

// ── detectKey ─────────────────────────────────────────────────────────────────

describe('detectKey', () => {
  it('returns null for empty array', () => {
    expect(detectKey([])).toBeNull();
  });

  it('returns null for array of all nulls', () => {
    expect(detectKey([null, null, null])).toBeNull();
  });

  it('detects C major from I-IV-V-I progression', () => {
    const slots: ChordSlot[] = [
      { root: 'C', type: 'major' },
      { root: 'F', type: 'major' },
      { root: 'G', type: 'major' },
      { root: 'C', type: 'major' },
    ];
    const result = detectKey(slots);
    expect(result).toEqual({ root: 'C', mode: 'major' });
  });

  it('detects A minor from Am-Dm-Em-Am progression', () => {
    const slots: ChordSlot[] = [
      { root: 'A', type: 'minor' },
      { root: 'D', type: 'minor' },
      { root: 'E', type: 'minor' },
      { root: 'A', type: 'minor' },
    ];
    const result = detectKey(slots);
    expect(result).toEqual({ root: 'A', mode: 'minor' });
  });

  it('detects G major from G-D-Em-C progression', () => {
    const slots: (ChordSlot | null)[] = [
      { root: 'G', type: 'major' },
      { root: 'D', type: 'major' },
      { root: 'E', type: 'minor' },
      { root: 'C', type: 'major' },
    ];
    const result = detectKey(slots);
    expect(result).toEqual({ root: 'G', mode: 'major' });
  });

  it('ignores null slots when detecting key', () => {
    const slots: (ChordSlot | null)[] = [
      { root: 'C', type: 'major' },
      null,
      { root: 'G', type: 'major' },
      null,
    ];
    const result = detectKey(slots);
    expect(result).not.toBeNull();
    // C and G are both diatonic to C major
    expect(result?.root).toBe('C');
    expect(result?.mode).toBe('major');
  });

  it('returns a non-null result for a single chord slot', () => {
    const slots: (ChordSlot | null)[] = [{ root: 'D', type: 'major' }];
    expect(detectKey(slots)).not.toBeNull();
  });

  it('detects D major from a D major progression', () => {
    const slots: ChordSlot[] = [
      { root: 'D', type: 'major' },
      { root: 'G', type: 'major' },
      { root: 'A', type: 'major' },
    ];
    const result = detectKey(slots);
    expect(result).toEqual({ root: 'D', mode: 'major' });
  });
});

// ── toRomanNumeral ────────────────────────────────────────────────────────────

describe('toRomanNumeral', () => {
  const cMajor: DetectedKey = { root: 'C', mode: 'major' };

  it('returns I for C major in C major key', () => {
    expect(toRomanNumeral('C', 'major', cMajor)).toBe('I');
  });

  it('returns ii for D minor in C major key', () => {
    expect(toRomanNumeral('D', 'minor', cMajor)).toBe('ii');
  });

  it('returns iii for E minor in C major key', () => {
    expect(toRomanNumeral('E', 'minor', cMajor)).toBe('iii');
  });

  it('returns IV for F major in C major key', () => {
    expect(toRomanNumeral('F', 'major', cMajor)).toBe('IV');
  });

  it('returns V for G major in C major key', () => {
    expect(toRomanNumeral('G', 'major', cMajor)).toBe('V');
  });

  it('returns vi for A minor in C major key', () => {
    expect(toRomanNumeral('A', 'minor', cMajor)).toBe('vi');
  });

  it('returns vii° for B dim in C major key', () => {
    expect(toRomanNumeral('B', 'dim', cMajor)).toBe('vii°');
  });

  it('returns V7 for G dominant 7 in C major key', () => {
    expect(toRomanNumeral('G', '7', cMajor)).toBe('V7');
  });

  it('returns Imaj7 for C maj7 in C major key', () => {
    expect(toRomanNumeral('C', 'maj7', cMajor)).toBe('Imaj7');
  });

  it('returns ii7 for D m7 in C major key (suffix appended to lowercase numeral)', () => {
    // The implementation appends "7" to the lowercased numeral, producing "ii7"
    expect(toRomanNumeral('D', 'm7', cMajor)).toBe('ii7');
  });

  it('returns ? for a chord root outside the scale', () => {
    // C# is not in C major scale
    expect(toRomanNumeral('C#', 'major', cMajor)).toBe('?');
  });

  it('works in minor key: returns i for A minor in A minor key', () => {
    const aMinor: DetectedKey = { root: 'A', mode: 'minor' };
    expect(toRomanNumeral('A', 'minor', aMinor)).toBe('i');
  });

  it('works in minor key: returns iv for D minor in A minor key', () => {
    const aMinor: DetectedKey = { root: 'A', mode: 'minor' };
    expect(toRomanNumeral('D', 'minor', aMinor)).toBe('iv');
  });

  it('returns Isus2 for C sus2 in C major key', () => {
    expect(toRomanNumeral('C', 'sus2', cMajor)).toBe('Isus2');
  });

  it('returns Isus4 for C sus4 in C major key', () => {
    expect(toRomanNumeral('C', 'sus4', cMajor)).toBe('Isus4');
  });

  it('returns I9 for C 9 in C major key', () => {
    expect(toRomanNumeral('C', '9', cMajor)).toBe('I9');
  });

  it('returns Imaj9 for C maj9 in C major key', () => {
    expect(toRomanNumeral('C', 'maj9', cMajor)).toBe('Imaj9');
  });

  it('returns vii°7 for B dim7 in C major key', () => {
    expect(toRomanNumeral('B', 'dim7', cMajor)).toBe('vii°7');
  });
});

// ── suggestScales ─────────────────────────────────────────────────────────────

describe('suggestScales', () => {
  it('returns empty array for empty slots', () => {
    expect(suggestScales([])).toEqual([]);
  });

  it('returns empty array for all-null slots', () => {
    expect(suggestScales([null, null])).toEqual([]);
  });

  it('includes C Major for C-F-G-Am progression', () => {
    const slots: (ChordSlot | null)[] = [
      { root: 'C', type: 'major' },
      { root: 'F', type: 'major' },
      { root: 'G', type: 'major' },
      { root: 'A', type: 'minor' },
    ];
    const suggestions = suggestScales(slots);
    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain('C Major');
  });

  it('excludes scales that do not contain all chord pitch classes', () => {
    // C major + F# major — these come from different keys, so no 7-note scale covers both
    const slots: (ChordSlot | null)[] = [
      { root: 'C', type: 'major' },
      { root: 'F#', type: 'major' },
    ];
    const suggestions = suggestScales(slots);
    // C major scale does not contain F# root — so it should not be suggested
    const labels = suggestions.map((s) => s.label);
    expect(labels).not.toContain('C Major');
  });

  it('returns ScaleSuggestion objects with root, mode, and label', () => {
    const slots: (ChordSlot | null)[] = [{ root: 'C', type: 'major' }];
    const suggestions = suggestScales(slots);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s).toHaveProperty('root');
      expect(s).toHaveProperty('mode');
      expect(s).toHaveProperty('label');
      expect(typeof s.label).toBe('string');
    }
  });

  it('ignores null slots when computing pitch classes', () => {
    const slotsWithNulls: (ChordSlot | null)[] = [
      { root: 'C', type: 'major' },
      null,
      { root: 'G', type: 'major' },
      null,
    ];
    const slotsWithout: (ChordSlot | null)[] = [
      { root: 'C', type: 'major' },
      { root: 'G', type: 'major' },
    ];
    expect(suggestScales(slotsWithNulls)).toEqual(suggestScales(slotsWithout));
  });

  it('includes A Natural Minor for Am-Dm-Em progression', () => {
    const slots: (ChordSlot | null)[] = [
      { root: 'A', type: 'minor' },
      { root: 'D', type: 'minor' },
      { root: 'E', type: 'minor' },
    ];
    const suggestions = suggestScales(slots);
    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain('A Natural Minor');
  });
});

// ── parseRomanNumeralInput ────────────────────────────────────────────────────

describe('parseRomanNumeralInput', () => {
  const cMajor: DetectedKey = { root: 'C', mode: 'major' };

  it('parses "I IV V I" in C major into correct slots', () => {
    const slots = parseRomanNumeralInput('I IV V I', cMajor);
    expect(slots[0]).toEqual({ root: 'C', type: 'major' });
    expect(slots[1]).toEqual({ root: 'F', type: 'major' });
    expect(slots[2]).toEqual({ root: 'G', type: 'major' });
    expect(slots[3]).toEqual({ root: 'C', type: 'major' });
    expect(slots[4]).toBeNull();
    expect(slots[5]).toBeNull();
    expect(slots[6]).toBeNull();
    expect(slots[7]).toBeNull();
  });

  it('always returns exactly 8 slots', () => {
    const slots = parseRomanNumeralInput('I IV V I', cMajor);
    expect(slots).toHaveLength(8);
  });

  it('parses "ii V I" in C major', () => {
    const slots = parseRomanNumeralInput('ii V I', cMajor);
    expect(slots[0]).toEqual({ root: 'D', type: 'minor' });
    expect(slots[1]).toEqual({ root: 'G', type: 'major' });
    expect(slots[2]).toEqual({ root: 'C', type: 'major' });
    expect(slots[3]).toBeNull();
  });

  it('parses dominant 7 suffix: "V7"', () => {
    const slots = parseRomanNumeralInput('V7', cMajor);
    expect(slots[0]).toEqual({ root: 'G', type: '7' });
  });

  it('parses minor 7 suffix: "ii7" (lowercase ii + 7 → m7)', () => {
    const slots = parseRomanNumeralInput('ii7', cMajor);
    expect(slots[0]).toEqual({ root: 'D', type: 'm7' });
  });

  it('parses maj7 suffix: "Imaj7"', () => {
    const slots = parseRomanNumeralInput('Imaj7', cMajor);
    expect(slots[0]).toEqual({ root: 'C', type: 'maj7' });
  });

  it('parses dim suffix: "viidim"', () => {
    const slots = parseRomanNumeralInput('viidim', cMajor);
    expect(slots[0]).toEqual({ root: 'B', type: 'dim' });
  });

  it('parses dim7 suffix: "viidim7"', () => {
    const slots = parseRomanNumeralInput('viidim7', cMajor);
    expect(slots[0]).toEqual({ root: 'B', type: 'dim7' });
  });

  it('parses sus4 suffix: "Isus4"', () => {
    const slots = parseRomanNumeralInput('Isus4', cMajor);
    expect(slots[0]).toEqual({ root: 'C', type: 'sus4' });
  });

  it('parses sus2 suffix: "Isus2"', () => {
    const slots = parseRomanNumeralInput('Isus2', cMajor);
    expect(slots[0]).toEqual({ root: 'C', type: 'sus2' });
  });

  it('caps parsed results at 8 slots', () => {
    const slots = parseRomanNumeralInput('I II III IV V VI VII I II', cMajor);
    expect(slots).toHaveLength(8);
  });

  it('returns all nulls for empty input', () => {
    const slots = parseRomanNumeralInput('', cMajor);
    expect(slots).toHaveLength(8);
    expect(slots.every((s) => s === null)).toBe(true);
  });

  it('parses in A minor key: "i iv V" → Am, Dm, E major', () => {
    const aMinor: DetectedKey = { root: 'A', mode: 'minor' };
    const slots = parseRomanNumeralInput('i iv V', aMinor);
    expect(slots[0]).toEqual({ root: 'A', type: 'minor' });
    expect(slots[1]).toEqual({ root: 'D', type: 'minor' });
    expect(slots[2]).toEqual({ root: 'E', type: 'major' });
  });

  it('parses in G major key: "I V vi IV"', () => {
    const gMajor: DetectedKey = { root: 'G', mode: 'major' };
    const slots = parseRomanNumeralInput('I V vi IV', gMajor);
    expect(slots[0]).toEqual({ root: 'G', type: 'major' });
    expect(slots[1]).toEqual({ root: 'D', type: 'major' });
    expect(slots[2]).toEqual({ root: 'E', type: 'minor' });
    expect(slots[3]).toEqual({ root: 'C', type: 'major' });
  });

  it('parses ° as dim suffix', () => {
    const slots = parseRomanNumeralInput('vii°', cMajor);
    expect(slots[0]).toEqual({ root: 'B', type: 'dim' });
  });

  it('parses add9 suffix', () => {
    const slots = parseRomanNumeralInput('Iadd9', cMajor);
    expect(slots[0]).toEqual({ root: 'C', type: 'add9' });
  });

  it('parses aug suffix', () => {
    const slots = parseRomanNumeralInput('Iaug', cMajor);
    expect(slots[0]).toEqual({ root: 'C', type: 'aug' });
  });

  it('parses m7b5 suffix', () => {
    const slots = parseRomanNumeralInput('viim7b5', cMajor);
    expect(slots[0]).toEqual({ root: 'B', type: 'm7b5' });
  });
});
