import type { TrackPiece } from '../audio/ClickTrackEngine';
import { getBpmAtRepetition } from '../audio/clickMath';
import type { SegmentGroup } from '../clickTrackTypes';
import type { PositionStore } from './playbackPosition';

/** How many bars show on the runway: the one before, the current one, and the next two. */
export const RUNWAY_BARS_BEFORE = 1;
export const RUNWAY_BARS_AFTER = 2;
/** Bars mounted before the current one: the visible one plus one waiting off-screen, so the bar that leaves still slides. */
export const RUNWAY_MOUNTED_BEFORE = RUNWAY_BARS_BEFORE + 1;
/** The CSS sizes each bar as a fraction of this (`--runway-bars`), so changing the two constants above keeps the layout right. */
export const RUNWAY_VISIBLE_BARS = RUNWAY_BARS_BEFORE + 1 + RUNWAY_BARS_AFTER;

/** One bar of the track, flattened out of its segment's repeats. */
export interface RunwayBar {
  /** Position in the whole track (0-based); the stable React key, so a bar slides instead of remounting. */
  flat: number;
  pieceIndex: number;
  rep: number;
}

/** Index of each segment's first bar in the flattened track, plus the total, for O(log n) lookups. */
export interface BarIndex {
  starts: number[];
  total: number;
}

export function buildBarIndex(pieces: readonly TrackPiece[]): BarIndex {
  const starts: number[] = [];
  let total = 0;
  for (const piece of pieces) {
    starts.push(total);
    total += Math.max(0, piece.repeats);
  }
  return { starts, total };
}

export function flatIndexOf(index: BarIndex, pieceIndex: number, rep: number): number {
  return (index.starts[pieceIndex] ?? 0) + rep;
}

/** The bar at a flat position, or null when it is outside the track. */
export function locateBar(index: BarIndex, flat: number): RunwayBar | null {
  if (flat < 0 || flat >= index.total) return null;
  let lo = 0;
  let hi = index.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index.starts[mid] <= flat) lo = mid;
    else hi = mid - 1;
  }
  return { flat, pieceIndex: lo, rep: flat - index.starts[lo] };
}

/**
 * The bars to mount around the current one. It reaches one bar further on each side than what is
 * visible, so the bar that leaves and the bar that arrives are already in the DOM and slide with the rest.
 */
export function runwayWindow(index: BarIndex, currentFlat: number): RunwayBar[] {
  const bars: RunwayBar[] = [];
  for (let flat = currentFlat - RUNWAY_MOUNTED_BEFORE; flat <= currentFlat + RUNWAY_BARS_AFTER + 1; flat++) {
    const bar = locateBar(index, flat);
    if (bar) bars.push(bar);
  }
  return bars;
}

/** What the runway header says about the current bar. */
export interface RunwayHeading {
  bpm: number;
  /** The group's name, or '' when the segment is in no group. */
  group: string;
  /** The segment's own label, or ''. */
  section: string;
}

/** A grouped segment is drawn in its group's color, like on the click track page; otherwise its own. */
export function effectiveColor(piece: TrackPiece, groups: readonly SegmentGroup[]): string {
  return groupOf(piece, groups)?.color ?? piece.color;
}

function groupOf(piece: TrackPiece, groups: readonly SegmentGroup[]): SegmentGroup | undefined {
  return piece.groupId === null ? undefined : groups.find((g) => g.id === piece.groupId);
}

/** Seconds one bar of this segment lasts at a repetition (tempo ramps change it); used to cap the slide animation. */
export function barSeconds(piece: TrackPiece, rep: number): number {
  return piece.timeSignature.numerator * (60 / getBpmAtRepetition(piece, rep)) * (4 / piece.timeSignature.denominator);
}

export function runwayHeading(piece: TrackPiece, rep: number, groups: readonly SegmentGroup[]): RunwayHeading {
  const group = groupOf(piece, groups);
  return {
    bpm: Math.round(getBpmAtRepetition(piece, rep)),
    group: group?.name ?? '',
    section: piece.label,
  };
}

/** The count-in card that leads the track when the run started with the countdown on. */
export interface RunwayCountIn {
  /** The number being counted (3, 2, 1), or null once the first bar has begun. */
  beat: number | null;
}

/** What a song row needs to draw the runway for the track that is playing. */
export interface RunwayControls {
  pieces: TrackPiece[];
  groups: SegmentGroup[];
  position: PositionStore;
  /** Present when this run began with a countdown: a card before bar 1 that shows the number. */
  countIn?: RunwayCountIn;
}

/** The slot the runway treats as "current": the count-in card sits just before bar 1, as a virtual bar -1. */
export const COUNT_IN_FLAT = -1;

/** The flat position the row is anchored on: the count-in card while counting, else the bar playing now. */
export function anchorFlat(currentFlat: number, counting: boolean): number {
  return counting ? COUNT_IN_FLAT : currentFlat;
}

/**
 * Where the count-in card sits relative to the anchor, or null once it has slid out of the mounted range.
 * It is the anchor itself while counting, then drifts left as the bars play (one bar further each bar).
 */
export function countInOffset(currentFlat: number, counting: boolean): number | null {
  const offset = COUNT_IN_FLAT - anchorFlat(currentFlat, counting);
  return offset >= -RUNWAY_MOUNTED_BEFORE ? offset : null;
}
