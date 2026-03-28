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
        'Start with a simple 3-string Am arpeggio shape on G, B, and high E strings: fret 7, fret 6, and fret 5 respectively.',
      practiceRoutine:
        'Play the Am arpeggio shape: G string fret 7, B string fret 6, high E string fret 5. Sweep downward (toward floor), then sweep upward to return. ' +
        'Use a metronome at 80 BPM. Each note should ring clearly and individually — no blurring.',
      "tab": [
        {"string":"e","steps":[null,null,"5",null,null,"5","|"]},
        {"string":"B","steps":[null,"6",null,null,"6",null,"|"]},
        {"string":"G","steps":["7",null,null,"7",null,null,"|"]},
        {"string":"D","steps":[null,null,null,null,null,null,"|"]},
        {"string":"A","steps":[null,null,null,null,null,null,"|"]},
        {"string":"E","steps":[null,null,null,null,null,null,"|"]}
      ],
      "fretHighlights": [
        {"string":3,"fret":7},
        {"string":4,"fret":6},
        {"string":5,"fret":5}
      ],
      "practiceNotes": {
        "steps": [
          {"string":3,"fret":7},
          {"string":4,"fret":6},
          {"string":5,"fret":5},
          {"string":3,"fret":7},
          {"string":4,"fret":6},
          {"string":5,"fret":5}
        ],
        "defaultBpm": 80
      },
      examples: [
        {
          name: "Down strokes",
          "tab": [
            {"string":"e","steps":[null,null,null,null,null,null,"|"]},
            {"string":"B","steps":["5",null,null,"5",null,null,"|"]},
            {"string":"G","steps":[null,"6",null,null,"6",null,"|"]},
            {"string":"D","steps":[null,null,"7",null,null,"7","|"]},
            {"string":"A","steps":[null,null,null,null,null,null,"|"]},
            {"string":"E","steps":[null,null,null,null,null,null,"|"]}
          ],
          "fretHighlights": [
            {"string":4,"fret":5},
            {"string":3,"fret":6},
            {"string":2,"fret":7}
          ],
          "practiceNotes": {
            "steps": [
              {"string":4,"fret":5},
              {"string":3,"fret":6},
              {"string":2,"fret":7},
              {"string":4,"fret":5},
              {"string":3,"fret":6},
              {"string":2,"fret":7}
            ],
            "defaultBpm": 80
          }
        }
      ],
    },
    {
      id: 'sweep-2',
      moduleId: 'sweep-picking',
      title: 'Three-String Major Sweep',
      difficulty: 'beginner',
      order: 2,
      explanation:
        'Now apply the sweep technique to a major arpeggio shape. The shape uses fret 9 on G, fret 10 on B, then frets 9 and 12 on high E. ' +
        'Focus on the rolling motion of your fretting fingers — each finger presses down as the pick arrives and releases immediately after.',
      practiceRoutine:
        'Sweep the shape: G string fret 9, B string fret 10, high E frets 9 and 12. Sweep down (G→B→e:9), reach e:12, then up-sweep (e:9→B→G). ' +
        'Start at 80 BPM. Listen for clean, separated notes.',
      "tab": [
        {"string":"e","steps":[null,null,"9","12","9",null,"|",null,null,"9","12","9",null,"|"]},
        {"string":"B","steps":[null,"10",null,null,null,"10","|",null,"10",null,null,null,"10","|"]},
        {"string":"G","steps":["9",null,null,null,null,null,"|","9",null,null,null,null,null,"|"]},
        {"string":"D","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
        {"string":"A","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
        {"string":"E","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]}
      ],
      "fretHighlights": [
        {"string":3,"fret":9},
        {"string":4,"fret":10},
        {"string":5,"fret":9},
        {"string":5,"fret":12}
      ],
      "practiceNotes": {
        "steps": [
          {"string":3,"fret":9},
          {"string":4,"fret":10},
          {"string":5,"fret":9},
          {"string":5,"fret":12},
          {"string":5,"fret":9},
          {"string":4,"fret":10},
          {"string":3,"fret":9},
          {"string":4,"fret":10},
          {"string":5,"fret":9},
          {"string":5,"fret":12},
          {"string":5,"fret":9},
          {"string":4,"fret":10}
        ],
        "defaultBpm": 80
      },
      examples: [
        {
          name: "E major",
          "tab": [
            {"string":"e","steps":[null,null,"12","16","12",null,"|",null,null,"12","16","12",null,"|"]},
            {"string":"B","steps":[null,"12",null,null,null,"12","|",null,"12",null,null,null,"12","|"]},
            {"string":"G","steps":["13",null,null,null,null,null,"|","13",null,null,null,null,null,"|"]},
            {"string":"D","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
            {"string":"A","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
            {"string":"E","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]}
          ],
          "fretHighlights": [
            {"string":3,"fret":13},
            {"string":4,"fret":12},
            {"string":5,"fret":12},
            {"string":5,"fret":16}
          ],
          "practiceNotes": {
            "steps": [
              {"string":3,"fret":13},
              {"string":4,"fret":12},
              {"string":5,"fret":12},
              {"string":5,"fret":16},
              {"string":5,"fret":12},
              {"string":4,"fret":12},
              {"string":3,"fret":13},
              {"string":4,"fret":12},
              {"string":5,"fret":12},
              {"string":5,"fret":16},
              {"string":5,"fret":12},
              {"string":4,"fret":12}
            ],
            "defaultBpm": 80
          }
        },
        {
          name: "E major #2",
          "tab": [
            {"string":"e","steps":[null,null,"7","12","7",null,"|",null,null,"7","12","7",null,"|"]},
            {"string":"B","steps":[null,"9",null,null,null,"9","|",null,"9",null,null,null,"9","|"]},
            {"string":"G","steps":["9",null,null,null,null,null,"|","9",null,null,null,null,null,"|"]},
            {"string":"D","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
            {"string":"A","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]},
            {"string":"E","steps":[null,null,null,null,null,null,"|",null,null,null,null,null,null,"|"]}
          ],
          "fretHighlights": [
            {"string":3,"fret":9},
            {"string":4,"fret":9},
            {"string":5,"fret":7},
            {"string":5,"fret":12}
          ],
          "practiceNotes": {
            "steps": [
              {"string":3,"fret":9},
              {"string":4,"fret":9},
              {"string":5,"fret":7},
              {"string":5,"fret":12},
              {"string":5,"fret":7},
              {"string":4,"fret":9},
              {"string":3,"fret":9},
              {"string":4,"fret":9},
              {"string":5,"fret":7},
              {"string":5,"fret":12},
              {"string":5,"fret":7},
              {"string":4,"fret":9}
            ],
            "defaultBpm": 80
          }
        }
      ]
    },
    {
      id: 'sweep-3',
      moduleId: 'sweep-picking',
      title: 'Arpeggio Sweep',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'The full 5-string sweep is the classic sweep picking sound. This Am shape spans from the A string to the high E string. ' +
        'The motion should feel like one fluid stroke downward, a tap at the top, then one fluid stroke upward. ' +
        'The biggest challenge is keeping unwanted strings silent — use left-hand muting and slight finger lifts.',
      practiceRoutine:
        'Sweep from high E (frets 15→12), through B (fret 13), G (fret 12), to D (frets 15, 12, 15), then reverse up through G (fret 12), B (fret 13), back to high E (fret 12). ' +
        'Start at 80 BPM. Play each note as a clean, distinct event.',
      "tab": [
        {"string":"e","steps":["15","12",null,null,null,null,null,null,null,"12","|"]},
        {"string":"B","steps":[null,null,"13",null,null,null,null,null,"13",null,"|"]},
        {"string":"G","steps":[null,null,null,"12",null,null,null,"12",null,null,"|"]},
        {"string":"D","steps":[null,null,null,null,"15","12","15",null,null,null,"|"]},
        {"string":"A","steps":[null,null,null,null,null,null,null,null,null,null,"|"]},
        {"string":"E","steps":[null,null,null,null,null,null,null,null,null,null,"|"]}
      ],
      "fretHighlights": [
        {"string":5,"fret":15},
        {"string":5,"fret":12},
        {"string":4,"fret":13},
        {"string":3,"fret":12},
        {"string":2,"fret":15},
        {"string":2,"fret":12}
      ],
      "practiceNotes": {
        "steps": [
          {"string":5,"fret":15},
          {"string":5,"fret":12},
          {"string":4,"fret":13},
          {"string":3,"fret":12},
          {"string":2,"fret":15},
          {"string":2,"fret":12},
          {"string":2,"fret":15},
          {"string":3,"fret":12},
          {"string":4,"fret":13},
          {"string":5,"fret":12}
        ],
        "defaultBpm": 80
      },
      examples: [
        {
          name: "Five string major",
          "tab": [
            {"string":"e","steps":[null,null,null,null,null,"8","12","8",null,null,null,null,"|"]},
            {"string":"B","steps":[null,null,null,null,"10",null,null,null,"10",null,null,null,"|"]},
            {"string":"G","steps":[null,null,null,"10",null,null,null,null,null,"10",null,null,"|"]},
            {"string":"D","steps":[null,null,"10",null,null,null,null,null,null,null,"10",null,"|"]},
            {"string":"A","steps":["8","12",null,null,null,null,null,null,null,null,null,"12","|"]},
            {"string":"E","steps":[null,null,null,null,null,null,null,null,null,null,null,null,"|"]}
          ],
          "fretHighlights": [
            {"string":1,"fret":8},
            {"string":1,"fret":12},
            {"string":2,"fret":10},
            {"string":3,"fret":10},
            {"string":4,"fret":10},
            {"string":5,"fret":8},
            {"string":5,"fret":12}
          ],
          "practiceNotes": {
            "steps": [
              {"string":1,"fret":8},
              {"string":1,"fret":12},
              {"string":2,"fret":10},
              {"string":3,"fret":10},
              {"string":4,"fret":10},
              {"string":5,"fret":8},
              {"string":5,"fret":12},
              {"string":5,"fret":8},
              {"string":4,"fret":10},
              {"string":3,"fret":10},
              {"string":2,"fret":10},
              {"string":1,"fret":12}
            ],
            "defaultBpm": 80
          }
        },
        {
          name: "Five string minor",
          "tab": [
            {"string":"e","steps":["17","12",null,null,null,null,null,null,null,null,null,"12","|"]},
            {"string":"B","steps":[null,null,"13",null,null,null,null,null,null,null,"13",null,"|"]},
            {"string":"G","steps":[null,null,null,"14",null,null,null,null,null,"14",null,null,"|"]},
            {"string":"D","steps":[null,null,null,null,"14",null,null,null,"14",null,null,null,"|"]},
            {"string":"A","steps":[null,null,null,null,null,"15","12","15",null,null,null,null,"|"]},
            {"string":"E","steps":[null,null,null,null,null,null,null,null,null,null,null,null,"|"]}
          ],
          "fretHighlights": [
            {"string":5,"fret":17},
            {"string":5,"fret":12},
            {"string":4,"fret":13},
            {"string":3,"fret":14},
            {"string":2,"fret":14},
            {"string":1,"fret":15},
            {"string":1,"fret":12}
          ],
          "practiceNotes": {
            "steps": [
              {"string":5,"fret":17},
              {"string":5,"fret":12},
              {"string":4,"fret":13},
              {"string":3,"fret":14},
              {"string":2,"fret":14},
              {"string":1,"fret":15},
              {"string":1,"fret":12},
              {"string":1,"fret":15},
              {"string":2,"fret":14},
              {"string":3,"fret":14},
              {"string":4,"fret":13},
              {"string":5,"fret":12}
            ],
            "defaultBpm": 80
          }
        }
      ]
    },
    {
      id: 'sweep-4',
      moduleId: 'sweep-picking',
      title: 'Sweep with Tapping Extension',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Combine sweep picking with a tap at the top of the arpeggio to extend the range. After the upward sweep reaches the high E string, ' +
        'tap fret 20 on the high E after ascending to fret 15, then return. ' +
        'This creates dramatic, wide-range arpeggios used extensively in neoclassical metal.',
      practiceRoutine:
        'Sweep up: G fret 14 → B fret 13 → high E fret 12, slide to fret 15, tap fret 20, then reverse: e:15, e:12, B:13, G:14. ' +
        'Start at 80 BPM. The tap should be at the same volume as the swept notes.',
      "tab": [
        {"string":"e","steps":[null,null,"12","15","T20","15","12",null,"|"]},
        {"string":"B","steps":[null,"13",null,null,null,null,null,"13","|"]},
        {"string":"G","steps":["14",null,null,null,null,null,null,null,"|"]},
        {"string":"D","steps":[null,null,null,null,null,null,null,null,"|"]},
        {"string":"A","steps":[null,null,null,null,null,null,null,null,"|"]},
        {"string":"E","steps":[null,null,null,null,null,null,null,null,"|"]}
      ],
      "fretHighlights": [
        {"string":3,"fret":14},
        {"string":4,"fret":13},
        {"string":5,"fret":12},
        {"string":5,"fret":15},
        {"string":5,"fret":20}
      ],
      "practiceNotes": {
        "steps": [
          {"string":3,"fret":14},
          {"string":4,"fret":13},
          {"string":5,"fret":12},
          {"string":5,"fret":15},
          {"string":5,"fret":20},
          {"string":5,"fret":15},
          {"string":5,"fret":12},
          {"string":4,"fret":13}
        ],
        "defaultBpm": 80
      },
      examples: [
        {
          name: "Alternating sweep and tap",
          "tab": [
            {"string":"e","steps":[null,null,null,"9","10","9",null,null,null,"9","T17","9",null,"|"]},
            {"string":"B","steps":[null,"10",null,null,null,null,"10",null,"10",null,null,null,"10","|"]},
            {"string":"G","steps":["9",null,null,null,null,null,null,"9",null,null,null,null,null,"|"]},
            {"string":"D","steps":[null,null,null,null,null,null,null,null,null,null,null,null,null,"|"]},
            {"string":"A","steps":[null,null,null,null,null,null,null,null,null,null,null,null,null,"|"]},
            {"string":"E","steps":[null,null,null,null,null,null,null,null,null,null,null,null,null,"|"]}
          ],
          "fretHighlights": [
            {"string":3,"fret":9},
            {"string":4,"fret":10},
            {"string":5,"fret":9},
            {"string":5,"fret":10},
            {"string":5,"fret":17}
          ],
          "practiceNotes": {
            "steps": [
              {"string":3,"fret":9},
              {"string":4,"fret":10},
              {"string":5,"fret":9},
              {"string":5,"fret":10},
              {"string":5,"fret":9},
              {"string":4,"fret":10},
              {"string":3,"fret":9},
              {"string":4,"fret":10},
              {"string":5,"fret":9},
              {"string":5,"fret":17},
              {"string":5,"fret":9},
              {"string":4,"fret":10}
            ],
            "defaultBpm": 80
          }
        }
      ]
    },
  ],
};
