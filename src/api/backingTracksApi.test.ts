import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  class AuthRequiredError extends Error {}
  const mutations = {
    requestBackingTrackUpload: vi.fn(),
    commitBackingTrack: vi.fn(),
    editBackingTrack: vi.fn(),
    removeBackingTracks: vi.fn(),
  };
  return {
    AuthRequiredError,
    mutations,
    requireAuth: vi.fn(async () => undefined),
    hasBackingTrackModel: vi.fn(() => true),
    getConfig: vi.fn(),
    getUrl: vi.fn(),
    uploadsFlag: { on: true },
  };
});

vi.mock('./bandsShared', () => ({
  bandsClient: { mutations: h.mutations },
  requireAuth: h.requireAuth,
}));
vi.mock('../backingTrackFlags', () => ({ backingTrackUploadsOn: () => h.uploadsFlag.on }));
vi.mock('./bandReads', () => ({ hasBackingTrackModel: h.hasBackingTrackModel }));
vi.mock('aws-amplify', () => ({ Amplify: { getConfig: h.getConfig } }));
vi.mock('aws-amplify/storage', () => ({ getUrl: h.getUrl }));

import {
  addBackingTrack,
  areBackingTrackUploadsOn,
  BackingTrackError,
  COMMIT_BACKOFF_MS,
  editBackingTrack,
  getBackingTrackUrl,
  isBackingTracksReady,
  removeBackingTracks,
} from './backingTracksApi';
import type { ValidBackingTrack } from '../bandTypes';

const ok = (body: Record<string, unknown> = {}) => ({ data: JSON.stringify({ ok: true, ...body }) });
const fail = (code: string) => ({ data: JSON.stringify({ ok: false, code }) });
const retry = () => fail('retry');

// ---- a tiny XMLHttpRequest stand-in --------------------------------------------------------------

