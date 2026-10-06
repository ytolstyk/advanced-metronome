export type PresetScaleMode =
  | 'major'
  | 'minor'
  | 'harmonic_minor'
  | 'melodic_minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'pentatonic_major'
  | 'pentatonic_minor'
  | 'blues';

// 'custom' is a Scales-page-only mode; its intervals are user-selected page state.
export type ScaleMode = PresetScaleMode | 'custom';

export const SCALE_LABELS: Record<ScaleMode, string> = {
  major:            'Major',
  minor:            'Natural Minor',
  harmonic_minor:   'Harmonic Minor',
  melodic_minor:    'Melodic Minor',
  dorian:           'Dorian',
  phrygian:         'Phrygian',
  lydian:           'Lydian',
  mixolydian:       'Mixolydian',
  locrian:          'Locrian',
  pentatonic_major: 'Pentatonic Major',
  pentatonic_minor: 'Pentatonic Minor',
  blues:            'Blues',
  custom:           'Custom',
};

export const SCALE_MODES: PresetScaleMode[] = [
  'major',
  'minor',
  'harmonic_minor',
  'melodic_minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'pentatonic_major',
  'pentatonic_minor',
  'blues',
];

// Modes offered on the Scales page (presets + user-defined custom).
export const SCALE_PAGE_MODES: ScaleMode[] = [...SCALE_MODES, 'custom'];

// Semitone intervals from root (0 = root)
export const SCALE_INTERVALS: Record<PresetScaleMode, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor:   [0, 2, 3, 5, 7, 8, 11],
  melodic_minor:    [0, 2, 3, 5, 7, 9, 11],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  locrian:          [0, 1, 3, 5, 6, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
};

export { NOTE_NAMES } from './noteColors';

export const SCALE_PENTATONIC_SUBSET: Partial<Record<ScaleMode, number[]>> = {
  major:       [0, 2, 4, 7, 9],
  lydian:      [0, 2, 4, 7, 9],
  mixolydian:  [0, 2, 4, 7, 9],
  minor:       [0, 3, 5, 7, 10],
  dorian:      [0, 3, 5, 7, 10],
  phrygian:    [0, 3, 5, 7, 10],
};
