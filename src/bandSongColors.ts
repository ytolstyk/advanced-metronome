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
