import type { LessonModule } from '../types';

export const sweepPickingModule: LessonModule = {
  id: 'sweep-picking',
  title: 'Sweep Picking',
  type: 'technique',
  description: 'Master the art of sweeping across strings with a single pick stroke to play fast, clean arpeggios and complex chord shapes.',
  lessons: [
    {
      id: 'sweep-1',
      moduleId: 'sweep-picking',
      title: 'Three-String Minor Sweep',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Sweep picking uses a single continuous pick motion across multiple strings. Think of it as a controlled "fall" — the pick rakes across strings in one direction. ' +
        'The key is muting: each finger lifts off immediately after the note sounds to prevent strings ringing together. ' +
        'Start with a simple 3-string Am arpeggio shape on G, B, and high E strings, all at fret 5.',
      practiceRoutine:
        'Play the Am arpeggio shape: G string fret 5, B string fret 5, high E string fret 5. Sweep downward (toward floor), then sweep upward to return. ' +
        'Use a metronome at 50 BPM. Each note should ring clearly and individually — no blurring.',
      tab: [
        { string: 'e', steps: [null, null, '5', null, null, '5', '|', null, null, '5', null, null, '5', '|'] },
        { string: 'B', steps: [null, '5', null, null, '5', null, '|', null, '5', null, null, '5', null, '|'] },
        { string: 'G', steps: ['5', null, null, '5', null, null, '|', '5', null, null, '5', null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 5, color: 'root' },
        { string: 4, fret: 5, color: 'accent' },
        { string: 5, fret: 5, color: 'default' },
      ],
      practiceNotes: {
        // G fret 5=55+5=60; B fret 5=59+5=64; high e fret 5=64+5=69
        steps: [
          { string: 3, fret: 5 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 4, fret: 5 },
          { string: 3, fret: 5 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 4, fret: 5 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'sweep-2',
      moduleId: 'sweep-picking',
      title: 'Three-String Major Sweep',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'Now apply the sweep technique to a major arpeggio shape. The C major shape at the 8th–9th position uses fret 9 on G, fret 8 on B, fret 8 on high E. ' +
        'Focus on the rolling motion of your fretting fingers — each finger presses down as the pick arrives and releases immediately after.',
      practiceRoutine:
        'Sweep the C major shape: G string fret 9, B string fret 8, high E fret 8. Down-sweep then up-sweep. ' +
        'Start at 50 BPM. Listen for clean, separated notes.',
      tab: [
        { string: 'e', steps: [null, null, '8', null, null, '8', '|', null, null, '8', null, null, '8', '|'] },
        { string: 'B', steps: [null, '8', null, null, '8', null, '|', null, '8', null, null, '8', null, '|'] },
        { string: 'G', steps: ['9', null, null, '9', null, null, '|', '9', null, null, '9', null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 9, color: 'root' },
        { string: 4, fret: 8, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
      ],
      practiceNotes: {
        // G fret 9=55+9=64; B fret 8=59+8=67; high e fret 8=64+8=72
        steps: [
          { string: 3, fret: 9 },
          { string: 4, fret: 8 },
          { string: 5, fret: 8 },
          { string: 4, fret: 8 },
          { string: 3, fret: 9 },
          { string: 4, fret: 8 },
          { string: 5, fret: 8 },
          { string: 4, fret: 8 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'sweep-3',
      moduleId: 'sweep-picking',
      title: 'Five-String Arpeggio Sweep',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'The full 5-string sweep is the classic sweep picking sound. This Am shape spans from the A string to the high E string. ' +
        'The motion should feel like one fluid stroke downward, a tap at the top, then one fluid stroke upward. ' +
        'The biggest challenge is keeping unwanted strings silent — use left-hand muting and slight finger lifts.',
      practiceRoutine:
        'Sweep through the full Am shape: A fret 7, D fret 7, G fret 5, B fret 5, high E fret 5, then reverse back down. ' +
        'Start at 40 BPM. Play each note as a clean, distinct event.',
      tab: [
        { string: 'e', steps: [null, null, null, null, '5', null, null, null, null, '5', '|'] },
        { string: 'B', steps: [null, null, null, '5', null, null, null, null, '5', null, '|'] },
        { string: 'G', steps: [null, null, '5', null, null, null, null, '5', null, null, '|'] },
        { string: 'D', steps: [null, '7', null, null, null, null, '7', null, null, null, '|'] },
        { string: 'A', steps: ['7', null, null, null, null, '7', null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 7, color: 'root' },
        { string: 2, fret: 7, color: 'accent' },
        { string: 3, fret: 5, color: 'default' },
        { string: 4, fret: 5, color: 'accent' },
        { string: 5, fret: 5, color: 'default' },
      ],
      practiceNotes: {
        // A fret 7=45+7=52; D fret 7=50+7=57; G fret 5=55+5=60; B fret 5=59+5=64; high e fret 5=64+5=69
        steps: [
          { string: 1, fret: 7 },
          { string: 2, fret: 7 },
          { string: 3, fret: 5 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 4, fret: 5 },
          { string: 3, fret: 5 },
          { string: 2, fret: 7 },
          { string: 1, fret: 7 },
          { string: 2, fret: 7 },
          { string: 3, fret: 5 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 4, fret: 5 },
          { string: 3, fret: 5 },
          { string: 2, fret: 7 },
        ],
        defaultBpm: 40,
      },
    },
    {
      id: 'sweep-4',
      moduleId: 'sweep-picking',
      title: 'Sweep with Tapping Extension',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Combine sweep picking with a tap at the top of the arpeggio to extend the range. After the upward sweep reaches the high E string, ' +
        'tap fret 12 then pull off back to fret 5 and descend. ' +
        'This creates dramatic, wide-range arpeggios used extensively in neoclassical metal.',
      practiceRoutine:
        'Sweep up the Am shape (A7, D7, G5, B5, e5), tap fret 12 on the high E string at the top, pull off to fret 5, then sweep back down. ' +
        'Start at 40 BPM. The tap should be at the same volume as the swept notes.',
      tab: [
        { string: 'e', steps: [null, null, null, null, '5', 'T12', 'p5', null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, '5', null, null, null, '5', null, null, null, '|'] },
        { string: 'G', steps: [null, null, '5', null, null, null, null, null, '5', null, null, '|'] },
        { string: 'D', steps: [null, '7', null, null, null, null, null, null, null, '7', null, '|'] },
        { string: 'A', steps: ['7', null, null, null, null, null, null, null, null, null, '7', '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 7, color: 'root' },
        { string: 2, fret: 7, color: 'accent' },
        { string: 3, fret: 5, color: 'default' },
        { string: 4, fret: 5, color: 'accent' },
        { string: 5, fret: 5, color: 'default' },
        { string: 5, fret: 12, color: 'root' },
      ],
      practiceNotes: {
        // A7=52, D7=57, G5=60, B5=64, e5=69, e12=76
        steps: [
          { string: 1, fret: 7 },
          { string: 2, fret: 7 },
          { string: 3, fret: 5 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 12 },
          { string: 5, fret: 5 },
          { string: 4, fret: 5 },
          { string: 3, fret: 5 },
          { string: 2, fret: 7 },
        ],
        defaultBpm: 40,
      },
    },
  ],
};
