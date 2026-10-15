import { beforeEach, describe, expect, it, vi } from 'vitest';

const hub = vi.hoisted(() => ({ listener: null as null | ((msg: { payload: { event: string } }) => void), stop: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({
  Hub: {
    listen: vi.fn((_channel: string, cb: (msg: { payload: { event: string } }) => void) => {
      hub.listener = cb;
      return hub.stop;
    }),
  },
}));

import { clearJoinCode, readJoinCode, registerJoinCodeCleanup, storeJoinCode } from './bandJoinCode';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  hub.listener = null;
  vi.restoreAllMocks();
});

describe('join code storage', () => {
  it('round-trips through sessionStorage only (never localStorage)', () => {
    expect(readJoinCode()).toBe('');
    storeJoinCode('ABCDE-FGHJK');
    expect(readJoinCode()).toBe('ABCDE-FGHJK');
    expect(localStorage.length).toBe(0);
    clearJoinCode();
    expect(readJoinCode()).toBe('');
  });

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readJoinCode()).toBe('');
    expect(() => storeJoinCode('X')).not.toThrow();
    expect(() => clearJoinCode()).not.toThrow();
  });
});

describe('registerJoinCodeCleanup', () => {
  it('forgets a pending code on sign-out, from any page', () => {
    storeJoinCode('ABCDE-FGHJK');
    registerJoinCodeCleanup();
    hub.listener!({ payload: { event: 'signedIn' } });
    expect(readJoinCode()).toBe('ABCDE-FGHJK');
    hub.listener!({ payload: { event: 'signedOut' } });
    expect(readJoinCode()).toBe('');
  });

  it('returns the unsubscribe function', () => {
    expect(registerJoinCodeCleanup()).toBe(hub.stop);
  });
});
