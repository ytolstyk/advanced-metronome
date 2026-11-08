import { describe, expect, it, vi } from 'vitest';
import { IDLE_PROGRESS, createProgressStore, formatClock, usableDuration } from './playerProgress';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [7.9, '0:07'],
    [65, '1:05'],
    [599, '9:59'],
    [3600, '1:00:00'],
    [3723, '1:02:03'],
    [-5, '0:00'],
    [NaN, '0:00'],
    [Infinity, '0:00'],
  ])('%s -> %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected);
  });
});

describe('usableDuration', () => {
  it('accepts only a finite positive length', () => {
    expect(usableDuration(245.3)).toBe(245.3);
    expect(usableDuration(NaN)).toBeNull();
    expect(usableDuration(Infinity)).toBeNull();
    expect(usableDuration(0)).toBeNull();
  });
});

describe('createProgressStore', () => {
  it('starts idle', () => {
    expect(createProgressStore().getSnapshot()).toBe(IDLE_PROGRESS);
  });

  it('notifies on a change and keeps the snapshot stable when nothing changed', () => {
    const store = createProgressStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ currentTime: 1, duration: 10, paused: false });
    const snap = store.getSnapshot();
    store.set({ currentTime: 1, duration: 10, paused: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(snap);
  });

  it('stops notifying after unsubscribe and resets to idle', () => {
    const store = createProgressStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set({ currentTime: 3, duration: 10, paused: true });
    off();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual(IDLE_PROGRESS);
  });
});
