import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useActionThenReload, useAsyncAction } from './useAsyncAction';

describe('useAsyncAction', () => {
  it('reports success and is busy only while the action runs', async () => {
    let finish!: () => void;
    const { result } = renderHook(() => useAsyncAction());
    let outcome: Promise<boolean>;
    act(() => {
      outcome = result.current.run(() => new Promise<void>((r) => { finish = r; }));
    });
    expect(result.current.busy).toBe(true);
    await act(async () => { finish(); expect(await outcome).toBe(true); });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports failure with the error message (or the fallback) and clears it on the next run', async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      expect(await result.current.run(async () => { throw new Error('nope'); })).toBe(false);
    });
    expect(result.current.error).toBe('nope');
    await act(async () => {
      expect(await result.current.run(async () => { throw 'weird'; }, 'Custom fallback')).toBe(false);
    });
    expect(result.current.error).toBe('Custom fallback');
    await act(async () => { await result.current.run(async () => {}); });
    expect(result.current.error).toBeNull();
  });

  it('clearError and setError work', () => {
    const { result } = renderHook(() => useAsyncAction());
    act(() => result.current.setError('x'));
    expect(result.current.error).toBe('x');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});

describe('useActionThenReload', () => {
  it('reloads after a successful action', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useActionThenReload(reload));
    await act(async () => { expect(await result.current.act(async () => {})).toBe(true); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ALWAYS reloads, even when the action fails, and still reports the failure', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useActionThenReload(reload));
    await act(async () => {
      expect(await result.current.act(async () => { throw new Error('half applied'); })).toBe(false);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.error).toBe('half applied'));
  });

  it('runs the action before the reload', async () => {
    const order: string[] = [];
    const reload = vi.fn(async () => { order.push('reload'); });
    const { result } = renderHook(() => useActionThenReload(reload));
    await act(async () => { await result.current.act(async () => { order.push('action'); }); });
    expect(order).toEqual(['action', 'reload']);
  });
});
