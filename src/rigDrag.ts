// Where a dragged card lands. Pure geometry on a computed layout: no DOM, no React.

import { GEO } from './rigRouting';
import type { RigLayout } from './rigRouting';
import type { RigPortRef } from './rigTypes';

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

/** What a dragged wire end is over when released. */
export type WireDropTarget = { kind: 'port'; ref: RigPortRef } | { kind: 'card' } | { kind: 'empty' };

/** How far beside a card's edge still counts as on it: the whole grab area of a pin, plus a little. */
const PIN_REACH_PX = GEO.plugHit / 2 + 2;

/** The port row, the rest of a card, or empty canvas under (x, y). Rows are found from the pins the cables are routed to. */
export function dropTargetAt(layout: RigLayout, x: number, y: number): WireDropTarget {
  for (const n of layout.nodes) {
    if (x < n.x - PIN_REACH_PX || x > n.x + n.w + PIN_REACH_PX || y < n.y || y > n.y + n.h) continue;
    const pin = layout.ports.find((p) => p.nodeId === n.id && Math.abs(p.y - y) <= GEO.rowH / 2);
    return pin ? { kind: 'port', ref: { n: n.id, p: pin.portId } } : { kind: 'card' };
  }
  return { kind: 'empty' };
}

/** Whether (x, y) is on the diagram itself, with no margin. */
export const isWithinStage = (layout: RigLayout, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x <= layout.width && y <= layout.height;

/** Whether letting a wire end go at (x, y) removes its cable: only on empty canvas on the diagram. */
export const releaseRemoves = (layout: RigLayout, x: number, y: number): boolean =>
  isWithinStage(layout, x, y) && dropTargetAt(layout, x, y).kind === 'empty';
