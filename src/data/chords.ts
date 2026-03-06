// Frets: index 0 = low E, index 5 = high e. -1 = muted, 0 = open, 1+ = fret number
export type Frets = [number, number, number, number, number, number];

export interface Barre { fret: number; fromString: number; toString: number; }

export interface ChordVoicing { frets: Frets; barre?: Barre; startFret?: number; }

export type RootNote = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type ChordType = 'major' | 'minor' | 'sus2' | 'sus4' | 'aug' | 'dim' | 'dim7' | 'm7b5'
  | 'add9' | 'add4' | 'add7' | 'maj7' | 'm7' | '7' | '6' | 'm6' | '9' | 'maj9' | '5';

export interface ChordEntry { root: RootNote; type: ChordType; voicings: ChordVoicing[]; }

export const CHORD_TYPE_LABELS: Record<ChordType, string> = {
  major: 'Major', minor: 'Minor', sus2: 'Sus2', sus4: 'Sus4',
  aug: 'Aug', dim: 'Dim', dim7: 'Dim7', m7b5: 'm7♭5',
  add9: 'Add9', add4: 'Add4', add7: 'Add7', maj7: 'Maj7',
  m7: 'm7', '7': 'Dom7', '6': '6th', m6: 'm6',
  '9': '9th', maj9: 'Maj9', '5': 'Power',
};

export const ROOT_NOTES: RootNote[] = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export const CHORD_TYPES: ChordType[] = [
  'major','minor','sus2','sus4','aug','dim','dim7','m7b5',
  'add9','add4','add7','maj7','m7','7','6','m6','9','maj9','5',
];

function chordName(root: RootNote, type: ChordType): string {
  const label = CHORD_TYPE_LABELS[type];
  if (type === 'major') return `${root} Major`;
  if (type === 'minor') return `${root}m`;
  if (type === 'maj7') return `${root}maj7`;
  if (type === 'm7') return `${root}m7`;
  if (type === 'm7b5') return `${root}m7♭5`;
  if (type === 'm6') return `${root}m6`;
  if (type === 'dim') return `${root}dim`;
  if (type === 'dim7') return `${root}dim7`;
  if (type === 'aug') return `${root}aug`;
  if (type === 'sus2') return `${root}sus2`;
  if (type === 'sus4') return `${root}sus4`;
  if (type === '7') return `${root}7`;
  if (type === '6') return `${root}6`;
  if (type === '9') return `${root}9`;
  if (type === 'maj9') return `${root}maj9`;
  if (type === 'add9') return `${root}add9`;
  if (type === 'add4') return `${root}add4`;
  if (type === 'add7') return `${root}add7`;
  if (type === '5') return `${root}5`;
  return `${root}${label}`;
}
export { chordName };

