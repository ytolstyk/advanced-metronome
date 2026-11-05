import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKING_TRACK_ERROR_CODES, isBackingTrackErrorCode } from '../backingTrackFormat';
import { BackingTrackError, CODE_MESSAGES, run } from './backingTrackProtocol';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('CODE_MESSAGES', () => {
  it.each(BACKING_TRACK_ERROR_CODES)('has a plain-language message for "%s"', (code) => {
    expect(CODE_MESSAGES[code]).toEqual(expect.any(String));
    expect(CODE_MESSAGES[code].length).toBeGreaterThan(10);
  });

  it('has no message for anything that is not a code', () => {
    expect(Object.keys(CODE_MESSAGES).sort()).toEqual([...BACKING_TRACK_ERROR_CODES].sort());
  });

  it('uses the shared size message for too-big', () => {
    expect(CODE_MESSAGES['too-big']).toBe('Files can be up to 50 MB. Try an MP3, M4A or FLAC.');
  });

  it('mentions the real limits', () => {
    expect(CODE_MESSAGES['song-full']).toContain('10');
    expect(CODE_MESSAGES['band-full']).toContain('100');
    expect(CODE_MESSAGES['over-quota']).toContain('20 files');
  });
});

describe('isBackingTrackErrorCode', () => {
  it.each(BACKING_TRACK_ERROR_CODES)('accepts "%s"', (code) => {
    expect(isBackingTrackErrorCode(code)).toBe(true);
  });

  it.each(['', 'nope', 'RETRY', ' retry', 'network', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'rejects the string %j (including inherited object names)',
    (value) => {
      expect(isBackingTrackErrorCode(value)).toBe(false);
    },
  );

  it.each([undefined, null, 0, 1, {}, [], ['retry'], true])('rejects the non-string %j', (value) => {
    expect(isBackingTrackErrorCode(value)).toBe(false);
  });
});

describe('BackingTrackError', () => {
  it('defaults to the message for its code', () => {
    const e = new BackingTrackError('song-full');
    expect(e.message).toBe(CODE_MESSAGES['song-full']);
    expect(e.code).toBe('song-full');
    expect(e.name).toBe('BackingTrackError');
    expect(e).toBeInstanceOf(Error);
  });

  it('has a connection message for the browser-side "network" failure', () => {
    expect(new BackingTrackError('network').message).toBe('The connection dropped. Check it and try again.');
  });

  it('lets a caller override the message and keeps the code', () => {
    const e = new BackingTrackError('bad-input', 'Give the track a name.');
    expect(e.message).toBe('Give the track a name.');
    expect(e.code).toBe('bad-input');
  });
});

describe('run', () => {
  const reply = (body: unknown) => ({ data: JSON.stringify(body) });

  it('returns the parsed reply on ok:true', async () => {
    await expect(run<{ track: number }>(async () => reply({ ok: true, track: 7 }))).resolves.toEqual({ ok: true, track: 7 });
  });

  it('throws a BackingTrackError with the Lambda\'s code on ok:false', async () => {
    const error = await run(async () => reply({ ok: false, code: 'banned' })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackingTrackError);
    expect(error).toMatchObject({ code: 'banned', message: CODE_MESSAGES.banned });
  });

  it.each(['brand-new', 'constructor', 'toString', '', undefined, 5])('turns the unknown code %j into retry', async (code) => {
    await expect(run(async () => reply({ ok: false, code }))).rejects.toMatchObject({ code: 'retry' });
  });

  it('turns a rejected call into retry without leaking the raw error', async () => {
    const error = await run(async () => {
      throw new Error('GraphQL: socket hang up 10.0.0.1');
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'retry', message: CODE_MESSAGES.retry });
    expect((error as Error).message).not.toContain('10.0.0.1');
    expect(console.warn).toHaveBeenCalled();
  });

  it('turns a reply with no data into retry and logs the GraphQL errors', async () => {
    await expect(run(async () => ({ data: null, errors: [{ message: 'denied' }] }))).rejects.toMatchObject({ code: 'retry' });
    expect(console.warn).toHaveBeenCalledWith('Backing track call returned no data', [{ message: 'denied' }]);
    await expect(run(async () => ({}))).rejects.toMatchObject({ code: 'retry' });
    await expect(run(async () => ({ data: '' }))).rejects.toMatchObject({ code: 'retry' });
  });

  it('turns unparsable data into retry', async () => {
    await expect(run(async () => ({ data: '{not json' }))).rejects.toMatchObject({ code: 'retry' });
  });
});
