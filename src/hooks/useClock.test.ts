import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useClock } from './useClock';

afterEach(() => vi.useRealTimers());

describe('useClock', () => {
  it('ticks on the interval and stops on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { result, unmount } = renderHook(() => useClock(1_000));
    expect(result.current).toBe(1_000_000);
    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(1_001_000);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('defaults to once a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() => useClock());
    act(() => void vi.advanceTimersByTime(59_999));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(60_000);
  });
});
