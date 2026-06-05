export type IntervalName =
  | 'Unison'
  | 'Minor 2nd'
  | 'Major 2nd'
  | 'Minor 3rd'
  | 'Major 3rd'
  | 'Perfect 4th'
  | 'Tritone'
  | 'Perfect 5th'
  | 'Minor 6th'
  | 'Major 6th'
  | 'Minor 7th'
  | 'Major 7th'
  | 'Octave';

export const INTERVAL_SEMITONES: Record<IntervalName, number> = {
  'Unison':      0,
  'Minor 2nd':   1,
  'Major 2nd':   2,
  'Minor 3rd':   3,
  'Major 3rd':   4,
  'Perfect 4th': 5,
  'Tritone':     6,
  'Perfect 5th': 7,
  'Minor 6th':   8,
  'Major 6th':   9,
  'Minor 7th':   10,
  'Major 7th':   11,
  'Octave':      12,
};

export const INTERVAL_NAMES: IntervalName[] = [
  'Unison',
  'Minor 2nd',
  'Major 2nd',
  'Minor 3rd',
  'Major 3rd',
  'Perfect 4th',
  'Tritone',
  'Perfect 5th',
  'Minor 6th',
  'Major 6th',
  'Minor 7th',
  'Major 7th',
  'Octave',
];

export type IntervalRange = 'up-to-tritone' | 'up-to-octave' | 'all';

// Max semitones included for each range setting
export const INTERVAL_RANGE_MAX: Record<IntervalRange, number> = {
  'up-to-tritone': 6,
  'up-to-octave':  12,
  'all':           12, // forward-compatible; same as up-to-octave for MVP
};

export type IntervalDirection = 'ascending' | 'descending' | 'harmonic' | 'random';
