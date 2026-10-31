import { describe, expect, it } from 'vitest';
import { trackFileName } from './useSongTracks';

describe('trackFileName', () => {
  it('names the WAV after the song', () => {
    expect(trackFileName('Black Dog')).toBe('Black Dog-click.wav');
  });

  it('keeps only letters, digits, spaces, dashes and underscores', () => {
    expect(trackFileName('AC/DC: "Back in Black" (live)?')).toBe('ACDC Back in Black live-click.wav');
    expect(trackFileName('../../etc/passwd')).toBe('etcpasswd-click.wav');
  });

  it('keeps letters and digits from any script, so non-English titles stay recognisable', () => {
    expect(trackFileName('Кино — Группа крови')).toBe('Кино Группа крови-click.wav');
    expect(trackFileName('君が代 2')).toBe('君が代 2-click.wav');
  });

  it('falls back when nothing usable is left, and caps the length', () => {
    expect(trackFileName('***')).toBe('click-track-click.wav');
    expect(trackFileName('x'.repeat(200))).toBe(`${'x'.repeat(50)}-click.wav`);
  });
});
