import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCopyToClipboard } from './useCopyToClipboard';

afterEach(() => {
  vi.useRealTimers();
});

describe('useCopyToClipboard', () => {
  it('copies, flashes "copied", then resets', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { result } = renderHook(() => useCopyToClipboard(1000));
    expect(result.current[0]).toBe(false);

    let ok = false;
    await act(async () => { ok = await result.current[1]('hello'); });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current[0]).toBe(true);

    act(() => { vi.advanceTimersByTime(1001); });
    expect(result.current[0]).toBe(false);
  });

  it('reports false (and does not flash) when the browser refuses', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const { result } = renderHook(() => useCopyToClipboard());
    let ok = true;
    await act(async () => { ok = await result.current[1]('x'); });
    expect(ok).toBe(false);
    expect(result.current[0]).toBe(false);
  });

  it('reports false when the clipboard API is missing', async () => {
    Object.assign(navigator, { clipboard: undefined });
    const { result } = renderHook(() => useCopyToClipboard());
    let ok = true;
    await act(async () => { ok = await result.current[1]('x'); });
    expect(ok).toBe(false);
  });
});
