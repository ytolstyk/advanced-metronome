export const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type RootNote = typeof ROOT_NOTES[number];

export const ENHARMONIC: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  'D♭': 'C#', 'E♭': 'D#', 'G♭': 'F#', 'A♭': 'G#', 'B♭': 'A#',
};

export function normalizeRoot(raw: string): string | null {
  const s = raw.trim();
  if ((ROOT_NOTES as readonly string[]).includes(s)) return s;
  const mapped = ENHARMONIC[s];
  return mapped && (ROOT_NOTES as readonly string[]).includes(mapped) ? mapped : null;
}

// Quality aliases → canonical quality names.
// Must stay in sync with src/data/chords.ts CHORD_TYPES (cross-boundary duplication, forced by Lambda deployment).
export const QUALITY_MAP: Record<string, string> = {
  major: 'major', maj: 'major', M: 'major',
  minor: 'minor', min: 'minor', m: 'minor',
  '7': '7', dominant7: '7', dom7: '7', 'dominant 7': '7', dominant: '7',
  maj7: 'maj7', major7: 'maj7', 'major 7': 'maj7',
  m7: 'm7', minor7: 'm7', 'minor 7': 'm7', min7: 'm7',
  sus2: 'sus2', suspended2: 'sus2',
  sus4: 'sus4', suspended4: 'sus4',
  aug: 'aug', augmented: 'aug',
  dim: 'dim', diminished: 'dim',
  dim7: 'dim7', diminished7: 'dim7',
  m7b5: 'm7b5', 'half-diminished': 'm7b5', 'half diminished': 'm7b5', 'half-dim': 'm7b5',
  add9: 'add9', 'add 9': 'add9', add2: 'add9',
  add4: 'add4', 'add 4': 'add4',
  add7: 'add7', 'add 7': 'add7',
  '6': '6', major6: '6', maj6: '6',
  m6: 'm6', minor6: 'm6',
  '9': '9', dominant9: '9', dom9: '9',
  maj9: 'maj9', major9: 'maj9',
  '5': '5', power: '5', 'power chord': '5', powerchord: '5',
};

// Returns null for unrecognized qualities so callers can drop rather than silently map to 'major'.
export function normalizeQuality(raw: string): string | null {
  const key = raw.trim();
  return QUALITY_MAP[key] ?? QUALITY_MAP[key.toLowerCase()] ?? null;
}
