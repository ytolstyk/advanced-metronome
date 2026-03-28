import type { LessonModule } from '../types';

export const doubleThumpingModule: LessonModule = {
  id: 'double-thumping',
  title: 'Double Thumping',
  type: 'technique',
  description: 'Adapt bass slap technique to guitar — use your thumb to strike and pop strings for percussive, funky rhythm tones.',
  lessons: [
    {
      id: 'double-thumping-1',
      moduleId: 'double-thumping',
      title: 'Basic Thumb Slap',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'The thumb slap (or thump) uses the bony side of your thumb to strike the string against the fretboard, producing a percussive pop. ' +
        'Rotate your wrist like turning a doorknob — the thumb bounces off the string immediately after contact. ' +
        'Start on the low E string with a relaxed wrist. The sound should be punchy and short.',
      practiceRoutine:
        'Slap the open low E string with your thumb on beats 1 and 3. Let the string ring briefly, then mute with your fretting hand. ' +
        'Start at 80 BPM. Focus on a clean, percussive attack.',
      tab: [
        { string: 'e', steps: [null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, '|'] },
        { string: 'E', steps: ['S0', 'S0', 'S0', 'S0', '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
      ],
      practiceNotes: {
        // low E open=40
        steps: [
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
        ],
        defaultBpm: 80,
      },
    },
    {
      id: 'double-thumping-2',
      moduleId: 'double-thumping',
      title: 'Slap and Pop Combination',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'The pop (or pluck) complements the slap. Hook your index or middle finger under a higher string and snap it against the fretboard. ' +
        'The classic pattern alternates: slap a bass note, then pop a treble note. ' +
        'This creates the iconic funky "thump-pop" sound.',
      practiceRoutine:
        'Slap the open low E string, then pop the open G string. Alternate: slap-pop-slap-pop in steady eighth notes. ' +
        'Start at 80 BPM. Keep the volume balanced between slap and pop.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, 'P0', null, 'P0', null, 'P0', null, 'P0', '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['S0', null, 'S0', null, 'S0', null, 'S0', null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
        { string: 3, fret: 0, color: 'accent' },
      ],
      practiceNotes: {
        // low E open=40; G open=55
        steps: [
          { string: 0, fret: 0 },
          { string: 3, fret: 0 },
          { string: 0, fret: 0 },
          { string: 3, fret: 0 },
          { string: 0, fret: 0 },
          { string: 3, fret: 0 },
          { string: 0, fret: 0 },
          { string: 3, fret: 0 },
        ],
        defaultBpm: 80,
      },
    },
    {
      id: 'double-thumping-3',
      moduleId: 'double-thumping',
      title: 'Double Thump Technique',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'The "double thump" adds a second attack: after the initial downward slap, your thumb bounces back upward through the string for a second hit. ' +
        'This doubles your speed without extra effort. Think of it as a down-up strumming motion with just the thumb. ' +
        'Pioneered by Victor Wooten on bass, this technique translates well to guitar low strings.',
      practiceRoutine:
        'On the low E string: thumb slap down (D), then thumb slap up (U) in quick succession. ' +
        'Play D-U-D-U as sixteenth notes at 80 BPM. The down and up should sound equally strong.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['D0', 'U0', 'D0', 'U0', 'D0', 'U0', 'D0', 'U0', '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
      ],
      practiceNotes: {
        // low E open=40
        steps: [
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
          { string: 0, fret: 0 },
        ],
        defaultBpm: 80,
      },
    },
    {
      id: 'double-thumping-4',
      moduleId: 'double-thumping',
      title: 'Thump-Pop Groove with Fretting',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Combine double thumps with pops and fretting hand hammer-ons/pull-offs for a full groove. ' +
        'This creates complex rhythmic patterns entirely from one hand\'s thumb work plus pops. ' +
        'Add ghost notes (muted slaps) for rhythmic texture between the main notes.',
      practiceRoutine:
        'Play this groove: double thump on low E fret 3, pop G string fret 5, hammer-on to G fret 7, then ghost note. ' +
        'Loop this pattern at 60 BPM. The groove should feel funky and rhythmic.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, 'P5h7', null, null, 'P5h7', '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['D3', 'U3', null, 'D3', 'U3', null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 3, color: 'root' },
        { string: 3, fret: 5, color: 'accent' },
        { string: 3, fret: 7, color: 'default' },
      ],
      practiceNotes: {
        // low E fret 3=40+3=43; G fret 5=55+5=60; G fret 7=55+7=62
        steps: [
          { string: 0, fret: 3 },
          { string: 0, fret: 3 },
          { string: 3, fret: 5 },
          { string: 3, fret: 7 },
          { string: 0, fret: 3 },
          { string: 0, fret: 3 },
          { string: 3, fret: 5 },
          { string: 3, fret: 7 },
        ],
        defaultBpm: 80,
      },
    },
  ],
};
