import { useSyncExternalStore } from 'react';
import type { PointerStore } from '../../../hooks/usePointerDrag';
import { dropTargetAt, releaseRemoves } from '../../../rigDrag';
import type { RigLayout } from '../../../rigRouting';
import { RIG_PALETTE } from '../../../rigUtils';

/** Same widths as a cable on the diagram: the loose end reads as the cable itself. */
const CASING_W = 7;
const CABLE_W = 3.5;
const LOOSE_END_R = 8;
const HINT_OFFSET = { x: 14, y: 10 } as const;

interface WireDragOverlayProps {
  layout: RigLayout;
  /** The end that stays plugged in, in stage pixels. */
  anchor: { x: number; y: number };
  color: string;
  pointer: PointerStore;
  /** Whether letting go at a point removes the cable (what a release would really do); by default, being on empty canvas. */
  wouldRemove?: (at: { x: number; y: number }) => boolean;
}

/**
 * The loose end of a cable being dragged: a line from the plug that stays put to the pointer. Red with a
 * hint when letting go here would remove the cable (empty canvas), grey over a card's non-port parts.
 * Re-renders on every move; nothing else does.
 */
export function WireDragOverlay({ layout, anchor, color, pointer, wouldRemove }: WireDragOverlayProps) {
  const at = useSyncExternalStore(pointer.subscribe, pointer.get);
  const removes = wouldRemove ? wouldRemove(at) : releaseRemoves(layout, at.x, at.y);
  const overCard = dropTargetAt(layout, at.x, at.y).kind === 'card';
  const stroke = removes ? RIG_PALETTE.remove : overCard ? RIG_PALETTE.muted : color;
  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden="true">
      <svg width={layout.width} height={layout.height} className="absolute inset-0">
        <line x1={anchor.x} y1={anchor.y} x2={at.x} y2={at.y} stroke={RIG_PALETTE.casing} strokeWidth={CASING_W} strokeLinecap="round" />
        <line x1={anchor.x} y1={anchor.y} x2={at.x} y2={at.y} stroke={stroke} strokeWidth={CABLE_W} strokeLinecap="round" strokeDasharray="2 7" />
        <circle cx={at.x} cy={at.y} r={LOOSE_END_R} fill={stroke} stroke={RIG_PALETTE.casing} strokeWidth={2} />
      </svg>
      {removes && (
        <span
          className="absolute whitespace-nowrap rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow"
          style={{ left: at.x + HINT_OFFSET.x, top: at.y + HINT_OFFSET.y, border: `1px solid ${RIG_PALETTE.remove}` }}
        >
          Release to remove the cable
        </span>
      )}
    </div>
  );
}
