import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NARROW_DAYS_PER_PAGE, useDaysPerPage, WIDE_DAYS_PER_PAGE } from './useDaysPerPage';

type Listener = () => void;

/** A controllable `matchMedia`: `setWide` flips the result and tells the listeners. */
function stubMatchMedia(initiallyWide: boolean) {
  let wide = initiallyWide;
  const listeners = new Set<Listener>();
  const query = {
    get matches() {
      return wide;
    },
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return {
    listeners,
    setWide: (next: boolean) => {
      wide = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useDaysPerPage', () => {
  it('is a week on a wide screen and three days on a phone', () => {
    stubMatchMedia(true);
    expect(renderHook(() => useDaysPerPage()).result.current).toBe(WIDE_DAYS_PER_PAGE);
    stubMatchMedia(false);
    expect(renderHook(() => useDaysPerPage()).result.current).toBe(NARROW_DAYS_PER_PAGE);
  });

  it('follows the screen when it is resized or rotated', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useDaysPerPage());
    act(() => media.setWide(false));
    expect(result.current).toBe(NARROW_DAYS_PER_PAGE);
    act(() => media.setWide(true));
    expect(result.current).toBe(WIDE_DAYS_PER_PAGE);
  });

  it('stops listening when unmounted', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useDaysPerPage());
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('shows a week where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useDaysPerPage()).result.current).toBe(WIDE_DAYS_PER_PAGE);
  });
});
