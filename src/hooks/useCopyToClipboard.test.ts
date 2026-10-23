import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCopyToClipboard } from './useCopyToClipboard';

afterEach(() => {
  vi.useRealTimers();
});

class FakeClipboardItem {
  items: Record<string, Promise<Blob>>;
  constructor(items: Record<string, Promise<Blob>>) {
    this.items = items;
  }
}

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

  describe('with a promise for the text', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('waits for the text, then writes it, where ClipboardItem is unavailable', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      const { result } = renderHook(() => useCopyToClipboard());
      let ok = false;
      await act(async () => { ok = await result.current[1](Promise.resolve('later')); });
      expect(ok).toBe(true);
      expect(writeText).toHaveBeenCalledWith('later');
    });

    it('hands the promise to the clipboard up front (so Safari keeps the click permission)', async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      const writeText = vi.fn();
      Object.assign(navigator, { clipboard: { write, writeText } });
      vi.stubGlobal('ClipboardItem', FakeClipboardItem);
      const { result } = renderHook(() => useCopyToClipboard());
      let resolveText: (t: string) => void = () => {};
      const pending = new Promise<string>((r) => { resolveText = r; });
      let done: Promise<boolean> = Promise.resolve(false);
      act(() => { done = result.current[1](pending); });
      expect(write).toHaveBeenCalledTimes(1); // written before the text exists
      resolveText('soon');
      await act(async () => { expect(await done).toBe(true); });
      const item = write.mock.calls[0][0][0] as { items: Record<string, Promise<Blob>> };
      expect(await (await item.items['text/plain']).text()).toBe('soon');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('rethrows when the text itself fails (not reported as a browser refusal), on either path', async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
      const { result } = renderHook(() => useCopyToClipboard());
      await act(async () => {
        await expect(result.current[1](Promise.reject(new Error('no text')))).rejects.toThrow('no text');
      });

      const write = vi.fn(async ([item]: [{ items: Record<string, Promise<Blob>> }]) => void (await item.items['text/plain']));
      Object.assign(navigator, { clipboard: { write } });
      vi.stubGlobal('ClipboardItem', FakeClipboardItem);
      await act(async () => {
        await expect(result.current[1](Promise.reject(new Error('no text 2')))).rejects.toThrow('no text 2');
      });
    });

    it('still reports false when the browser refuses a good promise', async () => {
      Object.assign(navigator, { clipboard: { write: vi.fn().mockRejectedValue(new Error('denied')) } });
      vi.stubGlobal('ClipboardItem', FakeClipboardItem);
      const { result } = renderHook(() => useCopyToClipboard());
      let ok = true;
      await act(async () => { ok = await result.current[1](Promise.resolve('x')); });
      expect(ok).toBe(false);
    });
  });
});
