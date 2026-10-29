import { useEffect } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { usePointerDrag } from '../../../hooks/usePointerDrag';
import type { Point } from '../../../hooks/usePointerDrag';
import { dropTargetAt, releaseRemoves } from '../../../rigDrag';
import type { RigLayout } from '../../../rigRouting';
import { portKey } from '../../../rigEdit';
import type { PortRef } from '../../../rigEdit';
import type { RigDiagram } from '../../../rigTypes';

/** Letting go this close to where the wire was picked up counts as not having moved it at all. */
const JITTER_PX = 24;

interface Wire {
  cableId: string;
  /** The end that was picked up. */
  grabbed: PortRef;
}

/** A wire end being dragged: which cable, the end that stays plugged in, and where it is anchored. */
export interface ActiveWire {
  cableId: string;
  /** The end that was picked up. */
  grabbed: PortRef;
  fixed: PortRef;
}

interface UseWireDragArgs {
  stageRef: RefObject<HTMLElement | null>;
  layoutRef: RefObject<RigLayout | null>;
  diagram: RigDiagram;
  enabled: boolean;
  /** The picked-up end was let go on a port. */
  onReconnect: (cableId: string, grabbed: PortRef, target: PortRef) => void;
  /** It was let go on empty canvas on the diagram: the cable is dropped. */
  onRemove: (cableId: string) => void;
}

/**
 * Dragging the plug at the end of a connected cable: onto another port to move it, onto empty
 * canvas to remove it. Anything else (a card's body, away from the diagram, outside the visible
 * box, back near where it was picked up, Esc) cancels. Only one end moves; the other is `fixed`.
 */
export function useWireDrag({ stageRef, layoutRef, diagram, enabled, onReconnect, onRemove }: UseWireDragArgs) {
  const pointerDrag = usePointerDrag<Wire>({
    stageRef,
    onDrop: ({ cableId, grabbed }, at) => {
      const layout = layoutRef.current;
      if (!enabled || !layout) return;
      const target = dropTargetAt(layout, at.x, at.y);
      if (target.kind === 'port') return onReconnect(cableId, grabbed, target.ref);
      if (wireWouldRemove(layout, stageRef.current, grabbed, at)) onRemove(cableId);
    },
  });
  const { drag, cancel } = pointerDrag;
  const cable = enabled && drag ? diagram.cables.find((c) => c.id === drag.payload.cableId) : undefined;
  // The drag ended up disabled, or its cable was removed or edited elsewhere: nothing left to drop.
  const stale = drag !== null && (!enabled || !cable || ![portKey(cable.from), portKey(cable.to)].includes(portKey(drag.payload.grabbed)));
  useEffect(() => {
    if (stale) cancel();
  }, [stale, cancel]);

  const active: ActiveWire | null =
    drag && cable && !stale ? { cableId: cable.id, grabbed: drag.payload.grabbed, fixed: portKey(drag.payload.grabbed) === portKey(cable.from) ? cable.to : cable.from } : null;

  /** Press on the plug of `port` (a connected port of `cableId`). */
  const begin = (e: ReactPointerEvent<HTMLElement>, cableId: string, grabbed: PortRef, pin: Point) =>
    pointerDrag.begin(e, { payload: { cableId, grabbed }, x: pin.x, y: pin.y });

  return { active, begin, pointer: pointerDrag.pointer, takeSuppressedClick: pointerDrag.takeSuppressedClick };
}

/**
 * Whether letting the picked-up end go at `at` (stage pixels) removes its cable: on empty canvas on the
 * diagram itself, with the pointer actually over the diagram (not under the nav, a dialog or off the
 * box it scrolls in), and not so close to where the end was picked up that it was only a wobble.
 * The drop and the "release to remove" hint both ask this, so they can't disagree.
 */
export function wireWouldRemove(layout: RigLayout, stage: HTMLElement | null, grabbed: PortRef, at: Point): boolean {
  return releaseRemoves(layout, at.x, at.y) && isOverDiagram(stage, at) && !nearPickup(layout, grabbed, at);
}

/** Whether the pointer at `at` is over the diagram: what is under it is part of the stage, else (no hit-testing) inside its scroll box. */
function isOverDiagram(stage: HTMLElement | null, at: Point): boolean {
  const origin = stage?.getBoundingClientRect();
  if (!stage || !origin) return false;
  const x = origin.left + at.x;
  const y = origin.top + at.y;
  const hit = document.elementFromPoint?.(x, y);
  if (hit !== undefined) return hit !== null && stage.contains(hit);
  // jsdom has no hit-testing: fall back to the box the diagram scrolls in.
  const box = stage.closest('[role="group"]')?.getBoundingClientRect();
  return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function nearPickup(layout: RigLayout, grabbed: PortRef, at: Point): boolean {
  const pin = layout.ports.find((p) => p.nodeId === grabbed.n && p.portId === grabbed.p);
  return pin !== undefined && Math.hypot(at.x - pin.x, at.y - pin.y) < JITTER_PX;
}
