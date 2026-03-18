// Frets: index 0 = lowest string, index n-1 = highest string. -1 = muted, 0 = open, 1+ = fret number
export type Frets = number[];

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

export interface GuitarTuning {
  id: string;
  label: string;
  stringCount: 6 | 7 | 8;
  openMidi: number[];    // low→high
  stringNames: string[]; // low→high
}

export const GUITAR_TUNINGS: GuitarTuning[] = [
  // 6-string
  { id: 'standard-6',    label: 'Standard (EADGBE)',        stringCount: 6, openMidi: [40,45,50,55,59,64], stringNames: ['E','A','D','G','B','e'] },
  { id: 'eb-standard-6', label: 'Eb Standard',              stringCount: 6, openMidi: [39,44,49,54,58,63], stringNames: ['Eb','Ab','Db','Gb','Bb','eb'] },
  { id: 'd-standard-6',  label: 'D Standard (DGCFAD)',      stringCount: 6, openMidi: [38,43,48,53,57,62], stringNames: ['D','G','C','F','A','d'] },
  { id: 'drop-d-6',      label: 'Drop D (DADGBE)',          stringCount: 6, openMidi: [38,45,50,55,59,64], stringNames: ['D','A','D','G','B','e'] },
  { id: 'drop-c-6',      label: 'Drop C (CGCFAD)',          stringCount: 6, openMidi: [36,43,48,53,57,62], stringNames: ['C','G','C','F','A','d'] },
  { id: 'open-g-6',      label: 'Open G (DGDGBD)',          stringCount: 6, openMidi: [38,43,50,55,59,62], stringNames: ['D','G','D','G','B','D'] },
  { id: 'dadgad-6',      label: 'DADGAD',                   stringCount: 6, openMidi: [38,45,50,55,57,62], stringNames: ['D','A','D','G','A','D'] },
  // 7-string
  { id: 'b-standard-7',  label: 'B Standard (BEADGBe)',     stringCount: 7, openMidi: [35,40,45,50,55,59,64], stringNames: ['B','E','A','D','G','B','e'] },
  { id: 'drop-a-7',      label: 'Drop A (AEADGBe)',         stringCount: 7, openMidi: [33,40,45,50,55,59,64], stringNames: ['A','E','A','D','G','B','e'] },
  { id: 'bb-standard-7', label: 'Bb Standard',              stringCount: 7, openMidi: [34,39,44,49,54,58,63], stringNames: ['Bb','Eb','Ab','Db','Gb','Bb','eb'] },
  // 8-string
  { id: 'f#-standard-8', label: 'F# Standard (F#BEADGBe)',  stringCount: 8, openMidi: [30,35,40,45,50,55,59,64], stringNames: ['F#','B','E','A','D','G','B','e'] },
  { id: 'drop-e-8',      label: 'Drop E (EBEADGBe)',        stringCount: 8, openMidi: [28,35,40,45,50,55,59,64], stringNames: ['E','B','E','A','D','G','B','e'] },
  { id: 'f-standard-8',  label: 'F Standard',               stringCount: 8, openMidi: [29,34,39,44,49,54,58,63], stringNames: ['F','Bb','Eb','Ab','Db','Gb','Bb','eb'] },
];

export const DEFAULT_TUNING_ID = 'standard-6';

export function getTuningById(id: string): GuitarTuning {
  return GUITAR_TUNINGS.find(t => t.id === id) ?? GUITAR_TUNINGS[0];
}

const ROOT_NOTE_TO_PC: Record<RootNote, number> = {
  'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11,
};

function addExtraStrings(entry: ChordEntry, extraOpenMidi: number[]): ChordEntry {
  const rootPc = ROOT_NOTE_TO_PC[entry.root];
  const extraCount = extraOpenMidi.length;
  const newVoicings = entry.voicings.map(voicing => {
    let frets: number[] = [...voicing.frets];
    for (let e = extraOpenMidi.length - 1; e >= 0; e--) {
      const semis = (rootPc - (extraOpenMidi[e] % 12) + 12) % 12;
      frets = [semis === 0 ? 0 : semis <= 4 ? semis : -1, ...frets];
    }
    const barre = voicing.barre
      ? { ...voicing.barre, fromString: voicing.barre.fromString + extraCount, toString: voicing.barre.toString + extraCount }
      : undefined;
    return { ...voicing, frets, barre };
  });
  return { ...entry, voicings: newVoicings };
}

const STANDARD_6_OPEN_MIDI = [40, 45, 50, 55, 59, 64];

