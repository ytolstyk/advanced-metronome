import { describe, it, expect } from 'vitest';
import { computeVoicingDifficulty } from './chords';
import type { ChordVoicing } from './chords';

// ── computeVoicingDifficulty ──────────────────────────────────────────────────

describe('computeVoicingDifficulty', () => {
  // ── beginner cases ──────────────────────────────────────────────────────────

  it('rates open C major as beginner (no barre, low frets, small spread)', () => {
    // x32010 — standard open C
    const voicing: ChordVoicing = { frets: [-1, 3, 2, 0, 1, 0] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  it('rates open G major as beginner', () => {
    // 320003 — standard open G
    const voicing: ChordVoicing = { frets: [3, 2, 0, 0, 0, 3] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  it('rates open D major as beginner', () => {
    // xx0232 — standard open D
    const voicing: ChordVoicing = { frets: [-1, -1, 0, 2, 3, 2] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  it('rates a chord with only open strings as beginner (all frets 0 or muted)', () => {
    // Em — 022000
    const voicing: ChordVoicing = { frets: [0, 2, 2, 0, 0, 0] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  it('rates a chord with no played frets (all muted/open) as beginner', () => {
    // Pathological: all strings muted
    const voicing: ChordVoicing = { frets: [-1, -1, -1, -1, -1, -1] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  // ── intermediate cases ──────────────────────────────────────────────────────

  it('rates barre F major at fret 1 as intermediate', () => {
    // 112331 barre at fret 1
    const voicing: ChordVoicing = {
      frets: [1, 1, 2, 3, 3, 1],
      barre: { fret: 1, fromString: 1, toString: 6 },
      startFret: 1,
    };
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates barre B minor at fret 2 as intermediate', () => {
    // x24432 — Bm barre at fret 2
    const voicing: ChordVoicing = {
      frets: [-1, 2, 4, 4, 3, 2],
      barre: { fret: 2, fromString: 2, toString: 6 },
      startFret: 2,
    };
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates a chord with spread of exactly 4 and 3 unique frets as intermediate', () => {
    // 3 unique frets (< 5), spread 2, no barre, startFret 2 → intermediate
    const voicing: ChordVoicing = { frets: [-1, 2, 3, 4, 3, -1], startFret: 2 };
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates a no-barre chord with moderate fret positions as intermediate', () => {
    // Frets at 3,4,5 — spread 2, 3 unique frets, startFret 3, no barre
    const voicing: ChordVoicing = { frets: [-1, 3, 4, 5, 4, -1], startFret: 3 };
    // beginner: maxFret 5 > 3 → fails; advanced: startFret 3 not > 5, no barre, spread 2 not > 4, uniqueFrets 3 < 4 → not advanced
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates barre C major at fret 3 with barre.fret = 3 as intermediate', () => {
    // barre.fret = 3 (not > 4) and startFret = 3 (not > 3 fails the > 3 check)
    const voicing: ChordVoicing = {
      frets: [3, 3, 5, 5, 5, 3],
      barre: { fret: 3, fromString: 1, toString: 6 },
      startFret: 3,
    };
    // hasBarre && (barre.fret > 4 → false, startFret > 3 → false) → not advanced
    // startFret 3 not > 5, spread = 5-3 = 2 not > 4, uniqueFrets = 2 < 4 → not advanced
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  // ── advanced cases ──────────────────────────────────────────────────────────

  it('rates a high-position chord (startFret > 5) as advanced', () => {
    // e.g. some chord at 8th position
    const voicing: ChordVoicing = { frets: [-1, 8, 10, 9, 10, -1], startFret: 8 };
    expect(computeVoicingDifficulty(voicing)).toBe('advanced');
  });

  it('rates a barre chord at a high fret (barre.fret > 4) as advanced', () => {
    // Barre at fret 7
    const voicing: ChordVoicing = {
      frets: [7, 7, 9, 9, 9, 7],
      barre: { fret: 7, fromString: 1, toString: 6 },
      startFret: 7,
    };
    expect(computeVoicingDifficulty(voicing)).toBe('advanced');
  });

  it('rates a barre chord at fret 4 as intermediate (not high enough to be advanced)', () => {
    // barre.fret = 4 (not > 5) and startFret = 4 (not > 5) → intermediate
    const voicing: ChordVoicing = {
      frets: [4, 4, 6, 6, 5, 4],
      barre: { fret: 4, fromString: 1, toString: 6 },
      startFret: 4,
    };
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates a barre chord where startFret > 5 as advanced', () => {
    // barre at fret 6, startFret 6 → (barre && startFret > 5) → advanced
    const voicing: ChordVoicing = {
      frets: [6, 6, 8, 8, 8, 6],
      barre: { fret: 6, fromString: 1, toString: 6 },
      startFret: 6,
    };
    expect(computeVoicingDifficulty(voicing)).toBe('advanced');
  });

  it('rates a chord with fretSpread > 4 as advanced', () => {
    // frets 2 and 8 in same voicing → spread = 6
    const voicing: ChordVoicing = { frets: [2, -1, 5, 7, 8, -1], startFret: 2 };
    expect(computeVoicingDifficulty(voicing)).toBe('advanced');
  });

  it('rates a chord with 4 unique non-barre frets as intermediate (threshold is 5)', () => {
    // 4 distinct fret numbers: 2,3,4,5 — uniqueFrets 4 < 5 → not advanced
    const voicing: ChordVoicing = { frets: [2, 3, 4, 5, -1, -1], startFret: 2 };
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates a chord with 5 or more unique frets as advanced', () => {
    // 5 distinct fret numbers: 2,3,4,5,6 → uniqueFrets 5 >= 5 → advanced
    const voicing: ChordVoicing = { frets: [2, 3, 4, 5, 6, -1], startFret: 2 };
    expect(computeVoicingDifficulty(voicing)).toBe('advanced');
  });

  it('rates a chord at startFret 6 without barre as intermediate', () => {
    // startFret 6 ≤ 7 and no barre → intermediate
    const voicing: ChordVoicing = { frets: [-1, 6, 7, 8, 7, -1], startFret: 6 };
    expect(computeVoicingDifficulty(voicing)).toBe('intermediate');
  });

  it('rates a chord at startFret 8 as advanced even without barre', () => {
    const voicing: ChordVoicing = { frets: [-1, 8, 9, 10, 9, -1], startFret: 8 };
    expect(computeVoicingDifficulty(voicing)).toBe('advanced');
  });

  // ── edge cases ──────────────────────────────────────────────────────────────

  it('treats fret 0 (open string) as not played when computing spread', () => {
    // Only fret 0 and -1 (open + muted) → playedFrets = [] → beginner
    const voicing: ChordVoicing = { frets: [0, 0, 0, -1, -1, -1] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  it('uses startFret default of 1 when not provided', () => {
    // No startFret property, low frets — should be beginner
    const voicing: ChordVoicing = { frets: [0, 2, 2, 1, 0, 0] };
    expect(computeVoicingDifficulty(voicing)).toBe('beginner');
  });

  it('returns a valid difficulty level for every possible call', () => {
    const validLevels = new Set(['beginner', 'intermediate', 'advanced']);
    const testCases: ChordVoicing[] = [
      { frets: [0, 2, 2, 1, 0, 0] },
      { frets: [1, 1, 2, 3, 3, 1], barre: { fret: 1, fromString: 1, toString: 6 }, startFret: 1 },
      { frets: [5, 5, 7, 7, 7, 5], barre: { fret: 5, fromString: 1, toString: 6 }, startFret: 5 },
    ];
    for (const v of testCases) {
      expect(validLevels.has(computeVoicingDifficulty(v))).toBe(true);
    }
  });
});
