import type { LessonModule } from '../types';

export const alternatePickingModule: LessonModule = {
  id: 'alternate-picking',
  title: 'Alternate Picking',
  type: 'technique',
  description: 'Build speed and precision by strictly alternating downstrokes and upstrokes — the most fundamental picking technique for clean, fast playing.',
  lessons: [
    {
      id: 'alt-pick-1',
      moduleId: 'alternate-picking',
      title: 'Minor Pentatonic Single-String Run',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Skip the chromatic exercises — start with notes you\'ll actually use in solos. ' +
        'On the high e string, the A minor pentatonic lands on frets 5 (A), 8 (C), 10 (D), and 12 (E). ' +
        'Strictly alternate pick every note: down-up-down-up all the way up and back down.',
      practiceRoutine:
        'Play frets 5-8-10-12 ascending then 12-10-8-5 descending on the high e string with strict down-up alternate picking. ' +
        'Start at 60 BPM with eighth notes. It should sound musical — these are real solo notes.',
      tab: [
        { string: 'e', steps: ['5', '8', '10', '12', '12', '10', '8', '5', '|', '5', '8', '10', '12', '12', '10', '8', '5', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 8, color: 'accent' },
        { string: 5, fret: 10, color: 'default' },
        { string: 5, fret: 12, color: 'accent' },
      ],
      practiceNotes: {
        // high e: 5=A4(69), 8=C5(72), 10=D5(74), 12=E5(76)
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 5, fret: 12 },
          { string: 5, fret: 12 },
          { string: 5, fret: 10 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 5, fret: 12 },
          { string: 5, fret: 12 },
          { string: 5, fret: 10 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'alt-pick-2',
      moduleId: 'alternate-picking',
      title: 'Pentatonic Box 1: Two-String Crossing',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'The top two strings of the A minor pentatonic box 1 are behind virtually every rock and blues solo. ' +
        'High e gives you frets 5 (A) and 8 (C); B string gives you 5 (E) and 8 (G). ' +
        'Ascend through all four notes then descend — alternate picking throughout. The string crossing is what makes this exercise valuable.',
      practiceRoutine:
        'Ascend: e:5, e:8, B:5, B:8. Descend: B:8, B:5, e:8, e:5. Strict alternate picking throughout. ' +
        'The string crossing mid-phrase is the challenge — keep the pick motion consistent and don\'t hesitate. Start at 55 BPM.',
      tab: [
        { string: 'e', steps: ['5', '8', null, null, null, null, '8', '5', '|', '5', '8', null, null, null, null, '8', '5', '|'] },
        { string: 'B', steps: [null, null, '5', '8', '8', '5', null, null, '|', null, null, '5', '8', '8', '5', null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 8, color: 'accent' },
        { string: 4, fret: 5, color: 'default' },
        { string: 4, fret: 8, color: 'accent' },
      ],
      practiceNotes: {
        // high e: 5=A4(69), 8=C5(72); B: 5=E4(64), 8=G4(67)
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 4, fret: 5 },
          { string: 4, fret: 8 },
          { string: 4, fret: 8 },
          { string: 4, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 4, fret: 5 },
          { string: 4, fret: 8 },
          { string: 4, fret: 8 },
          { string: 4, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
        ],
        defaultBpm: 55,
      },
    },
    {
      id: 'alt-pick-3',
      moduleId: 'alternate-picking',
      title: 'Three-Note-Per-String Scale',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'Three-note-per-string (3NPS) patterns are the bread and butter of alternate picking. Playing 3 notes per string means ' +
        'you always cross strings on the same pick direction, creating a consistent feel. ' +
        'This is the pattern used by players like Paul Gilbert and John Petrucci for blazing scale runs.',
      practiceRoutine:
        'Play the A minor scale 3NPS ascending: high E (5-7-8), B (5-7-8), G (5-7-9), D (5-7-9), A (5-7-8), low E (5-7-8). ' +
        'Strict alternate picking throughout. Start at 50 BPM with triplets.',
      tab: [
        { string: 'e', steps: ['5', '7', '8', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, '5', '7', '8', null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, '5', '7', '9', null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, null, '5', '7', '9', null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '5', '7', '8', null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '5', '7', '8', '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
        { string: 4, fret: 5, color: 'default' },
        { string: 4, fret: 7, color: 'accent' },
        { string: 4, fret: 8, color: 'default' },
        { string: 3, fret: 5, color: 'default' },
        { string: 3, fret: 7, color: 'accent' },
        { string: 3, fret: 9, color: 'default' },
        { string: 2, fret: 5, color: 'default' },
        { string: 2, fret: 7, color: 'accent' },
        { string: 2, fret: 9, color: 'default' },
        { string: 1, fret: 5, color: 'default' },
        { string: 1, fret: 7, color: 'accent' },
        { string: 1, fret: 8, color: 'default' },
        { string: 0, fret: 5, color: 'default' },
        { string: 0, fret: 7, color: 'accent' },
        { string: 0, fret: 8, color: 'default' },
      ],
      practiceNotes: {
        // high e: 5=69,7=71,8=72; B: 5=64,7=66,8=67; G: 5=60,7=62,9=64; D: 5=55,7=57,9=59; A: 5=50,7=52,8=53; low E: 5=45,7=47,8=48
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 8 },
          { string: 4, fret: 5 },
          { string: 4, fret: 7 },
          { string: 4, fret: 8 },
          { string: 3, fret: 5 },
          { string: 3, fret: 7 },
          { string: 3, fret: 9 },
          { string: 2, fret: 5 },
          { string: 2, fret: 7 },
          { string: 2, fret: 9 },
          { string: 1, fret: 5 },
          { string: 1, fret: 7 },
          { string: 1, fret: 8 },
          { string: 0, fret: 5 },
          { string: 0, fret: 7 },
          { string: 0, fret: 8 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'alt-pick-4',
      moduleId: 'alternate-picking',
      title: 'Cross-String Pentatonic Sextuplet',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Three notes ascending on the high e string, three notes descending on the B string, cycling as sextuplets. ' +
        'Every string crossing here is an "inside" pick — the most demanding type, where the pick must pass between two strings mid-phrase. ' +
        'This exact pattern and its variants appear throughout Paul Gilbert\'s and John Petrucci\'s playing. ' +
        'All six notes (A-C-D-A-G-E) are from the A minor pentatonic, so it sounds like a real lick.',
      practiceRoutine:
        'Play e:5-8-10, then immediately B:10-8-5 as one continuous 6-note group. Every note strictly alternate picked — no sweeping. ' +
        'Start at 60 BPM with triplets (6 notes per beat). Upstrokes must match the volume of downstrokes.',
      tab: [
        { string: 'e', steps: ['5', '8', '10', null, null, null, '5', '8', '10', null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, '10', '8', '5', null, null, null, '10', '8', '5', '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 8, color: 'accent' },
        { string: 5, fret: 10, color: 'default' },
        { string: 4, fret: 10, color: 'root' },
        { string: 4, fret: 8, color: 'accent' },
        { string: 4, fret: 5, color: 'default' },
      ],
      practiceNotes: {
        // high e: 5=A4(69), 8=C5(72), 10=D5(74); B: 10=A4(69), 8=G4(67), 5=E4(64)
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 4, fret: 10 },
          { string: 4, fret: 8 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 4, fret: 10 },
          { string: 4, fret: 8 },
          { string: 4, fret: 5 },
        ],
        defaultBpm: 60,
      },
    },
  ],
};