// After transposing frets, detect whether a barre makes sense:
// a barre at fret F from string S1 to S2 requires that every string in [S1,S2]
// is either muted or fretted at F or higher (no lower non-muted fret in the range).
function detectBarre(frets: number[]): Barre | undefined {
  const uniqueFrets = [...new Set(frets.filter(f => f > 0))];
  let best: Barre | undefined;
  let bestSpan = 1;

  for (const fv of uniqueFrets) {
    const first = frets.indexOf(fv);
    const last = frets.lastIndexOf(fv);
    if (last - first < 1) continue; // only one occurrence
    // All non-muted strings between first and last must be >= fv
    let valid = true;
    for (let i = first; i <= last; i++) {
      if (frets[i] >= 0 && frets[i] < fv) { valid = false; break; }
    }
    if (valid && last - first + 1 > bestSpan) {
      bestSpan = last - first + 1;
      best = { fret: fv, fromString: first + 1, toString: last + 1 };
    }
  }
  return best;
}

function transpose6StringVoicing(voicing: ChordVoicing, newOpenMidi: number[]): ChordVoicing {
  const newFrets = voicing.frets.map((fret, i) => {
    if (fret < 0) return -1;
    const midi = STANDARD_6_OPEN_MIDI[i] + fret;
    const nf = midi - newOpenMidi[i];
    return nf >= 0 && nf <= 15 ? nf : -1;
  });
  const frettedOnly = newFrets.filter(f => f > 0);
  const minFret = frettedOnly.length > 0 ? Math.min(...frettedOnly) : 0;
  const startFret = minFret > 1 ? minFret : undefined;
  const barre = detectBarre(newFrets);
  return { frets: newFrets, barre, startFret };
}

