import { describe, expect, it } from 'vitest';
import { BACKING_TRACK_LIMITS, PENDING_SLOTS } from '../../../src/backingTrackFormat';
import {
  BackingTrackError,
  buildUploadPolicy,
  isReconcilableOrphan,
  looksLikeMarkup,
  matchesAudioMagic,
  parseUploadRequest,
  pickSlot,
  userUsage,
  wouldExceedQuota,
  type StoredObject,
} from './rules';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

describe('BackingTrackError', () => {
  it('carries its code', () => {
    const error = new BackingTrackError('over-quota');
    expect(error.code).toBe('over-quota');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('parseUploadRequest', () => {
  it('accepts a supported type and a size within the limit', () => {
    expect(parseUploadRequest({ ext: 'mp3', bytes: 1234 })).toEqual({
      ext: 'mp3',
      bytes: 1234,
      contentType: 'audio/mpeg',
    });
    expect(parseUploadRequest({ ext: 'flac', bytes: BACKING_TRACK_LIMITS.maxBytes }).contentType).toBe('audio/flac');
  });

  it('refuses an unknown type, whatever the client claims', () => {
    for (const ext of ['exe', 'MP3', '', undefined, 42, '__proto__']) {
      expect(() => parseUploadRequest({ ext, bytes: 10 })).toThrowError(
        expect.objectContaining({ code: 'bad-input' }),
      );
    }
  });

  it('refuses a missing, fractional, zero or negative size', () => {
    for (const size of [undefined, 0, -1, 1.5, NaN, Infinity, '10']) {
      expect(() => parseUploadRequest({ ext: 'wav', bytes: size })).toThrowError(
        expect.objectContaining({ code: 'bad-input' }),
      );
    }
  });

  it('refuses a file over 50 MB with too-big', () => {
    expect(() => parseUploadRequest({ ext: 'wav', bytes: BACKING_TRACK_LIMITS.maxBytes + 1 })).toThrowError(
      expect.objectContaining({ code: 'too-big' }),
    );
  });
});

describe('pickSlot', () => {
  it('maps the random range onto every slot and never past the last', () => {
    expect(pickSlot(() => 0)).toBe(0);
    expect(pickSlot(() => 0.34)).toBe(1);
    expect(pickSlot(() => 0.999999)).toBe(PENDING_SLOTS - 1);
    expect(pickSlot(() => 1)).toBe(PENDING_SLOTS - 1);
  });

  it('stays in range with the real random source', () => {
    for (let i = 0; i < 200; i += 1) {
      const slot = pickSlot();
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(PENDING_SLOTS);
    }
  });
});

describe('buildUploadPolicy', () => {
  const policy = buildUploadPolicy({
    key: 'pending/sub/1',
    contentType: 'audio/mpeg',
    trackId: 'track-1',
    bytes: 2048,
  });

  it('pins key, content type, the trackId metadata and the size range', () => {
    expect(policy.conditions).toContainEqual({ key: 'pending/sub/1' });
    expect(policy.conditions).toContainEqual({ 'Content-Type': 'audio/mpeg' });
    expect(policy.conditions).toContainEqual(['eq', '$x-amz-meta-track', 'track-1']);
    expect(policy.conditions).toContainEqual(['content-length-range', 1, 2048]);
  });

  it('sends the same values as form fields', () => {
    expect(policy.fields).toEqual({
      key: 'pending/sub/1',
      'Content-Type': 'audio/mpeg',
      'x-amz-meta-track': 'track-1',
    });
  });
});

describe('matchesAudioMagic', () => {

  it('refuses a file whose header looks right but which also carries a web page', () => {
    const page = (header: number[]) => {
      const bytes = new Uint8Array(200);
      bytes.set(header);
      bytes.set(Array.from('<html><script>alert(1)</script>', (c) => c.charCodeAt(0)), 20);
      return bytes;
    };
    expect(matchesAudioMagic('mp3', page([0x49, 0x44, 0x33, 4]))).toBe(false);
    expect(matchesAudioMagic('wav', page([...Array.from('RIFF', (c) => c.charCodeAt(0)), 0, 0, 0, 0, ...Array.from('WAVE', (c) => c.charCodeAt(0))]))).toBe(false);
  });

  it.each(['<HTML>', '<svg ', '<!DOCTYPE html>', '<iframe'])('looksLikeMarkup spots %s in any case', (tag) => {
    expect(looksLikeMarkup(Uint8Array.from(`xxxx${tag}`, (c) => c.charCodeAt(0)))).toBe(true);
  });

  it('does not reject a broadcast WAV just because it carries an iXML chunk', () => {
    expect(looksLikeMarkup(Uint8Array.from('iXML<?xml version="1.0"?><BWFXML>', (c) => c.charCodeAt(0)))).toBe(false);
  });

  it('does not mistake ordinary audio bytes for markup', () => {
    expect(looksLikeMarkup(Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0xff, 0xfb, 0x90, 0]))).toBe(false);
  });
  it('recognises MP3 by ID3 tag or frame sync', () => {
    expect(matchesAudioMagic('mp3', bytes(...ascii('ID3'), 4, 0))).toBe(true);
    expect(matchesAudioMagic('mp3', bytes(0xff, 0xfb, 0x90, 0x00))).toBe(true);
    expect(matchesAudioMagic('mp3', bytes(0xff, 0x1b))).toBe(false);
    expect(matchesAudioMagic('mp3', bytes(0, 0, 0, 0))).toBe(false);
  });

  it('recognises M4A by the ftyp box at offset 4, whatever its brand', () => {
    expect(matchesAudioMagic('m4a', bytes(0, 0, 0, 0x20, ...ascii('ftypM4A '), 0))).toBe(true);
    expect(matchesAudioMagic('m4a', bytes(0, 0, 0, 0x20, ...ascii('ftypiso5'), 0))).toBe(true);
    expect(matchesAudioMagic('m4a', bytes(...ascii('ftyp'), 0, 0, 0, 0))).toBe(false);
  });

  it('recognises WAV by RIFF....WAVE', () => {
    expect(matchesAudioMagic('wav', bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')))).toBe(true);
    expect(matchesAudioMagic('wav', bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('AVI ')))).toBe(false);
  });

  it('recognises FLAC by fLaC or by a leading ID3 tag', () => {
    expect(matchesAudioMagic('flac', bytes(...ascii('fLaC'), 0))).toBe(true);
    expect(matchesAudioMagic('flac', bytes(...ascii('ID3'), 4, 0))).toBe(true);
    expect(matchesAudioMagic('flac', bytes(...ascii('OggS')))).toBe(false);
  });

  it('refuses a file whose content is another type (an HTML page named .mp3)', () => {
    const html = bytes(...ascii('<!DOCTYPE html>'));
    for (const ext of ['mp3', 'm4a', 'wav', 'flac'] as const) {
      expect(matchesAudioMagic(ext, html)).toBe(false);
    }
  });

  it('never reads past a short buffer', () => {
    expect(matchesAudioMagic('m4a', bytes(0, 0, 0))).toBe(false);
    expect(matchesAudioMagic('wav', bytes(...ascii('RIFF')))).toBe(false);
    expect(matchesAudioMagic('mp3', bytes())).toBe(false);
  });
});

describe('quota', () => {
  const object = (key: string, size: number, lastModified = 0): StoredObject => ({ key, size, lastModified });

  it('sums files and bytes', () => {
    expect(userUsage([object('a', 10), object('b', 20)])).toEqual({ files: 2, bytes: 30 });
    expect(userUsage([])).toEqual({ files: 0, bytes: 0 });
  });

  it('leaves out the key being committed so a retry is not refused by its own orphan', () => {
    expect(userUsage([object('a', 10), object('b', 20)], 'b')).toEqual({ files: 1, bytes: 10 });
  });

  it('refuses the 21st file', () => {
    expect(wouldExceedQuota({ files: BACKING_TRACK_LIMITS.maxUserFiles - 1, bytes: 0 }, 1)).toBe(false);
    expect(wouldExceedQuota({ files: BACKING_TRACK_LIMITS.maxUserFiles, bytes: 0 }, 1)).toBe(true);
  });

  it('refuses a file that would pass the byte cap, even with files to spare', () => {
    const nearlyFull = { files: 1, bytes: BACKING_TRACK_LIMITS.maxUserBytes - 100 };
    expect(wouldExceedQuota(nearlyFull, 100)).toBe(false);
    expect(wouldExceedQuota(nearlyFull, 101)).toBe(true);
  });
});

describe('isReconcilableOrphan', () => {
  const now = 10 * BACKING_TRACK_LIMITS.orphanGraceMs;
  const old = { key: 'bt/x', size: 1, lastModified: now - BACKING_TRACK_LIMITS.orphanGraceMs - 1 };
  const fresh = { key: 'bt/x', size: 1, lastModified: now - BACKING_TRACK_LIMITS.orphanGraceMs + 1 };

  it('collects an old object that no row owns', () => {
    expect(isReconcilableOrphan(old, null, now)).toBe(true);
  });

  it('collects an old object whose row names a different key', () => {
    expect(isReconcilableOrphan(old, { key: 'bt/other' }, now)).toBe(true);
  });

  it('keeps an old object that its row owns', () => {
    expect(isReconcilableOrphan(old, { key: 'bt/x' }, now)).toBe(false);
  });

  it('never touches a young object, which may be a commit still in flight', () => {
    expect(isReconcilableOrphan(fresh, null, now)).toBe(false);
    expect(isReconcilableOrphan(fresh, { key: 'bt/other' }, now)).toBe(false);
  });

  it('treats an object exactly at the grace boundary as old enough', () => {
    const edge = { key: 'bt/x', size: 1, lastModified: now - BACKING_TRACK_LIMITS.orphanGraceMs };
    expect(isReconcilableOrphan(edge, null, now)).toBe(true);
  });
});
