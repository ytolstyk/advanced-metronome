import { describe, expect, it, vi } from 'vitest';
import { listAll, pageOpts, runPool } from './paginate';

describe('pageOpts', () => {
  it('uses the shared page size and passes the token through', () => {
    expect(pageOpts(undefined)).toEqual({ limit: 250, nextToken: undefined });
    expect(pageOpts('t')).toEqual({ limit: 250, nextToken: 't' });
  });
});

describe('listAll', () => {
  it('follows nextToken until the end', async () => {
    const pages = [
      { items: [1, 2], nextToken: 't1' },
      { items: [3], nextToken: 't2' },
      { items: [4], nextToken: null },
    ];
    const fetch = vi.fn(async (token: string | undefined) => pages[token === undefined ? 0 : token === 't1' ? 1 : 2]);
    expect(await listAll(fetch)).toEqual({ items: [1, 2, 3, 4], incomplete: false });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([undefined, 't1', 't2']);
  });

  it('stops at the page cap and reports incomplete', async () => {
    const fetch = vi.fn(async () => ({ items: [1], nextToken: 'more' }));
    const res = await listAll(fetch, 3);
    expect(res.incomplete).toBe(true);
    expect(res.items).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('is complete when the last allowed page has no token', async () => {
    let n = 0;
    const fetch = vi.fn(async () => ({ items: [n], nextToken: ++n === 3 ? undefined : 'more' }));
    expect(await listAll(fetch, 3)).toEqual({ items: [0, 1, 2], incomplete: false });
  });

  it('propagates errors (callers fail closed)', async () => {
    await expect(listAll(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });
});

describe('runPool', () => {
  it('never runs more than `limit` tasks at once and runs every item', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool(3, Array.from({ length: 10 }, (_, i) => i), async (i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      seen.push(i);
      active--;
    });
    expect(peak).toBe(3);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('attempts every item even when some fail, then rethrows the first failure', async () => {
    const done: number[] = [];
    await expect(
      runPool(2, [1, 2, 3, 4, 5], async (i) => {
        if (i === 2) throw new Error('two failed');
        if (i === 4) throw new Error('four failed');
        done.push(i);
      }),
    ).rejects.toThrow('two failed');
    expect(done.sort()).toEqual([1, 3, 5]);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    const fn = vi.fn(async () => {});
    await runPool(5, [], fn);
    expect(fn).not.toHaveBeenCalled();
    await runPool(50, [1, 2], fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
