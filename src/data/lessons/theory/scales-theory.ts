import type { LessonModule } from '../types';

export const scalesTheoryModule: LessonModule = {
  id: 'scales-theory',
  title: 'Scale Theory',
  type: 'theory',
  description: 'Learn how scales are constructed from intervals, understand modes, and develop the fretboard knowledge to play any scale in any key.',
  lessons: [
    {
      id: 'scale-theory-1',
      moduleId: 'scales-theory',
      title: 'The Major Scale Formula',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'The major scale is the foundation of Western music theory. Its formula is: Whole-Whole-Half-Whole-Whole-Whole-Half (W-W-H-W-W-W-H). ' +
        'In semitones from the root: 0-2-4-5-7-9-11. Every key uses this same pattern starting from its root note. ' +
        'C major is the simplest: C-D-E-F-G-A-B (all white keys on a piano).',
      practiceRoutine:
        'Play the C major scale on one string (high E): frets 8-10-12-13-15-17-19-20. ' +
        'Say each interval aloud: "whole, whole, half, whole, whole, whole, half." Start at 60 BPM.',
      tab: [
        { string: 'e', steps: ['8', '10', '12', '13', '15', '17', '19', '20', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 8, color: 'root' },
        { string: 5, fret: 10, color: 'default' },
        { string: 5, fret: 12, color: 'default' },
        { string: 5, fret: 13, color: 'accent' },
        { string: 5, fret: 15, color: 'default' },
        { string: 5, fret: 17, color: 'default' },
        { string: 5, fret: 19, color: 'default' },
        { string: 5, fret: 20, color: 'root' },
      ],
      practiceNotes: {
        // high e (OPEN=64): 8=72(C), 10=74(D), 12=76(E), 13=77(F), 15=79(G), 17=81(A), 19=83(B), 20=84(C)
        steps: [
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 5, fret: 12 },
          { string: 5, fret: 13 },
          { string: 5, fret: 15 },
          { string: 5, fret: 17 },
          { string: 5, fret: 19 },
          { string: 5, fret: 20 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'scale-theory-2',
      moduleId: 'scales-theory',
      title: 'The Minor Scale and Relative Keys',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'The natural minor scale formula is: W-H-W-W-H-W-W (semitones: 0-2-3-5-7-8-10). ' +
        'Every major key has a "relative minor" that uses the same notes but starts on the 6th degree. ' +
        'C major\'s relative minor is A minor (A-B-C-D-E-F-G). Same notes, different starting point, completely different mood.',
      practiceRoutine:
        'Play A natural minor on the high E string: frets 5-7-8-10-12-13-15-17. ' +
        'Then play C major starting from fret 8. Notice they share the same notes! Start at 60 BPM.',
      tab: [
        { string: 'e', steps: ['5', '7', '8', '10', '12', '13', '15', '17', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'default' },
        { string: 5, fret: 8, color: 'accent' },
        { string: 5, fret: 10, color: 'default' },
        { string: 5, fret: 12, color: 'default' },
        { string: 5, fret: 13, color: 'accent' },
        { string: 5, fret: 15, color: 'default' },
        { string: 5, fret: 17, color: 'root' },
      ],
      practiceNotes: {
        // high e: 5=69(A), 7=71(B), 8=72(C), 10=74(D), 12=76(E), 13=77(F), 15=79(G), 17=81(A)
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 5, fret: 12 },
          { string: 5, fret: 13 },
          { string: 5, fret: 15 },
          { string: 5, fret: 17 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'scale-theory-3',
      moduleId: 'scales-theory',
      title: 'Pentatonic Scales',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'Pentatonic scales use 5 notes instead of 7, removing the "awkward" intervals. Minor pentatonic (0-3-5-7-10) is the backbone of rock and blues soloing. ' +
        'Major pentatonic (0-2-4-7-9) is its bright counterpart, essential for country and pop. ' +
        'These scales are forgiving — almost every note sounds good over the right chord.',
      practiceRoutine:
        'Play A minor pentatonic in the classic "box 1" position: low E (5-8), A (5-7), D (5-7), G (5-7), B (5-8), high E (5-8). ' +
        'This is the most important scale shape in rock guitar. Start at 60 BPM ascending then descending.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, null, null, '5', '8', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '5', '8', null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, '5', '7', null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, '5', '7', null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, '5', '7', null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['5', '8', null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 5, color: 'root' },
        { string: 0, fret: 8, color: 'default' },
        { string: 1, fret: 5, color: 'default' },
        { string: 1, fret: 7, color: 'accent' },
        { string: 2, fret: 5, color: 'default' },
        { string: 2, fret: 7, color: 'accent' },
        { string: 3, fret: 5, color: 'default' },
        { string: 3, fret: 7, color: 'accent' },
        { string: 4, fret: 5, color: 'default' },
        { string: 4, fret: 8, color: 'accent' },
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 8, color: 'default' },
      ],
      practiceNotes: {
        // low E: 5=45,8=48; A: 5=50,7=52; D: 5=55,7=57; G: 5=60,7=62; B: 5=64,8=67; high e: 5=69,8=72
        steps: [
          { string: 0, fret: 5 },
          { string: 0, fret: 8 },
          { string: 1, fret: 5 },
          { string: 1, fret: 7 },
          { string: 2, fret: 5 },
          { string: 2, fret: 7 },
          { string: 3, fret: 5 },
          { string: 3, fret: 7 },
          { string: 4, fret: 5 },
          { string: 4, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'scale-theory-4',
      moduleId: 'scales-theory',
      title: 'Modes of the Major Scale',
      difficulty: 'intermediate',
      order: 4,
      explanation:
        'Modes are scales derived by starting the major scale from each of its 7 degrees. Each mode has a unique character: ' +
        'Ionian (1st, = major), Dorian (2nd, minor with bright 6th), Phrygian (3rd, dark/Spanish), Lydian (4th, bright/dreamy), ' +
        'Mixolydian (5th, dominant/bluesy), Aeolian (6th, = natural minor), Locrian (7th, diminished/tense). ' +
        'Understanding modes unlocks the entire fretboard for improvisation.',
      practiceRoutine:
        'Play D Dorian on the high E string (same notes as C major, starting on D): frets 10-12-13-15-17-19-20-22. ' +
        'Compare with D natural minor (10-12-13-15-17-18-20-22) — the only difference is the 6th degree. Start at 50 BPM.',
      tab: [
        { string: 'e', steps: ['10', '12', '13', '15', '17', '19', '20', '22', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 10, color: 'root' },
        { string: 5, fret: 12, color: 'default' },
        { string: 5, fret: 13, color: 'accent' },
        { string: 5, fret: 15, color: 'default' },
        { string: 5, fret: 17, color: 'default' },
        { string: 5, fret: 19, color: 'accent' },
        { string: 5, fret: 20, color: 'default' },
        { string: 5, fret: 22, color: 'root' },
      ],
      practiceNotes: {
        // high e: 10=74(D), 12=76(E), 13=77(F), 15=79(G), 17=81(A), 19=83(B), 20=84(C), 22=86(D)
        steps: [
          { string: 5, fret: 10 },
          { string: 5, fret: 12 },
          { string: 5, fret: 13 },
          { string: 5, fret: 15 },
          { string: 5, fret: 17 },
          { string: 5, fret: 19 },
          { string: 5, fret: 20 },
          { string: 5, fret: 22 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'scale-theory-5',
      moduleId: 'scales-theory',
      title: 'Harmonic and Melodic Minor',
      difficulty: 'advanced',
      order: 5,
      explanation:
        'The harmonic minor scale raises the 7th degree of natural minor by one semitone (0-2-3-5-7-8-11), creating a leading tone that pulls toward the root. ' +
        'This gives it a distinctive "exotic" or "classical" sound. The melodic minor goes further, raising both the 6th and 7th (0-2-3-5-7-9-11) ascending, ' +
        'creating a smoother line. These scales generate unique chord types used extensively in jazz (e.g., min/maj7).',
      practiceRoutine:
        'Play A harmonic minor on the high E string: frets 5-7-8-10-12-13-16-17. Notice the 1.5-step gap between frets 13 and 16 — that\'s the signature sound. ' +
        'Then play A melodic minor ascending: 5-7-8-10-12-14-16-17. Start at 50 BPM.',
      tab: [
        { string: 'e', steps: ['5', '7', '8', '10', '12', '13', '16', '17', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'default' },
        { string: 5, fret: 8, color: 'accent' },
        { string: 5, fret: 10, color: 'default' },
        { string: 5, fret: 12, color: 'default' },
        { string: 5, fret: 13, color: 'accent' },
        { string: 5, fret: 16, color: 'default' },
        { string: 5, fret: 17, color: 'root' },
      ],
      practiceNotes: {
        // high e: 5=69(A), 7=71(B), 8=72(C), 10=74(D), 12=76(E), 13=77(F), 16=80(G#), 17=81(A)
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 8 },
          { string: 5, fret: 10 },
          { string: 5, fret: 12 },
          { string: 5, fret: 13 },
          { string: 5, fret: 16 },
          { string: 5, fret: 17 },
        ],
        defaultBpm: 50,
      },
    },
  ],
};
