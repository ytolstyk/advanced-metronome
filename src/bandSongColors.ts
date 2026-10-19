import { SONG_COLOR_KEYS, type SongColorKey } from './bandTypes';

/** How much of the song color tints a song card (kept low so muted text stays readable on it). */
export const SONG_COLOR_TINT_PERCENT = 8;

/** Display data for the song color palette. */
export const SONG_COLOR_STYLES: Record<SongColorKey, { label: string; hex: string }> = {
  red: { label: 'Red', hex: '#ef4444' },
  orange: { label: 'Orange', hex: '#f97316' },
  yellow: { label: 'Yellow', hex: '#eab308' },
  green: { label: 'Green', hex: '#22c55e' },
  teal: { label: 'Teal', hex: '#14b8a6' },
  blue: { label: 'Blue', hex: '#3b82f6' },
  purple: { label: 'Purple', hex: '#a855f7' },
  pink: { label: 'Pink', hex: '#ec4899' },
};

export const SONG_COLOR_OPTIONS = SONG_COLOR_KEYS.map((key) => ({ key, ...SONG_COLOR_STYLES[key] }));

/** A band's names for its palette colors ("Ballad" for red); colors without one are absent. */
export type ColorLabels = ReadonlyMap<SongColorKey, string>;

/** What to call a color on screen: the band's label if it has one, else the palette name. */
export const songColorName = (key: SongColorKey, labels?: ColorLabels): string =>
  labels?.get(key) ?? SONG_COLOR_STYLES[key].label;

/** Screen-reader name that keeps the palette color in it: "Red, Ballad" or just "Red". */
export const songColorAriaName = (key: SongColorKey, labels?: ColorLabels): string => {
  const label = labels?.get(key);
  return label ? `${SONG_COLOR_STYLES[key].label}, ${label}` : SONG_COLOR_STYLES[key].label;
};
