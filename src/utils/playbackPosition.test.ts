import { describe, expect, it, vi } from 'vitest';
import { createPositionStore } from './playbackPosition';

describe('createPositionStore', () => {
  it('starts before the first click by default', () => {
    expect(createPositionStore().getSnapshot()).toEqual({ pieceIndex: 0, rep: 0, subTick: -1 });
  });

  it('starts from a given position', () => {
    const initial = { pieceIndex: 2, rep: 3, subTick: 1 };
    expect(createPositionStore(initial).getSnapshot()).toBe(initial);
  });

  it('notifies subscribers and updates the snapshot when the position changes', () => {
    const store = createPositionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ pieceIndex: 0, rep: 0, subTick: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ pieceIndex: 0, rep: 0, subTick: 0 });
  });

  it('notifies when only one field changes', () => {
    const store = createPositionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ pieceIndex: 1, rep: 0, subTick: -1 });
    store.set({ pieceIndex: 1, rep: 1, subTick: -1 });
    store.set({ pieceIndex: 1, rep: 1, subTick: 2 });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not notify nor replace the snapshot for an equal position (a new object with the same values)', () => {
    const store = createPositionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.set({ pieceIndex: 0, rep: 0, subTick: -1 });
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(before);
  });

  it('keeps a stable snapshot reference between changes (required by useSyncExternalStore)', () => {
    const store = createPositionStore();
    store.set({ pieceIndex: 0, rep: 1, subTick: 0 });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('stops notifying a listener after it unsubscribes, and leaves the others alone', () => {
    const store = createPositionStore();
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = store.subscribe(a);
    store.subscribe(b);
    unsubscribeA();
    store.set({ pieceIndex: 0, rep: 0, subTick: 0 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('tolerates unsubscribing twice', () => {
    const store = createPositionStore();
    const unsubscribe = store.subscribe(vi.fn());
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('notifies every listener even when one unsubscribes itself during the notification', () => {
    const store = createPositionStore();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);
    store.set({ pieceIndex: 0, rep: 0, subTick: 0 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('lets a listener read the new snapshot', () => {
    const store = createPositionStore();
    let seen = -2;
    store.subscribe(() => {
      seen = store.getSnapshot().subTick;
    });
    store.set({ pieceIndex: 0, rep: 0, subTick: 5 });
    expect(seen).toBe(5);
  });
});
