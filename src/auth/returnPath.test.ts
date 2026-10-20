import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  forgetReturnPath,
  rememberCurrentLocation,
  takeReturnPath,
  useRememberReturnPath,
} from './returnPath';

const KEY = 'auth-return-path';
const MAX_AGE = 30 * 60 * 1000;

function stored(): { path: string; at: number } | null {
  const raw = sessionStorage.getItem(KEY);
  return raw === null ? null : (JSON.parse(raw) as { path: string; at: number });
}

function seed(value: unknown): void {
  sessionStorage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value));
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('rememberCurrentLocation', () => {
  it('stores the current pathname as JSON with a timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    window.history.pushState({}, '', '/chords');
    rememberCurrentLocation();
    expect(stored()).toEqual({ path: '/chords', at: Date.now() });
  });

  it('keeps the query string and hash', () => {
    window.history.pushState({}, '', '/bands/b1?tab=songs#vote');
    rememberCurrentLocation();
    expect(stored()?.path).toBe('/bands/b1?tab=songs#vote');
  });

  it('overwrites a previously remembered location', () => {
    window.history.pushState({}, '', '/chords');
    rememberCurrentLocation();
    window.history.pushState({}, '', '/tuner');
    rememberCurrentLocation();
    expect(stored()?.path).toBe('/tuner');
  });

  it('does not throw when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => rememberCurrentLocation()).not.toThrow();
  });
});

