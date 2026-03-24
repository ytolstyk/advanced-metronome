import type { LessonModule } from '../types';

export const chordsTheoryModule: LessonModule = {
  id: 'chords-theory',
  title: 'Chord Theory',
  type: 'theory',
  description: 'Understand how chords are built from intervals, learn chord families, inversions, and how to construct any chord from its formula.',
  lessons: [
    {
      id: 'chord-theory-1',
      moduleId: 'chords-theory',
      title: 'Major and Minor Triads',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'A triad is a three-note chord built by stacking intervals of thirds. A major triad has a root, major 3rd (4 semitones), and perfect 5th (7 semitones). ' +
        'A minor triad has a root, minor 3rd (3 semitones), and perfect 5th (7 semitones). ' +
        'The difference between major and minor is just one semitone in the 3rd — but it completely changes the mood.',
      practiceRoutine:
        'Play C major triad on top 3 strings at the 8th position: G fret 9 (G), B fret 8 (E), high E fret 8 (C). ' +
        'Then play C minor by lowering the B string to fret 8→fret 8... wait: Cm = G fret 8 (G), B fret 8 (Eb), high E fret 8 (C). ' +
        'Listen to the emotional difference. Start at 60 BPM.',
      tab: [
        { string: 'e', steps: ['8', null, '8', null, '|'] },
        { string: 'B', steps: ['8', null, '8', null, '|'] },
        { string: 'G', steps: ['9', null, '8', null, '|'] },
        { string: 'D', steps: [null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 9, color: 'root' },
        { string: 4, fret: 8, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
        { string: 3, fret: 8, color: 'accent' },
      ],
      practiceNotes: {
        // C major: G fret 9=55+9=64(E), B fret 8=59+8=67(G), high e fret 8=64+8=72(C)
        // C minor: G fret 8=63(Eb), B fret 8=67(G), high e fret 8=72(C)
        steps: [
          { string: 3, fret: 9 },
          { string: 4, fret: 8 },
          { string: 5, fret: 8 },
          { string: 3, fret: 8 },
          { string: 4, fret: 8 },
          { string: 5, fret: 8 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'chord-theory-2',
      moduleId: 'chords-theory',
      title: 'Suspended and Augmented Chords',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'Suspended chords replace the 3rd with another note: sus2 uses the 2nd (2 semitones), sus4 uses the 4th (5 semitones). ' +
        'They sound "open" and unresolved because they lack the major/minor quality. ' +
        'Augmented chords raise the 5th by a semitone (8 semitones from root), creating tension and symmetry.',
      practiceRoutine:
        'Starting from C major on the top 3 strings: play Csus2 (G fret 9, B fret 8, high E fret 10), Csus4 (G fret 10, B fret 8, high E fret 10), ' +
        'and Caug (G fret 9, B fret 9, high E fret 8). Notice how each has a distinct character. Play at 60 BPM.',
      tab: [
        { string: 'e', steps: ['8', null, '10', null, '8', null, '|'] },
        { string: 'B', steps: ['8', null, '8', null, '9', null, '|'] },
        { string: 'G', steps: ['9', null, '10', null, '9', null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 9, color: 'root' },
        { string: 3, fret: 10, color: 'accent' },
        { string: 4, fret: 8, color: 'default' },
        { string: 4, fret: 9, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
        { string: 5, fret: 10, color: 'accent' },
      ],
      practiceNotes: {
        // Csus2: G9=64(E), B8=67(G), e10=74(D)
        // Csus4: G10=65(F), B8=67(G), e10=74(F?)  — top 3 strings arpeggio each chord
        // Caug: G9=64, B9=68, e8=72
        steps: [
          { string: 3, fret: 9 },
          { string: 4, fret: 8 },
          { string: 5, fret: 8 },
          { string: 3, fret: 10 },
          { string: 4, fret: 8 },
          { string: 5, fret: 10 },
          { string: 3, fret: 9 },
          { string: 4, fret: 9 },
          { string: 5, fret: 8 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'chord-theory-3',
      moduleId: 'chords-theory',
      title: 'Seventh Chords',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'Seventh chords add a fourth note to the triad. Major 7th (maj7) adds the note 11 semitones above the root — a dreamy, jazzy sound. ' +
        'Dominant 7th (7) adds 10 semitones — a bluesy, tense sound that wants to resolve. ' +
        'Minor 7th (m7) adds 10 semitones to a minor triad — smooth and mellow. These are essential for jazz, R&B, and blues.',
      practiceRoutine:
        'Play Cmaj7, C7, and Cm7 in open position. Cmaj7: A fret 3, D fret 2, G open, B open, high E open. ' +
        'C7: same but B string fret 1. Cm7: A fret 3, D fret 1, G open, B open. ' +
        'Strum each slowly and listen to the mood. Start at 50 BPM.',
      tab: [
        { string: 'e', steps: ['0', null, '0', null, null, null, '|'] },
        { string: 'B', steps: ['0', null, '1', null, null, null, '|'] },
        { string: 'G', steps: ['0', null, '0', null, '0', null, '|'] },
        { string: 'D', steps: ['2', null, '2', null, '1', null, '|'] },
        { string: 'A', steps: ['3', null, '3', null, '3', null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 3, color: 'root' },
        { string: 2, fret: 2, color: 'accent' },
        { string: 3, fret: 0, color: 'default' },
        { string: 4, fret: 0, color: 'default' },
        { string: 4, fret: 1, color: 'accent' },
        { string: 5, fret: 0, color: 'default' },
        { string: 2, fret: 1, color: 'default' },
      ],
      practiceNotes: {
        // Cmaj7 arpeggio: A3=48, D2=52, G0=55, B0=59, e0=64
        // C7: same but B1=60
        // Cm7: A3=48, D1=51, G0=55
        steps: [
          { string: 1, fret: 3 },
          { string: 2, fret: 2 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 5, fret: 0 },
          { string: 1, fret: 3 },
          { string: 2, fret: 2 },
          { string: 3, fret: 0 },
          { string: 4, fret: 1 },
          { string: 5, fret: 0 },
          { string: 1, fret: 3 },
          { string: 2, fret: 1 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 5, fret: 0 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'chord-theory-4',
      moduleId: 'chords-theory',
      title: 'Chord Inversions',
      difficulty: 'intermediate',
      order: 4,
      explanation:
        'An inversion rearranges which note of the chord is on the bottom. Root position has the root as the lowest note. ' +
        'First inversion puts the 3rd on the bottom. Second inversion puts the 5th on the bottom. ' +
        'Inversions let you create smooth voice leading between chords — instead of jumping to a new chord shape, you can find a nearby inversion.',
      practiceRoutine:
        'Play C major in all three positions on the top 3 strings: ' +
        'Root position (G fret 9, B fret 8, high E fret 8), ' +
        '1st inversion (G fret 5, B fret 5, high E fret 5 = C/E), ' +
        '2nd inversion (G fret 0, B fret 1, high E fret 0 = C/G). Play at 50 BPM.',
      tab: [
        { string: 'e', steps: ['8', null, '5', null, '0', null, '|'] },
        { string: 'B', steps: ['8', null, '5', null, '1', null, '|'] },
        { string: 'G', steps: ['9', null, '5', null, '0', null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 9, color: 'root' },
        { string: 4, fret: 8, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
        { string: 3, fret: 5, color: 'accent' },
        { string: 4, fret: 5, color: 'default' },
        { string: 5, fret: 5, color: 'default' },
        { string: 3, fret: 0, color: 'default' },
        { string: 4, fret: 1, color: 'accent' },
        { string: 5, fret: 0, color: 'default' },
      ],
      practiceNotes: {
        // Root: G9=64, B8=67, e8=72
        // 1st inv: G5=60, B5=64, e5=69
        // 2nd inv: G0=55, B1=60, e0=64
        steps: [
          { string: 3, fret: 9 },
          { string: 4, fret: 8 },
          { string: 5, fret: 8 },
          { string: 3, fret: 5 },
          { string: 4, fret: 5 },
          { string: 5, fret: 5 },
          { string: 3, fret: 0 },
          { string: 4, fret: 1 },
          { string: 5, fret: 0 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'chord-theory-5',
      moduleId: 'chords-theory',
      title: 'Extended Chords: 9ths, 11ths, 13ths',
      difficulty: 'advanced',
      order: 5,
      explanation:
        'Extended chords add notes beyond the 7th by continuing to stack thirds. A 9th chord adds the 9th (= 2nd an octave up). ' +
        'An 11th adds the 11th (= 4th an octave up). A 13th adds the 13th (= 6th an octave up). ' +
        'On guitar, you can\'t play all 5-7 notes, so you drop less essential tones (usually the 5th). These chords are the vocabulary of jazz.',
      practiceRoutine:
        'Play C9 voicing: A fret 3 (C), D fret 2 (E), G fret 3 (Bb), B fret 3 (D). ' +
        'Then Dm11 voicing: A fret 5 (D), D fret 0 (D), G fret 2 (A?). Experiment with voicings at 40 BPM.',
      tab: [
        { string: 'e', steps: ['3', null, '1', null, '|'] },
        { string: 'B', steps: ['3', null, '1', null, '|'] },
        { string: 'G', steps: ['3', null, '2', null, '|'] },
        { string: 'D', steps: ['2', null, '0', null, '|'] },
        { string: 'A', steps: ['3', null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 3, color: 'root' },
        { string: 2, fret: 2, color: 'accent' },
        { string: 3, fret: 3, color: 'default' },
        { string: 4, fret: 3, color: 'default' },
        { string: 5, fret: 3, color: 'default' },
      ],
      practiceNotes: {
        // C9: A3=48, D2=52, G3=58(Bb), B3=62(D)
        // Dm11: D0=50, G2=57, B1=60, e0=64
        steps: [
          { string: 1, fret: 3 },
          { string: 2, fret: 2 },
          { string: 3, fret: 3 },
          { string: 4, fret: 3 },
          { string: 4, fret: 1 },
          { string: 3, fret: 2 },
          { string: 2, fret: 0 },
          { string: 5, fret: 0 },
        ],
        defaultBpm: 40,
      },
    },
  ],
};
