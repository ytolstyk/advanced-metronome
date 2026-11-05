import { describe, expect, it } from 'vitest';
import {
  AUDIO_EXTS,
  BACKING_TRACK_LIMITS,
  PENDING_SLOTS,
  areValidTags,
  committedKey,
  contentTypeForExt,
  extForContentType,
  extFromFileName,
  isAudioExt,
  isCleanLabel,
  isSlot,
  isUuid,
  labelFromFileName,
  normalizeTags,
  parseCommittedKey,
  pendingKey,
  sanitizeLabel,
  userBandPrefix,
  userPrefix,
} from './backingTrackFormat';

const SUB = 'a1b2c3d4-1111-4111-8111-111111111111';
const BAND = 'b2c3d4e5-2222-4222-8222-222222222222';
const SONG = 'c3d4e5f6-3333-4333-8333-333333333333';
const TRACK = 'd4e5f6a7-4444-4444-8444-444444444444';

describe('limits', () => {
  it('keeps the user byte cap below files x max size, so the byte cap is what binds', () => {
    expect(BACKING_TRACK_LIMITS.maxUserBytes).toBeLessThan(
      BACKING_TRACK_LIMITS.maxUserFiles * BACKING_TRACK_LIMITS.maxBytes,
    );
  });

  it('allows a 50 MB file', () => {
    expect(BACKING_TRACK_LIMITS.maxBytes).toBe(50 * 1024 * 1024);
  });
});

describe('audio types', () => {
  it('maps each extension to one canonical content type and back', () => {
    for (const ext of AUDIO_EXTS) {
      expect(extForContentType(contentTypeForExt(ext))).toBe(ext);
    }
  });

  it('knows exactly mp3, m4a, wav and flac', () => {
    expect([...AUDIO_EXTS].sort()).toEqual(['flac', 'm4a', 'mp3', 'wav']);
  });

  it('rejects non-canonical content types', () => {
    expect(extForContentType('audio/x-wav')).toBeNull();
    expect(extForContentType('text/html')).toBeNull();
    expect(extForContentType(undefined)).toBeNull();
  });

  it('isAudioExt ignores prototype keys', () => {
    expect(isAudioExt('mp3')).toBe(true);
    expect(isAudioExt('toString')).toBe(false);
    expect(isAudioExt('__proto__')).toBe(false);
    expect(isAudioExt('exe')).toBe(false);
  });

  it('reads the extension from a file name, case-insensitively', () => {
    expect(extFromFileName('Drums Only.MP3')).toBe('mp3');
    expect(extFromFileName('a.b.flac')).toBe('flac');
    expect(extFromFileName('song.exe')).toBeNull();
    expect(extFromFileName('noextension')).toBeNull();
    expect(extFromFileName('trailingdot.')).toBeNull();
  });
});

describe('ids and slots', () => {
  it('accepts lower-case UUIDs only', () => {
    expect(isUuid(SUB)).toBe(true);
    expect(isUuid(SUB.toUpperCase())).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(`${SUB}/`)).toBe(false);
    expect(isUuid('../etc/passwd')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('accepts only whole slot numbers in range', () => {
    for (let slot = 0; slot < PENDING_SLOTS; slot += 1) expect(isSlot(slot)).toBe(true);
    expect(isSlot(PENDING_SLOTS)).toBe(false);
    expect(isSlot(-1)).toBe(false);
    expect(isSlot(1.5)).toBe(false);
    expect(isSlot('1')).toBe(false);
  });
});

describe('keys', () => {
  it('builds and parses a committed key round trip', () => {
    const key = committedKey({ sub: SUB, bandId: BAND, songId: SONG, trackId: TRACK, ext: 'm4a' });
    expect(key).toBe(`bt/${SUB}/${BAND}/${SONG}/${TRACK}.m4a`);
    expect(parseCommittedKey(key)).toEqual({ sub: SUB, bandId: BAND, songId: SONG, trackId: TRACK, ext: 'm4a' });
  });

  it('builds the pending key and the prefixes', () => {
    expect(pendingKey(SUB, 2)).toBe(`pending/${SUB}/2`);
    expect(userPrefix(SUB)).toBe(`bt/${SUB}/`);
    expect(userBandPrefix(SUB, BAND)).toBe(`bt/${SUB}/${BAND}/`);
  });

  it.each([
    ['wrong extension', `bt/${SUB}/${BAND}/${SONG}/${TRACK}.exe`],
    ['no extension', `bt/${SUB}/${BAND}/${SONG}/${TRACK}`],
    ['extra segment', `bt/${SUB}/${BAND}/${SONG}/x/${TRACK}.mp3`],
    ['missing segment', `bt/${SUB}/${BAND}/${TRACK}.mp3`],
    ['traversal', `bt/${SUB}/${BAND}/${SONG}/../${TRACK}.mp3`],
    ['non-uuid band', `bt/${SUB}/not-a-uuid/${SONG}/${TRACK}.mp3`],
    ['pending prefix', `pending/${SUB}/${BAND}/${SONG}/${TRACK}.mp3`],
    ['trailing newline', `bt/${SUB}/${BAND}/${SONG}/${TRACK}.mp3\n`],
    ['upper-case ext', `bt/${SUB}/${BAND}/${SONG}/${TRACK}.MP3`],
  ])('rejects a committed key with %s', (_name, key) => {
    expect(parseCommittedKey(key)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseCommittedKey(undefined)).toBeNull();
    expect(parseCommittedKey(42)).toBeNull();
  });
});

describe('labels', () => {
  it('sanitises and clamps to the label limit', () => {
    expect(sanitizeLabel('  No   drums ')).toBe('No drums');
    expect(sanitizeLabel('x'.repeat(100))).toHaveLength(BACKING_TRACK_LIMITS.labelMax);
  });

  it('treats a label as clean only if sanitising would not change it', () => {
    expect(isCleanLabel('Drums only')).toBe(true);
    expect(isCleanLabel('')).toBe(false);
    expect(isCleanLabel(' padded ')).toBe(false);
    expect(isCleanLabel('zero​width')).toBe(false);
    expect(isCleanLabel('bidi‮override')).toBe(false);
    expect(isCleanLabel('x'.repeat(31))).toBe(false);
    expect(isCleanLabel(42)).toBe(false);
  });

  it('derives a starting label from a file name', () => {
    expect(labelFromFileName('no_drums_mix.mp3')).toBe('no drums mix');
    expect(labelFromFileName('Take 2.wav')).toBe('Take 2');
    expect(labelFromFileName('.mp3')).toBe('Backing track');
    expect(labelFromFileName('notes.txt')).toBe('notes.txt');
    expect(labelFromFileName('​.mp3')).toBe('Backing track');
  });
});

describe('tags', () => {
  it('keeps known instruments once each in palette order', () => {
    expect(normalizeTags(['drums', 'guitar', 'drums', 'nope'])).toEqual(['guitar', 'drums']);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('areValidTags rejects unknown, repeated or non-array input instead of repairing it', () => {
    expect(areValidTags(['guitar', 'drums'])).toBe(true);
    expect(areValidTags([])).toBe(true);
    expect(areValidTags(['guitar', 'guitar'])).toBe(false);
    expect(areValidTags(['kazoo'])).toBe(false);
    expect(areValidTags('guitar')).toBe(false);
    expect(areValidTags(undefined)).toBe(false);
  });
});