class FakeXHR {
  static instances: FakeXHR[] = [];
  /** Runs inside `send`, so a test decides how the upload ends. */
  static onSend: (xhr: FakeXHR) => void = (xhr) => xhr.finish(204);

  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  method = '';
  url = '';
  body: FormData | null = null;
  aborted = false;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
    FakeXHR.onSend(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
}

// ---- fixtures ------------------------------------------------------------------------------------

const TICKET = { trackId: 'track-1', slot: 1, url: 'https://s3.example/upload', fields: { key: 'pending/sub/1', policy: 'p', 'x-amz-signature': 's' } };
const song = { id: 'song-1', bandId: 'band-1' };
const mp3 = (name = 'No Drums.mp3', content = 'abcd') => new File([content], name, { type: 'audio/mpeg' });

const track = (over: Partial<Pick<ValidBackingTrack, 'key' | 'contentType' | 'label' | 'ext'>> = {}) => ({
  key: 'bt/sub/band/song/track.mp3',
  contentType: 'audio/mpeg',
  label: 'No drums',
  ext: 'mp3' as const,
  ...over,
});

const MUTATIONS = Object.values(h.mutations);
const noBackendCall = () => {
  for (const fn of MUTATIONS) expect(fn).not.toHaveBeenCalled();
  expect(h.getUrl).not.toHaveBeenCalled();
  expect(FakeXHR.instances).toHaveLength(0);
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of MUTATIONS) fn.mockReset();
  h.getUrl.mockReset();
  h.getConfig.mockReset();
  h.requireAuth.mockReset().mockResolvedValue(undefined);
  h.hasBackingTrackModel.mockReset().mockReturnValue(true);
  FakeXHR.instances = [];
  FakeXHR.onSend = (xhr) => xhr.finish(204);
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  h.mutations.requestBackingTrackUpload.mockResolvedValue(ok(TICKET));
  h.mutations.commitBackingTrack.mockResolvedValue(ok({ track: {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---- tests ---------------------------------------------------------------------------------------

describe('BackingTrackError re-export', () => {
  it('is the protocol module\'s class, so callers need only this module', async () => {
    const protocol = await import('./backingTrackProtocol');
    expect(BackingTrackError).toBe(protocol.BackingTrackError);
  });
});

describe('isBackingTracksReady', () => {
  it('is true only with the model AND a configured storage bucket', () => {
    h.getConfig.mockReturnValue({ Storage: { S3: { bucket: 'b' } } });
    expect(isBackingTracksReady()).toBe(true);
  });

  it('is false when the backend has no BackingTrack model', () => {
    h.hasBackingTrackModel.mockReturnValue(false);
    h.getConfig.mockReturnValue({ Storage: { S3: { bucket: 'b' } } });
    expect(isBackingTracksReady()).toBe(false);
  });

  it.each([
    ['no Storage section', {}],
    ['no S3 section', { Storage: {} }],
    ['an empty bucket', { Storage: { S3: { bucket: '' } } }],
  ])('is false with %s (the frontend can ship before the storage stack)', (_name, config) => {
    h.getConfig.mockReturnValue(config);
    expect(isBackingTracksReady()).toBe(false);
  });

  it('reads the config at call time, not at import time', () => {
    h.getConfig.mockReturnValue({});
    expect(isBackingTracksReady()).toBe(false);
    h.getConfig.mockReturnValue({ Storage: { S3: { bucket: 'b' } } });
    expect(isBackingTracksReady()).toBe(true);
  });
});

describe('areBackingTrackUploadsOn', () => {
  const ready = () => h.getConfig.mockReturnValue({ Storage: { S3: { bucket: 'b' } } });

  it('is true when the backend is ready AND its outputs say uploads are on', () => {
    ready();
    h.uploadsFlag.on = true;
    expect(areBackingTrackUploadsOn()).toBe(true);
  });

  it('is false when uploads are switched off, even though everything else is ready (listening still works)', () => {
    ready();
    h.uploadsFlag.on = false;
    expect(areBackingTrackUploadsOn()).toBe(false);
    expect(isBackingTracksReady()).toBe(true);
  });

  it('is false when the backend is not ready, whatever the flag says', () => {
    h.getConfig.mockReturnValue({});
    h.uploadsFlag.on = true;
    expect(areBackingTrackUploadsOn()).toBe(false);
  });

  afterEach(() => {
    h.uploadsFlag.on = true;
  });
});

describe('addBackingTrack', () => {
  it('asks for a ticket, uploads straight to S3, then commits with the ticket details', async () => {
    await addBackingTrack({ song, file: mp3(), label: '  No   drums ', tags: ['drums'] });

    expect(h.mutations.requestBackingTrackUpload).toHaveBeenCalledWith({ ext: 'mp3', bytes: 4 });
    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(TICKET.url);
    expect(h.mutations.commitBackingTrack).toHaveBeenCalledWith({
      trackId: 'track-1',
      bandId: 'band-1',
      songId: 'song-1',
      slot: 1,
      label: 'No drums',
      tags: ['drums'],
    });
  });

  it('sends the signed fields first and the file part LAST (S3 ignores anything after it)', async () => {
    await addBackingTrack({ song, file: mp3(), label: 'x', tags: [] });
    const form = FakeXHR.instances[0].body!;
    const names = [...form.keys()];
    expect(names).toEqual([...Object.keys(TICKET.fields), 'file']);
    expect(form.get('policy')).toBe('p');
    expect((form.get('file') as File).name).toBe('No Drums.mp3');
  });

  it('commits only after the upload finished', async () => {
    const order: string[] = [];
    FakeXHR.onSend = (xhr) => {
      order.push('upload');
      xhr.finish(204);
    };
    h.mutations.commitBackingTrack.mockImplementation(async () => {
      order.push('commit');
      return ok();
    });
    await addBackingTrack({ song, file: mp3(), label: 'x', tags: [] });
    expect(order).toEqual(['upload', 'commit']);
  });

  it('copies the tags array so later edits to it cannot change what was sent', async () => {
    const tags: ('drums' | 'bass')[] = ['drums'];
    await addBackingTrack({ song, file: mp3(), label: 'x', tags });
    const sent = h.mutations.commitBackingTrack.mock.calls[0][0].tags;
    expect(sent).toEqual(['drums']);
    expect(sent).not.toBe(tags);
  });

  it('reports upload progress as a fraction and ignores events with no known total', async () => {
    const onProgress = vi.fn();
    FakeXHR.onSend = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
      xhr.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 0 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 0 });
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      xhr.finish(204);
    };
    await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], onProgress });
    expect(onProgress.mock.calls).toEqual([[0.25], [1]]);
  });

