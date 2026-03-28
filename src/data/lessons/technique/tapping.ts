import type { LessonModule } from '../types';

export const tappingModule: LessonModule = {
  id: 'tapping',
  title: 'Tapping',
  type: 'technique',
  description: 'Create fluid legato lines by tapping notes on the fretboard with your picking hand, producing smooth cascading runs and arpeggios.',
  lessons: [
    {
      id: 'tapping-1',
      moduleId: 'tapping',
      title: 'Single-String Tapping Basics',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Tapping involves using a finger from your picking hand (typically the middle finger) to hammer onto the fretboard. ' +
        'The key is to tap firmly and pull off cleanly. Keep your fretting hand anchored and use the tip of your tapping finger. ' +
        'Start with a simple three-note pattern on one string: tap fret 12, pull off to fret 8, pull off to fret 5.',
      practiceRoutine:
        'Play this triplet pattern on the high E string at 60 BPM. Tap fret 12, pull off to fret 8, pull off to fret 5. ' +
        'Focus on even volume across all three notes. Once comfortable, increase BPM by 5.',
      tab: [
        { string: 'e', steps: ['T12p8p5', 'T12p8p5', '|', 'T12p8p5', 'T12p8p5', '|'] },
        { string: 'B', steps: [null, null, '|', null, null, '|'] },
        { string: 'G', steps: [null, null, '|', null, null, '|'] },
        { string: 'D', steps: [null, null, '|', null, null, '|'] },
        { string: 'A', steps: [null, null, '|', null, null, '|'] },
        { string: 'E', steps: [null, null, '|', null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 12, color: 'root' },
        { string: 5, fret: 8, color: 'accent' },
        { string: 5, fret: 5, color: 'default' },
      ],
      practiceNotes: {
        // OPEN_MIDI[5]=64 (high e)
        steps: [
          { string: 5, fret: 12 }, // 64+12=76
          { string: 5, fret: 8 },  // 64+8=72
          { string: 5, fret: 5 },  // 64+5=69
          { string: 5, fret: 12 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 12 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 12 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
        ],
        defaultBpm: 80
      },
      examples: [
        {
          name: "Pull-offs",
          "tab": [
            { "string": "e", "steps": [null, null, "|", null, null, "|"] },
            { "string": "B", "steps": ["T12p7p5", "T12p7p5", "|", "T12p7p5", "T12p7p5", "|"] },
            { "string": "G", "steps": [null, null, "|", null, null, "|"] },
            { "string": "D", "steps": [null, null, "|", null, null, "|"] },
            { "string": "A", "steps": [null, null, "|", null, null, "|"] },
            { "string": "E", "steps": [null, null, "|", null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 4, "fret": 12 },
            { "string": 4, "fret": 7 },
            { "string": 4, "fret": 5 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 4, "fret": 12 },
              { "string": 4, "fret": 7 },
              { "string": 4, "fret": 5 },
              { "string": 4, "fret": 12 },
              { "string": 4, "fret": 7 },
              { "string": 4, "fret": 5 },
              { "string": 4, "fret": 12 },
              { "string": 4, "fret": 7 },
              { "string": 4, "fret": 5 },
              { "string": 4, "fret": 12 },
              { "string": 4, "fret": 7 },
              { "string": 4, "fret": 5 }
            ],
            defaultBpm: 80
          }
        },
        {
          name: "Hammer-ons",
          "tab": [
            { "string": "e", "steps": [null, null, "|", null, null, "|"] },
            { "string": "B", "steps": [null, null, "|", null, null, "|"] },
            { "string": "G", "steps": ["h5h7T14", "h5h7T14", "|", "h5h7T14", "h5h7T14", "|"] },
            { "string": "D", "steps": [null, null, "|", null, null, "|"] },
            { "string": "A", "steps": [null, null, "|", null, null, "|"] },
            { "string": "E", "steps": [null, null, "|", null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 3, "fret": 5 },
            { "string": 3, "fret": 7 },
            { "string": 3, "fret": 14 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 14 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 14 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 14 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 14 }
            ],
            defaultBpm: 80
          }
        }
      ],
    },
    {
      id: 'tapping-2',
      moduleId: 'tapping',
      title: 'Two-String Tapping Patterns',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'Once comfortable on one string, expand to two strings. This creates wider melodic intervals and is the basis for tapping arpeggios. ' +
        'The fretting hand holds notes on the B string while the tapping hand alternates between the high E and B strings. ' +
        'Keep movements small and precise — the tapping finger should hover just above the fretboard.',
      practiceRoutine:
        'Alternate between high E and B strings. Tap fret 12 on high E, pull off to fret 7 on B, hammer on to fret 8 on B, then repeat. ' +
        'Start at 50 BPM with quarter notes.',
      "tab": [
        { "string": "e", "steps": [null, null, "|", null, null, "|"] },
        { "string": "B", "steps": [null, null, "|", null, null, "|"] },
        { "string": "G", "steps": [null, "5h7T9", "|", null, "5h7T9", "|"] },
        { "string": "D", "steps": ["5h7T9", null, "|", "5h7T9", null, "|"] },
        { "string": "A", "steps": [null, null, "|", null, null, "|"] },
        { "string": "E", "steps": [null, null, "|", null, null, "|"] }
      ],
      "fretHighlights": [
        { "string": 2, "fret": 5 },
        { "string": 2, "fret": 7 },
        { "string": 2, "fret": 9 },
        { "string": 3, "fret": 5 },
        { "string": 3, "fret": 7 },
        { "string": 3, "fret": 9 }
      ],
      "practiceNotes": {
        "steps": [
          { "string": 2, "fret": 5 },
          { "string": 2, "fret": 7 },
          { "string": 2, "fret": 9 },
          { "string": 3, "fret": 5 },
          { "string": 3, "fret": 7 },
          { "string": 3, "fret": 9 },
          { "string": 2, "fret": 5 },
          { "string": 2, "fret": 7 },
          { "string": 2, "fret": 9 },
          { "string": 3, "fret": 5 },
          { "string": 3, "fret": 7 },
          { "string": 3, "fret": 9 }
        ],
        defaultBpm: 80
      },
      examples: [
        {
          name: "Same string tap",
          "tab": [
            { "string": "e", "steps": [null, null, null, null, "|", null, null, null, null, "|"] },
            { "string": "B", "steps": [null, "T8", null, "T8", "|", null, "T8", null, "T8", "|"] },
            { "string": "G", "steps": [null, null, "h5h6", null, "|", null, null, "h5h6", null, "|"] },
            { "string": "D", "steps": ["h5h7", null, null, null, "|", "h5h7", null, null, null, "|"] },
            { "string": "A", "steps": [null, null, null, null, "|", null, null, null, null, "|"] },
            { "string": "E", "steps": [null, null, null, null, "|", null, null, null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 2, "fret": 5 },
            { "string": 2, "fret": 7 },
            { "string": 4, "fret": 8 },
            { "string": 3, "fret": 5 },
            { "string": 3, "fret": 6 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 2, "fret": 5 },
              { "string": 2, "fret": 7 },
              { "string": 4, "fret": 8 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 6 },
              { "string": 4, "fret": 8 },
              { "string": 2, "fret": 5 },
              { "string": 2, "fret": 7 },
              { "string": 4, "fret": 8 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 6 },
              { "string": 4, "fret": 8 }
            ],
            defaultBpm: 80
          }
        }
      ],
    },
    {
      id: 'tapping-3',
      moduleId: 'tapping',
      title: 'Tapping Arpeggios',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'Tapping arpeggios combine tapped notes with pull-offs across multiple strings to outline chord shapes. ' +
        'This technique was popularized by Eddie Van Halen and is central to neoclassical and progressive rock styles. ' +
        'The fretting hand holds a chord shape while the tapping hand adds notes an octave or more above.',
      practiceRoutine:
        'Play an Am arpeggio using tapping: tap fret 12 on high E (E note), pull off to fret 5 (A), move to B string: tap fret 12 (B), pull off to fret 5 (E). ' +
        'Continue to G string: tap fret 12 (G#/Ab), pull off to fret 5 (C#). Start at 70 BPM.',
      tab: [
        { string: 'e', steps: ['T12p5', null, null, '|'] },
        { string: 'B', steps: [null, 'T12p5', null, '|'] },
        { string: 'G', steps: [null, null, 'T12p5', '|'] },
        { string: 'D', steps: [null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 12, color: 'root' },
        { string: 5, fret: 5, color: 'accent' },
        { string: 4, fret: 12, color: 'root' },
        { string: 4, fret: 5, color: 'accent' },
        { string: 3, fret: 12, color: 'root' },
        { string: 3, fret: 5, color: 'accent' },
      ],
      practiceNotes: {
        // high e 12=76, 5=69; B 12=71, 5=64; G 12=67, 5=60
        steps: [
          { string: 5, fret: 12 },
          { string: 5, fret: 5 },
          { string: 4, fret: 12 },
          { string: 4, fret: 5 },
          { string: 3, fret: 12 },
          { string: 3, fret: 5 },
        ],
        defaultBpm: 80
      },
      examples: [
        {
          name: "Three-string arpeggio",
          tab: [
            { "string": "e", "steps": [null, null, "h5h8T10", "|"] },
            { "string": "B", "steps": [null, null, null, "|"] },
            { "string": "G", "steps": [null, "h5h7T10", null, "|"] },
            { "string": "D", "steps": [null, null, null, "|"] },
            { "string": "A", "steps": ["h5h8T12", null, null, "|"] },
            { "string": "E", "steps": [null, null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 1, "fret": 5 },
            { "string": 1, "fret": 8 },
            { "string": 1, "fret": 12 },
            { "string": 3, "fret": 5 },
            { "string": 3, "fret": 7 },
            { "string": 3, "fret": 10 },
            { "string": 5, "fret": 5 },
            { "string": 5, "fret": 8 },
            { "string": 5, "fret": 10 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 1, "fret": 5 },
              { "string": 1, "fret": 8 },
              { "string": 1, "fret": 12 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 10 },
              { "string": 5, "fret": 5 },
              { "string": 5, "fret": 8 },
              { "string": 5, "fret": 10 }
            ],
            defaultBpm: 80
          }
        },
        {
          name: "D major",
          "tab": [
            { "string": "e", "steps": ["T10p2", null, null, "|"] },
            { "string": "B", "steps": [null, "T10p3", null, "|"] },
            { "string": "G", "steps": [null, null, "T9p2", "|"] },
            { "string": "D", "steps": [null, null, null, "|"] },
            { "string": "A", "steps": [null, null, null, "|"] },
            { "string": "E", "steps": [null, null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 5, "fret": 10 },
            { "string": 5, "fret": 2 },
            { "string": 4, "fret": 10 },
            { "string": 4, "fret": 3 },
            { "string": 3, "fret": 9 },
            { "string": 3, "fret": 2 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 5, "fret": 10 },
              { "string": 5, "fret": 2 },
              { "string": 4, "fret": 10 },
              { "string": 4, "fret": 3 },
              { "string": 3, "fret": 9 },
              { "string": 3, "fret": 2 }
            ],
            defaultBpm: 80
          }
        }
      ],
    },
    {
      id: 'tapping-4',
      moduleId: 'tapping',
      title: 'Multi-Finger Tapping',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Multi-finger tapping (or touch-style) uses all fingers of both hands to tap on the fretboard simultaneously. ' +
        'The left hand plays bass notes and chords while the right hand plays melody, similar to piano technique. ' +
        'This requires complete independence between hands. Start by tapping simple intervals with both hands on separate strings.',
      practiceRoutine:
        'Left hand taps fret 5 on A string (D note, MIDI 50) while right hand taps fret 9 on high E string (C# note, MIDI 73). ' +
        'Alternate: LH on A string, RH on high E, creating a two-voice texture. Start very slowly at 40 BPM.',

      "tab": [
        { "string": "e", "steps": [null, null, null, null, "|", null, null, null, null, "|"] },
        { "string": "B", "steps": [null, null, "T10", null, "|", null, null, "T10", null, "|"] },
        { "string": "G", "steps": [null, "h7", null, null, "|", null, "h7", null, null, "|"] },
        { "string": "D", "steps": [null, null, null, "T10", "|", null, null, null, "T10", "|"] },
        { "string": "A", "steps": ["h5", null, null, null, "|", "h5", null, null, null, "|"] },
        { "string": "E", "steps": [null, null, null, null, "|", null, null, null, null, "|"] }
      ],
      "fretHighlights": [
        { "string": 1, "fret": 5 },
        { "string": 3, "fret": 7 },
        { "string": 4, "fret": 10 },
        { "string": 2, "fret": 10 }
      ],
      "practiceNotes": {
        "steps": [
          { "string": 1, "fret": 5 },
          { "string": 3, "fret": 7 },
          { "string": 4, "fret": 10 },
          { "string": 2, "fret": 10 },
          { "string": 1, "fret": 5 },
          { "string": 3, "fret": 7 },
          { "string": 4, "fret": 10 },
          { "string": 2, "fret": 10 }
        ],
        "defaultBpm": 80
      },
      examples: [
        {
          name: "Two-finger same string",
          "tab": [
            { "string": "e", "steps": [null, null, null, null, null, null, null, null, null, null, null, null, "|"] },
            { "string": "B", "steps": [null, null, null, null, null, null, null, null, null, null, null, null, "|"] },
            { "string": "G", "steps": [null, null, null, null, null, null, null, null, null, null, "7h9h10", "T14T16", "|"] },
            { "string": "D", "steps": [null, null, null, null, null, "7h9h10", "T12T14", null, null, null, null, null, "|"] },
            { "string": "A", "steps": ["5h7h8", "T12T14", null, null, null, null, null, null, null, null, null, null, "|"] },
            { "string": "E", "steps": [null, null, null, null, null, null, null, null, null, null, null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 1, "fret": 5 },
            { "string": 1, "fret": 7 },
            { "string": 1, "fret": 8 },
            { "string": 1, "fret": 12 },
            { "string": 1, "fret": 14 },
            { "string": 2, "fret": 7 },
            { "string": 2, "fret": 9 },
            { "string": 2, "fret": 10 },
            { "string": 2, "fret": 12 },
            { "string": 2, "fret": 14 },
            { "string": 3, "fret": 7 },
            { "string": 3, "fret": 9 },
            { "string": 3, "fret": 10 },
            { "string": 3, "fret": 14 },
            { "string": 3, "fret": 16 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 1, "fret": 5 },
              { "string": 1, "fret": 7 },
              { "string": 1, "fret": 8 },
              { "string": 1, "fret": 12 },
              { "string": 1, "fret": 14 },
              { "string": 2, "fret": 7 },
              { "string": 2, "fret": 9 },
              { "string": 2, "fret": 10 },
              { "string": 2, "fret": 12 },
              { "string": 2, "fret": 14 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 9 },
              { "string": 3, "fret": 10 },
              { "string": 3, "fret": 14 },
              { "string": 3, "fret": 16 }
            ],
            "defaultBpm": 80
          }
        },
        {
          name: "Two-finger different strings",
          "tab": [
            { "string": "e", "steps": [null, null, null, null, null, null, "|"] },
            { "string": "B", "steps": [null, null, null, null, null, null, "|"] },
            { "string": "G", "steps": [null, "T14", null, "5h7", "T14", null, "|"] },
            { "string": "D", "steps": ["5h7", null, "T12", null, null, "T12", "|"] },
            { "string": "A", "steps": [null, null, null, null, null, null, "|"] },
            { "string": "E", "steps": [null, null, null, null, null, null, "|"] }
          ],
          "fretHighlights": [
            { "string": 2, "fret": 5 },
            { "string": 2, "fret": 7 },
            { "string": 3, "fret": 14 },
            { "string": 2, "fret": 12 },
            { "string": 3, "fret": 5 },
            { "string": 3, "fret": 7 }
          ],
          "practiceNotes": {
            "steps": [
              { "string": 2, "fret": 5 },
              { "string": 2, "fret": 7 },
              { "string": 3, "fret": 14 },
              { "string": 2, "fret": 12 },
              { "string": 3, "fret": 5 },
              { "string": 3, "fret": 7 },
              { "string": 3, "fret": 14 },
              { "string": 2, "fret": 12 }
            ],
            "defaultBpm": 80
          }
        }
      ],
    },
  ],
};
