import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePracticeTimer } from './usePracticeTimer';

describe('usePracticeTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call onTick when isActive is false', () => {
    const onTick = vi.fn();
    renderHook(() => usePracticeTimer(false, onTick));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('calls onTick every 1000ms when isActive is true', () => {
    const onTick = vi.fn();
    renderHook(() => usePracticeTimer(true, onTick));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('calls onTick exactly once after 1000ms', () => {
    const onTick = vi.fn();
    renderHook(() => usePracticeTimer(true, onTick));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('stops ticking when isActive transitions from true to false', () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(
      ({ isActive }: { isActive: boolean }) => usePracticeTimer(isActive, onTick),
      { initialProps: { isActive: true } },
    );

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onTick).toHaveBeenCalledTimes(2);

    rerender({ isActive: false });

    act(() => { vi.advanceTimersByTime(3000); });
    // No additional ticks after going inactive
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('starts ticking when isActive transitions from false to true', () => {
    const onTick = vi.fn();
    const { rerender } = renderHook(
      ({ isActive }: { isActive: boolean }) => usePracticeTimer(isActive, onTick),
      { initialProps: { isActive: false } },
    );

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onTick).toHaveBeenCalledTimes(0);

    rerender({ isActive: true });

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('uses latest onTick callback without restarting the interval', () => {
    const firstTick = vi.fn();
    const secondTick = vi.fn();

    const { rerender } = renderHook(
      ({ onTick }: { onTick: () => void }) => usePracticeTimer(true, onTick),
      { initialProps: { onTick: firstTick } },
    );

    act(() => { vi.advanceTimersByTime(1000); });
    expect(firstTick).toHaveBeenCalledTimes(1);
    expect(secondTick).toHaveBeenCalledTimes(0);

    // Update the callback reference — interval should not restart
    rerender({ onTick: secondTick });

    act(() => { vi.advanceTimersByTime(1000); });
    expect(firstTick).toHaveBeenCalledTimes(1);
    expect(secondTick).toHaveBeenCalledTimes(1);
  });

  it('clears the interval on unmount', () => {
    const onTick = vi.fn();
    const { unmount } = renderHook(() => usePracticeTimer(true, onTick));

    act(() => { vi.advanceTimersByTime(1000); });
    expect(onTick).toHaveBeenCalledTimes(1);

    unmount();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('does not tick on sub-second intervals', () => {
    const onTick = vi.fn();
    renderHook(() => usePracticeTimer(true, onTick));
    act(() => { vi.advanceTimersByTime(999); });
    expect(onTick).toHaveBeenCalledTimes(0);
  });
});