export const CHORD_DATABASE: ChordEntry[] = [
  // ── C ──────────────────────────────────────────────────────────────
  { root: 'C', type: 'major',  voicings: [{ frets: [-1,3,2,0,1,0] }] },
  { root: 'C', type: 'minor',  voicings: [{ frets: [-1,3,5,5,4,3], barre: { fret: 3, fromString: 1, toString: 5 }, startFret: 3 }] },
  { root: 'C', type: 'sus2',   voicings: [{ frets: [-1,3,5,5,3,3], startFret: 3 }] },
  { root: 'C', type: 'sus4',   voicings: [{ frets: [-1,3,3,0,1,1] }] },
  { root: 'C', type: 'aug',    voicings: [{ frets: [-1,-1,2,1,1,0] }] },
  { root: 'C', type: 'dim',    voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'C', type: 'dim7',   voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'C', type: 'm7b5',   voicings: [{ frets: [-1,3,4,3,4,3], startFret: 3 }] },
  { root: 'C', type: 'add9',   voicings: [{ frets: [-1,3,2,0,3,0] }] },
  { root: 'C', type: 'add4',   voicings: [{ frets: [-1,3,2,0,1,1] }] },
  { root: 'C', type: 'add7',   voicings: [{ frets: [-1,3,2,3,1,0] }] },
  { root: 'C', type: 'maj7',   voicings: [{ frets: [-1,3,2,0,0,0] }] },
  { root: 'C', type: 'm7',     voicings: [{ frets: [-1,3,5,3,4,3], startFret: 3 }] },
  { root: 'C', type: '7',      voicings: [{ frets: [-1,3,2,3,1,0] }] },
  { root: 'C', type: '6',      voicings: [{ frets: [-1,3,2,2,1,0] }] },
  { root: 'C', type: 'm6',     voicings: [{ frets: [-1,3,5,5,5,3], startFret: 3 }] },
  { root: 'C', type: '9',      voicings: [{ frets: [-1,3,2,3,3,3], startFret: 3 }] },
  { root: 'C', type: 'maj9',   voicings: [{ frets: [-1,3,2,0,3,0] }] },
  { root: 'C', type: '5',      voicings: [{ frets: [-1,3,5,-1,-1,-1], startFret: 3 }] },

  // ── C# / Db ────────────────────────────────────────────────────────
  { root: 'C#', type: 'major',  voicings: [{ frets: [-1,4,6,6,6,4], barre: { fret: 4, fromString: 1, toString: 5 }, startFret: 4 }] },
  { root: 'C#', type: 'minor',  voicings: [{ frets: [-1,4,6,6,5,4], barre: { fret: 4, fromString: 1, toString: 5 }, startFret: 4 }] },
  { root: 'C#', type: 'sus2',   voicings: [{ frets: [-1,4,6,6,4,4], startFret: 4 }] },
  { root: 'C#', type: 'sus4',   voicings: [{ frets: [-1,4,6,6,7,4], startFret: 4 }] },
  { root: 'C#', type: 'aug',    voicings: [{ frets: [-1,-1,3,2,2,1] }] },
  { root: 'C#', type: 'dim',    voicings: [{ frets: [-1,-1,2,3,2,3] }] },
  { root: 'C#', type: 'dim7',   voicings: [{ frets: [-1,-1,2,3,2,3] }] },
  { root: 'C#', type: 'm7b5',   voicings: [{ frets: [-1,4,5,4,5,4], startFret: 4 }] },
  { root: 'C#', type: 'add9',   voicings: [{ frets: [-1,4,6,6,6,6], startFret: 4 }] },
  { root: 'C#', type: 'add4',   voicings: [{ frets: [-1,4,6,6,6,7], startFret: 4 }] },
  { root: 'C#', type: 'add7',   voicings: [{ frets: [-1,4,6,6,6,4], startFret: 4 }] },
  { root: 'C#', type: 'maj7',   voicings: [{ frets: [-1,4,3,1,1,1], startFret: 1 }] },
  { root: 'C#', type: 'm7',     voicings: [{ frets: [-1,4,6,4,5,4], startFret: 4 }] },
  { root: 'C#', type: '7',      voicings: [{ frets: [-1,4,3,4,2,1] }] },
  { root: 'C#', type: '6',      voicings: [{ frets: [-1,4,3,3,2,1] }] },
  { root: 'C#', type: 'm6',     voicings: [{ frets: [-1,4,6,6,6,4], startFret: 4 }] },
  { root: 'C#', type: '9',      voicings: [{ frets: [-1,4,3,4,4,4], startFret: 1 }] },
  { root: 'C#', type: 'maj9',   voicings: [{ frets: [-1,4,3,1,4,1], startFret: 1 }] },
  { root: 'C#', type: '5',      voicings: [{ frets: [-1,4,6,-1,-1,-1], startFret: 4 }] },

  // ── D ──────────────────────────────────────────────────────────────
  { root: 'D', type: 'major',  voicings: [{ frets: [-1,-1,0,2,3,2] }] },
  { root: 'D', type: 'minor',  voicings: [{ frets: [-1,-1,0,2,3,1] }] },
  { root: 'D', type: 'sus2',   voicings: [{ frets: [-1,-1,0,2,3,0] }] },
  { root: 'D', type: 'sus4',   voicings: [{ frets: [-1,-1,0,2,3,3] }] },
  { root: 'D', type: 'aug',    voicings: [{ frets: [-1,-1,0,3,3,2] }] },
  { root: 'D', type: 'dim',    voicings: [{ frets: [-1,-1,0,1,0,1] }] },
  { root: 'D', type: 'dim7',   voicings: [{ frets: [-1,-1,0,1,0,1] }] },
  { root: 'D', type: 'm7b5',   voicings: [{ frets: [-1,-1,0,1,3,1] }] },
  { root: 'D', type: 'add9',   voicings: [{ frets: [-1,-1,0,2,3,0] }] },
  { root: 'D', type: 'add4',   voicings: [{ frets: [-1,-1,0,2,3,3] }] },
  { root: 'D', type: 'add7',   voicings: [{ frets: [-1,-1,0,2,1,2] }] },
  { root: 'D', type: 'maj7',   voicings: [{ frets: [-1,-1,0,2,2,2] }] },
  { root: 'D', type: 'm7',     voicings: [{ frets: [-1,-1,0,2,1,1] }] },
  { root: 'D', type: '7',      voicings: [{ frets: [-1,-1,0,2,1,2] }] },
  { root: 'D', type: '6',      voicings: [{ frets: [-1,-1,0,2,0,2] }] },
  { root: 'D', type: 'm6',     voicings: [{ frets: [-1,-1,0,2,0,1] }] },
  { root: 'D', type: '9',      voicings: [{ frets: [-1,-1,0,2,1,0] }] },
  { root: 'D', type: 'maj9',   voicings: [{ frets: [-1,-1,0,2,2,0] }] },
  { root: 'D', type: '5',      voicings: [{ frets: [-1,-1,0,2,-1,-1] }] },

  // ── D# / Eb ────────────────────────────────────────────────────────
  { root: 'D#', type: 'major',  voicings: [{ frets: [-1,-1,1,3,4,3] }] },
  { root: 'D#', type: 'minor',  voicings: [{ frets: [-1,-1,1,3,4,2] }] },
  { root: 'D#', type: 'sus2',   voicings: [{ frets: [-1,-1,1,3,4,1] }] },
  { root: 'D#', type: 'sus4',   voicings: [{ frets: [-1,-1,1,3,4,4] }] },
  { root: 'D#', type: 'aug',    voicings: [{ frets: [-1,-1,1,0,0,3] }] },
  { root: 'D#', type: 'dim',    voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'D#', type: 'dim7',   voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'D#', type: 'm7b5',   voicings: [{ frets: [-1,6,7,6,7,6], startFret: 6 }] },
  { root: 'D#', type: 'add9',   voicings: [{ frets: [-1,-1,1,3,4,1] }] },
  { root: 'D#', type: 'add4',   voicings: [{ frets: [-1,-1,1,3,4,4] }] },
  { root: 'D#', type: 'add7',   voicings: [{ frets: [-1,-1,1,3,2,3] }] },
  { root: 'D#', type: 'maj7',   voicings: [{ frets: [-1,-1,1,3,3,3] }] },
  { root: 'D#', type: 'm7',     voicings: [{ frets: [-1,-1,1,3,2,2] }] },
  { root: 'D#', type: '7',      voicings: [{ frets: [-1,-1,1,3,2,3] }] },
  { root: 'D#', type: '6',      voicings: [{ frets: [-1,-1,1,3,1,3] }] },
  { root: 'D#', type: 'm6',     voicings: [{ frets: [-1,-1,1,3,1,2] }] },
  { root: 'D#', type: '9',      voicings: [{ frets: [-1,6,5,6,6,6], startFret: 5 }] },
  { root: 'D#', type: 'maj9',   voicings: [{ frets: [-1,-1,1,3,3,1] }] },
  { root: 'D#', type: '5',      voicings: [{ frets: [-1,-1,1,3,-1,-1] }] },

  // ── E ──────────────────────────────────────────────────────────────
  { root: 'E', type: 'major',  voicings: [{ frets: [0,2,2,1,0,0] }] },
  { root: 'E', type: 'minor',  voicings: [{ frets: [0,2,2,0,0,0] }] },
  { root: 'E', type: 'sus2',   voicings: [{ frets: [0,2,2,4,0,0] }] },
  { root: 'E', type: 'sus4',   voicings: [{ frets: [0,2,2,2,0,0] }] },
  { root: 'E', type: 'aug',    voicings: [{ frets: [0,3,2,1,0,0] }] },
  { root: 'E', type: 'dim',    voicings: [{ frets: [0,1,2,3,2,-1] }] },
  { root: 'E', type: 'dim7',   voicings: [{ frets: [-1,-1,2,3,2,3] }] },
  { root: 'E', type: 'm7b5',   voicings: [{ frets: [0,1,0,0,0,-1] }] },
  { root: 'E', type: 'add9',   voicings: [{ frets: [0,2,2,1,0,2] }] },
  { root: 'E', type: 'add4',   voicings: [{ frets: [0,2,2,1,0,0] }] },
  { root: 'E', type: 'add7',   voicings: [{ frets: [0,2,2,1,3,0] }] },
  { root: 'E', type: 'maj7',   voicings: [{ frets: [0,2,1,1,0,0] }] },
  { root: 'E', type: 'm7',     voicings: [{ frets: [0,2,2,0,3,0] }] },
  { root: 'E', type: '7',      voicings: [{ frets: [0,2,0,1,0,0] }] },
  { root: 'E', type: '6',      voicings: [{ frets: [0,2,2,1,2,0] }] },
  { root: 'E', type: 'm6',     voicings: [{ frets: [0,2,2,0,2,0] }] },
  { root: 'E', type: '9',      voicings: [{ frets: [0,2,0,1,0,2] }] },
  { root: 'E', type: 'maj9',   voicings: [{ frets: [0,2,1,1,0,2] }] },
  { root: 'E', type: '5',      voicings: [{ frets: [0,2,-1,-1,-1,-1] }] },

  // ── F ──────────────────────────────────────────────────────────────
  { root: 'F', type: 'major',  voicings: [{ frets: [1,3,3,2,1,1], barre: { fret: 1, fromString: 1, toString: 6 } }] },
  { root: 'F', type: 'minor',  voicings: [{ frets: [1,3,3,1,1,1], barre: { fret: 1, fromString: 1, toString: 6 } }] },
  { root: 'F', type: 'sus2',   voicings: [{ frets: [-1,-1,3,0,1,1] }] },
  { root: 'F', type: 'sus4',   voicings: [{ frets: [1,3,3,3,1,1], barre: { fret: 1, fromString: 1, toString: 6 } }] },
  { root: 'F', type: 'aug',    voicings: [{ frets: [-1,-1,3,2,2,1] }] },
  { root: 'F', type: 'dim',    voicings: [{ frets: [-1,-1,0,1,0,1] }] },
  { root: 'F', type: 'dim7',   voicings: [{ frets: [-1,-1,0,1,0,1] }] },
  { root: 'F', type: 'm7b5',   voicings: [{ frets: [1,2,3,1,1,1], startFret: 1 }] },
  { root: 'F', type: 'add9',   voicings: [{ frets: [-1,-1,3,0,1,1] }] },
  { root: 'F', type: 'add4',   voicings: [{ frets: [1,3,3,3,1,1], barre: { fret: 1, fromString: 1, toString: 6 } }] },
  { root: 'F', type: 'add7',   voicings: [{ frets: [1,3,3,2,4,1], startFret: 1 }] },
  { root: 'F', type: 'maj7',   voicings: [{ frets: [-1,-1,3,2,1,0] }] },
  { root: 'F', type: 'm7',     voicings: [{ frets: [1,3,3,1,4,1], startFret: 1 }] },
  { root: 'F', type: '7',      voicings: [{ frets: [1,3,1,2,1,1], barre: { fret: 1, fromString: 1, toString: 6 } }] },
  { root: 'F', type: '6',      voicings: [{ frets: [-1,-1,3,2,3,1] }] },
  { root: 'F', type: 'm6',     voicings: [{ frets: [-1,-1,0,1,1,1] }] },
  { root: 'F', type: '9',      voicings: [{ frets: [1,3,1,2,1,3], startFret: 1 }] },
  { root: 'F', type: 'maj9',   voicings: [{ frets: [-1,-1,3,2,1,3] }] },
  { root: 'F', type: '5',      voicings: [{ frets: [1,3,-1,-1,-1,-1] }] },

  // ── F# / Gb ────────────────────────────────────────────────────────
  { root: 'F#', type: 'major',  voicings: [{ frets: [2,4,4,3,2,2], barre: { fret: 2, fromString: 1, toString: 6 }, startFret: 2 }] },
  { root: 'F#', type: 'minor',  voicings: [{ frets: [2,4,4,2,2,2], barre: { fret: 2, fromString: 1, toString: 6 }, startFret: 2 }] },
  { root: 'F#', type: 'sus2',   voicings: [{ frets: [2,4,4,1,2,2], startFret: 2 }] },
  { root: 'F#', type: 'sus4',   voicings: [{ frets: [2,4,4,4,2,2], startFret: 2 }] },
  { root: 'F#', type: 'aug',    voicings: [{ frets: [-1,-1,4,3,3,2] }] },
  { root: 'F#', type: 'dim',    voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'F#', type: 'dim7',   voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'F#', type: 'm7b5',   voicings: [{ frets: [2,3,4,2,2,2], startFret: 2 }] },
  { root: 'F#', type: 'add9',   voicings: [{ frets: [2,4,4,3,2,4], startFret: 2 }] },
  { root: 'F#', type: 'add4',   voicings: [{ frets: [2,4,4,4,2,2], startFret: 2 }] },
  { root: 'F#', type: 'add7',   voicings: [{ frets: [2,4,4,3,5,2], startFret: 2 }] },
  { root: 'F#', type: 'maj7',   voicings: [{ frets: [2,4,3,3,2,2], startFret: 2 }] },
  { root: 'F#', type: 'm7',     voicings: [{ frets: [2,4,4,2,5,2], startFret: 2 }] },
  { root: 'F#', type: '7',      voicings: [{ frets: [2,4,2,3,2,2], startFret: 2 }] },
  { root: 'F#', type: '6',      voicings: [{ frets: [2,4,4,3,4,2], startFret: 2 }] },
  { root: 'F#', type: 'm6',     voicings: [{ frets: [2,4,4,2,4,2], startFret: 2 }] },
  { root: 'F#', type: '9',      voicings: [{ frets: [2,4,2,3,2,4], startFret: 2 }] },
  { root: 'F#', type: 'maj9',   voicings: [{ frets: [2,4,3,3,2,4], startFret: 2 }] },
  { root: 'F#', type: '5',      voicings: [{ frets: [2,4,-1,-1,-1,-1], startFret: 2 }] },

  // ── G ──────────────────────────────────────────────────────────────
  { root: 'G', type: 'major',  voicings: [{ frets: [3,2,0,0,0,3] }] },
  { root: 'G', type: 'minor',  voicings: [{ frets: [3,5,5,3,3,3], barre: { fret: 3, fromString: 1, toString: 6 }, startFret: 3 }] },
  { root: 'G', type: 'sus2',   voicings: [{ frets: [3,0,0,0,3,3] }] },
  { root: 'G', type: 'sus4',   voicings: [{ frets: [3,5,5,5,3,3], startFret: 3 }] },
  { root: 'G', type: 'aug',    voicings: [{ frets: [3,2,1,0,0,-1] }] },
  { root: 'G', type: 'dim',    voicings: [{ frets: [-1,-1,2,3,2,3] }] },
  { root: 'G', type: 'dim7',   voicings: [{ frets: [3,-1,2,3,2,-1] }] },
  { root: 'G', type: 'm7b5',   voicings: [{ frets: [3,4,5,3,3,3], startFret: 3 }] },
  { root: 'G', type: 'add9',   voicings: [{ frets: [3,2,0,0,0,0] }] },
  { root: 'G', type: 'add4',   voicings: [{ frets: [3,2,0,0,1,3] }] },
  { root: 'G', type: 'add7',   voicings: [{ frets: [3,2,0,0,0,1] }] },
  { root: 'G', type: 'maj7',   voicings: [{ frets: [3,2,0,0,0,2] }] },
  { root: 'G', type: 'm7',     voicings: [{ frets: [3,5,5,3,6,3], startFret: 3 }] },
  { root: 'G', type: '7',      voicings: [{ frets: [3,2,0,0,0,1] }] },
  { root: 'G', type: '6',      voicings: [{ frets: [3,2,0,0,0,0] }] },
  { root: 'G', type: 'm6',     voicings: [{ frets: [3,5,5,3,5,3], startFret: 3 }] },
  { root: 'G', type: '9',      voicings: [{ frets: [3,2,0,0,0,0] }] },
  { root: 'G', type: 'maj9',   voicings: [{ frets: [3,2,0,2,0,2] }] },
  { root: 'G', type: '5',      voicings: [{ frets: [3,5,-1,-1,-1,-1], startFret: 3 }] },

  // ── G# / Ab ────────────────────────────────────────────────────────
  { root: 'G#', type: 'major',  voicings: [{ frets: [4,6,6,5,4,4], barre: { fret: 4, fromString: 1, toString: 6 }, startFret: 4 }] },
  { root: 'G#', type: 'minor',  voicings: [{ frets: [4,6,6,4,4,4], barre: { fret: 4, fromString: 1, toString: 6 }, startFret: 4 }] },
  { root: 'G#', type: 'sus2',   voicings: [{ frets: [4,6,6,3,4,4], startFret: 3 }] },
  { root: 'G#', type: 'sus4',   voicings: [{ frets: [4,6,6,6,4,4], startFret: 4 }] },
  { root: 'G#', type: 'aug',    voicings: [{ frets: [-1,-1,1,0,0,3] }] },
  { root: 'G#', type: 'dim',    voicings: [{ frets: [-1,-1,3,4,3,4] }] },
  { root: 'G#', type: 'dim7',   voicings: [{ frets: [-1,-1,3,4,3,4] }] },
  { root: 'G#', type: 'm7b5',   voicings: [{ frets: [4,5,6,4,4,4], startFret: 4 }] },
  { root: 'G#', type: 'add9',   voicings: [{ frets: [4,6,6,5,4,6], startFret: 4 }] },
  { root: 'G#', type: 'add4',   voicings: [{ frets: [4,6,6,6,4,4], startFret: 4 }] },
  { root: 'G#', type: 'add7',   voicings: [{ frets: [4,6,6,5,7,4], startFret: 4 }] },
  { root: 'G#', type: 'maj7',   voicings: [{ frets: [4,6,5,5,4,4], startFret: 4 }] },
  { root: 'G#', type: 'm7',     voicings: [{ frets: [4,6,6,4,7,4], startFret: 4 }] },
  { root: 'G#', type: '7',      voicings: [{ frets: [4,6,4,5,4,4], startFret: 4 }] },
  { root: 'G#', type: '6',      voicings: [{ frets: [4,6,6,5,6,4], startFret: 4 }] },
  { root: 'G#', type: 'm6',     voicings: [{ frets: [4,6,6,4,6,4], startFret: 4 }] },
  { root: 'G#', type: '9',      voicings: [{ frets: [4,6,4,5,4,6], startFret: 4 }] },
  { root: 'G#', type: 'maj9',   voicings: [{ frets: [4,6,5,5,4,6], startFret: 4 }] },
  { root: 'G#', type: '5',      voicings: [{ frets: [4,6,-1,-1,-1,-1], startFret: 4 }] },

  // ── A ──────────────────────────────────────────────────────────────
  { root: 'A', type: 'major',  voicings: [{ frets: [-1,0,2,2,2,0] }] },
  { root: 'A', type: 'minor',  voicings: [{ frets: [-1,0,2,2,1,0] }] },
  { root: 'A', type: 'sus2',   voicings: [{ frets: [-1,0,2,2,0,0] }] },
  { root: 'A', type: 'sus4',   voicings: [{ frets: [-1,0,2,2,3,0] }] },
  { root: 'A', type: 'aug',    voicings: [{ frets: [-1,0,3,2,2,1] }] },
  { root: 'A', type: 'dim',    voicings: [{ frets: [-1,0,1,2,1,2] }] },
  { root: 'A', type: 'dim7',   voicings: [{ frets: [-1,0,1,2,1,2] }] },
  { root: 'A', type: 'm7b5',   voicings: [{ frets: [-1,0,1,2,0,1] }] },
  { root: 'A', type: 'add9',   voicings: [{ frets: [-1,0,2,2,2,2] }] },
  { root: 'A', type: 'add4',   voicings: [{ frets: [-1,0,2,2,3,0] }] },
  { root: 'A', type: 'add7',   voicings: [{ frets: [-1,0,2,2,2,3] }] },
  { root: 'A', type: 'maj7',   voicings: [{ frets: [-1,0,2,1,2,0] }] },
  { root: 'A', type: 'm7',     voicings: [{ frets: [-1,0,2,0,1,0] }] },
  { root: 'A', type: '7',      voicings: [{ frets: [-1,0,2,0,2,0] }] },
  { root: 'A', type: '6',      voicings: [{ frets: [-1,0,2,2,2,2] }] },
  { root: 'A', type: 'm6',     voicings: [{ frets: [-1,0,2,2,1,2] }] },
  { root: 'A', type: '9',      voicings: [{ frets: [-1,0,2,0,2,2] }] },
  { root: 'A', type: 'maj9',   voicings: [{ frets: [-1,0,2,1,2,2] }] },
  { root: 'A', type: '5',      voicings: [{ frets: [-1,0,2,-1,-1,-1] }] },

  // ── A# / Bb ────────────────────────────────────────────────────────
  { root: 'A#', type: 'major',  voicings: [{ frets: [-1,1,3,3,3,1], barre: { fret: 1, fromString: 2, toString: 5 } }] },
  { root: 'A#', type: 'minor',  voicings: [{ frets: [-1,1,3,3,2,1], barre: { fret: 1, fromString: 1, toString: 5 } }] },
  { root: 'A#', type: 'sus2',   voicings: [{ frets: [-1,1,3,3,1,1], startFret: 1 }] },
  { root: 'A#', type: 'sus4',   voicings: [{ frets: [-1,1,3,3,4,1], startFret: 1 }] },
  { root: 'A#', type: 'aug',    voicings: [{ frets: [-1,-1,0,3,3,2] }] },
  { root: 'A#', type: 'dim',    voicings: [{ frets: [-1,-1,3,4,3,4] }] },
  { root: 'A#', type: 'dim7',   voicings: [{ frets: [-1,-1,0,1,0,1] }] },
  { root: 'A#', type: 'm7b5',   voicings: [{ frets: [-1,1,2,3,2,1], startFret: 1 }] },
  { root: 'A#', type: 'add9',   voicings: [{ frets: [-1,1,3,3,3,3], startFret: 1 }] },
  { root: 'A#', type: 'add4',   voicings: [{ frets: [-1,1,3,3,4,1], startFret: 1 }] },
  { root: 'A#', type: 'add7',   voicings: [{ frets: [-1,1,3,3,3,4], startFret: 1 }] },
  { root: 'A#', type: 'maj7',   voicings: [{ frets: [-1,1,3,2,3,1], startFret: 1 }] },
  { root: 'A#', type: 'm7',     voicings: [{ frets: [-1,1,3,1,2,1], startFret: 1 }] },
  { root: 'A#', type: '7',      voicings: [{ frets: [-1,1,3,1,3,1], startFret: 1 }] },
  { root: 'A#', type: '6',      voicings: [{ frets: [-1,1,3,3,3,3], startFret: 1 }] },
  { root: 'A#', type: 'm6',     voicings: [{ frets: [-1,1,3,3,2,3], startFret: 1 }] },
  { root: 'A#', type: '9',      voicings: [{ frets: [-1,1,3,1,3,3], startFret: 1 }] },
  { root: 'A#', type: 'maj9',   voicings: [{ frets: [-1,1,3,2,3,3], startFret: 1 }] },
  { root: 'A#', type: '5',      voicings: [{ frets: [-1,1,3,-1,-1,-1] }] },

  // ── B ──────────────────────────────────────────────────────────────
  { root: 'B', type: 'major',  voicings: [{ frets: [-1,2,4,4,4,2], barre: { fret: 2, fromString: 1, toString: 5 }, startFret: 2 }] },
  { root: 'B', type: 'minor',  voicings: [{ frets: [-1,2,4,4,3,2], barre: { fret: 2, fromString: 1, toString: 5 }, startFret: 2 }] },
  { root: 'B', type: 'sus2',   voicings: [{ frets: [-1,2,4,4,2,2], startFret: 2 }] },
  { root: 'B', type: 'sus4',   voicings: [{ frets: [-1,2,4,4,5,2], startFret: 2 }] },
  { root: 'B', type: 'aug',    voicings: [{ frets: [-1,2,1,0,0,3] }] },
  { root: 'B', type: 'dim',    voicings: [{ frets: [-1,2,3,4,3,-1] }] },
  { root: 'B', type: 'dim7',   voicings: [{ frets: [-1,-1,1,2,1,2] }] },
  { root: 'B', type: 'm7b5',   voicings: [{ frets: [-1,2,3,2,3,2], startFret: 2 }] },
  { root: 'B', type: 'add9',   voicings: [{ frets: [-1,2,4,4,4,4], startFret: 2 }] },
  { root: 'B', type: 'add4',   voicings: [{ frets: [-1,2,4,4,5,2], startFret: 2 }] },
  { root: 'B', type: 'add7',   voicings: [{ frets: [-1,2,4,4,4,5], startFret: 2 }] },
  { root: 'B', type: 'maj7',   voicings: [{ frets: [-1,2,4,3,4,2], startFret: 2 }] },
  { root: 'B', type: 'm7',     voicings: [{ frets: [-1,2,4,2,3,2], startFret: 2 }] },
  { root: 'B', type: '7',      voicings: [{ frets: [-1,2,4,2,4,2], startFret: 2 }] },
  { root: 'B', type: '6',      voicings: [{ frets: [-1,2,4,4,4,4], startFret: 2 }] },
  { root: 'B', type: 'm6',     voicings: [{ frets: [-1,2,4,4,3,4], startFret: 2 }] },
  { root: 'B', type: '9',      voicings: [{ frets: [-1,2,4,2,4,4], startFret: 2 }] },
  { root: 'B', type: 'maj9',   voicings: [{ frets: [-1,2,4,3,4,4], startFret: 2 }] },
  { root: 'B', type: '5',      voicings: [{ frets: [-1,2,4,-1,-1,-1], startFret: 2 }] },
];
