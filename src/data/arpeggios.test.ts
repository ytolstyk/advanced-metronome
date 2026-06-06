import { describe, it, expect } from 'vitest';
import {
  ARPEGGIO_DATABASE,
  ARPEGGIO_QUALITIES,
  ARPEGGIO_QUALITY_LABELS,
  arpeggioName,
} from './arpeggios';

describe('ARPEGGIO_DATABASE', () => {
  it('contains exactly 96 entries (12 roots × 8 qualities)', () => {
    expect(ARPEGGIO_DATABASE).toHaveLength(96);
  });

  it('contains exactly 3 shapes per entry', () => {
    for (const entry of ARPEGGIO_DATABASE) {
      expect(entry.shapes).toHaveLength(3);
    }
  });

  it('every shape has exactly 6 frets', () => {
    for (const entry of ARPEGGIO_DATABASE) {
      for (const shape of entry.shapes) {
        expect(shape.frets).toHaveLength(6);
      }
    }
  });

  it('no non-muted fret is negative after transposition', () => {
    for (const entry of ARPEGGIO_DATABASE) {
      for (const shape of entry.shapes) {
        for (const fret of shape.frets) {
          if (fret !== -1) {
            expect(fret).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('each shape startFret equals the minimum non-muted, non-open fret', () => {
    for (const entry of ARPEGGIO_DATABASE) {
      for (const shape of entry.shapes) {
        const playedFrets = shape.frets.filter(f => f > 0);
        if (playedFrets.length > 0) {
          const expectedMin = Math.min(...playedFrets);
          expect(shape.startFret).toBe(expectedMin);
        }
      }
    }
  });

  it('covers all 12 root notes', () => {
    const roots = new Set(ARPEGGIO_DATABASE.map(e => e.root));
    expect(roots.size).toBe(12);
  });

  it('covers all 8 qualities for each root', () => {
    const rootGroups = new Map<string, Set<string>>();
    for (const entry of ARPEGGIO_DATABASE) {
      if (!rootGroups.has(entry.root)) {
        rootGroups.set(entry.root, new Set());
      }
      rootGroups.get(entry.root)!.add(entry.quality);
    }
    for (const [, qualities] of rootGroups) {
      expect(qualities.size).toBe(8);
    }
  });

  it('D shapes add 2 to each non-muted fret compared to C shapes', () => {
    const cMajor = ARPEGGIO_DATABASE.find(e => e.root === 'C' && e.quality === 'major')!;
    const dMajor = ARPEGGIO_DATABASE.find(e => e.root === 'D' && e.quality === 'major')!;

    for (let shapeIdx = 0; shapeIdx < 3; shapeIdx++) {
      const cFrets = cMajor.shapes[shapeIdx].frets;
      const dFrets = dMajor.shapes[shapeIdx].frets;
      for (let i = 0; i < 6; i++) {
        if (cFrets[i] === -1) {
          expect(dFrets[i]).toBe(-1);
        } else {
          expect(dFrets[i]).toBe(cFrets[i] + 2);
        }
      }
    }
  });

  it('C root shapes have semitone offset 0 (same as raw C_SHAPES values)', () => {
    const cMajor = ARPEGGIO_DATABASE.find(e => e.root === 'C' && e.quality === 'major')!;
    // E-shape C major: raw frets [8, 10, 10, 9, 8, 8]
    expect(cMajor.shapes[0].frets).toEqual([8, 10, 10, 9, 8, 8]);
    // A-shape C major: raw frets [-1, 3, 5, 5, 5, 3]
    expect(cMajor.shapes[1].frets).toEqual([-1, 3, 5, 5, 5, 3]);
    // D-shape C major: raw frets [-1, -1, 10, 9, 8, 8]
    expect(cMajor.shapes[2].frets).toEqual([-1, -1, 10, 9, 8, 8]);
  });

  it('C# shapes add 1 to each non-muted fret compared to C shapes', () => {
    const cMinor = ARPEGGIO_DATABASE.find(e => e.root === 'C' && e.quality === 'minor')!;
    const csMinor = ARPEGGIO_DATABASE.find(e => e.root === 'C#' && e.quality === 'minor')!;

    for (let shapeIdx = 0; shapeIdx < 3; shapeIdx++) {
      const cFrets = cMinor.shapes[shapeIdx].frets;
      const csFrets = csMinor.shapes[shapeIdx].frets;
      for (let i = 0; i < 6; i++) {
        if (cFrets[i] === -1) {
          expect(csFrets[i]).toBe(-1);
        } else {
          expect(csFrets[i]).toBe(cFrets[i] + 1);
        }
      }
    }
  });
});

describe('arpeggioName', () => {
  it('formats C Major correctly', () => {
    expect(arpeggioName('C', 'major')).toBe('C Major');
  });

  it('formats A# m7 correctly', () => {
    expect(arpeggioName('A#', 'm7')).toBe('A# m7');
  });

  it('formats D Dom7 correctly', () => {
    expect(arpeggioName('D', 'dom7')).toBe('D Dom7');
  });

  it('formats G# Dim7 correctly', () => {
    expect(arpeggioName('G#', 'dim7')).toBe('G# Dim7');
  });

  it('formats F m7b5 correctly', () => {
    expect(arpeggioName('F', 'm7b5')).toBe('F m7♭5');
  });

  it('formats E Aug correctly', () => {
    expect(arpeggioName('E', 'aug')).toBe('E Aug');
  });

  it('formats B Maj7 correctly', () => {
    expect(arpeggioName('B', 'maj7')).toBe('B Maj7');
  });
});

describe('ARPEGGIO_QUALITIES', () => {
  it('contains exactly 8 qualities', () => {
    expect(ARPEGGIO_QUALITIES).toHaveLength(8);
  });

  it('includes all expected quality identifiers', () => {
    expect(ARPEGGIO_QUALITIES).toContain('major');
    expect(ARPEGGIO_QUALITIES).toContain('minor');
    expect(ARPEGGIO_QUALITIES).toContain('maj7');
    expect(ARPEGGIO_QUALITIES).toContain('m7');
    expect(ARPEGGIO_QUALITIES).toContain('dom7');
    expect(ARPEGGIO_QUALITIES).toContain('dim7');
    expect(ARPEGGIO_QUALITIES).toContain('aug');
    expect(ARPEGGIO_QUALITIES).toContain('m7b5');
  });
});

describe('ARPEGGIO_QUALITY_LABELS', () => {
  it('has a label for every quality in ARPEGGIO_QUALITIES', () => {
    for (const quality of ARPEGGIO_QUALITIES) {
      expect(ARPEGGIO_QUALITY_LABELS[quality]).toBeDefined();
      expect(ARPEGGIO_QUALITY_LABELS[quality].length).toBeGreaterThan(0);
    }
  });

  it('labels match expected display strings', () => {
    expect(ARPEGGIO_QUALITY_LABELS.major).toBe('Major');
    expect(ARPEGGIO_QUALITY_LABELS.minor).toBe('Minor');
    expect(ARPEGGIO_QUALITY_LABELS.maj7).toBe('Maj7');
    expect(ARPEGGIO_QUALITY_LABELS.m7).toBe('m7');
    expect(ARPEGGIO_QUALITY_LABELS.dom7).toBe('Dom7');
    expect(ARPEGGIO_QUALITY_LABELS.dim7).toBe('Dim7');
    expect(ARPEGGIO_QUALITY_LABELS.aug).toBe('Aug');
    expect(ARPEGGIO_QUALITY_LABELS.m7b5).toBe('m7♭5');
  });
});