  it('reports whole percents only: events that round to the same percent are not repeated', async () => {
    const onProgress = vi.fn();
    FakeXHR.onSend = (xhr) => {
      for (const loaded of [250, 251, 254, 249, 260, 263, 1000]) {
        xhr.upload.onprogress?.({ lengthComputable: true, loaded, total: 1000 });
      }
      xhr.finish(204);
    };
    await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], onProgress });
    expect(onProgress.mock.calls).toEqual([[0.25], [0.26], [1]]);
  });

  it('works without a progress callback', async () => {
    FakeXHR.onSend = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
      xhr.finish(204);
    };
    await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).resolves.toBeUndefined();
  });

  describe('requires auth first', () => {
    it('throws the sign-in error and calls nothing else', async () => {
      const err = new h.AuthRequiredError('sign in');
      h.requireAuth.mockRejectedValue(err);
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toBe(err);
      noBackendCall();
    });
  });

  describe('validates before sending anything', () => {
    const rejection = (file: File, label = 'x') =>
      addBackingTrack({ song, file, label, tags: [] }).then(
        () => {
          throw new Error('expected a rejection');
        },
        (e: unknown) => e,
      );

    it('rejects an unsupported file type as bad-input with the plain message', async () => {
      const error = await rejection(mp3('a.ogg'));
      expect(error).toBeInstanceOf(BackingTrackError);
      expect(error).toMatchObject({ code: 'bad-input', message: 'Choose a MP3, M4A, WAV, FLAC file.' });
      noBackendCall();
    });

    it('rejects an empty file', async () => {
      expect(await rejection(mp3('a.mp3', ''))).toMatchObject({ code: 'bad-input', message: 'That file is empty.' });
      noBackendCall();
    });

    it('rejects a file over the size limit with the shared too-big message', async () => {
      const big = mp3('big.mp3');
      Object.defineProperty(big, 'size', { value: 50 * 1024 * 1024 + 1 });
      expect(await rejection(big)).toMatchObject({ code: 'bad-input', message: 'Files can be up to 50 MB. Try an MP3, M4A or FLAC.' });
      noBackendCall();
    });

    it.each(['', '   ', '\u200b\u200b'])('rejects a name with nothing printable (%j)', async (label) => {
      const error = await rejection(mp3(), label);
      expect(error).toBeInstanceOf(BackingTrackError);
      expect(error).toMatchObject({ code: 'bad-input', message: 'Give the track a name.' });
      noBackendCall();
    });

    it('takes the upload type from the file name, not the browser\'s MIME type', async () => {
      await addBackingTrack({ song, file: new File(['abcd'], 'take.WAV', { type: '' }), label: 'x', tags: [] });
      expect(h.mutations.requestBackingTrackUpload).toHaveBeenCalledWith({ ext: 'wav', bytes: 4 });
    });
  });

  describe('errors from the ticket request', () => {
    it('maps a Lambda code to its plain-language message and never uploads', async () => {
      h.mutations.requestBackingTrackUpload.mockResolvedValue(fail('over-quota'));
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toThrow(/used up your backing track storage \(20 files\)/);
      expect(FakeXHR.instances).toHaveLength(0);
      expect(h.mutations.commitBackingTrack).not.toHaveBeenCalled();
    });

    it('turns a transport failure into a plain retry message, not a raw GraphQL error', async () => {
      h.mutations.requestBackingTrackUpload.mockRejectedValue(new Error('GraphQL: Network Error 0x1'));
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BackingTrackError);
      expect((error as BackingTrackError).code).toBe('retry');
      expect((error as Error).message).toBe("That didn't go through. Please try again in a moment.");
    });

    it('treats a reply with no data, or with unparsable data, as retry', async () => {
      h.mutations.requestBackingTrackUpload.mockResolvedValueOnce({ data: null, errors: [{ message: 'x' }] });
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toMatchObject({ code: 'retry' });
      h.mutations.requestBackingTrackUpload.mockResolvedValueOnce({ data: 'not json' });
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toMatchObject({ code: 'retry' });
    });

    it('treats a code the client does not know as retry', async () => {
      h.mutations.requestBackingTrackUpload.mockResolvedValue(fail('brand-new-code'));
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toMatchObject({ code: 'retry' });
    });

    it.each([
      ['uploads-disabled', /switched off/],
      ['not-member', /Only band members/],
      ['banned', /can't add backing tracks to this band/],
      ['band-full', /band already has 100/],
      ['song-full', /song already has 10/],
    ])('shows the %s message', async (code, message) => {
      h.mutations.requestBackingTrackUpload.mockResolvedValue(fail(code));
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toThrow(message);
    });
  });

  describe('upload failures (commit is never attempted)', () => {
    it.each([
      [400, 'too-big', /Files can be up to 50 MB/],
      [403, 'retry', /didn't go through/],
      [404, 'retry', /didn't go through/],
      [500, 'retry', /didn't go through/],
      [503, 'retry', /didn't go through/],
    ])('S3 answering %i is %s', async (status, code, message) => {
      FakeXHR.onSend = (xhr) => xhr.finish(status);
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BackingTrackError);
      expect((error as BackingTrackError).code).toBe(code);
      expect((error as Error).message).toMatch(message);
      expect(h.mutations.commitBackingTrack).not.toHaveBeenCalled();
    });

    it('accepts any 2xx as success', async () => {
      FakeXHR.onSend = (xhr) => xhr.finish(201);
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).resolves.toBeUndefined();
    });

    it('a dropped connection is a network error', async () => {
      FakeXHR.onSend = (xhr) => xhr.onerror?.();
      await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toMatchObject({
        code: 'network',
        message: 'The connection dropped. Check it and try again.',
      });
      expect(h.mutations.commitBackingTrack).not.toHaveBeenCalled();
    });

    it('aborting the signal cancels the request and rejects with an AbortError', async () => {
      const controller = new AbortController();
      FakeXHR.onSend = () => controller.abort();
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal }).catch((e: unknown) => e);
      expect(FakeXHR.instances[0].aborted).toBe(true);
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe('AbortError');
      expect(h.mutations.commitBackingTrack).not.toHaveBeenCalled();
    });

    it('cancelling while the signed form is still being requested sends nothing at all', async () => {
      const controller = new AbortController();
      h.mutations.requestBackingTrackUpload.mockImplementation(async () => {
        controller.abort(); // the person pressed Cancel during the request
        return ok(TICKET);
      });
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal }).catch((e: unknown) => e);
      expect((error as DOMException).name).toBe('AbortError');
      expect(FakeXHR.instances).toHaveLength(0);
      expect(h.mutations.commitBackingTrack).not.toHaveBeenCalled();
    });

    it('cancelling after the file is sent but before the commit leaves the file unattached', async () => {
      const controller = new AbortController();
      FakeXHR.onSend = (xhr) => {
        xhr.finish(204);
        controller.abort();
      };
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal }).catch((e: unknown) => e);
      expect((error as DOMException).name).toBe('AbortError');
      expect(h.mutations.commitBackingTrack).not.toHaveBeenCalled();
    });

    it('stops listening to the signal once the upload is over', async () => {
      const controller = new AbortController();
      await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal });
      controller.abort();
      expect(FakeXHR.instances[0].aborted).toBe(false);
    });
  });

  describe('commit', () => {
    /** Starts an add whose commit keeps answering `retry`, under fake timers, and returns the settled outcome. */
    const startRetrying = () => {
      vi.useFakeTimers();
      h.mutations.commitBackingTrack.mockResolvedValue(retry());
      return addBackingTrack({ song, file: mp3(), label: 'x', tags: [] }).catch((e: unknown) => e);
    };
    const commits = () => h.mutations.commitBackingTrack.mock.calls.length;

    it('waits between re-sends (400 ms, then 1200 ms) and gives up after the third attempt', async () => {
      expect(COMMIT_BACKOFF_MS).toEqual([400, 1200]);
      const outcome = startRetrying();
      await vi.advanceTimersByTimeAsync(0);
      expect(commits()).toBe(1);
      await vi.advanceTimersByTimeAsync(399);
      expect(commits()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(commits()).toBe(2);
      await vi.advanceTimersByTimeAsync(1199);
      expect(commits()).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(commits()).toBe(3);
      expect(await outcome).toMatchObject({ code: 'retry' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(commits()).toBe(3);
      expect(h.mutations.requestBackingTrackUpload).toHaveBeenCalledTimes(1);
      expect(FakeXHR.instances).toHaveLength(1);
    });

    it('succeeds when a later attempt goes through, asking with the same track id each time', async () => {
      vi.useFakeTimers();
      h.mutations.commitBackingTrack.mockResolvedValueOnce(retry()).mockResolvedValueOnce(ok());
      const outcome = addBackingTrack({ song, file: mp3(), label: 'x', tags: [] });
      await vi.advanceTimersByTimeAsync(400);
      await expect(outcome).resolves.toBeUndefined();
      const ids = h.mutations.commitBackingTrack.mock.calls.map((c) => c[0].trackId);
      expect(ids).toEqual(['track-1', 'track-1']);
    });

    it('a transport failure on commit counts as retry', async () => {
      vi.useFakeTimers();
      h.mutations.commitBackingTrack.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok());
      const outcome = addBackingTrack({ song, file: mp3(), label: 'x', tags: [] });
      await vi.advanceTimersByTimeAsync(400);
      await expect(outcome).resolves.toBeUndefined();
      expect(commits()).toBe(2);
    });

    it.each(['song-full', 'replaced', 'banned', 'not-found', 'too-big', 'bad-file', 'conflict'])(
      'is NOT retried (and never waits) on the definite answer "%s"',
      async (code) => {
        h.mutations.commitBackingTrack.mockResolvedValue(fail(code));
        await expect(addBackingTrack({ song, file: mp3(), label: 'x', tags: [] })).rejects.toMatchObject({ code });
        expect(commits()).toBe(1);
      },
    );

    it('stops waiting when the person cancels during a back-off, and sends no further commit', async () => {
      const controller = new AbortController();
      h.mutations.commitBackingTrack.mockResolvedValue(retry());
      vi.useFakeTimers();
      const outcome = addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100);
      expect(commits()).toBe(1);
      controller.abort();
      const error = (await outcome) as DOMException;
      expect(error.name).toBe('AbortError');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(commits()).toBe(1);
    });

    it('does not start a back-off when the signal is already aborted as the first commit fails', async () => {
      const controller = new AbortController();
      h.mutations.commitBackingTrack.mockImplementation(async () => {
        controller.abort();
        return retry();
      });
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal }).catch((e: unknown) => e);
      expect((error as DOMException).name).toBe('AbortError');
      expect(commits()).toBe(1);
    });

    it('does not attach the file when cancelled between the upload and the first commit', async () => {
      const controller = new AbortController();
      FakeXHR.onSend = (xhr) => {
        xhr.finish(204);
        controller.abort();
      };
      const error = await addBackingTrack({ song, file: mp3(), label: 'x', tags: [], signal: controller.signal }).catch((e: unknown) => e);
      expect((error as DOMException).name).toBe('AbortError');
      expect(commits()).toBe(0);
    });
  });
});

