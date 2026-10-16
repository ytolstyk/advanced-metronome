import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BAND_LIMITS } from '../bandTypes';

const { query, isAuthenticated } = vi.hoisted(() => ({
  query: vi.fn(),
  isAuthenticated: vi.fn(),
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({ queries: { lookupSongLink: query }, models: {}, graphql: vi.fn() })),
}));
vi.mock('./authUtils', () => ({
  isAuthenticated,
  getCurrentUserSub: vi.fn(async () => 'sub-me'),
  getSignedInSub: vi.fn(async () => 'sub-me' as string | null),
}));

import { ARTIST_MAX, MAX_URL_LENGTH, TITLE_MAX } from '../../amplify/functions/song-metadata/parse';
import { isLookupSupported, lookupSongLink } from './songMetadataApi';
import { NotSignedInError } from './bandsShared';

const SPOTIFY = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const reply = (data: unknown, errors?: unknown[]) => query.mockResolvedValue({ data, errors });

beforeEach(() => {
  query.mockReset();
  isAuthenticated.mockReset();
  isAuthenticated.mockResolvedValue(true);
});

describe('isLookupSupported', () => {
  it.each([
    ['a Spotify track', SPOTIFY],
    ['a YouTube watch link', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['a youtu.be link', 'https://youtu.be/dQw4w9WgXcQ'],
    ['an Apple Music song', 'https://music.apple.com/us/song/never-gonna-give-you-up/1558533900'],
    ['an Apple Music album track', 'https://music.apple.com/us/album/x/1558533899?i=1558533900'],
    ['a SoundCloud track', 'https://soundcloud.com/rick-astley/never-gonna-give-you-up'],
  ])('is true for %s', (_label, url) => {
    expect(isLookupSupported(url)).toBe(true);
  });

  it.each([
    ['an unrelated site', 'https://example.com/song'],
    ['a Spotify album', 'https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT'],
    ['a YouTube channel page', 'https://www.youtube.com/@rickastley'],
    ['an Apple Music album without a track', 'https://music.apple.com/us/album/x/1558533899'],
    ['a SoundCloud set', 'https://soundcloud.com/user/sets/mix'],
    ['an http link', 'http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
    ['text that is not a url', 'never gonna give you up'],
    ['an empty string', ''],
  ])('is false for %s', (_label, url) => {
    expect(isLookupSupported(url)).toBe(false);
  });

  it('agrees with what the server accepts: supported links are fetchable, others are not', () => {
    expect(isLookupSupported('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
    expect(isLookupSupported('https://open.spotify.com/intl-de/artist/4cOdK2wGLETKBW3PvgPWqT')).toBe(false);
  });
});

describe('lookupSongLink', () => {
  describe('auth gating', () => {
    it('throws NotSignedInError when signed out and never calls the backend', async () => {
      isAuthenticated.mockResolvedValue(false);
      await expect(lookupSongLink(SPOTIFY)).rejects.toBeInstanceOf(NotSignedInError);
      expect(query).not.toHaveBeenCalled();
    });

    it('checks auth before validating the url', async () => {
      isAuthenticated.mockResolvedValue(false);
      await expect(lookupSongLink('not a url')).rejects.toBeInstanceOf(NotSignedInError);
    });
  });

  describe('url validation before the call', () => {
    it.each([
      ['not a url', 'hello world'],
      ['an empty string', ''],
      ['a javascript: url', 'javascript:alert(1)'],
      ['an ftp url', 'ftp://example.com/song'],
      ['a url with credentials', 'https://user:pw@open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
    ])('returns null for %s without calling the backend', async (_label, url) => {
      expect(await lookupSongLink(url)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });

    it.each([
      ['an unrelated site', 'https://example.com/song'],
      ['a Spotify album', 'https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT'],
      ['a YouTube channel', 'https://www.youtube.com/@rickastley'],
      ['a schemeless unsupported link', 'example.com/song'],
    ])('returns null for an unsupported link (%s) without calling the backend', async (_label, url) => {
      expect(await lookupSongLink(url)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });

    it('still requires sign-in before deciding a link is unsupported', async () => {
      isAuthenticated.mockResolvedValue(false);
      await expect(lookupSongLink('https://example.com/song')).rejects.toBeInstanceOf(NotSignedInError);
      expect(query).not.toHaveBeenCalled();
    });

    it('returns null for a supported-host url longer than the stored-link limit without calling the backend', async () => {
      const url = `https://www.youtube.com/watch?v=dQw4w9WgXcQ&pad=${'a'.repeat(BAND_LIMITS.urlMax)}`;
      expect(await lookupSongLink(url)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });

    it('returns null for a url longer than the stored-link limit', async () => {
      const url = `https://example.com/${'a'.repeat(BAND_LIMITS.urlMax)}`;
      expect(await lookupSongLink(url)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    });

    it('sends the canonical (normalised) url', async () => {
      reply(null);
      await lookupSongLink('HTTPS://Open.Spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith({ url: SPOTIFY });
    });
  });

  describe('results', () => {
    it('returns title and artist from the JSON the resolver sends back', async () => {
      reply(JSON.stringify({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' }));
      expect(await lookupSongLink(SPOTIFY)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
    });

    it('returns null when the resolver found nothing', async () => {
      reply(null);
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
    });

    it('returns null for an empty data string', async () => {
      reply('');
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
    });

    it('returns an empty artist when the artist is missing or not a string', async () => {
      reply(JSON.stringify({ title: 'Solo' }));
      expect(await lookupSongLink(SPOTIFY)).toEqual({ title: 'Solo', artist: '' });
      reply(JSON.stringify({ title: 'Solo', artist: 12 }));
      expect(await lookupSongLink(SPOTIFY)).toEqual({ title: 'Solo', artist: '' });
    });
  });

  describe('untrusted response handling', () => {
    it('returns null for invalid JSON', async () => {
      reply('{not json');
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
    });

    it.each([
      ['JSON null', 'null'],
      ['a JSON number', '42'],
      ['a JSON string', '"title"'],
      ['an empty object', '{}'],
      ['an array', '[]'],
    ])('returns null for %s', async (_label, data) => {
      reply(data);
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
    });

    it('returns null when the title is not a string', async () => {
      reply(JSON.stringify({ title: 123, artist: 'x' }));
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
      reply(JSON.stringify({ title: { nested: true }, artist: 'x' }));
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
    });

    it('returns null when the title is blank after sanitising', async () => {
      reply(JSON.stringify({ title: ' \u200b\u202e\t ', artist: 'x' }));
      expect(await lookupSongLink(SPOTIFY)).toBeNull();
    });

    it('strips zero-width, bidi and control characters and collapses whitespace', async () => {
      reply(JSON.stringify({ title: '  Hi\u200b  there\n', artist: '\u202eBand\u0007 Name ' }));
      expect(await lookupSongLink(SPOTIFY)).toEqual({ title: 'Hi there', artist: 'Band Name' });
    });

    it('clamps title and artist to the band limits', async () => {
      reply(JSON.stringify({ title: 't'.repeat(BAND_LIMITS.titleMax + 50), artist: 'a'.repeat(BAND_LIMITS.artistMax + 50) }));
      const result = await lookupSongLink(SPOTIFY);
      expect(result?.title).toHaveLength(BAND_LIMITS.titleMax);
      expect(result?.artist).toHaveLength(BAND_LIMITS.artistMax);
    });

    it('never splits a surrogate pair when clamping', async () => {
      reply(JSON.stringify({ title: '\u{1F3B8}'.repeat(BAND_LIMITS.titleMax + 5), artist: '' }));
      const result = await lookupSongLink(SPOTIFY);
      expect(Array.from(result?.title ?? '')).toHaveLength(BAND_LIMITS.titleMax);
      expect(result?.title).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    });

    it('ignores extra fields', async () => {
      reply(JSON.stringify({ title: 'T', artist: 'A', url: 'https://evil.example', html: '<script>' }));
      expect(await lookupSongLink(SPOTIFY)).toEqual({ title: 'T', artist: 'A' });
    });
  });

  describe('backend errors', () => {
    it('throws a readable error when the query reports errors', async () => {
      reply(null, [{ message: 'Lambda:Unhandled' }]);
      await expect(lookupSongLink(SPOTIFY)).rejects.toThrow('Could not look up that link.');
    });

    it('logs a warning with the first backend error message', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        reply(null, [{ message: 'Lambda:Unhandled' }, { message: 'second' }]);
        await expect(lookupSongLink(SPOTIFY)).rejects.toThrow();
        expect(warn).toHaveBeenCalledWith('lookupSongLink failed', 'Lambda:Unhandled');
      } finally {
        warn.mockRestore();
      }
    });

    it('does not warn on success', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        reply(JSON.stringify({ title: 'T', artist: 'A' }));
        await lookupSongLink(SPOTIFY);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('does not leak the backend error message', async () => {
      reply(null, [{ message: 'arn:aws:lambda:secret-detail' }]);
      const error = await lookupSongLink(SPOTIFY).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('arn:aws');
    });

    it('prefers the error over any data that came with it', async () => {
      reply(JSON.stringify({ title: 'T', artist: 'A' }), [{ message: 'partial' }]);
      await expect(lookupSongLink(SPOTIFY)).rejects.toThrow('Could not look up that link.');
    });

    it('treats an empty errors array as success', async () => {
      reply(JSON.stringify({ title: 'T', artist: 'A' }), []);
      expect(await lookupSongLink(SPOTIFY)).toEqual({ title: 'T', artist: 'A' });
    });

    it('propagates a network-level rejection', async () => {
      query.mockRejectedValue(new Error('Network error'));
      await expect(lookupSongLink(SPOTIFY)).rejects.toThrow('Network error');
    });
  });
});

describe('Lambda limits stay in step with BAND_LIMITS', () => {
  it('uses the same title, artist and link limits as the band validators', () => {
    expect(TITLE_MAX).toBe(BAND_LIMITS.titleMax);
    expect(ARTIST_MAX).toBe(BAND_LIMITS.artistMax);
    expect(MAX_URL_LENGTH).toBe(BAND_LIMITS.urlMax);
  });
});
