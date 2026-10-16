import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { SongLinkMetadata } from '../api/songMetadataApi';
import { NotSignedInError } from '../api/bandsShared';
import type { RawSongInput } from '../bandUtils';

const { lookupSongLink } = vi.hoisted(() => ({ lookupSongLink: vi.fn() }));
// Same shape as the real allow-list check, without pulling the amplify-function parser into the test.
vi.mock('../api/songMetadataApi', () => ({
  lookupSongLink,
  isLookupSupported: (url: string) => /spotify|youtube|youtu\.be|apple|soundcloud/.test(url),
}));

import { useSongLinkAutofill } from './useSongLinkAutofill';

const SPOTIFY = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const APPLE = 'https://music.apple.com/us/song/x/1558533900';
const RICK: SongLinkMetadata = { title: 'Never Gonna Give You Up', artist: 'Rick Astley' };
const QUEEN: SongLinkMetadata = { title: 'Bohemian Rhapsody', artist: 'Queen' };
const EMPTY: RawSongInput = { title: '', artist: '' };

function deferred() {
  let resolve!: (value: SongLinkMetadata | null) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<SongLinkMetadata | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(form: RawSongInput = EMPTY, initialUrl?: string) {
  return renderHook(() => {
    const [state, setForm] = useState<RawSongInput>(form);
    return { form: state, setForm, ...useSongLinkAutofill(setForm, initialUrl) };
  });
}

type Harness = ReturnType<typeof setup>;
const fill = async (h: Harness, link: string | undefined) => {
  await act(async () => {
    await h.result.current.fillFromLink(link);
  });
};
const type = (h: Harness, patch: Partial<RawSongInput>) => act(() => h.result.current.setForm((f) => ({ ...f, ...patch })));

beforeEach(() => {
  lookupSongLink.mockReset();
  lookupSongLink.mockResolvedValue(null);
});

describe('useSongLinkAutofill', () => {
  describe('initial state', () => {
    it('starts idle and makes no request', () => {
      const h = setup();
      expect(h.result.current.status).toEqual({ kind: 'idle' });
      expect(lookupSongLink).not.toHaveBeenCalled();
    });

    it('keeps fillFromLink and reset stable across renders', () => {
      const h = setup();
      const { fillFromLink, reset } = h.result.current;
      h.rerender();
      expect(h.result.current.fillFromLink).toBe(fillFromLink);
      expect(h.result.current.reset).toBe(reset);
    });
  });

  describe('a successful lookup', () => {
    it('fills an empty title and artist and reports what it found', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledWith(SPOTIFY);
      expect(h.result.current.form).toMatchObject(RICK);
      expect(h.result.current.status).toEqual({ kind: 'found', title: RICK.title, artist: RICK.artist });
    });

    it('is busy while the lookup is in flight', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      let done!: Promise<void>;
      act(() => {
        done = h.result.current.fillFromLink(SPOTIFY);
      });
      expect(h.result.current.status).toEqual({ kind: 'busy' });
      await act(async () => {
        pending.resolve(RICK);
        await done;
      });
      expect(h.result.current.status.kind).toBe('found');
    });

    it('looks up the canonical https form of what was typed', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, '  open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT  ');
      expect(lookupSongLink).toHaveBeenCalledWith(SPOTIFY);
    });

    it('reports a found song with no artist', async () => {
      lookupSongLink.mockResolvedValue({ title: 'Solo', artist: '' });
      const h = setup();
      await fill(h, SPOTIFY);
      expect(h.result.current.status).toEqual({ kind: 'found', title: 'Solo', artist: '' });
      expect(h.result.current.form).toMatchObject({ title: 'Solo', artist: '' });
    });
  });

  describe('each link is looked up once', () => {
    it('makes one request when the same link is pasted and then blurred', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
    });

    it('makes one request when the same link arrives again while the first lookup is still pending', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      await act(async () => {
        const first = h.result.current.fillFromLink(SPOTIFY);
        const second = h.result.current.fillFromLink(SPOTIFY);
        pending.resolve(RICK);
        await Promise.all([first, second]);
      });
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
      expect(h.result.current.status.kind).toBe('found');
    });

    it('treats differently spelled forms of the same link as one link', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, 'HTTPS://Open.Spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      await fill(h, 'open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
    });

    it('does not re-request a link that could not be read, and keeps saying so', async () => {
      lookupSongLink.mockResolvedValue(null);
      const h = setup();
      await fill(h, SPOTIFY);
      expect(h.result.current.status).toEqual({ kind: 'failed' });
      await fill(h, SPOTIFY);
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
      expect(h.result.current.status).toEqual({ kind: 'failed' });
    });

    it('looks a different link up even after a failed one', async () => {
      lookupSongLink.mockResolvedValueOnce(null).mockResolvedValueOnce(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, YOUTUBE);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
      expect(h.result.current.status.kind).toBe('found');
    });

    it('retries a link after the lookup threw', async () => {
      lookupSongLink.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      expect(h.result.current.status).toEqual({ kind: 'error' });
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
      expect(h.result.current.status.kind).toBe('found');
      expect(h.result.current.form.title).toBe(RICK.title);
    });

    it('keeps retrying a link for as long as the lookup keeps throwing', async () => {
      lookupSongLink.mockRejectedValue(new Error('throttled'));
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, SPOTIFY);
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(3);
      expect(h.result.current.status).toEqual({ kind: 'error' });
    });
  });

  describe('error statuses', () => {
    it('reports signedOut when nobody is signed in', async () => {
      lookupSongLink.mockRejectedValue(new NotSignedInError());
      const h = setup();
      await fill(h, SPOTIFY);
      expect(h.result.current.status).toEqual({ kind: 'signedOut' });
      expect(h.result.current.form).toEqual(EMPTY);
    });

    it('retries a signed-out lookup once the person has signed in', async () => {
      lookupSongLink.mockRejectedValueOnce(new NotSignedInError()).mockResolvedValueOnce(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
      expect(h.result.current.status.kind).toBe('found');
    });

    it.each([
      ['an Error', new Error('boom')],
      ['a string', 'boom'],
      ['undefined', undefined],
    ])('reports error when the lookup throws %s', async (_label, thrown) => {
      lookupSongLink.mockRejectedValue(thrown);
      const h = setup();
      await fill(h, SPOTIFY);
      expect(h.result.current.status).toEqual({ kind: 'error' });
      expect(h.result.current.form).toEqual(EMPTY);
    });

    it('moves from error to found when a different link works', async () => {
      lookupSongLink.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, YOUTUBE);
      expect(h.result.current.status.kind).toBe('found');
    });
  });

  describe('links that cannot be looked up', () => {
    it.each([
      ['undefined', undefined],
      ['an empty string', ''],
      ['whitespace', '   '],
      ['plain text', 'never gonna give you up'],
      ['an unsupported site', 'https://example.com/song'],
      ['a javascript: link', 'javascript:alert(1)'],
      ['a link with credentials', 'https://user:pw@open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
    ])('makes no request for %s and stays idle', async (_label, link) => {
      const h = setup();
      await fill(h, link);
      expect(lookupSongLink).not.toHaveBeenCalled();
      expect(h.result.current.status).toEqual({ kind: 'idle' });
      expect(h.result.current.form).toEqual(EMPTY);
    });

    it('discards an in-flight result when the link is replaced by an unsupported one', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      let first!: Promise<void>;
      act(() => {
        first = h.result.current.fillFromLink(SPOTIFY);
      });
      expect(h.result.current.status).toEqual({ kind: 'busy' });

      await fill(h, 'https://example.com/song');
      expect(h.result.current.status).toEqual({ kind: 'idle' });

      await act(async () => {
        pending.resolve(RICK);
        await first;
      });
      expect(h.result.current.form).toEqual(EMPTY);
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });

    it('discards an in-flight result when the link is cleared', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      let first!: Promise<void>;
      act(() => {
        first = h.result.current.fillFromLink(SPOTIFY);
      });
      await fill(h, '');
      await act(async () => {
        pending.resolve(RICK);
        await first;
      });
      expect(h.result.current.form).toEqual(EMPTY);
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });

    it('discards an in-flight error when the link is replaced by an unsupported one', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      let first!: Promise<void>;
      act(() => {
        first = h.result.current.fillFromLink(SPOTIFY);
      });
      await fill(h, 'https://example.com/song');
      await act(async () => {
        pending.reject(new Error('late'));
        await first;
      });
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });

    it('looks the earlier link up again if it is restored after an unusable one', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, 'https://example.com/song');
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
    });
  });

  describe('a newer link wins over a slower older one', () => {
    it('ignores the older result even when it resolves last', async () => {
      const first = deferred();
      const second = deferred();
      lookupSongLink.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const h = setup();
      await act(async () => {
        const a = h.result.current.fillFromLink(SPOTIFY);
        const b = h.result.current.fillFromLink(YOUTUBE);
        second.resolve(QUEEN);
        await b;
        first.resolve(RICK);
        await a;
      });
      expect(h.result.current.form).toMatchObject(QUEEN);
      expect(h.result.current.status).toEqual({ kind: 'found', title: QUEEN.title, artist: QUEEN.artist });
    });

    it('ignores an older failure and an older error that arrive after a newer success', async () => {
      const first = deferred();
      const second = deferred();
      lookupSongLink.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const h = setup();
      await act(async () => {
        const a = h.result.current.fillFromLink(SPOTIFY);
        const b = h.result.current.fillFromLink(YOUTUBE);
        second.resolve(QUEEN);
        await b;
        first.reject(new Error('late'));
        await a;
      });
      expect(h.result.current.status.kind).toBe('found');
    });

    it('does not let a stale thrown error make the newer link retryable', async () => {
      const first = deferred();
      const second = deferred();
      lookupSongLink.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const h = setup();
      await act(async () => {
        const a = h.result.current.fillFromLink(SPOTIFY);
        const b = h.result.current.fillFromLink(YOUTUBE);
        first.reject(new Error('late'));
        await a;
        second.resolve(QUEEN);
        await b;
      });
      await fill(h, YOUTUBE);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
    });
  });

  describe('which fields are replaced', () => {
    it('never overwrites a title the person typed, but fills the empty artist', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: 'My title', artist: '' });
      await fill(h, SPOTIFY);
      expect(h.result.current.form).toMatchObject({ title: 'My title', artist: 'Rick Astley' });
    });

    it('never overwrites an artist the person typed, but fills the empty title', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: '', artist: 'Me' });
      await fill(h, SPOTIFY);
      expect(h.result.current.form).toMatchObject({ title: RICK.title, artist: 'Me' });
    });

    it('treats whitespace-only fields as empty', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: '   ', artist: '\t' });
      await fill(h, SPOTIFY);
      expect(h.result.current.form).toMatchObject(RICK);
    });

    it('treats an undefined artist as empty', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: '' });
      await fill(h, SPOTIFY);
      expect(h.result.current.form.artist).toBe('Rick Astley');
    });

    it('replaces values an earlier lookup wrote when the next link is looked up', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce(QUEEN);
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, YOUTUBE);
      expect(h.result.current.form).toMatchObject(QUEEN);
    });

    it('keeps text the person edited after a fill when the next link arrives, replacing only the untouched field', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce(QUEEN);
      const h = setup();
      await fill(h, SPOTIFY);
      type(h, { title: 'Never Gonna Give You Up (live)' });
      await fill(h, YOUTUBE);
      expect(h.result.current.form).toMatchObject({ title: 'Never Gonna Give You Up (live)', artist: 'Queen' });
    });

    it('clears an auto-filled artist when the next link has none', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce({ title: 'Anonymous', artist: '' });
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, YOUTUBE);
      expect(h.result.current.form).toMatchObject({ title: 'Anonymous', artist: '' });
    });

    it('keeps a typed artist when the next link has none', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce({ title: 'Anonymous', artist: '' });
      const h = setup();
      await fill(h, SPOTIFY);
      type(h, { artist: 'Someone Else' });
      await fill(h, YOUTUBE);
      expect(h.result.current.form).toMatchObject({ title: 'Anonymous', artist: 'Someone Else' });
    });

    it('updates the artist replaced from a link that had one to a link that has a different one', async () => {
      lookupSongLink
        .mockResolvedValueOnce(RICK)
        .mockResolvedValueOnce(QUEEN)
        .mockResolvedValueOnce({ title: 'Third', artist: 'Third Artist' });
      const h = setup();
      await fill(h, SPOTIFY);
      await fill(h, YOUTUBE);
      await fill(h, APPLE);
      expect(h.result.current.form).toMatchObject({ title: 'Third', artist: 'Third Artist' });
    });

    it('does not touch other fields of the form', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: '', artist: '', key: 'F#m', bpm: 87, notes: 'n', songUrl: SPOTIFY, tabUrl: 'https://t.example/x' });
      await fill(h, SPOTIFY);
      expect(h.result.current.form).toMatchObject({ key: 'F#m', bpm: 87, notes: 'n', songUrl: SPOTIFY, tabUrl: 'https://t.example/x' });
    });

    it('leaves the form untouched when the link could not be read', async () => {
      lookupSongLink.mockResolvedValue(null);
      const h = setup({ title: 'Mine', artist: 'Me' });
      await fill(h, SPOTIFY);
      expect(h.result.current.form).toEqual({ title: 'Mine', artist: 'Me' });
    });
  });

  describe('the seed link (editing)', () => {
    it('is never looked up', async () => {
      const h = setup({ title: 'Existing', artist: 'Someone' }, SPOTIFY);
      await fill(h, SPOTIFY);
      expect(lookupSongLink).not.toHaveBeenCalled();
      expect(h.result.current.status).toEqual({ kind: 'idle' });
      expect(h.result.current.form).toEqual({ title: 'Existing', artist: 'Someone' });
    });

    it('is never looked up when spelled differently', async () => {
      const h = setup(EMPTY, 'open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      await fill(h, SPOTIFY);
      await fill(h, 'HTTPS://OPEN.SPOTIFY.COM/track/4cOdK2wGLETKBW3PvgPWqT');
      expect(lookupSongLink).not.toHaveBeenCalled();
    });

    it('does not stop a different link from being looked up', async () => {
      lookupSongLink.mockResolvedValue(QUEEN);
      const h = setup({ title: 'Existing', artist: 'Someone' }, SPOTIFY);
      await fill(h, YOUTUBE);
      expect(lookupSongLink).toHaveBeenCalledWith(YOUTUBE);
      expect(h.result.current.status.kind).toBe('found');
      expect(h.result.current.form).toEqual({ title: 'Existing', artist: 'Someone' });
    });

    it('is looked up again if the person moves away to an unsupported link and back', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: 'Existing' }, SPOTIFY);
      await fill(h, 'https://example.com/song');
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
    });

    it('tolerates a missing or unusable seed', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup(EMPTY, 'not a link');
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('returns to idle after a fill', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      act(() => h.result.current.reset());
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });

    it('returns to idle after a failure and an error', async () => {
      lookupSongLink.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('x'));
      const h = setup();
      await fill(h, SPOTIFY);
      act(() => h.result.current.reset());
      expect(h.result.current.status).toEqual({ kind: 'idle' });
      await fill(h, YOUTUBE);
      expect(h.result.current.status).toEqual({ kind: 'error' });
      act(() => h.result.current.reset());
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });

    it('drops a lookup that is still in flight', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      let first!: Promise<void>;
      act(() => {
        first = h.result.current.fillFromLink(SPOTIFY);
      });
      expect(h.result.current.status).toEqual({ kind: 'busy' });

      act(() => h.result.current.reset());
      expect(h.result.current.status).toEqual({ kind: 'idle' });

      await act(async () => {
        pending.resolve(RICK);
        await first;
      });
      expect(h.result.current.status).toEqual({ kind: 'idle' });
      expect(h.result.current.form).toEqual(EMPTY);
    });

    it('drops an in-flight lookup that then throws', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const h = setup();
      let first!: Promise<void>;
      act(() => {
        first = h.result.current.fillFromLink(SPOTIFY);
      });
      act(() => h.result.current.reset());
      await act(async () => {
        pending.reject(new NotSignedInError());
        await first;
      });
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });

    it('forgets the attempted link so the same link is looked up again', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup();
      await fill(h, SPOTIFY);
      act(() => h.result.current.reset());
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
    });

    it('forgets a failed link so it is looked up again', async () => {
      lookupSongLink.mockResolvedValue(null);
      const h = setup();
      await fill(h, SPOTIFY);
      act(() => h.result.current.reset());
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
    });

    it('keeps the seed link exempt from lookup', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const h = setup({ title: 'Existing' }, SPOTIFY);
      await fill(h, YOUTUBE);
      act(() => h.result.current.reset());
      await fill(h, SPOTIFY);
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
      expect(lookupSongLink).toHaveBeenCalledWith(YOUTUBE);
    });

    it('is safe to call before anything happened and more than once', () => {
      const h = setup();
      act(() => h.result.current.reset());
      act(() => h.result.current.reset());
      expect(h.result.current.status).toEqual({ kind: 'idle' });
    });
  });
});