describe('editBackingTrack', () => {
  it('sends the cleaned label and a copy of the tags', async () => {
    h.mutations.editBackingTrack.mockResolvedValue(ok());
    const tags: ('bass' | 'keys')[] = ['bass', 'keys'];
    await editBackingTrack('t-1', '  Bass   only ', tags);
    const arg = h.mutations.editBackingTrack.mock.calls[0][0];
    expect(arg).toEqual({ trackId: 't-1', label: 'Bass only', tags: ['bass', 'keys'] });
    expect(arg.tags).not.toBe(tags);
  });

  it('rejects an empty name without calling the backend', async () => {
    await expect(editBackingTrack('t-1', '   ', [])).rejects.toThrow('Give the track a name.');
    expect(h.mutations.editBackingTrack).not.toHaveBeenCalled();
  });

  it('maps a server code to a plain message', async () => {
    h.mutations.editBackingTrack.mockResolvedValue(fail('forbidden'));
    await expect(editBackingTrack('t-1', 'x', [])).rejects.toThrow("You can't change that track.");
  });

  it('requires auth first', async () => {
    const err = new h.AuthRequiredError('sign in');
    h.requireAuth.mockRejectedValue(err);
    await expect(editBackingTrack('t-1', 'x', [])).rejects.toBe(err);
    noBackendCall();
  });
});

