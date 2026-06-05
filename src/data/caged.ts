import type { RootNote } from './chords';
import { ROOT_NOTE_TO_PC } from './chords';

export type CagedName = 'C' | 'A' | 'G' | 'E' | 'D';
export type TriadRole = 'root' | 'M3' | 'P5';

export interface ShapeNote {
  string: number; // 0 = low E (MIDI order), 5 = high e
  fret: number;
  role: TriadRole;
}

export interface CagedShape {
  name: CagedName;
  color: string;
  notes: ShapeNote[];
}

export const CAGED_COLORS: Record<CagedName, string> = {
  C: '#f59e0b',
  A: '#10b981',
  G: '#3b82f6',
  E: '#8b5cf6',
  D: '#ef4444',
};

export const CAGED_SHAPE_ORDER: CagedName[] = ['C', 'A', 'G', 'E', 'D'];

// Templates defined for C major (rootPc = 0). Standard tuning open pitch classes:
// string 0 (low E) = 4, string 1 (A) = 9, string 2 (D) = 2,
// string 3 (G) = 7, string 4 (B) = 11, string 5 (high e) = 4
const TEMPLATES: Record<CagedName, ShapeNote[]> = {
  C: [
    { string: 1, fret: 3,  role: 'root' }, // A+3=0=C
    { string: 2, fret: 2,  role: 'M3'  }, // D+2=4=E
    { string: 3, fret: 0,  role: 'P5'  }, // G+0=7=G
    { string: 4, fret: 1,  role: 'root' }, // B+1=0=C
    { string: 5, fret: 0,  role: 'M3'  }, // e+0=4=E
  ],
  A: [
    { string: 1, fret: 3,  role: 'root' }, // A+3=0=C
    { string: 2, fret: 5,  role: 'P5'  }, // D+5=7=G
    { string: 3, fret: 5,  role: 'root' }, // G+5=0=C
    { string: 4, fret: 5,  role: 'M3'  }, // B+5=4=E
    { string: 5, fret: 3,  role: 'P5'  }, // e+3=7=G
  ],
  G: [
    { string: 0, fret: 8,  role: 'root' }, // E+8=0=C
    { string: 1, fret: 7,  role: 'M3'  }, // A+7=4=E
    { string: 2, fret: 5,  role: 'P5'  }, // D+5=7=G
    { string: 3, fret: 5,  role: 'root' }, // G+5=0=C
    { string: 4, fret: 5,  role: 'M3'  }, // B+5=4=E
    { string: 5, fret: 8,  role: 'root' }, // e+8=0=C
  ],
  E: [
    { string: 0, fret: 8,  role: 'root' }, // E+8=0=C
    { string: 1, fret: 10, role: 'P5'  }, // A+10=7=G
    { string: 2, fret: 10, role: 'root' }, // D+10=0=C
    { string: 3, fret: 9,  role: 'M3'  }, // G+9=4=E
    { string: 4, fret: 8,  role: 'P5'  }, // B+8=7=G
    { string: 5, fret: 8,  role: 'root' }, // e+8=0=C
  ],
  D: [
    { string: 2, fret: 10, role: 'root' }, // D+10=0=C
    { string: 3, fret: 12, role: 'P5'  }, // G+12=7=G
    { string: 4, fret: 13, role: 'root' }, // B+13=0=C
    { string: 5, fret: 12, role: 'M3'  }, // e+12=4=E
  ],
};

export function computeCAGEDShapes(rootPc: number): CagedShape[] {
  return CAGED_SHAPE_ORDER.map((name) => {
    const notes: ShapeNote[] = TEMPLATES[name].map(({ string, fret, role }) => {
      let transposed = fret + rootPc;
      while (transposed > 15) transposed -= 12;
      while (transposed < 0) transposed += 12;
      return { string, fret: transposed, role };
    });
    return { name, color: CAGED_COLORS[name], notes };
  });
}

export function getRootPc(rootNote: RootNote): number {
  return ROOT_NOTE_TO_PC[rootNote];
}
