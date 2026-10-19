import { describe, expect, it } from 'vitest';
import { SONG_COLOR_KEYS } from './bandTypes';
import { SONG_COLOR_OPTIONS, SONG_COLOR_STYLES } from './bandSongColors';
import { isSongColorKey } from './bandUtils';

describe('song color palette', () => {
  it('has display data for exactly the palette keys', () => {
    expect(Object.keys(SONG_COLOR_STYLES).sort()).toEqual([...SONG_COLOR_KEYS].sort());
  });

  it('uses a valid 6-digit hex and a non-empty label for every color', () => {
    for (const key of SONG_COLOR_KEYS) {
      expect(SONG_COLOR_STYLES[key].hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SONG_COLOR_STYLES[key].label.length).toBeGreaterThan(0);
    }
  });

  it('has a distinct hex and label per color', () => {
    const hexes = SONG_COLOR_KEYS.map((k) => SONG_COLOR_STYLES[k].hex.toLowerCase());
    const labels = SONG_COLOR_KEYS.map((k) => SONG_COLOR_STYLES[k].label);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('lists the options in palette order, each carrying its key, label and hex', () => {
    expect(SONG_COLOR_OPTIONS.map((o) => o.key)).toEqual([...SONG_COLOR_KEYS]);
    for (const option of SONG_COLOR_OPTIONS) {
      expect(option).toEqual({ key: option.key, ...SONG_COLOR_STYLES[option.key] });
      expect(isSongColorKey(option.key)).toBe(true);
    }
  });

  it('never includes the "none" sentinel as a pickable color', () => {
    expect(SONG_COLOR_KEYS).not.toContain('none');
    expect(SONG_COLOR_OPTIONS.some((o) => (o.key as string) === 'none')).toBe(false);
  });
});
