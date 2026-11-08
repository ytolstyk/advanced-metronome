/** Where a playing click track is: the segment, the bar within it, and the sub-tick that just clicked. */
export interface PlaybackPosition {
  pieceIndex: number;
  rep: number;
  /** Sub-tick within the bar; -1 before the first click has sounded. */
  subTick: number;
}

import { createStore, type ExternalStore } from './externalStore';

/**
 * A tiny external store for the playing position. The click fires many times a second, and putting it in
 * React state of the set list page would re-render every song row per click; with a store only the
 * runway (via `useSyncExternalStore`) re-renders.
 */
export type PositionStore = ExternalStore<PlaybackPosition>;

export function createPositionStore(initial: PlaybackPosition = { pieceIndex: 0, rep: 0, subTick: -1 }): PositionStore {
  return createStore(
    initial,
    (a, b) => a.pieceIndex === b.pieceIndex && a.rep === b.rep && a.subTick === b.subTick,
  );
}
