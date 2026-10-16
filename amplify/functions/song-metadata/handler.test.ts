// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './handler';

const YT_ID = 'dQw4w9WgXcQ';
const YT_LINK = `https://www.youtube.com/watch?v=${YT_ID}`;
const SPOTIFY_LINK = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
const SPOTIFY_HTML =
  '<meta property="og:title" content="Never Gonna Give You Up"/><meta name="music:musician_description" content="Rick Astley"/>';
const YT_JSON = '{"title":"Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)","author_name":"Rick Astley"}';

type HandlerArgs = Parameters<typeof handler>;

async function run(url: string | undefined): Promise<string | null | undefined> {
  const event = { arguments: { url } } as unknown as HandlerArgs[0];
  return (await handler(event, {} as HandlerArgs[1], () => undefined)) as string | null | undefined;
}

describe('song-metadata handler', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('requests that never reach the network', () => {
    it.each([
      ['an unsupported host', 'https://example.com/song'],
      ['a non-URL', 'hello'],
      ['an http link', `http://www.youtube.com/watch?v=${YT_ID}`],
      ['an unsupported spotify path', 'https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT'],
    ])('returns null for %s without fetching', async (_label, url) => {
      expect(await run(url)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty url', ''],
      ['a whitespace-only url', '   \n '],
      ['a missing url', undefined],
    ])('returns null for %s without fetching', async (_label, url) => {
      expect(await run(url)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns null for a url longer than 300 characters', async () => {
      expect(await run(`${YT_LINK}&pad=${'a'.repeat(300)}`)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a url of exactly 300 characters', async () => {
      const link = `${YT_LINK}&pad=`.padEnd(300, 'a');
      expect(link).toHaveLength(300);
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status: 200 }));
      expect(await run(link)).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful lookups', () => {
    it('returns the parsed YouTube metadata as a JSON string', async () => {
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status: 200 }));
      const result = await run(YT_LINK);
      expect(typeof result).toBe('string');
      expect(JSON.parse(result as string)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
    });

    it('returns the parsed Spotify metadata from an HTML page', async () => {
      fetchMock.mockResolvedValue(new Response(`<html><head>${SPOTIFY_HTML}</head></html>`, { status: 200 }));
      expect(JSON.parse((await run(SPOTIFY_LINK)) as string)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
    });

    it('trims surrounding whitespace on the incoming url', async () => {
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status: 200 }));
      expect(await run(`  ${YT_LINK}  `)).not.toBeNull();
    });

    it('requests the planned fixed-host URL, not the pasted one', async () => {
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status: 200 }));
      await run(`https://youtu.be/${YT_ID}?si=tracking`);
      const [requested] = fetchMock.mock.calls[0];
      expect(requested).toBe(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${YT_ID}`)}`,
      );
    });

    it('refuses redirects, sets a timeout signal and sends the expected headers', async () => {
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status: 200 }));
      await run(YT_LINK);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.headers).toMatchObject({ accept: 'application/json,text/html' });
      expect((init.headers as Record<string, string>)['user-agent']).toContain('DrummaLlamaBot');
    });
  });

  describe('permanent failures resolve to null; transient ones throw so the client can retry', () => {
    it('returns null for a non-ok response', async () => {
      fetchMock.mockResolvedValue(new Response('Not found', { status: 404 }));
      expect(await run(YT_LINK)).toBeNull();
    });

    it.each([429, 500, 503])('throws for a transient %i response', async (status) => {
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status }));
      await expect(run(YT_LINK)).rejects.toThrow(`provider unavailable (${status})`);
    });

    it('throws when fetch rejects', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(run(YT_LINK)).rejects.toThrow('network down');
    });

    it('throws when fetch rejects because a redirect was refused', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(run(SPOTIFY_LINK)).rejects.toThrow('fetch failed');
    });

    it('throws when the request times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      await expect(run(YT_LINK)).rejects.toThrow();
    });

    it('returns null when the body cannot be parsed', async () => {
      fetchMock.mockResolvedValue(new Response('<html>not json</html>', { status: 200 }));
      expect(await run(YT_LINK)).toBeNull();
    });

    it('returns null when the page has no title metadata', async () => {
      fetchMock.mockResolvedValue(new Response('<html><head></head></html>', { status: 200 }));
      expect(await run(SPOTIFY_LINK)).toBeNull();
    });

    it('returns null when the response has no body', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
      expect(await run(SPOTIFY_LINK)).toBeNull();
    });

    it('throws when reading the body fails', async () => {
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error('connection reset'));
        },
      });
      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
      await expect(run(SPOTIFY_LINK)).rejects.toThrow('connection reset');
    });
  });

  describe('body size cap', () => {
    const CHUNK = 100_000;
    const encoder = new TextEncoder();

    /** A body that never ends: `head` first, then filler chunks. Counts pulls and records cancellation. */
    function endlessBody(head: string, tailAt?: { index: number; text: string }) {
      const state = { pulls: 0, cancelled: false };
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const index = state.pulls++;
            const text = index === 0 ? head : tailAt && index === tailAt.index ? tailAt.text : '';
            const bytes = new Uint8Array(CHUNK).fill(32); // spaces
            const prefix = encoder.encode(text);
            bytes.set(prefix.subarray(0, CHUNK));
            controller.enqueue(bytes);
          },
          cancel() {
            state.cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      return { stream, state };
    }

    it('stops reading an endless body and cancels the stream', async () => {
      const { stream, state } = endlessBody(SPOTIFY_HTML);
      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
      const result = await run(SPOTIFY_LINK);
      expect(JSON.parse(result as string)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
      expect(state.cancelled).toBe(true);
      // 600 000 bytes / 100 000-byte chunks = 6 reads; allow a little slack, never unbounded.
      expect(state.pulls).toBeLessThanOrEqual(8);
      expect(state.pulls).toBeGreaterThanOrEqual(6);
    });

    it('ignores metadata that only appears after the cap', async () => {
      const { stream, state } = endlessBody('', { index: 20, text: SPOTIFY_HTML });
      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
      expect(await run(SPOTIFY_LINK)).toBeNull();
      expect(state.cancelled).toBe(true);
      expect(state.pulls).toBeLessThan(20);
    });

    it('stops reading as soon as </head> has been seen and cancels the stream', async () => {
      const { stream, state } = endlessBody(`<html><head>${SPOTIFY_HTML}</head>`);
      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
      const result = await run(SPOTIFY_LINK);
      expect(JSON.parse(result as string)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
      expect(state.cancelled).toBe(true);
      expect(state.pulls).toBe(1);
    });

    it('detects </head> split across two chunks', async () => {
      const bytes = encoder.encode(`<html><head>${SPOTIFY_HTML}</he`);
      const rest = encoder.encode('ad><body>never read</body>');
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            controller.enqueue(sent++ === 0 ? bytes : rest);
          },
        },
        { highWaterMark: 0 },
      );
      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
      expect(JSON.parse((await run(SPOTIFY_LINK)) as string)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
      expect(sent).toBe(2);
    });

    it('decodes a multi-byte character split across chunks', async () => {
      const bytes = encoder.encode(`<head><meta property="og:title" content="Café"/></head>`);
      const split = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
      const chunks = [bytes.subarray(0, split), bytes.subarray(split)];
      let i = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (i < chunks.length) controller.enqueue(chunks[i++]);
            else controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
      expect(JSON.parse((await run(SPOTIFY_LINK)) as string)).toEqual({ title: 'Café', artist: '' });
    });

    describe('cap boundary', () => {
      const TAG = '<meta property="og:title" content="Edge"/>';
      const CAP = 600_000;

      /** Delivers `text` (ASCII) in one chunk or in fixed-size chunks. */
      function bodyOf(text: string, chunkSize?: number): Response {
        const bytes = encoder.encode(text);
        if (!chunkSize) return new Response(bytes, { status: 200 });
        let at = 0;
        const stream = new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              if (at >= bytes.length) return controller.close();
              controller.enqueue(bytes.subarray(at, at + chunkSize));
              at += chunkSize;
            },
          },
          { highWaterMark: 0 },
        );
        return new Response(stream, { status: 200 });
      }

      it.each([
        ['one chunk', undefined],
        ['100 000-byte chunks', 100_000],
        ['uneven 70 001-byte chunks', 70_001],
      ])('keeps a tag that ends exactly at the cap (%s)', async (_label, chunkSize) => {
        fetchMock.mockResolvedValue(bodyOf(' '.repeat(CAP - TAG.length) + TAG, chunkSize));
        expect(JSON.parse((await run(SPOTIFY_LINK)) as string)).toEqual({ title: 'Edge', artist: '' });
      });

      it.each([
        ['one chunk', undefined],
        ['100 000-byte chunks', 100_000],
        ['uneven 70 001-byte chunks', 70_001],
      ])('drops a tag that is one byte over the cap (%s)', async (_label, chunkSize) => {
        fetchMock.mockResolvedValue(bodyOf(' '.repeat(CAP + 1 - TAG.length) + TAG, chunkSize));
        expect(await run(SPOTIFY_LINK)).toBeNull();
      });
    });
  });

  describe('logging', () => {
    let info: ReturnType<typeof vi.spyOn>;
    let warn: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const logged = () => JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]);

    it('logs an unsupported link without the link', async () => {
      await run('https://example.com/secret-path');
      expect(info).toHaveBeenCalledWith('song-metadata: unsupported link');
      expect(logged()).not.toContain('secret-path');
    });

    it('does not log anything for an empty url', async () => {
      await run('');
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('warns with the provider and status when the provider refuses', async () => {
      fetchMock.mockResolvedValue(new Response('nope', { status: 429 }));
      await run(YT_LINK).catch(() => undefined);
      expect(warn).toHaveBeenCalledWith('song-metadata: provider refused', 'youtube', 429);
      expect(logged()).not.toContain(YT_ID);
    });

    it('warns with the provider when the page has no title', async () => {
      fetchMock.mockResolvedValue(new Response('<head></head>', { status: 200 }));
      await run(SPOTIFY_LINK);
      expect(warn).toHaveBeenCalledWith('song-metadata: no title found', 'spotify');
      expect(logged()).not.toContain('4cOdK2wGLETKBW3PvgPWqT');
    });

    it('logs the provider and error name, never the link, when the lookup throws', async () => {
      fetchMock.mockRejectedValue(new DOMException('timed out while fetching ' + YT_LINK, 'TimeoutError'));
      await run(YT_LINK).catch(() => undefined);
      expect(error).toHaveBeenCalledWith('song-metadata: lookup failed', 'youtube', 'TimeoutError');
      expect(logged()).not.toContain(YT_ID);
    });

    it('logs "unknown" for a thrown non-Error value', async () => {
      fetchMock.mockRejectedValue('boom');
      await run(YT_LINK).catch(() => undefined);
      expect(error).toHaveBeenCalledWith('song-metadata: lookup failed', 'youtube', 'unknown');
    });

    it('does not log on a successful lookup', async () => {
      fetchMock.mockResolvedValue(new Response(YT_JSON, { status: 200 }));
      await run(YT_LINK);
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });
  });
});
