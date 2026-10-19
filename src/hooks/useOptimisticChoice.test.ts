import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { VOTE_INDEX_LAG_GRACE_MS } from '../bandTypes';
import { useOptimisticChoice } from './useOptimisticChoice';

const NOW = 1_000_000;

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('useOptimisticChoice', () => {
  it('has nothing pending and has written nothing initially', () => {
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
    expect(result.current.pendingFor('a')).toBeUndefined();
    expect(result.current.hasWritten('a')).toBe(false);
  });

  it('shows the value as in flight while the write runs', () => {
    const w = deferred();
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
    act(() => {
      void result.current.run('a', 'red', () => w.promise);
    });
    expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: null });
    expect(result.current.hasWritten('a')).toBe(true);
  });

  it('marks the choice settled (stamped with now) once the write succeeds', async () => {
    const w = deferred();
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
    let p!: Promise<void>;
    act(() => {
      p = result.current.run('a', 'red', () => w.promise);
    });
    await act(async () => {
      w.resolve();
      await p;
    });
    expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: NOW });
    expect(result.current.hasWritten('a')).toBe(true);
  });

  it('supports a null value (a cleared choice)', async () => {
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
    await act(async () => {
      await result.current.run('a', null, async () => {});
    });
    expect(result.current.pendingFor('a')).toEqual({ value: null, settledAt: NOW });
  });

  it('stops trusting a settled choice once the data was fetched after the grace period', async () => {
    const { result, rerender } = renderHook(({ at }) => useOptimisticChoice<string>(at), { initialProps: { at: NOW } });
    await act(async () => {
      await result.current.run('a', 'red', async () => {});
    });
    rerender({ at: NOW + VOTE_INDEX_LAG_GRACE_MS });
    expect(result.current.pendingFor('a')).toBeDefined();
    rerender({ at: NOW + VOTE_INDEX_LAG_GRACE_MS + 1 });
    expect(result.current.pendingFor('a')).toBeUndefined();
    // the session still remembers having written it
    expect(result.current.hasWritten('a')).toBe(true);
  });

  it('keeps trusting an in-flight choice however late the data was fetched', () => {
    const w = deferred();
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW + 100 * VOTE_INDEX_LAG_GRACE_MS));
    act(() => {
      void result.current.run('a', 'red', () => w.promise);
    });
    expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: null });
  });

  it('tracks ids independently', async () => {
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
    await act(async () => {
      await result.current.run('a', 'red', async () => {});
    });
    expect(result.current.pendingFor('b')).toBeUndefined();
    expect(result.current.hasWritten('b')).toBe(false);
  });

  describe('failure', () => {
    it('rethrows the write error', async () => {
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      await act(async () => {
        await expect(
          result.current.run('a', 'red', async () => {
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');
      });
    });

    it('a failed first write leaves nothing pending and hasWritten false', async () => {
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      await act(async () => {
        await result.current.run('a', 'red', () => Promise.reject(new Error('boom'))).catch(() => {});
      });
      expect(result.current.pendingFor('a')).toBeUndefined();
      expect(result.current.hasWritten('a')).toBe(false);
    });

    it('restores the previous (settled) choice when a later write fails', async () => {
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      await act(async () => {
        await result.current.run('a', 'red', async () => {});
      });
      await act(async () => {
        await result.current.run('a', 'blue', () => Promise.reject(new Error('boom'))).catch(() => {});
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: NOW });
      expect(result.current.hasWritten('a')).toBe(true);
    });

    it('rolls back only the failing id', async () => {
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      await act(async () => {
        await result.current.run('a', 'red', async () => {});
        await result.current.run('b', 'blue', () => Promise.reject(new Error('boom'))).catch(() => {});
      });
      expect(result.current.pendingFor('a')?.value).toBe('red');
      expect(result.current.pendingFor('b')).toBeUndefined();
    });
  });

  describe('overlapping writes for the same id', () => {
    it('pick 1 failing while pick 2 is in flight does not clobber pick 2', async () => {
      const w1 = deferred();
      const w2 = deferred();
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.run('a', 'red', () => w1.promise);
      });
      act(() => {
        p2 = result.current.run('a', 'blue', () => w2.promise);
      });
      await act(async () => {
        w1.reject(new Error('first failed'));
        await expect(p1).rejects.toThrow('first failed');
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'blue', settledAt: null });
      expect(result.current.hasWritten('a')).toBe(true);

      await act(async () => {
        w2.resolve();
        await p2;
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'blue', settledAt: NOW });
    });

    it('pick 1 settling after pick 2 started does not overwrite pick 2 (it stays in flight)', async () => {
      const w1 = deferred();
      const w2 = deferred();
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.run('a', 'red', () => w1.promise);
      });
      act(() => {
        p2 = result.current.run('a', 'blue', () => w2.promise);
      });
      await act(async () => {
        w1.resolve();
        await p1;
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'blue', settledAt: null });

      await act(async () => {
        w2.resolve();
        await p2;
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'blue', settledAt: NOW });
    });

    it('both picks failing in order (pick 1 first, then pick 2) leaves nothing pinned', async () => {
      const w1 = deferred();
      const w2 = deferred();
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.run('a', 'red', () => w1.promise);
      });
      act(() => {
        p2 = result.current.run('a', 'blue', () => w2.promise);
      });
      await act(async () => {
        w1.reject(new Error('first failed'));
        await expect(p1).rejects.toThrow('first failed');
      });
      await act(async () => {
        w2.reject(new Error('second failed'));
        await expect(p2).rejects.toThrow('second failed');
      });
      expect(result.current.pendingFor('a')).toBeUndefined();
      expect(result.current.hasWritten('a')).toBe(false);
    });

    it('pick 2 failing after pick 1 already finished restores pick 1 as settled (never stuck in flight)', async () => {
      const w1 = deferred();
      const w2 = deferred();
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.run('a', 'red', () => w1.promise);
      });
      act(() => {
        p2 = result.current.run('a', 'blue', () => w2.promise);
      });
      await act(async () => {
        w1.resolve();
        await p1;
      });
      await act(async () => {
        w2.reject(new Error('second failed'));
        await expect(p2).rejects.toThrow('second failed');
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: NOW });
    });

    it('pick 2 failing while pick 1 is still in flight restores pick 1, which then settles normally', async () => {
      const w1 = deferred();
      const w2 = deferred();
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.run('a', 'red', () => w1.promise);
      });
      act(() => {
        p2 = result.current.run('a', 'blue', () => w2.promise);
      });
      await act(async () => {
        w2.reject(new Error('second failed'));
        await expect(p2).rejects.toThrow('second failed');
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: null });

      await act(async () => {
        w1.resolve();
        await p1;
      });
      expect(result.current.pendingFor('a')).toEqual({ value: 'red', settledAt: NOW });
    });

    it('both writes failing in order leaves nothing pending', async () => {
      const w1 = deferred();
      const w2 = deferred();
      const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      act(() => {
        p1 = result.current.run('a', 'red', () => w1.promise);
      });
      act(() => {
        p2 = result.current.run('a', 'blue', () => w2.promise);
      });
      await act(async () => {
        w2.reject(new Error('second'));
        await expect(p2).rejects.toThrow('second');
      });
      await act(async () => {
        w1.reject(new Error('first'));
        await expect(p1).rejects.toThrow('first');
      });
      expect(result.current.pendingFor('a')).toBeUndefined();
      expect(result.current.hasWritten('a')).toBe(false);
    });
  });

  it('hasWritten is true synchronously right after run starts (before any re-render)', () => {
    const w = deferred();
    const { result } = renderHook(() => useOptimisticChoice<string>(NOW));
    act(() => {
      void result.current.run('a', 'red', () => w.promise);
      expect(result.current.hasWritten('a')).toBe(true);
    });
  });
});
