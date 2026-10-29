import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import type { ActiveDrag, PointerStore } from '../../../hooks/usePointerDrag';
import { dropMarker, dropSlotAt, isOverStage } from '../../../rigDrag';
import { GEO } from '../../../rigRouting';
import type { PlacedNode, RigLayout } from '../../../rigRouting';

/** Thickness of the line that shows where a dragged card will land. */
const MARKER_H = 4;

interface CardDragOverlayProps {
  layout: RigLayout;
  node: PlacedNode;
  drag: ActiveDrag<string>;
  pointer: PointerStore;
}

/** The ghost under the pointer, the drop line and the dashed empty columns. Re-renders on every move; nothing else does. */
export function CardDragOverlay({ layout, node, drag, pointer }: CardDragOverlayProps) {
  const at = useSyncExternalStore(pointer.subscribe, pointer.get);
  const over = isOverStage(layout, at.x, at.y);
  const marker = dropMarker(layout, node.id, dropSlotAt(layout, node.id, at.x, at.y));
  // Keep the ghost inside the stage so it never adds scroll room below the diagram.
  const top = Math.min(layout.height - GEO.headerH, Math.max(0, at.y - drag.offsetY));
  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden="true">
      {layout.colXs.map((x, c) =>
        layout.nodes.some((n) => n.col === c && n.id !== node.id) ? null : (
          <div
            key={c}
            className="absolute rounded-xl border-2 border-dashed border-border"
            style={{ left: x, top: layout.colTops[c], width: GEO.cardW, height: GEO.headerH }}
          />
        ),
      )}
      {over && <div className="absolute rounded-full bg-primary" style={{ left: marker.x, top: marker.y - MARKER_H / 2, width: marker.w, height: MARKER_H }} />}
      <div
        className={cn(
          'absolute left-0 top-0 flex flex-col justify-center overflow-hidden rounded-xl border bg-surface/90 px-3 shadow-xl shadow-black/50',
          over ? 'border-primary' : 'border-border opacity-60',
        )}
        style={{ width: GEO.cardW, height: GEO.headerH, transform: `translate3d(${at.x - drag.offsetX}px, ${top}px, 0)` }}
      >
        <span className="truncate text-sm font-bold text-foreground">{node.gear.name}</span>
        <span className="truncate text-[11px] text-surface-muted-foreground">{node.gear.kind}</span>
      </div>
    </div>
  );
}
