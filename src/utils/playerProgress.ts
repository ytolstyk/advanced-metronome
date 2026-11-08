import { createStore, type ExternalStore, type ReadableStore } from './externalStore';

/** Where the playing backing track is. `duration` is null until the browser knows it (or never, for a stream that reports none). */
export interface PlayerProgress {
  currentTime: number;
  duration: number | null;
  paused: boolean;
}

export const IDLE_PROGRESS: Readonly<PlayerProgress> = { currentTime: 0, duration: null, paused: false };

/** What the player bar may do with the store: read it. Only the hook writes. */
export type ReadableProgress = ReadableStore<PlayerProgress>;

export interface ProgressStore extends ExternalStore<PlayerProgress> {
  /** Changes some fields, keeping the rest. */
  patch: (partial: Partial<PlayerProgress>) => void;
  reset: () => void;
}

/**
 * The playing position as an external store: `timeupdate` fires several times a second, and putting it in
 * React state of the set list page would re-render every song row each time. With a store only the player bar
 * (via `useSyncExternalStore`) re-renders. Every field is compared in `equals`: add new ones there.
 */
export function createProgressStore(): ProgressStore {
  const store = createStore<PlayerProgress>(
    IDLE_PROGRESS,
    (a, b) => a.currentTime === b.currentTime && a.duration === b.duration && a.paused === b.paused,
  );
  return {
    ...store,
    patch: (partial) => store.set({ ...store.getSnapshot(), ...partial }),
    reset: () => store.set(IDLE_PROGRESS),
  };
}

/** `HTMLMediaElement.duration` is NaN before metadata and Infinity for some streams: only a real length counts. */
export function usableDuration(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/** "3:07", or "1:02:09" from an hour up. Anything not a finite, non-negative number reads as "0:00". */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
