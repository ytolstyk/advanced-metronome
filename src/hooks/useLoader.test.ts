import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { FOCUS_REFETCH_MS, useLoader } from './useLoader';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLoader', () => {
  it('goes loading → ready', async () => {
    const { result } = renderHook(() => useLoader(async () => 42));
    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 42 }));
    expect(result.current.refreshError).toBeNull();
  });

  it('a failed first load is an error state (never an empty-looking page)', async () => {
    const { result } = renderHook(() => useLoader(async () => { throw new Error('boom'); }));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', message: 'boom' }));
  });

  it('keeps the last good data when a refresh fails, and says so', async () => {
    let n = 0;
    const load = vi.fn(async () => {
      if (++n === 2) throw new Error('flaky');
      return n;
    });
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 1 }));
    await act(async () => { await result.current.reload(); });
    expect(result.current.state).toEqual({ status: 'ready', data: 1 });
    expect(result.current.refreshError).toBe('flaky');
    await act(async () => { await result.current.reload(); });
    expect(result.current.state).toEqual({ status: 'ready', data: 3 });
    expect(result.current.refreshError).toBeNull();
  });

  it('recovers from a failed first load via reload()', async () => {
    let n = 0;
    const { result } = renderHook(() => useLoader(async () => { if (++n === 1) throw new Error('first'); return 'ok'; }));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    await act(async () => { await result.current.reload(); });
    expect(result.current.state).toEqual({ status: 'ready', data: 'ok' });
  });

  it('ignores a superseded in-flight load', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const load = vi.fn(() => new Promise<string>((r) => { resolvers.push(r); }));
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(resolvers).toHaveLength(1));
    act(() => { void result.current.reload(); });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => { resolvers[1]('fresh'); });
    await act(async () => { resolvers[0]('stale'); });
    expect(result.current.state).toEqual({ status: 'ready', data: 'fresh' });
  });

  it('refetches on focus only after the throttle window', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const load = vi.fn(async () => 'x');
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + FOCUS_REFETCH_MS - 1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(load).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + FOCUS_REFETCH_MS + 1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('returning to a tab fires focus AND visibilitychange but refetches once', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const load = vi.fn(async () => 'x');
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    now.mockReturnValue(1_000_000 + FOCUS_REFETCH_MS + 1);
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a focus event during the first slow load does not start a second load', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    now.mockReturnValue(1_000_000 + FOCUS_REFETCH_MS * 10);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { resolve('done'); });
    expect(result.current.state).toEqual({ status: 'ready', data: 'done' });
  });

  it('does not refetch while the page is hidden', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const load = vi.fn(async () => 'x');
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    now.mockReturnValue(1_000_000 + FOCUS_REFETCH_MS * 10);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stops listening and ignores results after unmount', async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useLoader(load));
    unmount();
    await act(async () => { resolve('late'); });
    expect(result.current.state).toEqual({ status: 'loading' });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
