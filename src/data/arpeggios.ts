import type { RootNote } from './chords';
import { ROOT_NOTES } from './chords';

export type { RootNote };
export { ROOT_NOTES };

// Standard 6-string open MIDI notes: low E → high e
export const STANDARD_OPEN_MIDI = [40, 45, 50, 55, 59, 64];

export type ArpeggioQuality = 'major' | 'minor' | 'maj7' | 'm7' | 'dom7' | 'dim7' | 'aug' | 'm7b5';

export type CagedShape = 'E' | 'A' | 'D' | 'G' | 'C';

export interface ArpeggioShape {
  caged: CagedShape;
  frets: number[];     // -1 = muted/skip, 0 = open, 1+ = fret
  startFret?: number;  // display hint: lowest visible fret
  barre?: { fret: number; fromString: number; toString: number };
}

export interface ArpeggioEntry {
  root: RootNote;
  quality: ArpeggioQuality;
  shapes: ArpeggioShape[];
}

export const ARPEGGIO_QUALITY_LABELS: Record<ArpeggioQuality, string> = {
  major:  'Major',
  minor:  'Minor',
  maj7:   'Maj7',
  m7:     'm7',
  dom7:   'Dom7',
  dim7:   'Dim7',
  aug:    'Aug',
  m7b5:   'm7♭5',
};

export const ARPEGGIO_QUALITIES: ArpeggioQuality[] = [
  'major', 'minor', 'maj7', 'm7', 'dom7', 'dim7', 'aug', 'm7b5',
];

export function arpeggioName(root: RootNote, quality: ArpeggioQuality): string {
  return `${root} ${ARPEGGIO_QUALITY_LABELS[quality]}`;
}

// ── C-root shapes (moveable — no open strings except position I) ─────────────
// String indices: 0=low E (MIDI 40), 1=A (45), 2=D (50), 3=G (55), 4=B (59), 5=high e (64)
// Chord tones verified for C root on each string+fret combination.

const C_SHAPES: Record<ArpeggioQuality, ArpeggioShape[]> = {
  // major: R(0) 3(4) 5(7)
  major: [
    // E-type: root str0 fret 8
    { caged: 'E', frets: [8, 10, 10, 9, 8, 8], startFret: 8 },
    // A-type: root str1 fret 3
    { caged: 'A', frets: [-1, 3, 5, 5, 5, 3], startFret: 3 },
    // D-type: root str2 fret 10
    { caged: 'D', frets: [-1, -1, 10, 9, 8, 8], startFret: 8 },
  ],
  // minor: R(0) b3(3) 5(7)
  minor: [
    { caged: 'E', frets: [8, 10, 10, 8, 8, 8], startFret: 8 },
    { caged: 'A', frets: [-1, 3, 5, 5, 4, 3], startFret: 3 },
    { caged: 'D', frets: [-1, -1, 10, 8, 8, 8], startFret: 8 },
  ],
  // maj7: R(0) 3(4) 5(7) 7(11)
  maj7: [
    { caged: 'E', frets: [8, 7, 9, 9, 8, 7], startFret: 7 },
    { caged: 'A', frets: [-1, 3, 5, 4, 5, 3], startFret: 3 },
    { caged: 'D', frets: [-1, -1, 10, 9, 8, 7], startFret: 7 },
  ],
  // m7: R(0) b3(3) 5(7) b7(10)
  m7: [
    { caged: 'E', frets: [8, 10, 10, 8, 11, 8], startFret: 8 },
    { caged: 'A', frets: [-1, 3, 5, 5, 4, 6], startFret: 3 },
    { caged: 'D', frets: [-1, -1, 10, 8, 11, 8], startFret: 8 },
  ],
  // dom7: R(0) 3(4) 5(7) b7(10)
  dom7: [
    { caged: 'E', frets: [8, 10, 10, 9, 11, 8], startFret: 8 },
    { caged: 'A', frets: [-1, 3, 5, 3, 5, 3], startFret: 3 },
    { caged: 'D', frets: [-1, -1, 10, 9, 11, 8], startFret: 8 },
  ],
  // dim7: R(0) b3(3) b5(6) bb7(9)
  dim7: [
    { caged: 'E', frets: [8, 9, 10, 8, 7, 8], startFret: 7 },
    // str4 fret 4 = Eb (b3); fret 3 = D natural (wrong)
    { caged: 'A', frets: [-1, 3, 4, 5, 4, 5], startFret: 3 },
    { caged: 'D', frets: [-1, -1, 10, 8, 7, 8], startFret: 7 },
  ],
  // aug: R(0) 3(4) #5(8)
  aug: [
    { caged: 'E', frets: [8, 7, 10, 9, 9, 8], startFret: 7 },
    { caged: 'A', frets: [-1, 3, 6, 5, 5, 4], startFret: 3 },
    { caged: 'D', frets: [-1, -1, 10, 9, 9, 8], startFret: 8 },
  ],
  // m7b5: R(0) b3(3) b5(6) b7(10)
  m7b5: [
    { caged: 'E', frets: [8, 9, 10, 8, 11, 8], startFret: 8 },
    { caged: 'A', frets: [-1, 3, 4, 5, 4, 6], startFret: 3 },
    // str3 fret 11 = Gb (b5); fret 8 = Eb (b3) — that would duplicate m7
    { caged: 'D', frets: [-1, -1, 10, 11, 11, 8], startFret: 8 },
  ],
};

const ROOT_SEMITONES: Record<RootNote, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

function transposeShapes(shapes: ArpeggioShape[], semitones: number): ArpeggioShape[] {
  return shapes.map(shape => {
    const transposed = shape.frets.map(f => f < 0 ? f : f + semitones);
    // Find lowest non-muted fret for startFret hint
    const playedFrets = transposed.filter(f => f > 0);
    const minFret = playedFrets.length > 0 ? Math.min(...playedFrets) : 1;
    const barre = shape.barre
      ? { ...shape.barre, fret: shape.barre.fret + semitones }
      : undefined;
    return {
      caged: shape.caged,
      frets: transposed,
      startFret: minFret,
      ...(barre ? { barre } : {}),
    };
  });
}

function buildDatabase(): ArpeggioEntry[] {
  const db: ArpeggioEntry[] = [];
  for (const root of ROOT_NOTES) {
    const semitones = ROOT_SEMITONES[root];
    for (const quality of ARPEGGIO_QUALITIES) {
      const cShapes = C_SHAPES[quality] as ArpeggioShape[];
      db.push({
        root,
        quality,
        shapes: transposeShapes(cShapes, semitones),
      });
    }
  }
  return db;
}

export const ARPEGGIO_DATABASE: ArpeggioEntry[] = buildDatabase();
