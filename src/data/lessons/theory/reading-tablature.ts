import type { LessonModule } from '../types';

export const readingTablatureModule: LessonModule = {
  id: 'reading-tablature',
  title: 'Reading Tablature',
  type: 'theory',
  description:
    'Learn to read guitar tablature from scratch — decode the six-line staff, single notes, open strings, chord shapes, notation symbols, and full riffs.',
  lessons: [
    // ─────────────────────────────────────────────────────────
    // LESSON 1 — The Tab Staff
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-1',
      moduleId: 'reading-tablature',
      title: 'The Tab Staff',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Guitar tablature (tab) is a six-line staff where each line represents a string on the guitar. ' +
        'The bottom line is the thickest string — low E. The top line is the thinnest string — high e. ' +
        'Numbers tell you which fret to press; 0 means play the string open without pressing any fret. ' +
        'You read tab left to right, just like sheet music. Higher numbers mean higher up the neck — farther from the headstock.',
      practiceRoutine:
        'On the high e string (top line): play the open string (0), then fret 1 (index finger), fret 3 (ring finger), fret 5 (pinky). ' +
        'Hear how each step rises in pitch. Then reverse — 5, 3, 1, 0 — descending back down. ' +
        'Start at 60 BPM, one note per beat.',
      tab: [
        { string: 'e', steps: ['0', '1', '3', '5', '5', '3', '1', '0', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 0, color: 'root' },
        { string: 5, fret: 1, color: 'default' },
        { string: 5, fret: 3, color: 'default' },
        { string: 5, fret: 5, color: 'accent' },
      ],
      practiceNotes: {
        steps: [
          { string: 5, fret: 0 },
          { string: 5, fret: 1 },
          { string: 5, fret: 3 },
          { string: 5, fret: 5 },
          { string: 5, fret: 5 },
          { string: 5, fret: 3 },
          { string: 5, fret: 1 },
          { string: 5, fret: 0 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'B string',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'B', steps: ['0', '1', '3', '5', '5', '3', '1', '0', '|'] },
            { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 4, fret: 0, color: 'root' },
            { string: 4, fret: 1, color: 'default' },
            { string: 4, fret: 3, color: 'default' },
            { string: 4, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              { string: 4, fret: 0 },
              { string: 4, fret: 1 },
              { string: 4, fret: 3 },
              { string: 4, fret: 5 },
              { string: 4, fret: 5 },
              { string: 4, fret: 3 },
              { string: 4, fret: 1 },
              { string: 4, fret: 0 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'G string',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'G', steps: ['0', '1', '3', '5', '5', '3', '1', '0', '|'] },
            { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 3, fret: 0, color: 'root' },
            { string: 3, fret: 1, color: 'default' },
            { string: 3, fret: 3, color: 'default' },
            { string: 3, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              { string: 3, fret: 0 },
              { string: 3, fret: 1 },
              { string: 3, fret: 3 },
              { string: 3, fret: 5 },
              { string: 3, fret: 5 },
              { string: 3, fret: 3 },
              { string: 3, fret: 1 },
              { string: 3, fret: 0 },
            ],
            defaultBpm: 80,
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 2 — Open String Notes
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-2',
      moduleId: 'reading-tablature',
      title: 'Open String Notes',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'The six open strings are named E-A-D-G-B-e from lowest (thickest) to highest (thinnest). ' +
        '"Open" means no fingers on the fretboard — just pick the string. In tab, open strings always show as 0. ' +
        'Knowing all six string names cold is essential: whenever you see a line in tab, you immediately know which string it refers to. ' +
        'Low E and A are bass strings; D and G are mid; B and high e are treble.',
      practiceRoutine:
        'Pick each open string starting from low E, moving up one string at a time: E → A → D → G → B → e. ' +
        'Then reverse: e → B → G → D → A → E. Say each string name aloud as you play it. ' +
        'Repeat until you can name each string instantly without thinking. 60 BPM, one string per beat.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, '0', '|'] },
        { string: 'B', steps: [null, null, null, null, '0', null, '|'] },
        { string: 'G', steps: [null, null, null, '0', null, null, '|'] },
        { string: 'D', steps: [null, null, '0', null, null, null, '|'] },
        { string: 'A', steps: [null, '0', null, null, null, null, '|'] },
        { string: 'E', steps: ['0', null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
        { string: 1, fret: 0, color: 'default' },
        { string: 2, fret: 0, color: 'default' },
        { string: 3, fret: 0, color: 'accent' },
        { string: 4, fret: 0, color: 'default' },
        { string: 5, fret: 0, color: 'default' },
      ],
      practiceNotes: {
        steps: [
          { string: 0, fret: 0 },
          { string: 1, fret: 0 },
          { string: 2, fret: 0 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 5, fret: 0 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'High to low',
          tab: [
            { string: 'e', steps: ['0', null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, '0', null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, '0', null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, '0', null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, '0', null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, '0', '|'] },
          ],
          fretHighlights: [
            { string: 5, fret: 0, color: 'root' },
            { string: 4, fret: 0, color: 'default' },
            { string: 3, fret: 0, color: 'default' },
            { string: 2, fret: 0, color: 'accent' },
            { string: 1, fret: 0, color: 'default' },
            { string: 0, fret: 0, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              { string: 5, fret: 0 },
              { string: 4, fret: 0 },
              { string: 3, fret: 0 },
              { string: 2, fret: 0 },
              { string: 1, fret: 0 },
              { string: 0, fret: 0 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'Full sweep up & down',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, '0', '0', null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, '0', null, null, '0', null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, null, '0', null, null, null, null, '0', null, null, null, '|'] },
            { string: 'D', steps: [null, null, '0', null, null, null, null, null, null, '0', null, null, '|'] },
            { string: 'A', steps: [null, '0', null, null, null, null, null, null, null, null, '0', null, '|'] },
            { string: 'E', steps: ['0', null, null, null, null, null, null, null, null, null, null, '0', '|'] },
          ],
          fretHighlights: [
            { string: 0, fret: 0, color: 'root' },
            { string: 1, fret: 0, color: 'default' },
            { string: 2, fret: 0, color: 'default' },
            { string: 3, fret: 0, color: 'accent' },
            { string: 4, fret: 0, color: 'default' },
            { string: 5, fret: 0, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              { string: 0, fret: 0 },
              { string: 1, fret: 0 },
              { string: 2, fret: 0 },
              { string: 3, fret: 0 },
              { string: 4, fret: 0 },
              { string: 5, fret: 0 },
              { string: 5, fret: 0 },
              { string: 4, fret: 0 },
              { string: 3, fret: 0 },
              { string: 2, fret: 0 },
              { string: 1, fret: 0 },
              { string: 0, fret: 0 },
            ],
            defaultBpm: 80,
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 3 — Single Notes Anywhere
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-3',
      moduleId: 'reading-tablature',
      title: 'Single Notes Anywhere',
      difficulty: 'beginner',
      order: 3,
      explanation:
        'A number on any line means: press that fret on that string. ' +
        'The line tells you which string; the number tells you which fret. ' +
        'Tab pins down a specific location on the neck — no ambiguity. ' +
        'The same pitch can exist at multiple places on a guitar, but tab tells you exactly where the arranger intends you to play it. ' +
        'Work through a melody one note at a time: identify the string (line), find the fret (number), pick.',
      practiceRoutine:
        'Play this four-note melody on the G string: open (0), fret 2, fret 4, fret 5. ' +
        'These are the notes G, A, B, C — a major scale fragment. ' +
        'Then reverse (5–4–2–0) for a descending run. ' +
        'Try it on the D string at the same frets — notice the notes change but the fingering pattern is identical. ' +
        'Start at 60 BPM, one note per beat.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: ['0', '2', '4', '5', '4', '2', '0', '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 0, color: 'root' },
        { string: 3, fret: 2, color: 'default' },
        { string: 3, fret: 4, color: 'default' },
        { string: 3, fret: 5, color: 'accent' },
      ],
      practiceNotes: {
        steps: [
          { string: 3, fret: 0 },
          { string: 3, fret: 2 },
          { string: 3, fret: 4 },
          { string: 3, fret: 5 },
          { string: 3, fret: 4 },
          { string: 3, fret: 2 },
          { string: 3, fret: 0 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'D string',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, null, null, null, null, null, '|'] },
            { string: 'D', steps: ['0', '2', '4', '5', '4', '2', '0', '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 2, fret: 0, color: 'root' },
            { string: 2, fret: 2, color: 'default' },
            { string: 2, fret: 4, color: 'default' },
            { string: 2, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              { string: 2, fret: 0 },
              { string: 2, fret: 2 },
              { string: 2, fret: 4 },
              { string: 2, fret: 5 },
              { string: 2, fret: 4 },
              { string: 2, fret: 2 },
              { string: 2, fret: 0 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'Crossing strings',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'G', steps: ['0', '2', '4', '5', null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, '5', '4', '2', '0', '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 3, fret: 0, color: 'root' },
            { string: 3, fret: 2, color: 'default' },
            { string: 3, fret: 4, color: 'default' },
            { string: 3, fret: 5, color: 'accent' },
            { string: 2, fret: 0, color: 'root' },
            { string: 2, fret: 2, color: 'default' },
            { string: 2, fret: 4, color: 'default' },
            { string: 2, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              { string: 3, fret: 0 },
              { string: 3, fret: 2 },
              { string: 3, fret: 4 },
              { string: 3, fret: 5 },
              { string: 2, fret: 5 },
              { string: 2, fret: 4 },
              { string: 2, fret: 2 },
              { string: 2, fret: 0 },
            ],
            defaultBpm: 80,
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 4 — Reading Chords
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-4',
      moduleId: 'reading-tablature',
      title: 'Reading Chords',
      difficulty: 'beginner',
      order: 4,
      explanation:
        'When numbers are stacked vertically in tab — appearing in the same column — you play them simultaneously as a chord. ' +
        '"x" means mute that string (don\'t play it at all). "0" means play it open. ' +
        'Em (E minor) is one of the easiest chords to read: press the A string at fret 2 and the D string at fret 2, ' +
        'while every other string rings open. The tab shows all six strings stacked: 0-0-0-2-2-0 from top (high e) to bottom (low E). ' +
        'Strumming down across all six strings gives you the full chord.',
      practiceRoutine:
        'Fret A string at 2 and D string at 2, then strum all six strings. ' +
        'Then try arpeggating — pick each string individually from low E up to high e, one note per beat. ' +
        'Arpeggiation lets you check that each note rings cleanly. Start at 60 BPM.',
      tab: [
        { string: 'e', steps: ['0', '0', '0', '0', '|'] },
        { string: 'B', steps: ['0', '0', '0', '0', '|'] },
        { string: 'G', steps: ['0', '0', '0', '0', '|'] },
        { string: 'D', steps: ['2', '2', '2', '2', '|'] },
        { string: 'A', steps: ['2', '2', '2', '2', '|'] },
        { string: 'E', steps: ['0', '0', '0', '0', '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
        { string: 1, fret: 2, color: 'accent' },
        { string: 2, fret: 2, color: 'root' },
        { string: 3, fret: 0},
        { string: 4, fret: 0},
        { string: 5, fret: 0},
      ],
      practiceNotes: {
        steps: [
          [{ string: 0, fret: 0 },
          { string: 1, fret: 2 },
          { string: 2, fret: 2 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 5, fret: 0 }],
          [{ string: 5, fret: 0 },
          { string: 4, fret: 0 },
          { string: 3, fret: 0 },
          { string: 2, fret: 2 },
          { string: 1, fret: 2 },
          { string: 0, fret: 0 }],
          [{ string: 5, fret: 0 },
          { string: 4, fret: 0 },
          { string: 3, fret: 0 },
          { string: 2, fret: 2 },
          { string: 1, fret: 2 },
          { string: 0, fret: 0 }],
          [{ string: 5, fret: 0 },
          { string: 4, fret: 0 },
          { string: 3, fret: 0 },
          { string: 2, fret: 2 },
          { string: 1, fret: 2 },
          { string: 0, fret: 0 }],
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'Am chord',
          tab: [
            { string: 'e', steps: ['0', '0', '0', '0', '|'] },
            { string: 'B', steps: ['1', '1', '1', '1', '|'] },
            { string: 'G', steps: ['2', '2', '2', '2', '|'] },
            { string: 'D', steps: ['2', '2', '2', '2', '|'] },
            { string: 'A', steps: ['0', '0', '0', '0', '|'] },
            { string: 'E', steps: ['x', 'x', 'x', 'x', '|'] },
          ],
          fretHighlights: [
            { string: 1, fret: 0, color: 'root' },
            { string: 2, fret: 2, color: 'accent' },
            { string: 3, fret: 2, color: 'default' },
            { string: 4, fret: 1, color: 'default' },
            { string: 5, fret: 0, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              [{ string: 1, fret: 0 },
              { string: 2, fret: 2 },
              { string: 3, fret: 2 },
              { string: 4, fret: 1 },
              { string: 5, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 1 },
              { string: 3, fret: 2 },
              { string: 2, fret: 2 },
              { string: 1, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 1 },
              { string: 3, fret: 2 },
              { string: 2, fret: 2 },
              { string: 1, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 1 },
              { string: 3, fret: 2 },
              { string: 2, fret: 2 },
              { string: 1, fret: 0 }],
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'E major chord',
          tab: [
            { string: 'e', steps: ['0', '0', '0', '0', '|'] },
            { string: 'B', steps: ['0', '0', '0', '0', '|'] },
            { string: 'G', steps: ['1', '1', '1', '1', '|'] },
            { string: 'D', steps: ['2', '2', '2', '2', '|'] },
            { string: 'A', steps: ['2', '2', '2', '2', '|'] },
            { string: 'E', steps: ['0', '0', '0', '0', '|'] },
          ],
          fretHighlights: [
            { string: 0, fret: 0, color: 'root' },
            { string: 1, fret: 2, color: 'accent' },
            { string: 2, fret: 2, color: 'root' },
            { string: 3, fret: 1, color: 'default' },
            { string: 4, fret: 0, color: 'default' },
            { string: 5, fret: 0, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              [{ string: 0, fret: 0 },
              { string: 1, fret: 2 },
              { string: 2, fret: 2 },
              { string: 3, fret: 1 },
              { string: 4, fret: 0 },
              { string: 5, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 0 },
              { string: 3, fret: 1 },
              { string: 2, fret: 2 },
              { string: 1, fret: 2 },
              { string: 0, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 0 },
              { string: 3, fret: 1 },
              { string: 2, fret: 2 },
              { string: 1, fret: 2 },
              { string: 0, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 0 },
              { string: 3, fret: 1 },
              { string: 2, fret: 2 },
              { string: 1, fret: 2 },
              { string: 0, fret: 0 }],
            ],
            defaultBpm: 80,
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 5 — Open Chord Library
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-5',
      moduleId: 'reading-tablature',
      title: 'Open Chord Library',
      difficulty: 'beginner',
      order: 5,
      explanation:
        'Five open chords unlock hundreds of songs: G, C, D, Em, and Am. ' +
        'Each has a distinct shape in tab that you should be able to recognize at a glance. ' +
        'G uses all six strings with fretted notes on the low and high strings. ' +
        'C and D mute the lowest strings (shown as x) — a key detail to watch for. ' +
        'Em and Am (covered in the previous lesson) are the simplest: just two fretted notes. ' +
        'Practice reading each shape before you play it — identify every number and x before picking up the guitar.',
      practiceRoutine:
        'Arpeggiate the G chord: play each string from low E to high e, one per beat, checking each note rings clearly. ' +
        'Then try the examples: C chord (skip low E) and D chord (skip E and A). ' +
        'Strum each chord four times before moving to the next. Start at 60 BPM.',
      tab: [
        { string: 'e', steps: ['3', '3', '3', '3', '|'] },
        { string: 'B', steps: ['3', '3', '3', '3', '|'] },
        { string: 'G', steps: ['0', '0', '0', '0', '|'] },
        { string: 'D', steps: ['0', '0', '0', '0', '|'] },
        { string: 'A', steps: ['2', '2', '2', '2', '|'] },
        { string: 'E', steps: ['3', '3', '3', '3', '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 3, color: 'root' },
        { string: 1, fret: 2, color: 'default' },
        { string: 2, fret: 0, color: 'default' },
        { string: 3, fret: 0, color: 'root' },
        { string: 4, fret: 3, color: 'default' },
        { string: 5, fret: 3, color: 'accent' },
      ],
      practiceNotes: {
        steps: [
          [{ string: 0, fret: 3 },
          { string: 1, fret: 2 },
          { string: 2, fret: 0 },
          { string: 3, fret: 0 },
          { string: 4, fret: 3 },
          { string: 5, fret: 3 }],
          [{ string: 5, fret: 3 },
          { string: 4, fret: 3 },
          { string: 3, fret: 0 },
          { string: 2, fret: 0 },
          { string: 1, fret: 2 },
          { string: 0, fret: 3 }],
          [{ string: 5, fret: 3 },
          { string: 4, fret: 3 },
          { string: 3, fret: 0 },
          { string: 2, fret: 0 },
          { string: 1, fret: 2 },
          { string: 0, fret: 3 }],
          [{ string: 5, fret: 3 },
          { string: 4, fret: 3 },
          { string: 3, fret: 0 },
          { string: 2, fret: 0 },
          { string: 1, fret: 2 },
          { string: 0, fret: 3 }],
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'C chord',
          tab: [
            { string: 'e', steps: ['0', '0', '0', '0', '|'] },
            { string: 'B', steps: ['1', '1', '1', '1', '|'] },
            { string: 'G', steps: ['0', '0', '0', '0', '|'] },
            { string: 'D', steps: ['2', '2', '2', '2', '|'] },
            { string: 'A', steps: ['3', '3', '3', '3', '|'] },
            { string: 'E', steps: ['x', 'x', 'x', 'x', '|'] },
          ],
          fretHighlights: [
            { string: 1, fret: 3, color: 'root' },
            { string: 2, fret: 2, color: 'default' },
            { string: 3, fret: 0, color: 'default' },
            { string: 4, fret: 1, color: 'root' },
            { string: 5, fret: 0, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              [{ string: 1, fret: 3 },
              { string: 2, fret: 2 },
              { string: 3, fret: 0 },
              { string: 4, fret: 1 },
              { string: 5, fret: 0 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 1 },
              { string: 3, fret: 0 },
              { string: 2, fret: 2 },
              { string: 1, fret: 3 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 1 },
              { string: 3, fret: 0 },
              { string: 2, fret: 2 },
              { string: 1, fret: 3 }],
              [{ string: 5, fret: 0 },
              { string: 4, fret: 1 },
              { string: 3, fret: 0 },
              { string: 2, fret: 2 },
              { string: 1, fret: 3 }],
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'D chord',
          tab: [
            { string: 'e', steps: ['2', '2', '2', '2', '|'] },
            { string: 'B', steps: ['3', '3', '3', '3', '|'] },
            { string: 'G', steps: ['2', '2', '2', '2', '|'] },
            { string: 'D', steps: ['0', '0', '0', '0', '|'] },
            { string: 'A', steps: ['x', 'x', 'x', 'x', '|'] },
            { string: 'E', steps: ['x', 'x', 'x', 'x', '|'] },
          ],
          fretHighlights: [
            { string: 2, fret: 0, color: 'root' },
            { string: 3, fret: 2, color: 'default' },
            { string: 4, fret: 3, color: 'accent' },
            { string: 5, fret: 2, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              [{ string: 2, fret: 0 },
              { string: 3, fret: 2 },
              { string: 4, fret: 3 },
              { string: 5, fret: 2 }],
              [{ string: 5, fret: 2 },
              { string: 4, fret: 3 },
              { string: 3, fret: 2 },
              { string: 2, fret: 0 }],
            ],
            defaultBpm: 80,
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 6 — Notation Symbols: h, p, / and \
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-6',
      moduleId: 'reading-tablature',
      title: 'Notation Symbols',
      difficulty: 'intermediate',
      order: 6,
      explanation:
        'Tab uses shorthand symbols between fret numbers to show how to connect them. ' +
        '"h" = hammer-on: pick the first note, then slam a fretting finger onto the higher fret without picking again. ' +
        '"p" = pull-off: pick the higher note, then snap your finger off the string to sound the lower note beneath it. ' +
        '"/" = slide up: fret the first note, then glide your finger up the string toward the higher fret. ' +
        '"\\\\": slide down: glide from the higher fret toward the lower. ' +
        'Examples: "5h7" means pick fret 5, hammer to fret 7. "7p5" means pick fret 7, pull off to fret 5. ' +
        '"5/7" means slide from 5 up to 7. The second note in each case is not picked.',
      practiceRoutine:
        'On the high e string, play 5h7 four times. Make the hammered note as loud as the picked one — this requires speed and force. ' +
        'Then play 7p5 four times, snapping your finger off the string sharply. ' +
        'Finally try the slides: 5/7 (smooth upward glide) and 7\\\\5 (smooth downward glide). ' +
        'Start at 70 BPM.',
      tab: [
        { string: 'e', steps: ['5h7', '5h7', '5h7', '5h7', '7p5', '7p5', '7p5', '7p5', '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 5, fret: 5, color: 'root' },
        { string: 5, fret: 7, color: 'accent' },
      ],
      practiceNotes: {
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
          name: 'G string',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'G', steps: ['5h7', '5h7', '5h7', '5h7', '7p5', '7p5', '7p5', '7p5', '|'] },
            { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 3, fret: 5, color: 'root' },
            { string: 3, fret: 7, color: 'accent' },
          ],
          practiceNotes: {
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
          name: 'Slides on B string',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'B', steps: ['5/7', '5/7', '5/7', '5/7', '7\\5', '7\\5', '7\\5', '7\\5', '|'] },
            { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 4, fret: 5, color: 'root' },
            { string: 4, fret: 7, color: 'accent' },
          ],
          practiceNotes: {
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
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 7 — Power Chords
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-7',
      moduleId: 'reading-tablature',
      title: 'Power Chords',
      difficulty: 'intermediate',
      order: 7,
      explanation:
        'A power chord is a two-note shape — root and its fifth. It is completely movable: slide the same shape ' +
        'up or down the neck and it always works, regardless of key. ' +
        'In tab, power chords appear as two stacked numbers on adjacent low strings. ' +
        'On the low E string: E5 = E(0) + A(2). Move it up three frets: G5 = E(3) + A(5). Two more: A5 = E(5) + A(7). ' +
        'The same shape works rooted on the A string: A5 = A(0) + D(2), B5 = A(2) + D(4), C5 = A(3) + D(5). ' +
        'Mute all other strings — power chords sound their best clean and focused.',
      practiceRoutine:
        'Play E5 → G5 → A5 → G5 on the low E and A strings. Hold each shape for two beats, picking both strings together. ' +
        'Focus on muting the higher strings with the side of your pick-hand palm. ' +
        'Start at 70 BPM.',
      tab: [
        { string: 'e', steps: [null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, '|'] },
        { string: 'A', steps: ['2', '5', '7', '5', '|'] },
        { string: 'E', steps: ['0', '3', '5', '3', '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
        { string: 1, fret: 2, color: 'accent' },
        { string: 0, fret: 3, color: 'root' },
        { string: 1, fret: 5, color: 'accent' },
        { string: 0, fret: 5, color: 'root' },
        { string: 1, fret: 7, color: 'accent' },
      ],
      practiceNotes: {
        steps: [
          [{ string: 0, fret: 0 }, { string: 1, fret: 2 }],
          [{ string: 0, fret: 3 }, { string: 1, fret: 5 }],
          [{ string: 0, fret: 5 }, { string: 1, fret: 7 }],
          [{ string: 0, fret: 3 }, { string: 1, fret: 5 }],
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'A-string rooted chords',
          tab: [
            { string: 'e', steps: [null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, null, null, '|'] },
            { string: 'D', steps: ['2', '4', '5', '7', '|'] },
            { string: 'A', steps: ['0', '2', '3', '5', '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 1, fret: 0, color: 'root' },
            { string: 2, fret: 2, color: 'accent' },
            { string: 1, fret: 2, color: 'root' },
            { string: 2, fret: 4, color: 'accent' },
            { string: 1, fret: 3, color: 'root' },
            { string: 2, fret: 5, color: 'accent' },
            { string: 1, fret: 5, color: 'root' },
            { string: 2, fret: 7, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              [{ string: 1, fret: 0 }, { string: 2, fret: 2 }],
              [{ string: 1, fret: 2 }, { string: 2, fret: 4 }],
              [{ string: 1, fret: 3 }, { string: 2, fret: 5 }],
              [{ string: 1, fret: 5 }, { string: 2, fret: 7 }],
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'D-string rooted chords',
          tab: [
            { string: 'e', steps: [null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, '|'] },
            { string: 'G', steps: ['2', '4', '5', '4', '|'] },
            { string: 'D', steps: ['0', '2', '3', '2', '|'] },
            { string: 'A', steps: [null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 2, fret: 0, color: 'root' },
            { string: 3, fret: 2, color: 'accent' },
            { string: 2, fret: 2, color: 'root' },
            { string: 3, fret: 4, color: 'accent' },
            { string: 2, fret: 3, color: 'root' },
            { string: 3, fret: 5, color: 'accent' },
          ],
          practiceNotes: {
            steps: [
              [{ string: 2, fret: 0 }, { string: 3, fret: 2 }],
              [{ string: 2, fret: 2 }, { string: 3, fret: 4 }],
              [{ string: 2, fret: 3 }, { string: 3, fret: 5 }],
              [{ string: 2, fret: 2 }, { string: 3, fret: 4 }],
            ],
            defaultBpm: 80,
          },
        },
      ],
    },

    // ─────────────────────────────────────────────────────────
    // LESSON 8 — Reading a Full Riff
    // ─────────────────────────────────────────────────────────
    {
      id: 'tab-8',
      moduleId: 'reading-tablature',
      title: 'Reading a Full Riff',
      difficulty: 'intermediate',
      order: 8,
      explanation:
        'A complete riff combines everything you\'ve learned: single notes across multiple strings, position shifts, and notation symbols. ' +
        'The key to reading a riff fluently is breaking it into small sections. ' +
        'First, scan all the strings that have notes. Then work through each note: which string (which line), which fret (which number), any technique symbol. ' +
        'Play it at half speed first — speed comes after accuracy. ' +
        'This riff walks up the low strings using the A minor pentatonic root positions: a great pattern for both reading practice and real music.',
      practiceRoutine:
        'Read through the riff one note at a time before playing. Identify each string and fret. ' +
        'Play at 60 BPM, one note per beat, focusing on clean transitions between strings. ' +
        'Once it feels smooth, push to 80 BPM. The riff ascends across low E → A → D strings — keep your fretting hand relaxed as you shift positions.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, '0', '2', '|'] },
        { string: 'A', steps: [null, null, null, '0', '2', '3', null, null, '|'] },
        { string: 'E', steps: ['0', '3', '5', null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 0, color: 'root' },
        { string: 0, fret: 3, color: 'default' },
        { string: 0, fret: 5, color: 'default' },
        { string: 1, fret: 0, color: 'accent' },
        { string: 1, fret: 2, color: 'default' },
        { string: 1, fret: 3, color: 'default' },
        { string: 2, fret: 0, color: 'accent' },
        { string: 2, fret: 2, color: 'default' },
      ],
      practiceNotes: {
        steps: [
          { string: 0, fret: 0 },
          { string: 0, fret: 3 },
          { string: 0, fret: 5 },
          { string: 1, fret: 0 },
          { string: 1, fret: 2 },
          { string: 1, fret: 3 },
          { string: 2, fret: 0 },
          { string: 2, fret: 2 },
        ],
        defaultBpm: 80,
      },
      examples: [
        {
          name: 'With hammer-ons',
          tab: [
            { string: 'e', steps: [null, null, null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, null, null, null, '|'] },
            { string: 'G', steps: [null, null, null, null, null, null, '|'] },
            { string: 'D', steps: [null, null, null, null, '0', '2', '|'] },
            { string: 'A', steps: [null, null, '0', '2h3', null, null, '|'] },
            { string: 'E', steps: ['0', '3h5', null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 0, fret: 0, color: 'root' },
            { string: 0, fret: 3, color: 'default' },
            { string: 0, fret: 5, color: 'default' },
            { string: 1, fret: 0, color: 'accent' },
            { string: 1, fret: 2, color: 'default' },
            { string: 1, fret: 3, color: 'default' },
            { string: 2, fret: 0, color: 'accent' },
            { string: 2, fret: 2, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              { string: 0, fret: 0 },
              { string: 0, fret: 3 },
              { string: 0, fret: 5 },
              { string: 1, fret: 0 },
              { string: 1, fret: 2 },
              { string: 1, fret: 3 },
              { string: 2, fret: 0 },
              { string: 2, fret: 2 },
            ],
            defaultBpm: 80,
          },
        },
        {
          name: 'Pentatonic lick — high strings',
          tab: [
            { string: 'e', steps: ['5', '8', '10', null, null, null, null, '|'] },
            { string: 'B', steps: [null, null, null, '5', '8', '10', null, '|'] },
            { string: 'G', steps: [null, null, null, null, null, null, '7', '|'] },
            { string: 'D', steps: [null, null, null, null, null, null, null, '|'] },
            { string: 'A', steps: [null, null, null, null, null, null, null, '|'] },
            { string: 'E', steps: [null, null, null, null, null, null, null, '|'] },
          ],
          fretHighlights: [
            { string: 5, fret: 5, color: 'root' },
            { string: 5, fret: 8, color: 'default' },
            { string: 5, fret: 10, color: 'accent' },
            { string: 4, fret: 5, color: 'root' },
            { string: 4, fret: 8, color: 'default' },
            { string: 4, fret: 10, color: 'accent' },
            { string: 3, fret: 7, color: 'default' },
          ],
          practiceNotes: {
            steps: [
              { string: 5, fret: 5 },
              { string: 5, fret: 8 },
              { string: 5, fret: 10 },
              { string: 4, fret: 5 },
              { string: 4, fret: 8 },
              { string: 4, fret: 10 },
              { string: 3, fret: 7 },
            ],
            defaultBpm: 80,
          },
        },
      ],
    },
  ],
};
