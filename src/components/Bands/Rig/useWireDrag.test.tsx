import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { resolveNodes } from '../../../rigData';
import type { PortRef } from '../../../rigEdit';
import { computeRigLayout } from '../../../rigRouting';
import type { RigLayout } from '../../../rigRouting';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../../../rigPresets';
import type { RigDiagram } from '../../../rigTypes';
import { useWireDrag, wireWouldRemove } from './useWireDrag';

const layout = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables);
const pin = (nodeId: string, portId: string) => layout.ports.find((p) => p.nodeId === nodeId && p.portId === portId)!;

/** cbass runs from the bass output (nbass:out1) to the interface's Ch 2 (nscarlet:in02). */
const BASS_OUT: PortRef = { n: 'nbass', p: 'out1' };
const CH2: PortRef = { n: 'nscarlet', p: 'in02' };
const bassOut = pin('nbass', 'out1');
const ch2 = pin('nscarlet', 'in02');
const spareIn = pin('nspeaker', 'in02');
/** Empty canvas on the diagram, far from every pin. */
const inGutter = { x: layout.gutters[0].x + 4, y: layout.height / 2 };

/** The stage sits at (30, 50) on screen, so a mix-up between screen and stage coordinates shows. */
const ORIGIN = { x: 30, y: 50 };

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, x: left, y: top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

interface Dom {
  stageRef: RefObject<HTMLElement | null>;
  group: HTMLElement;
}

/** A stage inside a `role="group"` box, like the canvas has; `box` is the size of the box the diagram scrolls in. */
function makeDom(box = { width: 5000, height: 5000 }, withGroup = true): Dom {
  const group = document.createElement('div');
  group.setAttribute('role', 'group');
  group.getBoundingClientRect = () => rect(0, 0, box.width, box.height);
  const stage = document.createElement('div');
  stage.getBoundingClientRect = () => rect(ORIGIN.x, ORIGIN.y, layout.width, layout.height);
  (withGroup ? group : document.body).appendChild(stage);
  if (withGroup) document.body.appendChild(group);
  return { stageRef: { current: stage }, group };
}

const at = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  clientX: x + ORIGIN.x, clientY: y + ORIGIN.y, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: 'mouse', ...extra,
});
const down = (x: number, y: number) =>
  ({ ctrlKey: false, target: document.createElement('div'), ...at(x, y) }) as unknown as ReactPointerEvent<HTMLElement>;

interface Setup {
  diagram?: RigDiagram;
  enabled?: boolean;
  dom?: Dom;
  layoutRef?: RefObject<RigLayout | null>;
}

function setup({ diagram = JAM_STATION_DIAGRAM, enabled = true, dom = makeDom(), layoutRef = { current: layout } }: Setup = {}) {
  const onReconnect = vi.fn<(cableId: string, grabbed: PortRef, target: PortRef) => void>();
  const onRemove = vi.fn<(cableId: string) => void>();
  const hook = renderHook(
    (props: { diagram: RigDiagram; enabled: boolean }) =>
      useWireDrag({ stageRef: dom.stageRef, layoutRef, diagram: props.diagram, enabled: props.enabled, onReconnect, onRemove }),
    { initialProps: { diagram, enabled } },
  );
  return { ...hook, onReconnect, onRemove, dom };
}
type Hook = ReturnType<typeof setup>;

const grab = (h: Hook, cableId: string, grabbed: PortRef, from: { x: number; y: number }) =>
  act(() => h.result.current.begin(down(from.x, from.y), cableId, grabbed, from));
const move = (to: { x: number; y: number }) => act(() => void fireEvent.pointerMove(window, at(to.x, to.y)));
const release = (to: { x: number; y: number }) => act(() => void fireEvent.pointerUp(window, at(to.x, to.y, { buttons: 0 })));
/** Press the plug at `from`, travel well past the threshold and let go at `to`. */
const dragAndRelease = (h: Hook, cableId: string, grabbed: PortRef, from: { x: number; y: number }, to: { x: number; y: number }) => {
  grab(h, cableId, grabbed, from);
  move({ x: from.x + 40, y: from.y + 40 });
  release(to);
};

