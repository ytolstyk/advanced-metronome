import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

/** How far the pointer must travel before a press counts as a drag (so a plain click still selects). */
const DRAG_THRESHOLD_PX = 5;

/** Touch and pen only start a drag from an element carrying this attribute, so the rest of a card still scrolls. */
export const DRAG_GRIP_ATTRIBUTE = 'data-drag-grip';
const DRAG_GRIP_SELECTOR = `[${DRAG_GRIP_ATTRIBUTE}]`;

export interface Point {
  x: number;
  y: number;
}

/** What the render needs to know about a drag in progress; it changes only when a drag starts or ends. */
export interface ActiveDrag {
  nodeId: string;
  /** Where inside the card it was grabbed, so the ghost doesn't jump. */
  offsetX: number;
  offsetY: number;
}

/** The pointer position (in stage pixels) as an external store, so moving it re-renders only what reads it. */
export interface PointerStore {
  get: () => Point;
  subscribe: (listener: () => void) => () => void;
}

function createPointerStore(): PointerStore & { set: (point: Point) => void } {
  let point: Point = { x: 0, y: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => point,
    set: (next) => {
      point = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface UseCardDragArgs {
  /** The element whose top-left corner is (0, 0) of the positions used by the layout. */
  stageRef: RefObject<HTMLElement | null>;
  /** The pointer was released after a drag, at `at` in stage pixels. */
  onDrop: (nodeId: string, at: Point) => void;
}

/**
 * Pointer-based dragging of a card (mouse, pen and touch; no drag-and-drop library, which would
 * not work on touch). A press only becomes a drag after it travels a few pixels, and until then
 * nothing re-renders. While one is down it listens on the window (leaving the card is fine); Esc,
 * a lost button, a lost window or a lost pointer cancel it. A drag also swallows the click that
 * follows its release, so ending a drag over a card doesn't select it.
 */
export function useCardDrag({ stageRef, onDrop }: UseCardDragArgs) {
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const [pointer] = useState(createPointerStore);
  /** Aborting this removes every listener of the press in progress. */
  const press = useRef<AbortController | null>(null);
  const setCursor = useRef(false);
  const suppressClick = useRef(false);
  const dropRef = useRef(onDrop);
  useLayoutEffect(() => {
    dropRef.current = onDrop;
  });

  const cancel = useCallback(() => {
    press.current?.abort();
    press.current = null;
    if (setCursor.current) document.body.style.removeProperty('cursor');
    setCursor.current = false;
    setDrag(null);
  }, []);
  useEffect(() => cancel, [cancel]);

  const stagePoint = useCallback(
    (e: { clientX: number; clientY: number }): Point | null => {
      const rect = stageRef.current?.getBoundingClientRect();
      return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
    },
    [stageRef],
  );

  const begin = useCallback(
    (e: ReactPointerEvent<HTMLElement>, node: { id: string; x: number; y: number }) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const fromGrip = (e.target as Element).closest(DRAG_GRIP_SELECTOR) !== null;
      // A ctrl+click is a context menu on macOS: its release never arrives.
      if (e.pointerType === 'mouse' ? e.ctrlKey : !fromGrip) return;
      const start = stagePoint(e);
      if (!start) return;

      press.current?.abort();
      const controller = new AbortController();
      press.current = controller;
      const { signal } = controller;
      const { pointerId } = e;
      const origin = { x: e.clientX, y: e.clientY };
      const offsetX = start.x - node.x;
      const offsetY = start.y - node.y;
      let active = false;
      let at = start;

      const end = () => {
        if (press.current === controller) cancel();
      };
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (ev.pointerType === 'mouse' && ev.buttons === 0) return end(); // the release was missed
        const point = stagePoint(ev);
        if (!point) return;
        at = point;
        if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) > DRAG_THRESHOLD_PX) {
          active = true;
          pointer.set(point);
          document.body.style.cursor = 'grabbing';
          setCursor.current = true;
          setDrag({ nodeId: node.id, offsetX, offsetY });
        } else if (active) {
          pointer.set(point);
        }
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dropAt = stagePoint(ev) ?? at;
        end();
        if (!active) return;
        swallowNextClick(suppressClick);
        dropRef.current(node.id, dropAt);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) end();
      };
      // The button is still down: its release will click whatever is under it.
      const abort = () => {
        end();
        if (active) swallowClickAfterRelease(suppressClick);
      };
      const onEscape = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') abort();
      };

      window.addEventListener('pointermove', onMove, { signal });
      window.addEventListener('pointerup', onUp, { signal });
      window.addEventListener('pointercancel', onCancel, { signal });
      window.addEventListener('keydown', onEscape, { signal });
      window.addEventListener('blur', abort, { signal });
      document.addEventListener('visibilitychange', abort, { signal });
      window.addEventListener('contextmenu', abort, { signal });
      // Dragging across other text must not select it.
      window.addEventListener('selectstart', (ev) => ev.preventDefault(), { signal });
    },
    [cancel, pointer, stagePoint],
  );

  /** True once, right after a drag ended: the click that follows the release must not select the card. */
  const takeSuppressedClick = useCallback(() => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  }, []);

  return { drag, pointer: pointer as PointerStore, begin, cancel, takeSuppressedClick };
}

/** The click event follows pointerup in the same task, so a zero timeout clears the flag right after it. */
function swallowNextClick(flag: RefObject<boolean>): void {
  flag.current = true;
  setTimeout(() => {
    flag.current = false;
  }, 0);
}

function swallowClickAfterRelease(flag: RefObject<boolean>): void {
  const controller = new AbortController();
  const { signal } = controller;
  window.addEventListener('pointerup', () => {
    swallowNextClick(flag);
    controller.abort();
  }, { signal });
  window.addEventListener('pointercancel', () => controller.abort(), { signal });
}
