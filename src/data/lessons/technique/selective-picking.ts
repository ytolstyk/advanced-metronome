import type { LessonModule } from '../types';

export const selectivePickingModule: LessonModule = {
  id: 'selective-picking',
  title: 'Economy / Selective Picking',
  type: 'technique',
  description: 'Minimize pick movement by using the most efficient stroke direction when crossing strings — sweep into the next string instead of alternating.',
  lessons: [
    {
      id: 'economy-1',
      moduleId: 'selective-picking',
      title: 'Economy Picking Concept',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Economy picking (also called selective picking) breaks the strict alternate picking rule: when moving to an adjacent string in the same direction, ' +
        'continue the pick stroke through to that string instead of reversing. ' +
        'For example, after a downstroke on the B string, sweep the downstroke through to the high E string. This saves one motion.',
      practiceRoutine:
        'Play 2 notes on B string (down-up), then 1 note on high E (down — sweeping through from B). ' +
        'Pattern: B fret 5 (D), B fret 7 (U), high E fret 5 (D). The high E should feel like the pick falls onto the string. Start at 50 BPM.',
      tab: [
        { string: 'e', steps: [null, null, '5', null, null, '5', '|'] },
        { string: 'B', steps: ['5', '7', null, '5', '7', null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 4, fret: 5, color: 'root' },
        { string: 4, fret: 7, color: 'accent' },
        { string: 5, fret: 5, color: 'default' },
      ],
      practiceNotes: {
        // B fret 5=59+5=64; B fret 7=59+7=66; high e fret 5=64+5=69
        steps: [
          { string: 4, fret: 5 },
          { string: 4, fret: 7 },
          { string: 5, fret: 5 },
          { string: 4, fret: 5 },
          { string: 4, fret: 7 },
          { string: 5, fret: 5 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'economy-2',
      moduleId: 'selective-picking',
      title: 'Ascending Economy Runs',
      difficulty: 'intermediate',
      order: 2,
      explanation:
        'When ascending (moving from low to high strings), economy picking means the last note on each string is a downstroke, ' +
        'which sweeps into the next string. With 3 notes per string, the pattern is Down-Up-Down (sweep to next string). ' +
        'This creates a flowing ascending motion with minimal pick travel.',
      practiceRoutine:
        'Play a G major scale ascending with 3 notes per string, economy picking: low E (7-9-10), A (7-9-10), D (7-9-11), G (7-9-10), B (8-10), high E (7-9-10). ' +
        'Start at 50 BPM with triplets.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '7', '9', '10', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '8', '10', null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, null, '7', '9', '10', null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '7', '9', '11', null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, '7', '9', '10', null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['7', '9', '10', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 7, color: 'root' },
        { string: 0, fret: 9, color: 'accent' },
        { string: 0, fret: 10, color: 'default' },
        { string: 1, fret: 7, color: 'default' },
        { string: 1, fret: 9, color: 'accent' },
        { string: 1, fret: 10, color: 'default' },
        { string: 2, fret: 7, color: 'default' },
        { string: 2, fret: 9, color: 'accent' },
        { string: 2, fret: 10, color: 'default' },
        { string: 3, fret: 7, color: 'default' },
        { string: 3, fret: 9, color: 'accent' },
        { string: 3, fret: 11, color: 'default' },
        { string: 4, fret: 8, color: 'default' },
        { string: 4, fret: 10, color: 'accent' },
        { string: 5, fret: 7, color: 'default' },
        { string: 5, fret: 9, color: 'accent' },
        { string: 5, fret: 10, color: 'default' },
      ],
      practiceNotes: {
        // low E: 7=47,9=49,10=50; A: 7=52,9=54,10=55; D: 7=57,9=59,11=61; G: 7=62,9=64,10=65; B: 8=67,10=69; high e: 7=71,9=73,10=74
        steps: [
          { string: 0, fret: 7 },
          { string: 0, fret: 9 },
          { string: 0, fret: 10 },
          { string: 1, fret: 7 },
          { string: 1, fret: 9 },
          { string: 1, fret: 10 },
          { string: 2, fret: 7 },
          { string: 2, fret: 9 },
          { string: 2, fret: 11 },
          { string: 3, fret: 7 },
          { string: 3, fret: 9 },
          { string: 3, fret: 10 },
          { string: 4, fret: 8 },
          { string: 4, fret: 10 },
          { string: 5, fret: 7 },
          { string: 5, fret: 9 },
          { string: 5, fret: 10 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'economy-3',
      moduleId: 'selective-picking',
      title: 'Descending Economy Runs',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'When descending, economy picking reverses: the last note on each string is an upstroke, which sweeps upward into the next (lower) string. ' +
        'With 2NPS pentatonic, the pattern is Up-Down on each string, sweep to next. ' +
        'Descending is often harder because upstrokes feel less natural as the sweeping stroke.',
      practiceRoutine:
        'Descend the A minor pentatonic: high E (8-5), B (8-5), G (7-5), D (7-5), A (7-5), low E (8-5). ' +
        'Use economy picking: upstroke-downstroke on each string, sweep to next. Start at 50 BPM.',
      tab: [
        { string: 'e', steps: ['8', '5', null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, '8', '5', null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, '7', '5', null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '7', '5', null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '7', '5', null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, '8', '5', '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 8, color: 'root' },
        { string: 5, fret: 5, color: 'accent' },
        { string: 4, fret: 8, color: 'default' },
        { string: 4, fret: 5, color: 'accent' },
        { string: 3, fret: 7, color: 'default' },
        { string: 3, fret: 5, color: 'accent' },
        { string: 2, fret: 7, color: 'default' },
        { string: 2, fret: 5, color: 'accent' },
        { string: 1, fret: 7, color: 'default' },
        { string: 1, fret: 5, color: 'accent' },
        { string: 0, fret: 8, color: 'default' },
        { string: 0, fret: 5, color: 'accent' },
      ],
      practiceNotes: {
        // high e: 8=72,5=69; B: 8=67,5=64; G: 7=62,5=60; D: 7=57,5=55; A: 7=52,5=50; low E: 8=48,5=45
        steps: [
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 4, fret: 8 },
          { string: 4, fret: 5 },
          { string: 3, fret: 7 },
          { string: 3, fret: 5 },
          { string: 2, fret: 7 },
          { string: 2, fret: 5 },
          { string: 1, fret: 7 },
          { string: 1, fret: 5 },
          { string: 0, fret: 8 },
          { string: 0, fret: 5 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'economy-4',
      moduleId: 'selective-picking',
      title: 'Mixed Economy and Alternate Picking',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Real-world playing requires switching between economy and alternate picking depending on the musical phrase. ' +
        'Use economy picking when crossing strings in the pick\'s travel direction, and alternate picking when reversing. ' +
        'The goal is efficiency — always choose the path of least pick movement.',
      practiceRoutine:
        'Play this phrase: ascend 3 notes on G string with economy sweep to B, play 2 on B with alternate pick back, sweep to high E. ' +
        'Practice slowly, analyzing each pick stroke. Start at 40 BPM.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, null, null, '5', '7', '8', '|'] },
        { string: 'B', steps: [null, null, null, null, null, '5', '7', '8', '5', null, null, null, null, '|'] },
        { string: 'G', steps: ['5', '7', '9', null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 5, color: 'root' },
        { string: 3, fret: 7, color: 'accent' },
        { string: 3, fret: 9, color: 'default' },
        { string: 4, fret: 5, color: 'default' },
        { string: 4, fret: 7, color: 'accent' },
        { string: 4, fret: 8, color: 'default' },
        { string: 5, fret: 5, color: 'default' },
        { string: 5, fret: 7, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
      ],
      practiceNotes: {
        // G: 5=60,7=62,9=64; B: 5=64,7=66,8=67; high e: 5=69,7=71,8=72
        steps: [
          { string: 3, fret: 5 },
          { string: 3, fret: 7 },
          { string: 3, fret: 9 },
          { string: 4, fret: 5 },
          { string: 4, fret: 7 },
          { string: 4, fret: 8 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 8 },
        ],
        defaultBpm: 40,
      },
    },
  ],
};
