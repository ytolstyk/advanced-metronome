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
      title: 'Single-String Alternate Picking',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Alternate picking means strictly alternating between downstrokes (toward the floor) and upstrokes (toward the ceiling). ' +
        'Never use two downstrokes or two upstrokes in a row. This consistency builds speed and predictability. ' +
        'Start on one string with a simple chromatic exercise.',
      practiceRoutine:
        'On the high E string, play frets 5-6-7-8 with strict down-up-down-up picking. Then descend 8-7-6-5 continuing the alternation. ' +
        'Start at 60 BPM with eighth notes. Use a metronome and focus on perfectly even timing.',
      tab: [
        { string: 'e', steps: ['5', '6', '7', '8', '8', '7', '6', '5', '|', '5', '6', '7', '8', '8', '7', '6', '5', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|', null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 6, color: 'accent' },
        { string: 5, fret: 7, color: 'default' },
        { string: 5, fret: 8, color: 'accent' },
      ],
      practiceNotes: {
        // high e: 5=69, 6=70, 7=71, 8=72
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 6 },
          { string: 5, fret: 7 },
          { string: 5, fret: 8 },
          { string: 5, fret: 8 },
          { string: 5, fret: 7 },
          { string: 5, fret: 6 },
          { string: 5, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 6 },
          { string: 5, fret: 7 },
          { string: 5, fret: 8 },
          { string: 5, fret: 8 },
          { string: 5, fret: 7 },
          { string: 5, fret: 6 },
          { string: 5, fret: 5 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'alt-pick-2',
      moduleId: 'alternate-picking',
      title: 'Two-String Crossing',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'The challenge of alternate picking appears when crossing strings. When moving from a higher to a lower string on an upstroke, ' +
        'or from a lower to a higher string on a downstroke, the pick must "hop over" the string just played. ' +
        'Practice this transition slowly and deliberately.',
      practiceRoutine:
        'Play frets 5-7 on high E, then 5-7 on B string, alternating picks throughout (D-U-D-U). ' +
        'The string change happens between notes 2 and 3. Start at 50 BPM.',
      tab: [
        { string: 'e', steps: ['5', '7', null, null, '5', '7', null, null, '|'] },
        { string: 'B', steps: [null, null, '5', '7', null, null, '5', '7', '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'accent' },
        { string: 4, fret: 5, color: 'default' },
        { string: 4, fret: 7, color: 'accent' },
      ],
      practiceNotes: {
        // high e: 5=69, 7=71; B: 5=64, 7=66
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 4, fret: 5 },
          { string: 4, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 4, fret: 5 },
          { string: 4, fret: 7 },
        ],
        defaultBpm: 50,
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
      title: 'Speed Building: Sixteenth Note Bursts',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Build top speed with short bursts of sixteenth notes. Play 4 fast notes then rest, 4 fast notes then rest. ' +
        'This trains your muscles for speed without the fatigue of continuous playing. Gradually extend the burst length. ' +
        'Use minimal pick movement — the pick should barely clear the string.',
      practiceRoutine:
        'On the high E string: play frets 5-7-5-7 as a fast sixteenth-note burst, then rest for a beat. Repeat. ' +
        'Start at 80 BPM. The burst should be fast and clean, the rest should be complete silence.',
      tab: [
        { string: 'e', steps: ['5', '7', '5', '7', null, null, null, null, '5', '7', '5', '7', null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'accent' },
      ],
      practiceNotes: {
        // high e: 5=69, 7=71
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
        ],
        defaultBpm: 80,
      },
    },
  ],
};