const withCable = (id: string, patch: Partial<RigDiagram['cables'][number]>): RigDiagram => ({
  ...JAM_STATION_DIAGRAM,
  cables: JAM_STATION_DIAGRAM.cables.map((c) => (c.id === id ? { ...c, ...patch } : c)),
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.body.style.removeProperty('cursor');
});

describe('useWireDrag', () => {
  describe('the wire in the air', () => {
    it('is idle until a plug is pressed and has moved past the threshold', () => {
      const h = setup();
      expect(h.result.current.active).toBeNull();
      grab(h, 'cbass', CH2, ch2);
      expect(h.result.current.active).toBeNull(); // a press alone is still a click
      move({ x: ch2.x + 2, y: ch2.y + 2 });
      expect(h.result.current.active).toBeNull();
      move({ x: ch2.x + 30, y: ch2.y });
      expect(h.result.current.active).toEqual({ cableId: 'cbass', grabbed: CH2, fixed: BASS_OUT });
    });

    it('anchors the end that stays: the output end when the input was grabbed', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      expect(h.result.current.active?.fixed).toEqual(BASS_OUT);
    });

    it('anchors the end that stays: the input end when the output was grabbed', () => {
      const h = setup();
      grab(h, 'cbass', BASS_OUT, bassOut);
      move({ x: bassOut.x + 30, y: bassOut.y });
      expect(h.result.current.active?.fixed).toEqual(CH2);
    });

    it('follows the pointer in stage coordinates through the pointer store', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: 200, y: 300 });
      expect(h.result.current.pointer.get()).toEqual({ x: 200, y: 300 });
      move({ x: 210, y: 310 });
      expect(h.result.current.pointer.get()).toEqual({ x: 210, y: 310 });
    });

    it('stays active, with the new anchor, when the other end of the cable is re-plugged elsewhere mid-drag', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      h.rerender({ diagram: withCable('cbass', { from: { n: 'ndrums', p: 'outl' } }), enabled: true });
      expect(h.result.current.active).toEqual({ cableId: 'cbass', grabbed: CH2, fixed: { n: 'ndrums', p: 'outl' } });
    });
  });

  describe('letting go', () => {
    it('on a port reports the cable, the end that was grabbed and the port it landed on', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', CH2, ch2, spareIn);
      expect(h.onReconnect).toHaveBeenCalledTimes(1);
      expect(h.onReconnect).toHaveBeenCalledWith('cbass', CH2, { n: 'nspeaker', p: 'in02' });
      expect(h.onRemove).not.toHaveBeenCalled();
      expect(h.result.current.active).toBeNull();
    });

    it('reports the grabbed end as it was grabbed (the output side too)', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', BASS_OUT, bassOut, pin('ndrums', 'outl'));
      expect(h.onReconnect).toHaveBeenCalledWith('cbass', BASS_OUT, { n: 'ndrums', p: 'outl' });
    });

    it('on its own port still reports a reconnect (the caller decides that it is a no-op)', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', CH2, ch2, ch2);
      expect(h.onReconnect).toHaveBeenCalledWith('cbass', CH2, CH2);
      expect(h.onRemove).not.toHaveBeenCalled();
    });

    it('on empty canvas removes the cable', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', CH2, ch2, inGutter);
      expect(h.onRemove).toHaveBeenCalledTimes(1);
      expect(h.onRemove).toHaveBeenCalledWith('cbass');
      expect(h.onReconnect).not.toHaveBeenCalled();
    });

    it('on a card away from its ports does nothing', () => {
      const h = setup();
      const drums = layout.nodes.find((n) => n.id === 'ndrums')!;
      dragAndRelease(h, 'cbass', CH2, ch2, { x: drums.x + 40, y: drums.y + 10 }); // the header
      expect(h.onReconnect).not.toHaveBeenCalled();
      expect(h.onRemove).not.toHaveBeenCalled();
    });

    it('off the diagram does nothing, even beside it', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', CH2, ch2, { x: -10, y: inGutter.y });
      dragAndRelease(h, 'cbass', CH2, ch2, { x: inGutter.x, y: layout.height + 10 });
      expect(h.onRemove).not.toHaveBeenCalled();
      expect(h.onReconnect).not.toHaveBeenCalled();
    });

    it('swallows the click that follows a drag, once', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', CH2, ch2, spareIn);
      expect(h.result.current.takeSuppressedClick()).toBe(true);
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });

    it('a press that never travelled drops nothing and swallows nothing', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      release(ch2);
      expect(h.onReconnect).not.toHaveBeenCalled();
      expect(h.onRemove).not.toHaveBeenCalled();
      expect(h.result.current.takeSuppressedClick()).toBe(false);
    });

    it('does nothing before the layout is known', () => {
      const h = setup({ layoutRef: { current: null } });
      dragAndRelease(h, 'cbass', CH2, ch2, spareIn);
      dragAndRelease(h, 'cbass', CH2, ch2, inGutter);
      expect(h.onReconnect).not.toHaveBeenCalled();
      expect(h.onRemove).not.toHaveBeenCalled();
    });

    it('uses the layout as it is at the moment of release, not at the start of the drag', () => {
      const layoutRef: RefObject<RigLayout | null> = { current: layout };
      const h = setup({ layoutRef });
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      layoutRef.current = null;
      release(spareIn);
      expect(h.onReconnect).not.toHaveBeenCalled();
    });
  });

  describe('removing is deliberate', () => {
    // The pin sits on the card's left edge; the gutter to its left is empty canvas.
    const near = (dx: number) => ({ x: ch2.x - dx, y: ch2.y });

    it('is refused less than 24px from where the end was picked up, and allowed from 24px on', () => {
      const h = setup();
      dragAndRelease(h, 'cbass', CH2, ch2, near(23));
      expect(h.onRemove).not.toHaveBeenCalled();
      dragAndRelease(h, 'cbass', CH2, ch2, near(24));
      expect(h.onRemove).toHaveBeenCalledTimes(1);
    });

    it('measures from the end that was grabbed, not from the other one', () => {
      const h = setup();
      // 23px beside the OUTPUT end of the same cable, which is far from the grabbed input end
      dragAndRelease(h, 'cbass', CH2, ch2, { x: bassOut.x + 23, y: bassOut.y });
      // the bass pin sits on the card's right edge: 23px right of it is the gutter
      expect(h.onRemove).toHaveBeenCalledTimes(1);
    });

    it('is refused when the release is outside the box the diagram scrolls in', () => {
      const h = setup({ dom: makeDom({ width: 100, height: 100 }) });
      dragAndRelease(h, 'cbass', CH2, ch2, inGutter);
      expect(h.onRemove).not.toHaveBeenCalled();
    });

    it('is allowed right up to the edge of that box, in screen coordinates', () => {
      const box = { width: ORIGIN.x + inGutter.x, height: ORIGIN.y + inGutter.y };
      const h = setup({ dom: makeDom(box) });
      dragAndRelease(h, 'cbass', CH2, ch2, inGutter);
      expect(h.onRemove).toHaveBeenCalledTimes(1);
      dragAndRelease(h, 'cbass', CH2, ch2, { x: inGutter.x + 1, y: inGutter.y });
      expect(h.onRemove).toHaveBeenCalledTimes(1);
    });

    it('is refused when the stage is not inside a box at all, while moving to a port still works', () => {
      const h = setup({ dom: makeDom(undefined, false) });
      dragAndRelease(h, 'cbass', CH2, ch2, inGutter);
      expect(h.onRemove).not.toHaveBeenCalled();
      dragAndRelease(h, 'cbass', CH2, ch2, spareIn);
      expect(h.onReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('when it cannot go on', () => {
    it('does nothing at all while disabled, even if the press began', () => {
      const h = setup({ enabled: false });
      dragAndRelease(h, 'cbass', CH2, ch2, spareIn);
      dragAndRelease(h, 'cbass', CH2, ch2, inGutter);
      expect(h.onReconnect).not.toHaveBeenCalled();
      expect(h.onRemove).not.toHaveBeenCalled();
      expect(h.result.current.active).toBeNull();
    });

    it('is cancelled when it gets disabled mid-drag: no wire, cursor restored, nothing dropped', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      expect(document.body.style.cursor).toBe('grabbing');
      h.rerender({ diagram: JAM_STATION_DIAGRAM, enabled: false });
      expect(h.result.current.active).toBeNull();
      expect(document.body.style.cursor).toBe('');
      h.rerender({ diagram: JAM_STATION_DIAGRAM, enabled: true });
      release(spareIn);
      expect(h.onReconnect).not.toHaveBeenCalled();
    });

    it('is cancelled when its cable is removed mid-drag', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      h.rerender({ diagram: { ...JAM_STATION_DIAGRAM, cables: JAM_STATION_DIAGRAM.cables.filter((c) => c.id !== 'cbass') }, enabled: true });
      expect(h.result.current.active).toBeNull();
      expect(document.body.style.cursor).toBe('');
      release(spareIn);
      expect(h.onReconnect).not.toHaveBeenCalled();
    });

    it('is cancelled when the end being held is moved to another port elsewhere', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      h.rerender({ diagram: withCable('cbass', { to: { n: 'nspeaker', p: 'in02' } }), enabled: true });
      expect(h.result.current.active).toBeNull();
      release(spareIn);
      expect(h.onReconnect).not.toHaveBeenCalled();
      expect(h.onRemove).not.toHaveBeenCalled();
    });

    it('Escape ends it without dropping, and the release that follows does not click the port', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
      expect(h.result.current.active).toBeNull();
      release(spareIn);
      expect(h.onReconnect).not.toHaveBeenCalled();
      expect(h.result.current.takeSuppressedClick()).toBe(true);
    });

    it('unmounting mid-drag restores the cursor and drops nothing', () => {
      const h = setup();
      grab(h, 'cbass', CH2, ch2);
      move({ x: ch2.x + 30, y: ch2.y });
      h.unmount();
      expect(document.body.style.cursor).toBe('');
      release(spareIn);
      expect(h.onReconnect).not.toHaveBeenCalled();
    });
  });
});