// Tuning-specific voicings for alternate 6-string tunings.
// All fret values verified against each tuning's openMidi: index 0 = lowest string.
// Drop D:  [D(38), A(45), D(50), G(55), B(59), e(64)]
// Open G:  [D(38), G(43), D(50), G(55), B(59), D(62)]
// DADGAD:  [D(38), A(45), D(50), G(55), A(57), D(62)]
const TUNING_SPECIFIC_CHORDS: Record<string, ChordEntry[]> = {
  'drop-d-6': [
    // D-family open voicings exploiting the low D string
    { root: 'D', type: 'major', voicings: [{ frets: [0,0,0,2,3,2] }] },          // D A D A D F#
    { root: 'D', type: 'minor', voicings: [{ frets: [0,0,0,2,3,1] }] },          // D A D A D F
    { root: 'D', type: '5',     voicings: [{ frets: [0,0,0,-1,-1,-1] }] },       // D A D
    { root: 'D', type: 'sus2',  voicings: [{ frets: [0,0,0,2,3,0] }] },          // D A D A D E
    { root: 'D', type: 'sus4',  voicings: [{ frets: [0,0,0,2,3,3] }] },          // D A D A D G
    { root: 'D', type: 'maj7',  voicings: [{ frets: [0,0,0,2,2,2] }] },          // D A D A C# F#
    { root: 'D', type: 'm7',    voicings: [{ frets: [0,0,0,2,1,1] }] },          // D A D A C F
    { root: 'D', type: '7',     voicings: [{ frets: [0,0,0,2,1,2] }] },          // D A D A C F#
    { root: 'D', type: '6',     voicings: [{ frets: [0,0,0,2,0,2] }] },          // D A D A B F#
    { root: 'D', type: 'add9',  voicings: [{ frets: [0,0,4,2,3,0] }] },          // D A F# A D E
    { root: 'D', type: '9',     voicings: [{ frets: [0,0,0,2,1,0] }] },          // D A D A C E
    { root: 'D', type: 'maj9',  voicings: [{ frets: [0,0,4,2,2,0] }] },          // D A F# A C# E
    { root: 'D', type: 'aug',   voicings: [{ frets: [0,0,0,3,3,2] }] },          // D A D Bb D F#
    { root: 'D', type: 'm6',    voicings: [{ frets: [0,0,0,2,0,1] }] },          // D A D A B F
    // G and A power chords using the low D string
    { root: 'G', type: '5',     voicings: [{ frets: [5,5,0,-1,-1,-1] }] },       // G D D
    { root: 'A', type: '5',     voicings: [{ frets: [-1,0,2,-1,-1,-1] }] },      // A E (strings 1-2)
  ],
  'open-g-6': [
    // G-family exploiting the all-open G chord
    { root: 'G', type: 'major', voicings: [{ frets: [0,0,0,0,0,0] }] },          // D G D G B D (all open)
    { root: 'G', type: 'minor', voicings: [{ frets: [0,0,0,3,3,0] }] },          // D G D Bb D D
    { root: 'G', type: '5',     voicings: [{ frets: [0,0,0,0,-1,-1] }] },        // D G D G
    { root: 'G', type: '6',     voicings: [{ frets: [0,0,0,0,0,2] }] },          // D G D G B E
    { root: 'G', type: '7',     voicings: [{ frets: [0,0,0,0,0,3] }] },          // D G D G B F
    { root: 'G', type: 'maj7',  voicings: [{ frets: [0,0,0,0,0,4] }] },          // D G D G B F#
    { root: 'G', type: 'm7',    voicings: [{ frets: [0,0,3,3,3,0] }] },          // D G F Bb D D
    { root: 'G', type: 'sus4',  voicings: [{ frets: [0,0,0,5,3,0] }] },          // D G D C D D
    { root: 'G', type: 'sus2',  voicings: [{ frets: [0,0,0,2,3,0] }] },          // D G D A D D
    { root: 'G', type: 'add9',  voicings: [{ frets: [0,0,2,0,0,0] }] },          // D G E G B D
    // Common barre chords idiomatic to Open G
    { root: 'C', type: 'major', voicings: [{ frets: [5,5,5,5,5,5], barre: { fret: 5, fromString: 1, toString: 6 }, startFret: 5 }] }, // G C G C E G
    { root: 'D', type: 'major', voicings: [{ frets: [7,7,7,7,7,7], barre: { fret: 7, fromString: 1, toString: 6 }, startFret: 7 }] }, // A D A D F# A
    { root: 'D', type: 'minor', voicings: [{ frets: [0,0,3,2,3,0] }] },          // D G F A D D
    { root: 'D', type: '7',     voicings: [{ frets: [0,0,4,2,1,0] }] },          // D G F# A C D
    { root: 'A', type: 'major', voicings: [{ frets: [2,2,2,2,2,2], barre: { fret: 2, fromString: 1, toString: 6 }, startFret: 2 }] }, // E A E A C# E
    { root: 'E', type: 'major', voicings: [{ frets: [2,1,2,1,0,2] }] },          // E G# E G# B E
  ],
  'dadgad-6': [
    // Open = Dsus4; modal drone chords exploiting paired D and A strings
    { root: 'D', type: 'sus4',  voicings: [{ frets: [0,0,0,0,0,0] }] },          // D A D G A D (all open)
    { root: 'D', type: 'major', voicings: [{ frets: [0,0,4,2,0,0] }] },          // D A F# A A D
    { root: 'D', type: 'minor', voicings: [{ frets: [0,0,3,2,0,0] }] },          // D A F A A D
    { root: 'D', type: '5',     voicings: [{ frets: [0,0,0,-1,-1,-1] }] },       // D A D
    { root: 'D', type: '7',     voicings: [{ frets: [0,0,4,2,3,0] }] },          // D A F# A C D
    { root: 'D', type: 'm7',    voicings: [{ frets: [0,0,3,2,3,0] }] },          // D A F A C D
    { root: 'D', type: 'sus2',  voicings: [{ frets: [0,0,2,2,0,0] }] },          // D A E A A D
    { root: 'G', type: 'major', voicings: [{ frets: [0,2,0,0,2,0] }] },          // D B D G B D
    { root: 'A', type: 'major', voicings: [{ frets: [0,0,2,2,4,2] }] },          // D A E A C# E
    { root: 'A', type: 'minor', voicings: [{ frets: [0,0,2,2,3,0] }] },          // D A E A C D
    { root: 'E', type: 'minor', voicings: [{ frets: [0,2,2,0,2,0] }] },          // D B E G B D
    { root: 'C', type: 'major', voicings: [{ frets: [0,3,2,0,3,2] }] },          // D C E G C E
  ],
};

export function getChordDatabase(tuning: GuitarTuning): ChordEntry[] {
  if (tuning.id === 'standard-6') return CHORD_DATABASE;
  if (tuning.stringCount === 6) {
    const transposed = CHORD_DATABASE.map(entry => ({
      ...entry,
      voicings: entry.voicings.map(v => transpose6StringVoicing(v, tuning.openMidi)),
    }));
    const specific = TUNING_SPECIFIC_CHORDS[tuning.id];
    if (!specific) return transposed;
    // Prepend tuning-specific voicings so they appear first in the diagram
    return transposed.map(entry => {
      const specificEntry = specific.find(s => s.root === entry.root && s.type === entry.type);
      if (!specificEntry) return entry;
      return { ...entry, voicings: [...specificEntry.voicings, ...entry.voicings] };
    });
  }
  const extraOpenMidi = tuning.openMidi.slice(0, tuning.stringCount - 6);
  return CHORD_DATABASE.map(entry => addExtraStrings(entry, extraOpenMidi));
}

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
