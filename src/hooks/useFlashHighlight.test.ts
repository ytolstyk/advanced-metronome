import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlashHighlight } from './useFlashHighlight';

describe('useFlashHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unlit', () => {
    const { result } = renderHook(() => useFlashHighlight());
    expect(result.current[0]).toBe(false);
  });

  it('lights up immediately when triggered', () => {
    const { result } = renderHook(() => useFlashHighlight());
    act(() => { result.current[1](); });
    expect(result.current[0]).toBe(true);
  });

  it('unlights after the default duration', () => {
    const { result } = renderHook(() => useFlashHighlight());
    act(() => { result.current[1](); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current[0]).toBe(false);
  });

  it('respects a custom duration', () => {
    const { result } = renderHook(() => useFlashHighlight(1000));
    act(() => { result.current[1](); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current[0]).toBe(true);
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current[0]).toBe(false);
  });

  it('re-triggering before the timer fires restarts the duration instead of leaking a timer', () => {
    const { result } = renderHook(() => useFlashHighlight());
    act(() => { result.current[1](); });
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { result.current[1](); }); // re-trigger before the first timer fires
    act(() => { vi.advanceTimersByTime(300); });
    // 300ms after the second trigger is still < 400ms, so it should still be lit
    expect(result.current[0]).toBe(true);
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current[0]).toBe(false);
  });

  it('clears the pending timer on unmount without throwing', () => {
    const { result, unmount } = renderHook(() => useFlashHighlight());
    act(() => { result.current[1](); });
    expect(() => unmount()).not.toThrow();
  });
});
