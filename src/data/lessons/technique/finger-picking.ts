import type { LessonModule } from '../types';

export const fingerPickingModule: LessonModule = {
  id: 'finger-picking',
  title: 'Finger Picking',
  type: 'technique',
  description: 'Develop fingerstyle technique to play melody, harmony, and bass simultaneously using your thumb and fingers independently.',
  lessons: [
    {
      id: 'finger-picking-1',
      moduleId: 'finger-picking',
      title: 'PIMA Finger Assignment',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'In classical and fingerstyle guitar, each finger has a letter: P (pulgar/thumb) plays bass strings E-A-D, ' +
        'I (indice/index) plays G string, M (medio/middle) plays B string, A (anular/ring) plays high E. ' +
        'This assignment creates a natural hand position. Start by plucking each string with its assigned finger in sequence.',
      practiceRoutine:
        'Place your hand over the strings with thumb on the low E. Pluck P-I-M-A in sequence (low E, G, B, high e open), then reverse A-M-I-P. ' +
        'Keep your wrist relaxed and fingers curved. Start at 60 BPM, one note per beat.',
      tab: [
        { string: 'e', steps: [null, null, null, '0', null, null, null, '0', '|'] },
        { string: 'B', steps: [null, null, '0', null, null, null, '0', null, '|'] },
        { string: 'G', steps: [null, '0', null, null, null, '0', null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['0', null, null, null, '0', null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
        { string: 3, fret: 0, color: 'accent' },
        { string: 4, fret: 0, color: 'accent' },
        { string: 5, fret: 0, color: 'default' },
      ],
      practiceNotes: {
        // low E open=40; G open=55; B open=59; high e open=64
        steps: [
          { string: 0, fret: 0 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 5, fret: 0 },
          { string: 0, fret: 0 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 5, fret: 0 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: "D major",
          tab: [
            {string:"e",steps:[null,null,null,"2",null,null,null,"2","|"]},
            {string:"B",steps:[null,null,"3",null,null,null,"3",null,"|"]},
            {string:"G",steps:[null,"2",null,null,null,"2",null,null,"|"]},
            {string:"D",steps:["0",null,null,null,"0",null,null,null,"|"]},
            {string:"A",steps:[null,null,null,null,null,null,null,null,"|"]},
            {string:"E",steps:[null,null,null,null,null,null,null,null,"|"]},
          ],
          fretHighlights: [
            {string:2,fret:0},
            {string:3,fret:2},
            {string:4,fret:3},
            {string:5,fret:2}
          ],
          practiceNotes: {
            steps: [
              {string:2,fret:0},
              {string:3,fret:2},
              {string:4,fret:3},
              {string:5,fret:2},
              {string:2,fret:0},
              {string:3,fret:2},
              {string:4,fret:3},
              {string:5,fret:2}
            ],
            defaultBpm: 80
          }
        },
        {
          name: "A minor",
          tab: [
            {string:"e",steps:[null,null,null,null,null,null,null,null,"|"]},
            {string:"B",steps:[null,null,null,"1",null,null,null,"1","|"]},
            {string:"G",steps:[null,null,"2",null,null,null,"2",null,"|"]},
            {string:"D",steps:[null,"2",null,null,null,"2",null,null,"|"]},
            {string:"A",steps:["0",null,null,null,"0",null,null,null,"|"]},
            {string:"E",steps:[null,null,null,null,null,null,null,null,"|"]},
          ],
          fretHighlights: [
            {string:1,fret:0},
            {string:2,fret:2},
            {string:3,fret:2},
            {string:4,fret:1}
          ],
          practiceNotes: {
            steps: [
              {string:1,fret:0},
              {string:2,fret:2},
              {string:3,fret:2},
              {string:4,fret:1},
              {string:1,fret:0},
              {string:2,fret:2},
              {string:3,fret:2},
              {string:4,fret:1}
            ],
            defaultBpm: 80
          },
        },
      ],
    },
    {
      id: 'finger-picking-2',
      moduleId: 'finger-picking',
      title: 'Travis Picking Pattern',
      difficulty: 'intermediate',
      order: 2,
      explanation:
        'Travis picking is a fingerstyle pattern where the thumb alternates between two bass strings while the fingers pick a melody on the treble strings. ' +
        'Named after Merle Travis, this creates a "boom-chick" rhythmic feel. The thumb keeps a steady alternating bass while fingers fill in between.',
      practiceRoutine:
        'Hold a C chord. Thumb alternates between A string fret 3 (C note) and low E string open. ' +
        'Index and middle fingers pluck G and B strings between thumb strokes. Start at 50 BPM.',
      tab: [
        {string:"e",steps:[null,null,null,"0",null,null,null,"0","|"]},
        {string:"B",steps:[null,null,"1",null,null,null,"1",null,"|"]},
        {string:"G",steps:[null,"0",null,null,null,"0",null,null,"|"]},
        {string:"D",steps:[null,null,null,null,"2",null,null,null,"|"]},
        {string:"A",steps:["3",null,null,null,null,null,null,null,"|"]},
        {string:"E",steps:[null,null,null,null,null,null,null,null,"|"]}
      ],
      fretHighlights: [
        {string:1,fret:3},
        {string:3,fret:0},
        {string:4,fret:1},
        {string:5,fret:0},
        {string:2,fret:2}
      ],
      practiceNotes: {
        steps: [
          {string:1,fret:3},
          {string:3,fret:0},
          {string:4,fret:1},
          {string:5,fret:0},
          {string:2,fret:2},
          {string:3,fret:0},
          {string:4,fret:1},
          {string:5,fret:0}
        ],
        defaultBpm: 80
      },
      examples: [
        {
          name: "G major",
          tab: [
            {string:"e",steps:[null,null,null,"3",null,null,null,"3","|"]},
            {string:"B",steps:[null,null,"3",null,null,null,"3",null,"|"]},
            {string:"G",steps:[null,"0",null,null,null,"0",null,null,"|"]},
            {string:"D",steps:[null,null,null,null,"0",null,null,null,"|"]},
            {string:"A",steps:[null,null,null,null,null,null,null,null,"|"]},
            {string:"E",steps:["3",null,null,null,null,null,null,null,"|"]}
          ],
          fretHighlights: [
            {string:0,fret:3},
            {string:3,fret:0},
            {string:4,fret:3},
            {string:5,fret:3},
            {string:2,fret:0}
          ],
          practiceNotes: {
            steps: [
              {string:0,fret:3},
              {string:3,fret:0},
              {string:4,fret:3},
              {string:5,fret:3},
              {string:2,fret:0},
              {string:3,fret:0},
              {string:4,fret:3},
              {string:5,fret:3}
            ],
            defaultBpm: 80
          },
        },
      ],
    },
    {
      id: 'finger-picking-3',
      moduleId: 'finger-picking',
      title: 'Arpeggio Picking Patterns',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'Arpeggio patterns roll through chord tones in a flowing sequence. Unlike Travis picking, the thumb may play a single bass note while ' +
        'fingers cascade up or down through the remaining strings. This is the foundation of classical guitar repertoire and creates a harp-like sound.',
      practiceRoutine:
        'Hold an Am chord. Play the arpeggio: A string open (thumb), G fret 2 (index), B fret 1 (middle), high E open (ring), B fret 1 (middle), G fret 2 (index). ' +
        'This is a 6-note pattern. Keep it flowing and even. Start at 60 BPM (one note per 8th note).',
      tab: [
        { string: 'e', steps: [null, null, null, '0', null, null, '|', null, null, null, '0', null, null, '|'] },
        { string: 'B', steps: [null, null, '1', null, '1', null, '|', null, null, '1', null, '1', null, '|'] },
        { string: 'G', steps: [null, '2', null, null, null, '2', '|', null, '2', null, null, null, '2', '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
        { string: 'A', steps: ['0', null, null, null, null, null, '|', '0', null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, '|', null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 0, color: 'root' },
        { string: 3, fret: 2, color: 'accent' },
        { string: 4, fret: 1, color: 'default' },
        { string: 5, fret: 0, color: 'default' },
      ],
      practiceNotes: {
        // A open=45; G fret 2=55+2=57; B fret 1=59+1=60; high e open=64
        steps: [
          { string: 1, fret: 0 },
          { string: 3, fret: 2 },
          { string: 4, fret: 1 },
          { string: 5, fret: 0 },
          { string: 4, fret: 1 },
          { string: 3, fret: 2 },
          { string: 1, fret: 0 },
          { string: 3, fret: 2 },
          { string: 4, fret: 1 },
          { string: 5, fret: 0 },
          { string: 4, fret: 1 },
          { string: 3, fret: 2 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: "D major",
          tab: [
            {string:"e",steps:[null,null,null,"2",null,null,"|",null,null,null,"2",null,null,"|"]},
            {string:"B",steps:[null,null,"3",null,"3",null,"|",null,null,"3",null,"3",null,"|"]},
            {string:"G",steps:[null,"2",null,null,null,"2","|",null,"2",null,null,null,"2","|"]},
            {string:"D",steps:["0",null,null,null,null,null,"|","0",null,null,null,null,null,"|"]},
            {string:"A",steps:[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
            {string:"E",steps:[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]}
          ],
          fretHighlights: [
            {string:2,fret:0},
            {string:3,fret:2},
            {string:4,fret:3},
            {string:5,fret:2}
          ],
          practiceNotes: {
            steps: [
              {string:2,fret:0},
              {string:3,fret:2},
              {string:4,fret:3},
              {string:5,fret:2},
              {string:4,fret:3},
              {string:3,fret:2},
              {string:2,fret:0},
              {string:3,fret:2},
              {string:4,fret:3},
              {string:5,fret:2},
              {string:4,fret:3},
              {string:3,fret:2}
            ],
            defaultBpm: 80
          },
        },
      ],
    },
    {
      id: 'finger-picking-4',
      moduleId: 'finger-picking',
      title: 'Independence Exercise: Melody Over Bass',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'The ultimate fingerpicking skill is playing independent parts simultaneously — a bass line with the thumb and a melody with the fingers. ' +
        'This requires your thumb to operate on autopilot while your fingers focus on the melody. Think of each hand as a separate instrument.',
      practiceRoutine:
        'Play a steady quarter-note bass on the A string open with your thumb while your ring finger plays a simple melody on the high E string: ' +
        'frets 0, 3, 5, 3. The bass and melody should be completely independent. Start at 40 BPM.',
      tab: [
        { string: 'e', steps: ['0', null, '3', null, '5', null, '3', null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, '0', null, '0', null, '0', null, '0', '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 0, color: 'root' },
        { string: 5, fret: 0, color: 'accent' },
        { string: 5, fret: 3, color: 'default' },
        { string: 5, fret: 5, color: 'default' },
      ],
      practiceNotes: {
        // high e: 0=64, 3=67, 5=69, 3=67; A open=45
        steps: [
          { string: 5, fret: 0 },
          { string: 1, fret: 0 },
          { string: 5, fret: 3 },
          { string: 1, fret: 0 },
          { string: 5, fret: 5 },
          { string: 1, fret: 0 },
          { string: 5, fret: 3 },
          { string: 1, fret: 0 },
        ],
        defaultBpm: 40,
      },
      examples: [
        {
            name: "E major",
          tab: [
            {string:"e",steps:[null,null,null,null,null,null,null,null,"|"]},
            {string:"B",steps:[null,null,null,null,null,null,null,null,"|"]},
            {string:"G",steps:[null,null,null,null,null,null,null,null,"|"]},
            {string:"D",steps:[null,null,null,null,null,null,null,"9","|"]},
            {string:"A",steps:[null,"7",null,"9",null,"11",null,null,"|"]},
            {string:"E",steps:["0",null,"0",null,"0",null,"0",null,"|"]}
          ],
          fretHighlights: [
            {string:0,fret:0},
            {string:1,fret:7},
            {string:1,fret:9},
            {string:1,fret:11},
            {string:2,fret:9}
          ],
          practiceNotes: {
            steps: [
              {string:0,fret:0},
              {string:1,fret:7},
              {string:0,fret:0},
              {string:1,fret:9},
              {string:0,fret:0},
              {string:1,fret:11},
              {string:0,fret:0},
              {string:2,fret:9}
            ],
            defaultBpm: 80
          },
        },
      ],
    },
  ],
};
