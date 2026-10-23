import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('passes through a result that arrives in time and leaves no timer behind', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve('done'), 1_000, 'work')).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes through an error that arrives in time', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000, 'work')).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the label when the work takes too long, without cancelling it', async () => {
    vi.useFakeTimers();
    let finished = false;
    const slow = new Promise<void>((resolve) => setTimeout(() => ((finished = true), resolve()), 5_000));
    const result = withTimeout(slow, 1_000, 'slow thing').catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toBe('slow thing timed out');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(finished).toBe(true);
  });
});