describe('wireWouldRemove', () => {
  const layout3 = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables);
  const gutter = { x: layout3.gutters[0].x + 4, y: layout3.height / 2 };
  const grabbed = { n: 'nscarlet', p: 'in02' };

  function stageInBox() {
    const box = document.createElement('div');
    box.setAttribute('role', 'group');
    const stage = document.createElement('div');
    box.append(stage);
    document.body.append(box);
    const rect = (w: number, h: number) => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(rect(layout3.width, layout3.height));
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect(layout3.width, layout3.height));
    return { box, stage };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    // jsdom has no elementFromPoint: remove any stub a test added
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it('removes on empty canvas over the diagram', () => {
    const { stage } = stageInBox();
    expect(wireWouldRemove(layout3, stage, grabbed, gutter)).toBe(true);
  });

  it('asks what is really under the pointer when the browser can say: another element over the diagram cancels', () => {
    const { stage } = stageInBox();
    const nav = document.createElement('nav');
    document.body.append(nav);
    (document as { elementFromPoint?: unknown }).elementFromPoint = vi.fn(() => nav);
    expect(wireWouldRemove(layout3, stage, grabbed, gutter)).toBe(false);
  });

  it('removes when what is under the pointer is part of the stage', () => {
    const { stage } = stageInBox();
    const child = document.createElement('div');
    stage.append(child);
    (document as { elementFromPoint?: unknown }).elementFromPoint = vi.fn(() => child);
    expect(wireWouldRemove(layout3, stage, grabbed, gutter)).toBe(true);
  });

  it('cancels when nothing is under the pointer (outside the window)', () => {
    const { stage } = stageInBox();
    (document as { elementFromPoint?: unknown }).elementFromPoint = vi.fn(() => null);
    expect(wireWouldRemove(layout3, stage, grabbed, gutter)).toBe(false);
  });

  it('cancels without a stage, and near where the end was picked up', () => {
    const { stage } = stageInBox();
    expect(wireWouldRemove(layout3, null, grabbed, gutter)).toBe(false);
    const pin = layout3.ports.find((p) => p.nodeId === 'nscarlet' && p.portId === 'in02')!;
    expect(wireWouldRemove(layout3, stage, grabbed, { x: pin.x - 20, y: pin.y })).toBe(false);
  });
});

