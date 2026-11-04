import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRemote } from './useRemote';

/** A promise the test settles by hand, so answers can arrive in any order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useRemote', () => {
  it('stays idle and never loads while the key is null', () => {
    const load = vi.fn(async () => 'x');
    const { result } = renderHook(() => useRemote<string>(null, load));
    expect(result.current).toEqual({ status: 'idle' });
    expect(load).not.toHaveBeenCalled();
  });

  it('is loading first, then ready with the loaded value', async () => {
    const d = deferred<string>();
    const { result } = renderHook(() => useRemote('k1', () => d.promise));
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => d.resolve('hello'));
    expect(result.current).toEqual({ status: 'ready', value: 'hello' });
  });

  it('reports the error message when the load rejects', async () => {
    const { result } = renderHook(() => useRemote('k1', async () => Promise.reject(new Error('boom'))));
    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: 'boom' }));
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    const { result } = renderHook(() => useRemote('k1', () => Promise.reject('nope')));
    await waitFor(() => expect(result.current).toEqual({ status: 'error', message: 'Could not load this' }));
  });

  it('ignores an answer that arrives after the key changed', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ k }) => useRemote(k, () => (k === 'a' ? first.promise : second.promise)), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    await act(async () => first.resolve('stale answer for a'));
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => second.resolve('answer for b'));
    expect(result.current).toEqual({ status: 'ready', value: 'answer for b' });
  });

  it('ignores a stale rejection after the key changed', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ k }) => useRemote(k, () => (k === 'a' ? first.promise : second.promise)), {
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });
    await act(async () => first.reject(new Error('old failure')));
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => second.resolve('fine'));
    expect(result.current).toEqual({ status: 'ready', value: 'fine' });
  });

  it('never shows the previous key\'s data while the new key loads', async () => {
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ k }) => useRemote(k, () => (k === 'a' ? Promise.resolve('A') : second.promise)), {
      initialProps: { k: 'a' },
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', value: 'A' }));
    rerender({ k: 'b' });
    expect(result.current).toEqual({ status: 'loading' }); // same render as the key change
    await act(async () => second.resolve('B'));
    expect(result.current).toEqual({ status: 'ready', value: 'B' });
  });

  it('goes back to idle when the key becomes null', async () => {
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useRemote(k, async () => 'v'), {
      initialProps: { k: 'a' as string | null },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ k: null });
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('does not reload when only the loader identity changes, but uses the latest loader on a key change', async () => {
    const calls: string[] = [];
    const { rerender } = renderHook(
      ({ k, tag }) =>
        useRemote(k, async () => {
          calls.push(`${k}:${tag}`);
          return tag;
        }),
      { initialProps: { k: 'a', tag: 'one' } },
    );
    await waitFor(() => expect(calls).toEqual(['a:one']));
    rerender({ k: 'a', tag: 'two' });
    expect(calls).toEqual(['a:one']);
    rerender({ k: 'b', tag: 'two' });
    await waitFor(() => expect(calls).toEqual(['a:one', 'b:two']));
  });

  it('does not set state after unmount', async () => {
    const d = deferred<string>();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useRemote('k', () => d.promise));
    unmount();
    await act(async () => d.resolve('late'));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
