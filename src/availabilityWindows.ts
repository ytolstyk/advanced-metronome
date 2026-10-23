import { AVAILABILITY_LIMITS, type BestWindow, type MissingReason } from './bandTypes';
import { intersect, popcount, type Overlap } from './availabilityUtils';

/**
 * "Best times": the stretches where the most members are free together. Only free marks count, so
 * a window never claims someone is free who didn't say so.
 */

/** Shortest window "Best times" offers, in half-hour slots: 1, 2 or 3 hours. `defaultMinSlots` must be one of these. */
export const MIN_LENGTH_CHOICES = [
  { slots: 2, label: '1 hour' },
  { slots: 4, label: '2 hours' },
  { slots: 6, label: '3 hours' },
] as const;

/** A group of one is just someone's own calendar, not an overlap. */
const MIN_GROUP_SIZE = 2;
const DEFAULT_WINDOW_LIMIT = 3;

/** A run of slots, with offsets relative to the first slot scanned (not absolute slots). */
interface RawWindow {
  startOffset: number;
  endOffset: number;
  /** Members free for every slot of the run (opaque; see `Overlap.membersIn`). */
  mask: number;
}

const lengthOf = (w: RawWindow): number => w.endOffset - w.startOffset;

/**
 * `outer` covers `inner` when it spans all of `inner`'s time with all of its members, so `inner`
 * adds nothing. A run's mask is the members free for every slot of it, so a run that spans more
 * time can only have the same members or fewer: for runs from `scanRuns`, covering needs EQUAL
 * masks. The callers below therefore look windows up by mask, and only the time span is compared.
 */
const spans = (outer: RawWindow, inner: RawWindow): boolean =>
  outer.startOffset <= inner.startOffset && outer.endOffset >= inner.endOffset;

const compareWindows = (a: RawWindow, b: RawWindow): number =>
  popcount(b.mask) - popcount(a.mask) || lengthOf(b) - lengthOf(a) || a.startOffset - b.startOffset;

/** From each start, the longest run where at least `size` members stay free throughout. */
function scanRuns(slotMasks: number[], size: number, minSlots: number): RawWindow[] {
  const found: RawWindow[] = [];
  for (let start = 0; start < slotMasks.length; start++) {
    if (popcount(slotMasks[start]) < size) continue;
    let mask = slotMasks[start];
    let end = start + 1;
    for (; end < slotMasks.length; end++) {
      const next = intersect(mask, slotMasks[end]);
      // An unchanged intersection still has at least `size` members, so only a change needs the
      // (relatively slow) bit count. This keeps a fully open calendar at a few milliseconds.
      if (next !== mask && popcount(next) < size) break;
      mask = next;
    }
    if (end - start >= minSlots) found.push({ startOffset: start, endOffset: end, mask });
  }
  return found;
}

/** Drop runs inside an earlier run with the same members. `scanRuns` emits runs in start order. */
function dropCovered(windows: RawWindow[]): RawWindow[] {
  const furthestEnd = new Map<number, number>();
  return windows.filter((w) => {
    if ((furthestEnd.get(w.mask) ?? -1) >= w.endOffset) return false;
    furthestEnd.set(w.mask, w.endOffset);
    return true;
  });
}

/** Runs from `candidates` that no run in `covering` covers (looked up by mask, see `covers`). */
function dropCoveredBy(candidates: RawWindow[], covering: RawWindow[]): RawWindow[] {
  const byMask = new Map<number, RawWindow[]>();
  for (const w of covering) byMask.set(w.mask, [...(byMask.get(w.mask) ?? []), w]);
  return candidates.filter((w) => !byMask.get(w.mask)?.some((outer) => spans(outer, w)));
}

export interface BestWindowsOptions {
  fromSlot?: number;
  toSlot?: number;
  minSlots?: number;
  /** Most windows per tier. */
  limit?: number;
  /** Slots a window may use; others are treated as nobody being free (e.g. outside practice hours). */
  allowed?: ReadonlySet<number>;
}

export interface BestWindows {
  /** The largest group that shares at least `minSlots` in a row. */
  best: BestWindow[];
  /** One person fewer, but not already covered by a best window (e.g. longer stretches). */
  alsoClose: BestWindow[];
}

/**
 * Suggested practice windows over upcoming slots (never one that has started). Empty unless at
 * least two members overlap.
 */
export function findBestWindows(overlap: Overlap, options: BestWindowsOptions = {}): BestWindows {
  const { resolution } = overlap;
  const minSlots = options.minSlots ?? AVAILABILITY_LIMITS.defaultMinSlots;
  const limit = options.limit ?? DEFAULT_WINDOW_LIMIT;
  const from = Math.max(options.fromSlot ?? 0, resolution.nowSlot + 1);
  const to = Math.min(options.toSlot ?? resolution.horizonEndSlot, resolution.horizonEndSlot);
  const slotMasks: number[] = [];
  for (let slot = from; slot < to; slot++) slotMasks.push(options.allowed && !options.allowed.has(slot) ? 0 : overlap.maskAt(slot));

  const toWindow = (w: RawWindow): BestWindow => {
    const startSlot = from + w.startOffset;
    const endSlot = from + w.endOffset;
    const subs = overlap.membersIn(w.mask);
    return { startSlot, endSlot, subs, missing: missingFor(overlap, new Set(subs), startSlot, endSlot) };
  };

  // No run can be longer than the range, so a minimum beyond it can never be met at any size.
  if (minSlots > slotMasks.length) return { best: [], alsoClose: [] };
  for (let size = overlap.maxCount; size >= MIN_GROUP_SIZE; size--) {
    const primary = dropCovered(scanRuns(slotMasks, size, minSlots));
    if (primary.length === 0) continue;
    const close =
      size - 1 >= MIN_GROUP_SIZE
        ? dropCoveredBy(dropCovered(scanRuns(slotMasks, size - 1, minSlots)), primary)
        : [];
    return {
      best: primary.sort(compareWindows).slice(0, limit).map(toWindow),
      alsoClose: close.sort(compareWindows).slice(0, limit).map(toWindow),
    };
  }
  return { best: [], alsoClose: [] };
}

/** Everyone not free for the whole window, with why. */
function missingFor(
  overlap: Overlap,
  free: ReadonlySet<string>,
  startSlot: number,
  endSlot: number,
): BestWindow['missing'] {
  const missing: BestWindow['missing'] = [];
  for (const sub of overlap.resolution.participants) {
    if (free.has(sub)) continue;
    const status = overlap.resolution.statuses.get(sub);
    let reason: MissingReason = 'unreadable';
    if (status?.kind === 'not-responded') reason = 'not-responded';
    else if (status?.kind === 'available') {
      reason = startSlot < status.startSlot || endSlot > status.endSlot ? 'no-data' : 'not-marked';
    }
    missing.push({ sub, reason });
  }
  return missing;
}