describe('removeBackingTracks', () => {
  it('sends a copy of the ids and resolves when every result is ok', async () => {
    h.mutations.removeBackingTracks.mockResolvedValue(ok({ results: [{ id: 'a', ok: true }, { id: 'b', ok: true }] }));
    const ids = ['a', 'b'];
    await expect(removeBackingTracks(ids)).resolves.toBeUndefined();
    const sent = h.mutations.removeBackingTracks.mock.calls[0][0].trackIds;
    expect(sent).toEqual(['a', 'b']);
    expect(sent).not.toBe(ids);
  });

  it('throws when any per-id result failed, with that result\'s message', async () => {
    h.mutations.removeBackingTracks.mockResolvedValue(
      ok({ results: [{ id: 'a', ok: true }, { id: 'b', ok: false, code: 'forbidden' }] }),
    );
    await expect(removeBackingTracks(['a', 'b'])).rejects.toMatchObject({ code: 'forbidden', message: "You can't change that track." });
  });

  it('falls back to retry when a failed result carries no code', async () => {
    h.mutations.removeBackingTracks.mockResolvedValue(ok({ results: [{ id: 'a', ok: false }] }));
    await expect(removeBackingTracks(['a'])).rejects.toMatchObject({ code: 'retry' });
  });

  it('surfaces a top-level server code', async () => {
    h.mutations.removeBackingTracks.mockResolvedValue(fail('not-member'));
    await expect(removeBackingTracks(['a'])).rejects.toMatchObject({ code: 'not-member' });
  });

  it('requires auth first', async () => {
    const err = new h.AuthRequiredError('sign in');
    h.requireAuth.mockRejectedValue(err);
    await expect(removeBackingTracks(['a'])).rejects.toBe(err);
    noBackendCall();
  });
});

