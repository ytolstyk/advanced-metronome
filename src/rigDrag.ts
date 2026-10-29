// Where a dragged card lands. Pure geometry on a computed layout: no DOM, no React.

import { GEO } from './rigRouting';
import type { RigLayout } from './rigRouting';

export interface DropSlot {
  col: number;
  /** Position among the column's other cards (0 = top). */
  index: number;
}

/** The insertion line drawn while dragging, in diagram pixels. */
export interface DropMarker {
  x: number;
  y: number;
  w: number;
}

/** How far past the diagram's edge a release still counts as a drop on it. */
const DROP_MARGIN_PX = 48;

/** Columns to lay out while dragging: the used ones plus one empty column on the right to drop into. */
export const columnsWhileDragging = (nodes: readonly { col: number }[]): number => Math.max(0, ...nodes.map((n) => n.col)) + 2;

/** Whether a release at (x, y) is on (or just beside) the diagram; anywhere else cancels the drag. */
export const isOverStage = (layout: RigLayout, x: number, y: number): boolean =>
  x >= -DROP_MARGIN_PX && y >= -DROP_MARGIN_PX && x <= layout.width + DROP_MARGIN_PX && y <= layout.height + DROP_MARGIN_PX;

/** The slot a card dragged to (x, y) would take: nearest column, then below every card whose middle is above y. */
export function dropSlotAt(layout: RigLayout, draggedId: string, x: number, y: number): DropSlot {
  let col = 0;
  let best = Infinity;
  for (let c = 0; c < layout.cols; c++) {
    const dist = Math.abs(x - (layout.colXs[c] + GEO.cardW / 2));
    if (dist < best) {
      best = dist;
      col = c;
    }
  }
  const index = layout.nodes.filter((n) => n.col === col && n.id !== draggedId && n.y + n.h / 2 < y).length;
  return { col, index };
}

/**
 * The line that shows where `slot` is: in the gap above the card that would follow it, or under the
 * last card. Relies on `layout.nodes` being top to bottom within a column (it stacks in array order).
 */
export function dropMarker(layout: RigLayout, draggedId: string, slot: DropSlot): DropMarker {
  const others = layout.nodes.filter((n) => n.col === slot.col && n.id !== draggedId);
  const x = layout.colXs[slot.col];
  const next = others[slot.index];
  if (next) return { x, y: next.y - GEO.cardGap / 2, w: GEO.cardW };
  const prev = others[slot.index - 1];
  if (prev) return { x, y: prev.y + prev.h + GEO.cardGap / 2, w: GEO.cardW };
  return { x, y: layout.colTops[slot.col], w: GEO.cardW };
}
