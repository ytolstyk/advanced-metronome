import type { LessonModule } from '../types';

export const pullOffsHammerOnsModule: LessonModule = {
  id: 'pull-offs-hammer-ons',
  title: 'Pull-offs & Hammer-ons',
  type: 'technique',
  description: 'Build legato fluency with hammer-ons and pull-offs — the foundation of smooth, connected guitar lines without picking every note.',
  lessons: [
    {
      id: 'legato-1',
      moduleId: 'pull-offs-hammer-ons',
      title: 'Basic Hammer-ons',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'A hammer-on is played by picking a note then slamming another finger down onto a higher fret on the same string. ' +
        'The second note sounds without picking again. The key is speed and force — your finger must land firmly and quickly. ' +
        'Think of it as "hammering" a nail. The hammered note should be as loud as the picked note.',
      practiceRoutine:
        'On the high E string: pick fret 5, hammer onto fret 7. Repeat steadily. Then try fret 5 to fret 8 (wider stretch). ' +
        'Start at 60 BPM, two notes per beat (eighth notes). Focus on equal volume.',
      tab: [
        { string: 'e', steps: ['5h7', '5h7', '5h7', '5h7', '|'] },
        { string: 'B', steps: [null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'accent' },
      ],
      practiceNotes: {
        // high e fret 5=A4(69); fret 7=B4(71)
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
      examples: [
        {
          name: 'B string',
          tab: [
            { string: 'e', steps: [null, null, null, null, '|'] },
            { string: 'B', steps: ['5h7', '5h7', '5h7', '5h7', '|'] },
            { string: 'G', steps: [null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 4, fret: 5, color: 'root' },
            { string: 4, fret: 7, color: 'accent' },
          ],
          practiceNotes: {
            // B string fret 5=E4(64); fret 7=F#4(66)
            steps: [
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'G string',
          tab: [
            { string: 'e', steps: [null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, '|'] },
            { string: 'G', steps: ['5h7', '5h7', '5h7', '5h7', '|'] },
            { string: 'D', steps: [null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 3, fret: 5, color: 'root' },
            { string: 3, fret: 7, color: 'accent' },
          ],
          practiceNotes: {
            // G string fret 5=C4(60); fret 7=D4(62)
            steps: [
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'Minor third stretch',
          tab: [
            { string: 'e', steps: ['5h8', '5h8', '5h8', '5h8', '|'] },
            { string: 'B', steps: [null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 5, fret: 5, color: 'root' },
            { string: 5, fret: 8, color: 'accent' },
          ],
          practiceNotes: {
            // high e fret 5=A4(69); fret 8=C5(72)
            steps: [
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
            ],
            defaultBpm: 80,
          },
        },
      ],
    },
    {
      id: 'legato-2',
      moduleId: 'pull-offs-hammer-ons',
      title: 'Basic Pull-offs',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'A pull-off is the reverse of a hammer-on: with two fingers fretting, you pluck the string by pulling the higher finger off with a slight downward flick. ' +
        'The lower finger stays in place and the lower note sounds. The pulling motion gives the string energy — don\'t just lift straight up.',
      practiceRoutine:
        'On the high E string: pick fret 7 (ring finger), pull off to fret 5 (index finger). The pull-off should snap the string slightly. ' +
        'Repeat at 60 BPM. Both notes should be equally clear.',
      tab: [
        { string: 'e', steps: ['7p5', '7p5', '7p5', '7p5', '|'] },
        { string: 'B', steps: [null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 7, color: 'root' },
        { string: 5, fret: 5, color: 'accent' },
      ],
      practiceNotes: {
        // high e fret 7=B4(71); fret 5=A4(69)
        steps: [
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'B string',
          tab: [
            { string: 'e', steps: [null, null, null, null, '|'] },
            { string: 'B', steps: ['7p5', '7p5', '7p5', '7p5', '|'] },
            { string: 'G', steps: [null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 4, fret: 7, color: 'root' },
            { string: 4, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            // B string fret 7=F#4(66); fret 5=E4(64)
            steps: [
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
              { string: 4, fret: 7 },
              { string: 4, fret: 5 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'G string',
          tab: [
            { string: 'e', steps: [null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, '|'] },
            { string: 'G', steps: ['7p5', '7p5', '7p5', '7p5', '|'] },
            { string: 'D', steps: [null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 3, fret: 7, color: 'root' },
            { string: 3, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            // G string fret 7=D4(62); fret 5=C4(60)
            steps: [
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
              { string: 3, fret: 7 },
              { string: 3, fret: 5 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'Minor third drop',
          tab: [
            { string: 'e', steps: ['8p5', '8p5', '8p5', '8p5', '|'] },
            { string: 'B', steps: [null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 5, fret: 8, color: 'root' },
            { string: 5, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            // high e fret 8=C5(72); fret 5=A4(69)
            steps: [
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 5 },
            ],
            defaultBpm: 80,
          },
        },
      ],
    },
    {
      id: 'legato-3',
      moduleId: 'pull-offs-hammer-ons',
      title: 'Hammer-on / Pull-off Trills',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'A trill rapidly alternates between two notes using continuous hammer-ons and pull-offs with no picking after the initial attack. ' +
        'This builds finger strength and independence. Start slowly and build speed gradually. ' +
        'Try all finger combinations: index-middle, index-ring, index-pinky for different widths.',
      practiceRoutine:
        'Pick fret 5 on the high E, then trill to fret 7: h7-p5-h7-p5 as fast sixteenth notes. ' +
        'Start at 60 BPM (4 notes per beat). Then try index-ring (fret 5 to 8) and index-pinky (fret 5 to 9).',
      tab: [
        { string: 'e', steps: ['5h7p5h7p5h7p5h7', '|', '5h8p5h8p5h8p5h8', '|'] },
        { string: 'B', steps: [null, '|', null, '|'] },
        { string: 'G', steps: [null, '|', null, '|'] },
        { string: 'D', steps: [null, '|', null, '|'] },
        { string: 'A', steps: [null, '|', null, '|'] },
        { string: 'E', steps: [null, '|', null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'accent' },
        { string: 5, fret: 8, color: 'default' },
      ],
      practiceNotes: {
        // high e: 5=69, 7=71, 8=72
        steps: [
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 7 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
          { string: 5, fret: 5 },
          { string: 5, fret: 8 },
        ],
        defaultBpm: 80,
      },
    },
    {
      id: 'legato-4',
      moduleId: 'pull-offs-hammer-ons',
      title: 'Legato Scale Runs',
      difficulty: 'intermediate',
      order: 4,
      explanation:
        'Apply hammer-ons and pull-offs to scale patterns for fluid, connected lines. Pick only the first note on each string, ' +
        'then hammer-on the remaining notes. This creates the smooth "legato" sound associated with players like Joe Satriani and Allan Holdsworth.',
      practiceRoutine:
        'Play the A minor pentatonic scale ascending with legato: pick fret 5 on high E, hammer fret 8. Move to B string: pick 5, hammer 8. Continue across all strings. ' +
        'Start at 50 BPM with eighth notes.',
      tab: [
        {string:"e",steps:["8p5",null,null,null,null,null,"|"]},
        {string:"B",steps:[null,"8p5",null,null,null,null,"|"]},
        {string:"G",steps:[null,null,"7p5",null,null,null,"|"]},
        {string:"D",steps:[null,null,null,"7p5",null,null,"|"]},
        {string:"A",steps:[null,null,null,null,"7p5",null,"|"]},
        {string:"E",steps:[null,null,null,null,null,"8p5","|"]}
      ],
      fretHighlights: [
        {string:5,fret:8},
        {string:5,fret:5},
        {string:4,fret:8},
        {string:4,fret:5},
        {string:3,fret:7},
        {string:3,fret:5},
        {string:2,fret:7},
        {string:2,fret:5},
        {string:1,fret:7},
        {string:1,fret:5},
        {string:0,fret:8},
        {string:0,fret:5}
      ],
      practiceNotes: {
        steps: [
          {string:5,fret:8},
          {string:5,fret:5},
          {string:4,fret:8},
          {string:4,fret:5},
          {string:3,fret:7},
          {string:3,fret:5},
          {string:2,fret:7},
          {string:2,fret:5},
          {string:1,fret:7},
          {string:1,fret:5},
          {string:0,fret:8},
          {string:0,fret:5}
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'legato-5',
      moduleId: 'pull-offs-hammer-ons',
      title: 'Legato Scale Runs',
      difficulty: 'intermediate',
      order: 4,
      explanation:
        'Apply hammer-ons and pull-offs to scale patterns for fluid, connected lines. Pick only the first note on each string, ' +
        'then hammer-on the remaining notes. This creates the smooth "legato" sound associated with players like Joe Satriani and Allan Holdsworth.',
      practiceRoutine:
        'Play the A minor pentatonic scale ascending with legato: pick fret 5 on high E, hammer fret 8. Move to B string: pick 5, hammer 8. Continue across all strings. ' +
        'Start at 50 BPM with eighth notes.',
      tab: [
        {string:"e",steps:[null,null,null,null,null,"7h9","|"]},
        {string:"B",steps:[null,null,null,null,"7h9",null,"|"]},
        {string:"G",steps:[null,null,null,"6h9",null,null,"|"]},
        {string:"D",steps:[null,null,"6h9",null,null,null,"|"]},
        {string:"A",steps:[null,"7h9",null,null,null,null,"|"]},
        {string:"E",steps:["7h9",null,null,null,null,null,"|"]}
      ],
      fretHighlights: [
        {string:0,fret:7},
        {string:0,fret:9},
        {string:1,fret:7},
        {string:1,fret:9},
        {string:2,fret:6},
        {string:2,fret:9},
        {string:3,fret:6},
        {string:3,fret:9},
        {string:4,fret:7},
        {string:4,fret:9},
        {string:5,fret:7},
        {string:5,fret:9}
      ],
      practiceNotes: {
        steps: [
          {string:0,fret:7},
          {string:0,fret:9},
          {string:1,fret:7},
          {string:1,fret:9},
          {string:2,fret:6},
          {string:2,fret:9},
          {string:3,fret:6},
          {string:3,fret:9},
          {string:4,fret:7},
          {string:4,fret:9},
          {string:5,fret:7},
          {string:5,fret:9}
        ],
        "defaultBpm": 80
      }
    },
    {
      id: 'legato-6',
      moduleId: 'pull-offs-hammer-ons',
      title: 'Cross-String Legato',
      difficulty: 'advanced',
      order: 5,
      explanation:
        'Advanced legato extends across strings without picking — use hammer-ons from nowhere (hammering onto the next string without picking). ' +
        'This requires significant finger strength. The trick is to hammer hard enough that the note rings clearly even without the initial pick attack.',
      practiceRoutine:
        'Pick only the first note (fret 5 on low E). Hammer-on to fret 7, then fret 8. Then hammer from nowhere onto fret 5 of the A string, ' +
        'continue hammering up through all strings. Start extremely slowly at 40 BPM.',
      tab: [
        {string:"e",steps:[null,null,null,null,null,"7h9h10","|"]},
        {string:"B",steps:[null,null,null,null,"7h9h10",null,"|"]},
        {string:"G",steps:[null,null,null,"6h7h9",null,null,"|"]},
        {string:"D",steps:[null,null,"6h7h9",null,null,null,"|"]},
        {string:"A",steps:[null,"5h7h9",null,null,null,null,"|"]},
        {string:"E",steps:["5h7h9",null,null,null,null,null,"|"]}
      ],
      fretHighlights: [
        {string:0,fret:5},
        {string:0,fret:7},
        {string:0,fret:9},
        {string:1,fret:5},
        {string:1,fret:7},
        {string:1,fret:9},
        {string:2,fret:6},
        {string:2,fret:7},
        {string:2,fret:9},
        {string:3,fret:6},
        {string:3,fret:7},
        {string:3,fret:9},
        {string:4,fret:7},
        {string:4,fret:9},
        {string:4,fret:10},
        {string:5,fret:7},
        {string:5,fret:9},
        {string:5,fret:10}
      ],
      practiceNotes: {
        steps: [
          {string:0,fret:5},
          {string:0,fret:7},
          {string:0,fret:9},
          {string:1,fret:5},
          {string:1,fret:7},
          {string:1,fret:9},
          {string:2,fret:6},
          {string:2,fret:7},
          {string:2,fret:9},
          {string:3,fret:6},
          {string:3,fret:7},
          {string:3,fret:9},
          {string:4,fret:7},
          {string:4,fret:9},
          {string:4,fret:10},
          {string:5,fret:7},
          {string:5,fret:9},
          {string:5,fret:10}
        ],
        defaultBpm: 80
      },
      examples: [
        {
          name: "G minor",
          tab: [
            {string:"e",steps:[null,null,null,null,null,"5h6h8", "|"]},
            {string:"B",steps:[null,null,null,null,"4h6h8",null, "|"]},
            {string:"G",steps:[null,null,null,"3h5h7",null,null, "|"]},
            {string:"D",steps:[null,null,"3h5h7",null,null,null, "|"]},
            {string:"A",steps:[null,"3h5h6",null,null,null,null, "|"]},
            {string:"E",steps:["3h5h6",null,null,null,null,null, "|"]}
          ],
          fretHighlights: [
            {string:0,fret:3},
            {string:0,fret:5},
            {string:0,fret:6},
            {string:1,fret:3},
            {string:1,fret:5},
            {string:1,fret:6},
            {string:2,fret:3},
            {string:2,fret:5},
            {string:2,fret:7},
            {string:3,fret:3},
            {string:3,fret:5},
            {string:3,fret:7},
            {string:4,fret:4},
            {string:4,fret:6},
            {string:4,fret:8},
            {string:5,fret:5},
            {string:5,fret:6},
            {string:5,fret:8}
          ],
          practiceNotes: {
            steps: [
              {string:0,fret:3},
              {string:0,fret:5},
              {string:0,fret:6},
              {string:1,fret:3},
              {string:1,fret:5},
              {string:1,fret:6},
              {string:2,fret:3},
              {string:2,fret:5},
              {string:2,fret:7},
              {string:3,fret:3},
              {string:3,fret:5},
              {string:3,fret:7},
              {string:4,fret:4},
              {string:4,fret:6},
              {string:4,fret:8},
              {string:5,fret:5},
              {string:5,fret:6},
              {string:5,fret:8}
            ],
            defaultBpm: 80
          }
        },
        {
          name: "G# major",
          tab: [
            {string:"e",steps:["9p8p6",null,null,null,null,null,"|"]},
            {string:"B",steps:[null,"9p8p6",null,null,null,null,"|"]},
            {string:"G",steps:[null,null,"8p6p5",null,null,null,"|"]},
            {string:"D",steps:[null,null,null,"8p6p5",null,null,"|"]},
            {string:"A",steps:[null,null,null,null,"8p6p4",null,"|"]},
            {string:"E",steps:[null,null,null,null,null,"8p6p4","|"]}
          ],
          fretHighlights: [
            {string:5,fret:9},
            {string:5,fret:8},
            {string:5,fret:6},
            {string:4,fret:9},
            {string:4,fret:8},
            {string:4,fret:6},
            {string:3,fret:8},
            {string:3,fret:6},
            {string:3,fret:5},
            {string:2,fret:8},
            {string:2,fret:6},
            {string:2,fret:5},
            {string:1,fret:8},
            {string:1,fret:6},
            {string:1,fret:4},
            {string:0,fret:8},
            {string:0,fret:6},
            {string:0,fret:4}
          ],
          practiceNotes: {
            steps: [
              {string:5,fret:9},
              {string:5,fret:8},
              {string:5,fret:6},
              {string:4,fret:9},
              {string:4,fret:8},
              {string:4,fret:6},
              {string:3,fret:8},
              {string:3,fret:6},
              {string:3,fret:5},
              {string:2,fret:8},
              {string:2,fret:6},
              {string:2,fret:5},
              {string:1,fret:8},
              {string:1,fret:6},
              {string:1,fret:4},
              {string:0,fret:8},
              {string:0,fret:6},
              {string:0,fret:4}
            ],
            defaultBpm: 80
          }
        }
      ]
    },
  ],
};
