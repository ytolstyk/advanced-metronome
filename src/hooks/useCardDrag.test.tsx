import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { DRAG_GRIP_ATTRIBUTE, useCardDrag } from './useCardDrag';

/** The stage sits at (100, 200) on screen, so a mix-up between screen and stage coordinates shows. */
const ORIGIN = { x: 100, y: 200 };
const NODE = { id: 'node-a', x: 40, y: 60 };

function makeStage(): RefObject<HTMLElement | null> {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: ORIGIN.x, top: ORIGIN.y, x: ORIGIN.x, y: ORIGIN.y, width: 800, height: 600, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  return { current: el };
}

/** Screen-space pointer fields for a point at stage position (x, y). */
const at = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  clientX: x + ORIGIN.x, clientY: y + ORIGIN.y, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: 'mouse', ...extra,
});

/** The React pointerdown a card's header would hand to `begin`. */
function down(x: number, y: number, extra: Record<string, unknown> = {}, target: Element = document.createElement('div')) {
  return { ctrlKey: false, target, ...at(x, y, extra) } as unknown as ReactPointerEvent<HTMLElement>;
}

function setup(stage: RefObject<HTMLElement | null> = makeStage()) {
  const onDrop = vi.fn<(nodeId: string, at: { x: number; y: number }) => void>();
  const hook = renderHook((props: { onDrop: typeof onDrop }) => useCardDrag({ stageRef: stage, onDrop: props.onDrop }), {
    initialProps: { onDrop },
  });
  return { ...hook, onDrop, stage };
}

type Hook = ReturnType<typeof setup>;
const press = (h: Hook, x = 50, y = 70, extra: Record<string, unknown> = {}, target?: Element) =>
  act(() => h.result.current.begin(down(x, y, extra, target), NODE));
const move = (x: number, y: number, extra: Record<string, unknown> = {}) => act(() => void fireEvent.pointerMove(window, at(x, y, extra)));
const release = (x: number, y: number, extra: Record<string, unknown> = {}) =>
  act(() => void fireEvent.pointerUp(window, at(x, y, { buttons: 0, ...extra })));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.style.removeProperty('cursor');
});

