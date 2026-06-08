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

// ── Progression suggestions ────────────────────────────────────────────────

export interface ProgressionSuggestion {
  name: string;
  chords: string[];
}

type ProgContext = 'major' | 'minor';

interface ProgressionTemplate {
  pattern: string[];
  name: string;
  context: ProgContext;
}

const PROGRESSION_TEMPLATES: ProgressionTemplate[] = [
  { pattern: ['I', 'IV', 'V'],          name: 'I – IV – V',          context: 'major' },
  { pattern: ['I', 'V', 'vi', 'IV'],    name: 'I – V – vi – IV', context: 'major' },
  { pattern: ['I', 'vi', 'IV', 'V'],    name: 'I – vi – IV – V', context: 'major' },
  { pattern: ['ii', 'V', 'I'],          name: 'ii – V – I (jazz)',     context: 'major' },
  { pattern: ['vi', 'IV', 'I', 'V'],    name: 'vi – IV – I – V', context: 'major' },
  { pattern: ['i', 'VII', 'VI', 'VII'], name: 'i – VII – VI – VII',    context: 'minor' },
  { pattern: ['i', 'iv', 'VII', 'III'], name: 'i – iv – VII – III',   context: 'minor' },
  { pattern: ['i', 'VI', 'III', 'VII'], name: 'i – VI – III – VII',   context: 'minor' },
];

const NUMERAL_INFO: Record<ProgContext, Record<string, { degree: number; quality: DiatonicQuality }>> = {
  major: {
    'I':   { degree: 0, quality: 'major' },
    'ii':  { degree: 1, quality: 'minor' },
    'iii': { degree: 2, quality: 'minor' },
    'IV':  { degree: 3, quality: 'major' },
    'V':   { degree: 4, quality: 'major' },
    'vi':  { degree: 5, quality: 'minor' },
    'vii': { degree: 6, quality: 'dim'   },
  },
  minor: {
    'i':   { degree: 0, quality: 'minor' },
    'ii°': { degree: 1, quality: 'dim'   },
    'III': { degree: 2, quality: 'major' },
    'iv':  { degree: 3, quality: 'minor' },
    'v':   { degree: 4, quality: 'minor' },
    'VI':  { degree: 5, quality: 'major' },
    'VII': { degree: 6, quality: 'major' },
  },
};

function resolveNumeral(numeral: string, keyRoot: RootNote, context: ProgContext): string {
  const info = NUMERAL_INFO[context][numeral];
  if (!info) return numeral;
  const scaleOffsets = context === 'major' ? SCALE_INTERVALS['major'] : SCALE_INTERVALS['minor'];
  const keyPc = ROOT_NOTE_TO_PC[keyRoot];
  const notePc = (keyPc + scaleOffsets[info.degree]) % 12;
  const note = ROOT_NOTES[notePc];
  const suffix = info.quality === 'minor' ? 'm' : info.quality === 'dim' ? 'dim' : '';
  return note + suffix;
}

export function suggestProgressionsForChord(root: RootNote, type: ChordType): ProgressionSuggestion[] {
  const quality = simplifyQuality(type);
  if (quality === 'other') return [];

  const results: ProgressionSuggestion[] = [];
  const seen = new Set<string>();

  const prioritizedRoots = [root, ...ROOT_NOTES.filter((r) => r !== root)];
  for (const keyRoot of prioritizedRoots) {
    const keyPc = ROOT_NOTE_TO_PC[keyRoot];
    for (const context of ['major', 'minor'] as const) {
      const scaleOffsets = context === 'major' ? SCALE_INTERVALS['major'] : SCALE_INTERVALS['minor'];
      const diatonicQ = context === 'major' ? MAJOR_DIATONIC : MINOR_DIATONIC;

      for (let d = 0; d < 7; d++) {
        const degreePc = (keyPc + scaleOffsets[d]) % 12;
        if (degreePc !== ROOT_NOTE_TO_PC[root]) continue;
        if (diatonicQ[d] !== quality) continue;

        const degreeNumerals = Object.entries(NUMERAL_INFO[context])
          .filter(([, info]) => info.degree === d)
          .map(([n]) => n);

        for (const template of PROGRESSION_TEMPLATES) {
          if (template.context !== context) continue;
          if (!degreeNumerals.some((n) => template.pattern.includes(n))) continue;

          const chords = template.pattern.map((n) => resolveNumeral(n, keyRoot, context));
          const dedupeKey = chords.join('-');
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const keyLabel = context === 'major' ? `${keyRoot} major` : `${keyRoot} minor`;
          results.push({ name: `${template.name} in ${keyLabel}`, chords });

          if (results.length >= 8) return results;
        }
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