describe('getBackingTrackUrl', () => {
  beforeEach(() => {
    h.getUrl.mockResolvedValue({ url: new URL('https://signed.example/file?sig=1') });
  });

  it('links the stored key for 10 minutes and forces the audio content type; playing skips the existence check', async () => {
    const url = await getBackingTrackUrl(track());
    expect(url).toBe('https://signed.example/file?sig=1');
    expect(h.getUrl).toHaveBeenCalledWith({
      path: 'bt/sub/band/song/track.mp3',
      options: { expiresIn: 600, validateObjectExistence: false, contentType: 'audio/mpeg' },
    });
  });

  it('does not ask for an attachment or an existence check when playing, with or without the options object', async () => {
    await getBackingTrackUrl(track(), { download: false });
    await getBackingTrackUrl(track(), {});
    for (const [arg] of h.getUrl.mock.calls) {
      expect(arg.options).not.toHaveProperty('contentDisposition');
      expect(arg.options.validateObjectExistence).toBe(false);
    }
  });

  it('checks the file exists before handing out a download link', async () => {
    await getBackingTrackUrl(track(), { download: true });
    expect(h.getUrl.mock.calls[0][0].options.validateObjectExistence).toBe(true);
  });

  it('asks for an attachment named after the label when downloading', async () => {
    await getBackingTrackUrl(track(), { download: true });
    expect(h.getUrl.mock.calls[0][0].options.contentDisposition).toBe(
      `attachment; filename="No drums.mp3"; filename*=UTF-8''No%20drums.mp3`,
    );
  });

  it('gives non-ASCII names an ASCII fallback plus an RFC 5987 encoded name', async () => {
    await getBackingTrackUrl(track({ label: 'Café ドラム' }), { download: true });
    const header = h.getUrl.mock.calls[0][0].options.contentDisposition as string;
    expect(header).toBe(`attachment; filename="Caf_ ___.mp3"; filename*=UTF-8''${encodeURIComponent('Café ドラム.mp3')}`);
    expect(header.split(';')[1]).toMatch(/^[\x20-\x7e]+$/);
  });

  it('turns any storage failure into a plain-language not-found error', async () => {
    h.getUrl.mockRejectedValue(new Error('NoSuchKey: bt/secret/key'));
    const error = await getBackingTrackUrl(track()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackingTrackError);
    expect((error as BackingTrackError).code).toBe('not-found');
    expect((error as Error).message).toBe("That file isn't available. It may have been removed.");
    expect((error as Error).message).not.toContain('bt/secret');
  });

  it('requires auth first', async () => {
    const err = new h.AuthRequiredError('sign in');
    h.requireAuth.mockRejectedValue(err);
    await expect(getBackingTrackUrl(track())).rejects.toBe(err);
    noBackendCall();
  });
});
