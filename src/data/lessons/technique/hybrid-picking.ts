import type { LessonModule } from '../types';

export const hybridPickingModule: LessonModule = {
  id: 'hybrid-picking',
  title: 'Hybrid Picking',
  type: 'technique',
  description: 'Combine pick and fingers simultaneously — use the pick for bass notes and middle/ring fingers for upper strings to play complex patterns impossible with pick alone.',
  lessons: [
    {
      id: 'hybrid-1',
      moduleId: 'hybrid-picking',
      title: 'Pick + Middle Finger Basics',
      difficulty: 'beginner',
      order: 1,
      explanation:
        'Hybrid picking means holding the pick normally while using your free fingers (middle, ring, pinky) to pluck other strings. ' +
        'The most basic form uses the pick on a low string and the middle finger on a higher string simultaneously or in alternation. ' +
        'This technique is essential in country, bluegrass, and modern rock.',
      practiceRoutine:
        'Pick the low E string fret 3 with the pick and pluck the open B string with your middle finger, alternating. ' +
        'Alternate: pick bass, pluck treble, pick bass, pluck treble at 60 BPM.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, 'm0', null, 'm0', null, 'm0', null, 'm0', '|'] },
        { string: 'G', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['p3', null, 'p3', null, 'p3', null, 'p3', null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 3, color: 'root' },
        { string: 4, fret: 0, color: 'accent' },
      ],
      practiceNotes: {
        // low E fret 3=40+3=43; B open=59
        steps: [
          { string: 0, fret: 3 },
          { string: 4, fret: 0 },
          { string: 0, fret: 3 },
          { string: 4, fret: 0 },
          { string: 0, fret: 3 },
          { string: 4, fret: 0 },
          { string: 0, fret: 3 },
          { string: 4, fret: 0 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'hybrid-2',
      moduleId: 'hybrid-picking',
      title: 'Banjo Rolls',
      difficulty: 'intermediate',
      order: 2,
      explanation:
        'Banjo rolls are three-note repeating patterns using pick-middle-ring (or variations). ' +
        'The pick hits a bass string, middle finger plucks a middle string, ring finger plucks a high string, creating a rolling arpeggio effect. ' +
        'This is the signature sound of country and bluegrass guitar.',
      practiceRoutine:
        'Hold a G chord. Play a forward roll: pick low E fret 3, middle finger G open, ring finger B open, repeat as triplets at 60 BPM.',
      tab: [
        { string: 'e', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'B', steps: [null, null, 'a0', null, null, 'a0', null, null, 'a0', null, null, 'a0', '|'] },
        { string: 'G', steps: [null, 'm0', null, null, 'm0', null, null, 'm0', null, null, 'm0', null, '|'] },
        { string: 'D', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, null, null, null, null, null, null, null, null, '|'] },
        { string: 'E', steps: ['p3', null, null, 'p3', null, null, 'p3', null, null, 'p3', null, null, '|'] },
      ],
      fretHighlights: [
        { string: 0, fret: 3, color: 'root' },
        { string: 3, fret: 0, color: 'accent' },
        { string: 4, fret: 0, color: 'default' },
      ],
      practiceNotes: {
        // low E fret 3=43; G open=55; B open=59
        steps: [
          { string: 0, fret: 3 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 0, fret: 3 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 0, fret: 3 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
          { string: 0, fret: 3 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
        ],
        defaultBpm: 60,
      },
    },
    {
      id: 'hybrid-3',
      moduleId: 'hybrid-picking',
      title: 'Double Stops with Hybrid Picking',
      difficulty: 'intermediate',
      order: 3,
      explanation:
        'Double stops (two notes at once) are a natural fit for hybrid picking. The pick plays one note while a finger plucks another simultaneously. ' +
        'This creates intervals like 3rds, 6ths, and octaves that ring together. ' +
        'Country pedal steel licks rely heavily on this technique.',
      practiceRoutine:
        'Play 3rds on the G and B strings simultaneously: G(4)/B(5), G(5)/B(6), G(5)/B(6), G(7)/B(8). ' +
        'Start at 50 BPM, one double stop per beat.',
      tab: [
        { string: 'e', steps: [null, null, null, null, '|'] },
        { string: 'B', steps: ['5', '6', '6', '8', '|'] },
        { string: 'G', steps: ['4', '5', '5', '7', '|'] },
        { string: 'D', steps: [null, null, null, null, '|'] },
        { string: 'A', steps: [null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 3, fret: 4, color: 'root' },
        { string: 3, fret: 5, color: 'accent' },
        { string: 3, fret: 7, color: 'default' },
        { string: 4, fret: 5, color: 'accent' },
        { string: 4, fret: 6, color: 'default' },
        { string: 4, fret: 8, color: 'default' },
      ],
      practiceNotes: {
        // G fret 4=55+4=59 (but played simultaneously with B fret 5=64); list G then B for each
        // G:4=59, B:5=64; G:5=60, B:6=65; G:7=62, B:8=67
        steps: [
          { string: 3, fret: 4 },
          { string: 4, fret: 5 },
          { string: 3, fret: 5 },
          { string: 4, fret: 6 },
          { string: 3, fret: 5 },
          { string: 4, fret: 6 },
          { string: 3, fret: 7 },
          { string: 4, fret: 8 },
        ],
        defaultBpm: 50,
      },
    },
    {
      id: 'hybrid-4',
      moduleId: 'hybrid-picking',
      title: 'Hybrid Picking Arpeggios',
      difficulty: 'advanced',
      order: 4,
      explanation:
        'Use hybrid picking to play wide-interval arpeggios that would be impossible with a pick alone. ' +
        'The pick handles non-adjacent bass notes while fingers grab upper strings, allowing you to skip strings effortlessly. ' +
        'This opens up voicings and textures unique to hybrid picking.',
      practiceRoutine:
        'Play a Cmaj7 arpeggio: pick A string fret 3 (C), middle finger plucks G open, ring finger plucks high E open, ' +
        'then pick D string fret 2 (E), middle finger plucks B fret 1 (C). Start at 50 BPM.',
      tab: [
        { string: 'e', steps: [null, null, 'a0', null, null, null, null, null, 'a0', null, '|'] },
        { string: 'B', steps: [null, null, null, null, 'm1', null, null, null, null, 'm1', '|'] },
        { string: 'G', steps: [null, 'm0', null, null, null, null, null, 'm0', null, null, '|'] },
        { string: 'D', steps: [null, null, null, 'p2', null, null, null, null, null, null, '|'] },
        { string: 'A', steps: ['p3', null, null, null, null, 'p3', null, null, null, null, '|'] },
        { string: 'E', steps: [null, null, null, null, null, null, null, null, null, null, '|'] },
      ],
      fretHighlights: [
        { string: 1, fret: 3, color: 'root' },
        { string: 3, fret: 0, color: 'accent' },
        { string: 5, fret: 0, color: 'default' },
        { string: 2, fret: 2, color: 'accent' },
        { string: 4, fret: 1, color: 'default' },
      ],
      practiceNotes: {
        // A fret 3=45+3=48; G open=55; high e open=64; D fret 2=50+2=52; B fret 1=59+1=60
        steps: [
          { string: 1, fret: 3 },
          { string: 3, fret: 0 },
          { string: 5, fret: 0 },
          { string: 2, fret: 2 },
          { string: 4, fret: 1 },
          { string: 1, fret: 3 },
          { string: 3, fret: 0 },
          { string: 5, fret: 0 },
          { string: 2, fret: 2 },
          { string: 4, fret: 1 },
        ],
        defaultBpm: 50,
      },
    },
  ],
};
