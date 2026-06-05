import type { RootNote, ChordType } from '../data/chords';
import { ROOT_NOTE_TO_PC, ROOT_NOTES } from '../data/chords';
import { CHORD_INTERVALS } from '../audio/chordSynths';
import type { ScaleMode } from '../data/scales';
import { SCALE_INTERVALS, SCALE_MODES, SCALE_LABELS } from '../data/scales';

export interface ChordSlot {
  root: RootNote;
  type: ChordType;
}

export interface DetectedKey {
  root: RootNote;
  mode: 'major' | 'minor';
}

export interface ScaleSuggestion {
  root: RootNote;
  mode: ScaleMode;
  label: string;
}

// ── Diatonic chord qualities per scale degree ──────────────────────────────

type DiatonicQuality = 'major' | 'minor' | 'dim';

const MAJOR_DIATONIC: DiatonicQuality[] = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'];
const MINOR_DIATONIC: DiatonicQuality[] = ['minor', 'dim', 'major', 'minor', 'minor', 'major', 'major'];

// ── Quality helpers ────────────────────────────────────────────────────────

function simplifyQuality(type: ChordType): DiatonicQuality | 'other' {
  switch (type) {
    case 'major': case 'sus2': case 'sus4': case 'add9': case 'add4':
    case 'maj7': case '6': case '9': case 'maj9': case '5': case '7': case 'add7':
      return 'major';
    case 'minor': case 'm7': case 'm6':
      return 'minor';
    case 'dim': case 'dim7': case 'm7b5':
      return 'dim';
    default:
      return 'other';
  }
}

// ── Pitch class helpers ────────────────────────────────────────────────────

export function chordPitchClasses(root: RootNote, type: ChordType): Set<number> {
  const rootPc = ROOT_NOTE_TO_PC[root];
  const intervals = CHORD_INTERVALS[type] ?? [0, 4, 7];
  return new Set(intervals.map((i) => (rootPc + (i % 12) + 12) % 12));
}

// ── Key detection ──────────────────────────────────────────────────────────

export function detectKey(slots: (ChordSlot | null)[]): DetectedKey | null {
  const filled = slots.filter((s): s is ChordSlot => s !== null);
  if (filled.length === 0) return null;

  const filledRootPcs = new Set(filled.map((s) => ROOT_NOTE_TO_PC[s.root]));

  let bestScore = -1;
  let bestKey: DetectedKey | null = null;

  for (const root of ROOT_NOTES) {
    const keyPc = ROOT_NOTE_TO_PC[root];

    for (const mode of ['major', 'minor'] as const) {
      const scaleOffsets = mode === 'major' ? SCALE_INTERVALS['major'] : SCALE_INTERVALS['minor'];
      const diatonicQualities = mode === 'major' ? MAJOR_DIATONIC : MINOR_DIATONIC;

      const diatonic = scaleOffsets.map((offset, i) => ({
        pc: (keyPc + offset) % 12,
        quality: diatonicQualities[i],
      }));

      let score = 0;
      for (const slot of filled) {
        const slotPc = ROOT_NOTE_TO_PC[slot.root];
        const slotQ = simplifyQuality(slot.type);
        if (slotQ !== 'other' && diatonic.some((d) => d.pc === slotPc && d.quality === slotQ)) {
          score++;
        }
      }

      if (
        score > bestScore ||
        (score === bestScore && bestKey !== null && (
          // tie-break 1: prefer key whose root appears as a chord root
          (filledRootPcs.has(keyPc) && !filledRootPcs.has(ROOT_NOTE_TO_PC[bestKey.root])) ||
          // tie-break 2: prefer major over minor
          (filledRootPcs.has(keyPc) === filledRootPcs.has(ROOT_NOTE_TO_PC[bestKey.root]) &&
           mode === 'major' && bestKey.mode === 'minor')
        ))
      ) {
        bestScore = score;
        bestKey = { root, mode };
      }
    }
  }

  return bestKey;
}

// ── Roman numeral analysis ─────────────────────────────────────────────────

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