describe('forgetReturnPath', () => {
  it('removes the remembered path', () => {
    rememberCurrentLocation();
    forgetReturnPath();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('is a no-op when nothing is remembered', () => {
    expect(() => forgetReturnPath()).not.toThrow();
  });

  it('leaves unrelated sessionStorage keys alone', () => {
    sessionStorage.setItem('other', 'keep');
    rememberCurrentLocation();
    forgetReturnPath();
    expect(sessionStorage.getItem('other')).toBe('keep');
  });

  it('does not throw when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => forgetReturnPath()).not.toThrow();
  });
});

describe('takeReturnPath', () => {
  it('returns null when nothing is remembered', () => {
    expect(takeReturnPath()).toBeNull();
  });

  it('round-trips the current location, including query and hash', () => {
    window.history.pushState({}, '', '/practice?x=1#top');
    rememberCurrentLocation();
    expect(takeReturnPath()).toBe('/practice?x=1#top');
  });

  it('clears the entry so a second take returns null', () => {
    window.history.pushState({}, '', '/caged');
    rememberCurrentLocation();
    takeReturnPath();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(takeReturnPath()).toBeNull();
  });

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    it('returns the path when exactly at the 30 minute limit', () => {
      seed({ path: '/caged', at: Date.now() - MAX_AGE });
      expect(takeReturnPath()).toBe('/caged');
    });

    it('returns null one millisecond past the limit, and still clears the entry', () => {
      seed({ path: '/caged', at: Date.now() - MAX_AGE - 1 });
      expect(takeReturnPath()).toBeNull();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('expires an entry remembered earlier once the clock advances past the limit', () => {
      window.history.pushState({}, '', '/caged');
      rememberCurrentLocation();
      vi.advanceTimersByTime(MAX_AGE + 1);
      expect(takeReturnPath()).toBeNull();
    });

    it('still honours an entry shortly before the limit', () => {
      window.history.pushState({}, '', '/caged');
      rememberCurrentLocation();
      vi.advanceTimersByTime(MAX_AGE - 1000);
      expect(takeReturnPath()).toBe('/caged');
    });
  });

  describe('rejects malformed or tampered storage, clearing it', () => {
    it.each([
      ['non-JSON text', 'not json'],
      ['a bare legacy path string', '/chords'],
      ['JSON null', 'null'],
      ['a JSON number', '42'],
      ['a JSON string', '"/chords"'],
      ['an object missing the timestamp', { path: '/chords' }],
      ['an object missing the path', { at: 1 }],
      ['a non-string path', { path: 5, at: Date.now() }],
      ['a non-number timestamp', { path: '/chords', at: 'now' }],
    ])('returns null for %s', (_label, value) => {
      seed(value);
      expect(takeReturnPath()).toBeNull();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it.each([
      ['a full URL', 'https://evil.com/x'],
      ['a protocol-relative URL', '//evil.com/x'],
      ['a path without a leading slash', 'chords'],
      ['a path with a backslash', '/\\evil.com'],
      ['a path with a tab', '/\t/evil.com'],
      ['a path with a newline', '/chords\nx'],
      ['a path with a NUL char', '/chords\u0000'],
      ['a path with DEL', '/chords\u007f'],
      ['an empty path', ''],
      ['a javascript: URL', 'javascript:alert(1)'],
    ])('returns null when the stored path is %s', (_label, path) => {
      seed({ path, at: Date.now() });
      expect(takeReturnPath()).toBeNull();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });
  });

  it('rejects a stored path that canonicalises to a protocol-relative URL', () => {
    seed({ path: '/.//evil.com', at: Date.now() });
    expect(takeReturnPath()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('canonicalises a stored path through URL parsing (dot segments)', () => {
    seed({ path: '/a/../chords?x=1#h', at: Date.now() });
    expect(takeReturnPath()).toBe('/chords?x=1#h');
  });

  it('returns null instead of throwing when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(takeReturnPath()).toBeNull();
  });
});

describe('useRememberReturnPath', () => {
  it('remembers the current location while active', () => {
    window.history.pushState({}, '', '/scales?root=D');
    renderHook(() => useRememberReturnPath(true));
    expect(stored()?.path).toBe('/scales?root=D');
  });

  it('stores nothing while inactive', () => {
    window.history.pushState({}, '', '/scales');
    renderHook(() => useRememberReturnPath(false));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('remembers when active flips to true, and forgets when it flips back to false', () => {
    window.history.pushState({}, '', '/scales');
    const { rerender } = renderHook(({ active }) => useRememberReturnPath(active), {
      initialProps: { active: false },
    });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    rerender({ active: true });
    expect(stored()?.path).toBe('/scales');
    rerender({ active: false });
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('forgets on unmount while active', () => {
    window.history.pushState({}, '', '/scales');
    const { unmount } = renderHook(() => useRememberReturnPath(true));
    expect(stored()).not.toBeNull();
    unmount();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('does not clear an entry on unmount when it was never active', () => {
    seed({ path: '/kept', at: Date.now() });
    const { unmount } = renderHook(() => useRememberReturnPath(false));
    unmount();
    expect(stored()?.path).toBe('/kept');
  });

  it('refreshes the remembered location when re-activated on another page', () => {
    window.history.pushState({}, '', '/scales');
    const { rerender } = renderHook(({ active }) => useRememberReturnPath(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    window.history.pushState({}, '', '/tuner');
    rerender({ active: true });
    expect(stored()?.path).toBe('/tuner');
  });

  it('re-remembers the location on pagehide while active (the OAuth redirect unloads the page)', () => {
    window.history.pushState({}, '', '/scales');
    renderHook(() => useRememberReturnPath(true));
    sessionStorage.removeItem(KEY);
    window.history.pushState({}, '', '/scales?x=2');
    window.dispatchEvent(new Event('pagehide'));
    expect(stored()?.path).toBe('/scales?x=2');
  });

  it('ignores pagehide while inactive', () => {
    window.history.pushState({}, '', '/scales');
    renderHook(() => useRememberReturnPath(false));
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('stops listening to pagehide after deactivation', () => {
    window.history.pushState({}, '', '/scales');
    const { rerender } = renderHook(({ active }) => useRememberReturnPath(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('stops listening to pagehide after unmount', () => {
    window.history.pushState({}, '', '/scales');
    const { unmount } = renderHook(() => useRememberReturnPath(true));
    unmount();
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
