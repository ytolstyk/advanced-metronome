/** Where a playing click track is: the segment, the bar within it, and the sub-tick that just clicked. */
export interface PlaybackPosition {
  pieceIndex: number;
  rep: number;
  /** Sub-tick within the bar; -1 before the first click has sounded. */
  subTick: number;
}

/**
 * A tiny external store for the playing position. The click fires many times a second, and putting it in
 * React state of the set list page would re-render every song row per click; with a store only the
 * runway (via `useSyncExternalStore`) re-renders.
 */
export interface PositionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PlaybackPosition;
  set: (next: PlaybackPosition) => void;
}

export function createPositionStore(initial: PlaybackPosition = { pieceIndex: 0, rep: 0, subTick: -1 }): PositionStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => current,
    set(next) {
      if (next.pieceIndex === current.pieceIndex && next.rep === current.rep && next.subTick === current.subTick) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