describe('useCardDrag', () => {
  it('starts idle', () => {
    const h = setup();
    expect(h.result.current.drag).toBeNull();
    expect(h.result.current.takeSuppressedClick()).toBe(false);
    expect(h.result.current.pointer.get()).toEqual({ x: 0, y: 0 });
  });

  describe('starting', () => {
    it('is not a drag until the pointer travels past the threshold (exactly 5px is still a click)', () => {
      const h = setup();
      press(h, 50, 70);
      move(53, 74); // hypot(3, 4) = 5
      expect(h.result.current.drag).toBeNull();
      expect(document.body.style.cursor).toBe('');
      move(54, 74); // hypot(4, 4) > 5
      expect(h.result.current.drag).not.toBeNull();
    });

    it('records where inside the card it was grabbed, in stage coordinates', () => {
      const h = setup();
      press(h, 50, 70); // 10px right of and 10px below the card's corner at (40, 60)
      move(90, 120);
      expect(h.result.current.drag).toEqual({ nodeId: 'node-a', offsetX: 10, offsetY: 10 });
      expect(document.body.style.cursor).toBe('grabbing');
    });

    it('does nothing when the stage is not mounted', () => {
      const h = setup({ current: null });
      press(h);
      move(200, 200);
      release(200, 200);
      expect(h.result.current.drag).toBeNull();
      expect(h.onDrop).not.toHaveBeenCalled();
    });

    it('ignores the right button, ctrl+click, secondary pointers and a pen or touch outside the grip', () => {
      const h = setup();
      for (const extra of [{ button: 2 }, { ctrlKey: true }, { isPrimary: false }, { pointerType: 'pen' }, { pointerType: 'touch' }]) {
        press(h, 50, 70, extra);
        move(200, 200);
        release(200, 200);
      }
      expect(h.result.current.drag).toBeNull();
      expect(h.onDrop).not.toHaveBeenCalled();
    });

    it('lets touch and pen start from inside the grip, even from a child of it', () => {
      const h = setup();
      const grip = document.createElement('span');
      grip.setAttribute(DRAG_GRIP_ATTRIBUTE, '');
      const icon = document.createElement('svg');
      grip.appendChild(icon);
      for (const pointerType of ['touch', 'pen']) {
        press(h, 50, 70, { pointerType }, icon);
        move(200, 200, { pointerType });
        release(200, 200, { pointerType });
      }
      expect(h.onDrop).toHaveBeenCalledTimes(2);
    });

    it('a ctrl key does not block a touch drag from the grip (only the mouse context-menu case)', () => {
      const h = setup();
      const grip = document.createElement('span');
      grip.setAttribute(DRAG_GRIP_ATTRIBUTE, '');
      press(h, 50, 70, { pointerType: 'touch', ctrlKey: true }, grip);
      move(200, 200, { pointerType: 'touch' });
      expect(h.result.current.drag).not.toBeNull();
    });

    it('a second press takes over from one still in progress', () => {
      const h = setup();
      press(h, 50, 70, { pointerId: 1 });
      press(h, 60, 80, { pointerId: 2 });
      move(300, 300, { pointerId: 1 }); // the abandoned press no longer moves anything
      expect(h.result.current.drag).toBeNull();
      move(300, 300, { pointerId: 2 });
      expect(h.result.current.drag).not.toBeNull();
      release(300, 300, { pointerId: 1 });
      expect(h.onDrop).not.toHaveBeenCalled();
      release(300, 300, { pointerId: 2 });
      expect(h.onDrop).toHaveBeenCalledTimes(1);
    });
  });

  describe('the pointer store', () => {
    it('follows the pointer in stage coordinates once a drag is active, and notifies subscribers', () => {
      const h = setup();
      const listener = vi.fn();
      const unsubscribe = h.result.current.pointer.subscribe(listener);
      press(h, 50, 70);
      move(52, 71); // below the threshold: nothing is published
      expect(listener).not.toHaveBeenCalled();
      move(90, 120); // activates, publishing where it is
      expect(listener).toHaveBeenCalledTimes(1);
      expect(h.result.current.pointer.get()).toEqual({ x: 90, y: 120 });
      move(95, 130);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(h.result.current.pointer.get()).toEqual({ x: 95, y: 130 });
      unsubscribe();
      move(99, 140);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(h.result.current.pointer.get()).toEqual({ x: 99, y: 140 });
    });

    it('keeps the same store across renders, so subscribers are not torn down', () => {
      const h = setup();
      const before = h.result.current.pointer;
      h.rerender({ onDrop: vi.fn() });
      expect(h.result.current.pointer).toBe(before);
    });
  });

  describe('dropping', () => {
    it('reports the node and the release position in stage coordinates, then ends the drag', () => {
      const h = setup();
      press(h);
      move(300, 250);
      release(320, 260);
      expect(h.onDrop).toHaveBeenCalledWith('node-a', { x: 320, y: 260 });
      expect(h.result.current.drag).toBeNull();
      expect(document.body.style.cursor).toBe('');
    });

    it('calls the latest onDrop, not the one from when the press began', () => {
      const h = setup();
      const later = vi.fn();
      press(h);
      move(300, 250);
      h.rerender({ onDrop: later });
      release(300, 250);
      expect(later).toHaveBeenCalledTimes(1);
      expect(h.onDrop).not.toHaveBeenCalled();
    });

    it('falls back to the last known position when the stage is gone at release', () => {
      const h = setup();
      press(h);
      move(300, 250);
      (h.stage as { current: HTMLElement | null }).current = null;
      release(900, 900);
      expect(h.onDrop).toHaveBeenCalledWith('node-a', { x: 300, y: 250 });
    });

    it('a press released without travelling is a click: no drop, nothing swallowed', () => {
      const h = setup();
      press(h);
      move(52, 71);
      release(52, 71);
      expect(h.onDrop).not.toHaveBeenCalled();
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });

    it('listens for nothing once it has ended', () => {
      const h = setup();
      press(h);
      move(300, 250);
      release(300, 250);
      move(400, 400);
      release(400, 400);
      expect(h.onDrop).toHaveBeenCalledTimes(1);
      expect(h.result.current.drag).toBeNull();
    });

    it('swallows the click that follows the release, once, and only until the next task', () => {
      const h = setup();
      press(h);
      move(300, 250);
      release(300, 250);
      expect(h.result.current.takeSuppressedClick()).toBe(true);
      expect(h.result.current.takeSuppressedClick()).toBe(false);

      press(h);
      move(300, 250);
      release(300, 250);
      act(() => void vi.runAllTimers());
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });
  });

  describe('cancelling', () => {
    it('Escape ends the drag without dropping, and ignores other keys', () => {
      const h = setup();
      press(h);
      move(300, 250);
      act(() => void fireEvent.keyDown(window, { key: 'Enter' }));
      expect(h.result.current.drag).not.toBeNull();
      act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
      expect(h.result.current.drag).toBeNull();
      expect(document.body.style.cursor).toBe('');
      release(300, 250);
      expect(h.onDrop).not.toHaveBeenCalled();
    });

    it('after Escape, swallows the click of the release that is still to come', () => {
      const h = setup();
      press(h);
      move(300, 250);
      act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
      expect(h.result.current.takeSuppressedClick()).toBe(false); // nothing released yet
      release(300, 250);
      expect(h.result.current.takeSuppressedClick()).toBe(true);
      act(() => void vi.runAllTimers());
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });

    it('Escape before the drag began does not swallow the next click', () => {
      const h = setup();
      press(h);
      act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
      release(50, 70);
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });

    it('after Escape, a cancelled pointer stops waiting for the release', () => {
      const h = setup();
      press(h);
      move(300, 250);
      act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
      act(() => void fireEvent.pointerCancel(window, at(300, 250)));
      release(300, 250);
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });

    it('a mouse move with no button held ends a press that has not become a drag yet', () => {
      const h = setup();
      press(h);
      move(52, 71, { buttons: 0 });
      move(300, 250); // too late: the press is over
      expect(h.result.current.drag).toBeNull();
      release(300, 250);
      expect(h.onDrop).not.toHaveBeenCalled();
    });

    it('a touch move reporting no buttons is not mistaken for a missed release', () => {
      const h = setup();
      const grip = document.createElement('span');
      grip.setAttribute(DRAG_GRIP_ATTRIBUTE, '');
      press(h, 50, 70, { pointerType: 'touch' }, grip);
      move(300, 250, { pointerType: 'touch', buttons: 0 });
      expect(h.result.current.drag).not.toBeNull();
    });

    it('another pointer cancelling does not end this drag', () => {
      const h = setup();
      press(h);
      move(300, 250);
      act(() => void fireEvent.pointerCancel(window, at(300, 250, { pointerId: 9 })));
      expect(h.result.current.drag).not.toBeNull();
    });

    it('cancel() ends the drag, resets the cursor and detaches the listeners', () => {
      const h = setup();
      press(h);
      move(300, 250);
      act(() => h.result.current.cancel());
      expect(h.result.current.drag).toBeNull();
      expect(document.body.style.cursor).toBe('');
      release(300, 250);
      expect(h.onDrop).not.toHaveBeenCalled();
    });

    it('unmounting mid-drag detaches the listeners and restores the cursor', () => {
      const h = setup();
      press(h);
      move(300, 250);
      expect(document.body.style.cursor).toBe('grabbing');
      h.unmount();
      expect(document.body.style.cursor).toBe('');
      release(300, 250);
      expect(h.onDrop).not.toHaveBeenCalled();
    });
  });
});