export function toRomanNumeral(root: RootNote, type: ChordType, key: DetectedKey): string {
  const keyPc = ROOT_NOTE_TO_PC[key.root];
  const slotPc = ROOT_NOTE_TO_PC[root];
  const scaleOffsets = key.mode === 'major' ? SCALE_INTERVALS['major'] : SCALE_INTERVALS['minor'];

  const scalePcs = scaleOffsets.map((o) => (keyPc + o) % 12);
  const degreeIndex = scalePcs.indexOf(slotPc);

  if (degreeIndex === -1) return '?';

  const quality = simplifyQuality(type);
  let numeral: string = NUMERALS[degreeIndex];

  if (quality === 'minor') numeral = numeral.toLowerCase();
  if (quality === 'dim') numeral = numeral.toLowerCase() + '°';

  // Extension suffixes
  switch (type) {
    case '7':    numeral += '7'; break;
    case 'm7':   numeral += '7'; break;
    case 'maj7': numeral += 'maj7'; break;
    case 'dim7': numeral = numeral.replace('°', '°7'); break;
    case '9':    numeral += '9'; break;
    case 'maj9': numeral += 'maj9'; break;
    case 'sus2': numeral += 'sus2'; break;
    case 'sus4': numeral += 'sus4'; break;
  }

  return numeral;
}

// ── Scale suggestions ──────────────────────────────────────────────────────

export function suggestScales(slots: (ChordSlot | null)[]): ScaleSuggestion[] {
  const filled = slots.filter((s): s is ChordSlot => s !== null);
  if (filled.length === 0) return [];

  const allPcs = new Set<number>();
  for (const slot of filled) {
    for (const pc of chordPitchClasses(slot.root, slot.type)) {
      allPcs.add(pc);
    }
  }

  const results: ScaleSuggestion[] = [];

  for (const root of ROOT_NOTES) {
    const rootPc = ROOT_NOTE_TO_PC[root];
    for (const mode of SCALE_MODES) {
      const scalePcs = new Set(SCALE_INTERVALS[mode].map((i) => (rootPc + i) % 12));
      if ([...allPcs].every((pc) => scalePcs.has(pc))) {
        results.push({ root, mode, label: `${root} ${SCALE_LABELS[mode]}` });
      }
    }
  }

  return results;
}

// ── Roman numeral input parser ─────────────────────────────────────────────

const ROMAN_DEGREE: Record<string, number> = {
  VII: 6, VI: 5, IV: 3, V: 4, III: 2, II: 1, I: 0,
  vii: 6, vi: 5, iv: 3, v: 4, iii: 2, ii: 1, i: 0,
};

const TOKEN_RE = /((?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))(maj7|m7b5|m7|dim7|dim|aug|sus4|sus2|add9|7|°)?/g;

function resolveType(numeral: string, suffix: string | undefined): ChordType {
  const isUpper = numeral === numeral.toUpperCase();
  if (!suffix) return isUpper ? 'major' : 'minor';
  switch (suffix) {
    case '7':    return isUpper ? '7' : 'm7';
    case 'maj7': return 'maj7';
    case 'm7':   return 'm7';
    case 'dim':  return 'dim';
    case 'dim7': return 'dim7';
    case '°':    return 'dim';
    case 'aug':  return 'aug';
    case 'sus2': return 'sus2';
    case 'sus4': return 'sus4';
    case 'add9': return 'add9';
    case 'm7b5': return 'm7b5';
    default:     return isUpper ? 'major' : 'minor';
  }
}

export function parseRomanNumeralInput(input: string, key: DetectedKey): (ChordSlot | null)[] {
  const slots: (ChordSlot | null)[] = new Array(8).fill(null);
  const scaleOffsets = key.mode === 'major' ? SCALE_INTERVALS['major'] : SCALE_INTERVALS['minor'];
  const keyPc = ROOT_NOTE_TO_PC[key.root];

  let i = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while (i < 8 && (match = TOKEN_RE.exec(input)) !== null) {
    const numeral = match[1];
    const suffix = match[2];
    const degreeIndex = ROMAN_DEGREE[numeral];
    if (degreeIndex === undefined) continue;

    const semitones = scaleOffsets[degreeIndex];
    const rootPc = (keyPc + semitones) % 12;
    const root = ROOT_NOTES[rootPc];
    const type = resolveType(numeral, suffix);

    slots[i++] = { root, type };
  }

  return slots;
}
