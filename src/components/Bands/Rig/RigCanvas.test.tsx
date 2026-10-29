import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RigCanvas } from './RigCanvas';
import { resolveNodes } from '../../../rigData';
import { GEO, computeRigLayout } from '../../../rigRouting';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../../../rigPresets';

const layout = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables, 4);
const colMid = (c: number) => layout.colXs[c] + GEO.cardW / 2;
const [first, second] = layout.nodes.filter((n) => n.col === 0);
const nameOf = (id: string) => layout.nodes.find((n) => n.id === id)!.gear.name;

/** The stage sits at (30, 50) on screen, so a mix-up between screen and stage coordinates shows. */
const ORIGIN = { x: 30, y: 50 };

/** When set, the box the diagram scrolls in is only this big (a stage wider than the page). */
let visibleBox: { width: number; height: number } | null = null;

beforeEach(() => {
  visibleBox = null;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const clipped = visibleBox !== null && this.getAttribute('role') === 'group';
    const width = clipped ? visibleBox!.width : layout.width;
    const height = clipped ? visibleBox!.height : layout.height;
    return { left: ORIGIN.x, top: ORIGIN.y, x: ORIGIN.x, y: ORIGIN.y, width, height, right: ORIGIN.x + width, bottom: ORIGIN.y + height, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.removeProperty('cursor');
});

function setup(over: Partial<Parameters<typeof RigCanvas>[0]> = {}) {
  const props = {
    diagram: JAM_STATION_DIAGRAM,
    gear: JAM_STATION_GEAR,
    editable: true,
    selectedNodeId: null as string | null,
    onSelectNode: vi.fn<(id: string | null) => void>(),
    selectedCableId: null as string | null,
    onSelectCable: vi.fn<(id: string | null) => void>(),
    connectFrom: null,
    onPortClick: vi.fn(),
    onMoveNode: vi.fn<(id: string, col: number, index: number) => void>(),
    onReconnectCable: vi.fn<(cableId: string, grabbed: { n: string; p: string }, target: { n: string; p: string }) => void>(),
    onRemoveCable: vi.fn<(cableId: string) => void>(),
    ...over,
  };
  const view = render(<RigCanvas {...props} />);
  return { ...props, props, ...view };
}

const header = (id: string) => screen.getByRole('button', { name: `Select ${nameOf(id)}` });
/** A pointer event at stage position (x, y); extra fields override the defaults (left mouse button held). */
const ptr = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  clientX: x + ORIGIN.x, clientY: y + ORIGIN.y, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: 'mouse', ...extra,
});
const press = (id: string, extra: Record<string, unknown> = {}) => fireEvent.pointerDown(header(id), ptr(first.x + 20, first.y + 20, extra));
const startDrag = (id: string, extra: Record<string, unknown> = {}) => {
  press(id, extra);
  fireEvent.pointerMove(window, ptr(first.x + 60, first.y + 60, extra));
};
const dragTo = (id: string, x: number, y: number) => {
  startDrag(id);
  fireEvent.pointerMove(window, ptr(x, y));
  fireEvent.pointerUp(window, ptr(x, y, { buttons: 0 }));
};
const spareColumnShown = () => screen.queryByText('Stage 4') !== null;
/** Under the last card of column 0 but still on the diagram. */
const belowColumn = layout.height;

describe('RigCanvas dragging', () => {
  it('drops a card at the end of its column (screen and stage coordinates differ)', () => {
    const props = setup();
    dragTo(first.id, colMid(0), belowColumn);
    expect(props.onMoveNode).toHaveBeenCalledWith(first.id, 0, 2);
  });

  it('drops a card between two others in another column', () => {
    const props = setup();
    const [x] = layout.nodes.filter((n) => n.col === 2);
    dragTo(first.id, colMid(2), x.y + x.h + GEO.cardGap / 2);
    expect(props.onMoveNode).toHaveBeenCalledWith(first.id, 2, 1);
  });

  it('offers a spare empty column while dragging, and drops into it', () => {
    const props = setup();
    expect(spareColumnShown()).toBe(false);
    startDrag(first.id);
    expect(spareColumnShown()).toBe(true);
    fireEvent.pointerUp(window, ptr(colMid(3), 300, { buttons: 0 }));
    expect(props.onMoveNode).toHaveBeenCalledWith(first.id, 3, 0);
    expect(spareColumnShown()).toBe(false);
  });

  it('shows the ghost and the drop line while dragging, and the original dimmed', () => {
    setup();
    startDrag(first.id);
    const overlay = document.querySelector('.z-40')!;
    expect(overlay).toHaveTextContent(nameOf(first.id));
    expect(overlay.querySelector('.bg-primary')).not.toBeNull();
    expect(overlay.querySelectorAll('.border-dashed')).toHaveLength(1); // the spare column
    fireEvent.pointerMove(window, ptr(layout.width + 400, 10));
    expect(overlay.querySelector('.bg-primary')).toBeNull(); // no drop line away from the diagram
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.z-40')).toBeNull();
  });

  it('cancels when released away from the diagram', () => {
    const props = setup();
    dragTo(first.id, layout.width + 400, 10);
    dragTo(first.id, 10, layout.height + 400);
    expect(props.onMoveNode).not.toHaveBeenCalled();
    expect(spareColumnShown()).toBe(false);
  });

  it('treats a small movement as a click, not a drag', () => {
    const props = setup();
    fireEvent.pointerDown(header(second.id), ptr(second.x + 20, second.y + 20));
    fireEvent.pointerMove(window, ptr(second.x + 22, second.y + 21));
    expect(spareColumnShown()).toBe(false);
    fireEvent.pointerUp(window, ptr(second.x + 22, second.y + 21, { buttons: 0 }));
    fireEvent.click(header(second.id));
    expect(props.onMoveNode).not.toHaveBeenCalled();
    expect(props.onSelectNode).toHaveBeenCalledWith(second.id);
  });

  it('does not select the card when a drag ends over it, but the next click does', () => {
    vi.useFakeTimers();
    try {
      const props = setup();
      dragTo(second.id, second.x + 30, second.y + 10);
      fireEvent.click(header(second.id));
      expect(props.onSelectNode).not.toHaveBeenCalled();
      act(() => {
        vi.runAllTimers();
      });
      fireEvent.click(header(second.id));
      expect(props.onSelectNode).toHaveBeenCalledWith(second.id);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('cancelling', () => {
    it('Escape ends the drag, and releasing afterwards neither drops nor selects the card', () => {
      vi.useFakeTimers();
      try {
        const props = setup();
        startDrag(first.id);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(spareColumnShown()).toBe(false);
        fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
        fireEvent.click(header(first.id));
        expect(props.onMoveNode).not.toHaveBeenCalled();
        expect(props.onSelectNode).not.toHaveBeenCalled();
        act(() => {
          vi.runAllTimers();
        });
        fireEvent.click(header(first.id));
        expect(props.onSelectNode).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a cancelled pointer ends the drag', () => {
      const props = setup();
      startDrag(first.id);
      fireEvent.pointerCancel(window, ptr(colMid(2), 200));
      expect(spareColumnShown()).toBe(false);
      fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
      expect(props.onMoveNode).not.toHaveBeenCalled();
    });

    it('a mouse move with no button held (the release was missed) ends the drag', () => {
      const props = setup();
      startDrag(first.id);
      fireEvent.pointerMove(window, ptr(colMid(2), 200, { buttons: 0 }));
      expect(spareColumnShown()).toBe(false);
      fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
      expect(props.onMoveNode).not.toHaveBeenCalled();
    });

    it.each([
      ['the window loses focus', () => fireEvent.blur(window)],
      ['the tab is hidden', () => fireEvent(document, new Event('visibilitychange'))],
      ['a context menu opens', () => fireEvent.contextMenu(window)],
    ])('%s', (_name, event) => {
      const props = setup();
      startDrag(first.id);
      event();
      expect(spareColumnShown()).toBe(false);
      fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
      expect(props.onMoveNode).not.toHaveBeenCalled();
    });

    it('a drag aborted by a context menu does not select the card on release', () => {
      vi.useFakeTimers();
      try {
        const props = setup();
        startDrag(first.id);
        fireEvent.contextMenu(window);
        fireEvent.pointerUp(window, ptr(first.x + 60, first.y + 60, { buttons: 0 }));
        fireEvent.click(header(first.id));
        expect(props.onSelectNode).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves a page cursor it did not set alone', () => {
      document.body.style.cursor = 'wait';
      const { unmount } = setup();
      unmount();
      expect(document.body.style.cursor).toBe('wait');
    });

    it('is cancelled when the card disappears mid-drag', () => {
      const { props, rerender } = setup();
      startDrag(first.id);
      expect(spareColumnShown()).toBe(true);
      const without = {
        ...JAM_STATION_DIAGRAM,
        nodes: JAM_STATION_DIAGRAM.nodes.filter((n) => n.id !== first.id),
        cables: JAM_STATION_DIAGRAM.cables.filter((c) => c.from.n !== first.id && c.to.n !== first.id),
      };
      rerender(<RigCanvas {...props} diagram={without} />);
      expect(document.querySelector('.z-40')).toBeNull();
      expect(document.body.style.cursor).toBe('');
      fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
      expect(props.onMoveNode).not.toHaveBeenCalled();
    });

    it('removes its listeners when the canvas unmounts mid-drag', () => {
      const { props, unmount } = setup();
      startDrag(first.id);
      unmount();
      fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
      expect(props.onMoveNode).not.toHaveBeenCalled();
      expect(document.body.style.cursor).toBe('');
    });
  });

  it('ignores other pointers, the right button, ctrl+click and a pen outside the grip', () => {
    const props = setup();
    press(first.id, { button: 2 });
    press(first.id, { ctrlKey: true });
    press(first.id, { pointerType: 'pen' });
    press(first.id, { isPrimary: false });
    fireEvent.pointerMove(window, ptr(colMid(2), 200));
    fireEvent.pointerUp(window, ptr(colMid(2), 200, { buttons: 0 }));
    expect(spareColumnShown()).toBe(false);
    expect(props.onMoveNode).not.toHaveBeenCalled();
  });

  it('follows only the pointer that pressed', () => {
    const props = setup();
    press(first.id);
    fireEvent.pointerMove(window, ptr(first.x + 80, first.y + 80, { pointerId: 7 }));
    expect(spareColumnShown()).toBe(false);
    fireEvent.pointerMove(window, ptr(first.x + 80, first.y + 80));
    fireEvent.pointerUp(window, ptr(colMid(0), belowColumn, { pointerId: 7, buttons: 0 }));
    expect(spareColumnShown()).toBe(true); // the foreign release did not end it
    fireEvent.pointerUp(window, ptr(colMid(0), belowColumn, { buttons: 0 }));
    expect(props.onMoveNode).toHaveBeenCalledTimes(1);
  });

  it('starts a touch or pen drag from the grip only', () => {
    const props = setup();
    const grip = document.querySelectorAll('[data-drag-grip]')[0] as HTMLElement;
    for (const pointerType of ['touch', 'pen']) {
      fireEvent.pointerDown(grip, ptr(first.x + 20, first.y + 20, { pointerType }));
      fireEvent.pointerMove(window, ptr(colMid(0), belowColumn, { pointerType }));
      fireEvent.pointerUp(window, ptr(colMid(0), belowColumn, { pointerType, buttons: 0 }));
    }
    expect(props.onMoveNode).toHaveBeenCalledTimes(2);
    expect(props.onMoveNode).toHaveBeenCalledWith(first.id, 0, 2);
  });

  it('stops text selection and shows a grabbing cursor while dragging', () => {
    setup();
    startDrag(first.id);
    expect(document.body.style.cursor).toBe('grabbing');
    expect(fireEvent(window, new Event('selectstart', { cancelable: true }))).toBe(false);
    fireEvent.pointerUp(window, ptr(colMid(0), belowColumn, { buttons: 0 }));
    expect(document.body.style.cursor).toBe('');
    expect(fireEvent(window, new Event('selectstart', { cancelable: true }))).toBe(true);
  });

  it('cannot be dragged when read-only or without a move handler', () => {
    const readOnly = setup({ editable: false });
    expect(screen.queryAllByRole('button', { name: /^Select / })).toHaveLength(0);
    expect(document.querySelector('[data-drag-grip]')).toBeNull();
    expect(readOnly.onMoveNode).not.toHaveBeenCalled();
  });

  it('shows no grips without a move handler', () => {
    setup({ onMoveNode: undefined });
    expect(document.querySelector('[data-drag-grip][title="Drag to move"]')).toBeNull();
  });

  it('is centred when it cannot be edited, left-aligned when it can', () => {
    const { container, rerender, props } = setup();
    expect(container.querySelector('.mx-auto')).toBeNull();
    rerender(<RigCanvas {...props} editable={false} />);
    expect(container.querySelector('.mx-auto')).not.toBeNull();
  });
});

describe('RigCanvas wire ends', () => {
  const layout3 = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables);
  const pin = (nodeId: string, portId: string) => layout3.ports.find((p) => p.nodeId === nodeId && p.portId === portId)!;
  const rowOf = (name: RegExp) => screen.getByRole('button', { name });
  /** The plug follows its row in the card. */
  const plugAfter = (name: RegExp) => {
    const next = rowOf(name).nextElementSibling as HTMLElement | null;
    return next?.getAttribute('title')?.startsWith('Drag to move this end') ? next : null;
  };
  const plugOf = (name: RegExp) => plugAfter(name)!;
  const BASS_OUT = /Electric Bass: Output/;
  const SCARLETT_CH2 = /Focusrite Scarlett 18i8: Ch 2/;
  const bassOut = pin('nbass', 'out1');
  const ch2 = pin('nscarlet', 'in02');
  const spareIn = pin('nspeaker', 'in02');
  const startWire = (name: RegExp, from: { x: number; y: number }, extra: Record<string, unknown> = {}) => {
    fireEvent.pointerDown(plugOf(name), ptr(from.x, from.y, extra));
    fireEvent.pointerMove(window, ptr(from.x + 30, from.y + 30, extra));
  };
  const release = (at: { x: number; y: number }) => fireEvent.pointerUp(window, ptr(at.x, at.y, { buttons: 0 }));
  const overlay = () => document.querySelector('.z-40');

  it('puts a plug on every connected port and none on free ones', () => {
    setup();
    expect(document.querySelectorAll('[title^="Drag to move this end"]')).toHaveLength(JAM_STATION_DIAGRAM.cables.length * 2);
    expect(plugAfter(/HeadRush FRFR-108 MKII: Input 2/)).toBeNull();
  });

  it('has no plugs when read-only or without both wire handlers', () => {
    setup({ editable: false });
    expect(document.querySelector('[title^="Drag to move this end"]')).toBeNull();
    document.body.innerHTML = '';
    setup({ onRemoveCable: undefined });
    expect(document.querySelector('[title^="Drag to move this end"]')).toBeNull();
  });

  it('moves the end it was pressed on to the port it is dropped on', () => {
    const props = setup();
    startWire(SCARLETT_CH2, ch2);
    release(spareIn);
    expect(props.onReconnectCable).toHaveBeenCalledWith('cbass', { n: 'nscarlet', p: 'in02' }, { n: 'nspeaker', p: 'in02' });
    expect(props.onRemoveCable).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  });

  it('reports the port it grabbed: the output end for the output plug', () => {
    const props = setup();
    startWire(BASS_OUT, bassOut);
    release(pin('ndrums', 'outl'));
    expect(props.onReconnectCable).toHaveBeenCalledWith('cbass', { n: 'nbass', p: 'out1' }, { n: 'ndrums', p: 'outl' });
  });

  it('removes the cable when the end is let go on empty canvas', () => {
    const props = setup();
    startWire(SCARLETT_CH2, ch2);
    release({ x: layout3.gutters[0].x + 4, y: layout3.height / 2 });
    expect(props.onRemoveCable).toHaveBeenCalledWith('cbass');
    expect(props.onReconnectCable).not.toHaveBeenCalled();
  });

  it('does nothing when let go on a card away from a port, or away from the diagram', () => {
    const props = setup();
    const drums = layout3.nodes.find((n) => n.id === 'ndrums')!;
    startWire(SCARLETT_CH2, ch2);
    release({ x: drums.x + 40, y: drums.y + 10 });
    startWire(SCARLETT_CH2, ch2);
    release({ x: layout3.width + 300, y: 10 });
    startWire(SCARLETT_CH2, ch2);
    release({ x: 10, y: layout3.height + 300 });
    expect(props.onReconnectCable).not.toHaveBeenCalled();
    expect(props.onRemoveCable).not.toHaveBeenCalled();
  });

  it('draws the loose end, dims the cable, and shows a remove hint only over empty canvas', () => {
    setup();
    startWire(SCARLETT_CH2, ch2);
    expect(overlay()!.querySelector('line')).not.toBeNull();
    expect(document.querySelector('svg g[opacity="0.25"]')).not.toBeNull();
    expect(overlay()).not.toHaveTextContent('Release to remove');
    fireEvent.pointerMove(window, ptr(layout3.gutters[0].x + 4, layout3.height / 2));
    expect(overlay()).toHaveTextContent('Release to remove the cable');
    fireEvent.pointerMove(window, ptr(spareIn.x, spareIn.y));
    expect(overlay()).not.toHaveTextContent('Release to remove');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(overlay()).toBeNull();
    expect(document.querySelector('svg g[opacity="0.25"]')).toBeNull();
  });

  it('highlights the ports it can be dropped on, counting its own as free', () => {
    setup();
    startWire(SCARLETT_CH2, ch2);
    expect(rowOf(/HeadRush FRFR-108 MKII: Input 2/).className).toContain('ring-sky-400'); // free input
    expect(rowOf(/HeadRush FRFR-108 MKII: Input 1/).className).not.toContain('ring-sky-400'); // another cable's
    expect(rowOf(SCARLETT_CH2).className).toContain('ring-sky-400'); // where it came from
    expect(rowOf(/Electric Guitar: Output/).className).not.toContain('ring-sky-400'); // an output
    expect(rowOf(BASS_OUT).className).toContain('ring-primary'); // the end that stays
  });

  it('Escape and a cancelled pointer drop nothing', () => {
    const props = setup();
    startWire(SCARLETT_CH2, ch2);
    fireEvent.keyDown(window, { key: 'Escape' });
    release(spareIn);
    startWire(SCARLETT_CH2, ch2);
    fireEvent.pointerCancel(window, ptr(spareIn.x, spareIn.y));
    release(spareIn);
    expect(props.onReconnectCable).not.toHaveBeenCalled();
    expect(props.onRemoveCable).not.toHaveBeenCalled();
  });

  it('is a click, not a drag, below the threshold: the port still gets its click', () => {
    const props = setup();
    fireEvent.pointerDown(plugOf(SCARLETT_CH2), ptr(ch2.x, ch2.y));
    fireEvent.pointerUp(window, ptr(ch2.x, ch2.y, { buttons: 0 }));
    fireEvent.click(rowOf(SCARLETT_CH2));
    expect(props.onPortClick).toHaveBeenCalledTimes(1);
    expect(props.onReconnectCable).not.toHaveBeenCalled();
  });

  it('does not treat the release click on the row as a port click after a drag', () => {
    vi.useFakeTimers();
    try {
      const props = setup();
      startWire(SCARLETT_CH2, ch2);
      release(ch2); // back on its own port
      fireEvent.click(rowOf(SCARLETT_CH2));
      expect(props.onPortClick).not.toHaveBeenCalled();
      act(() => {
        vi.runAllTimers();
      });
      fireEvent.click(rowOf(SCARLETT_CH2));
      expect(props.onPortClick).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('touch and pen can pick a plug up (it is a grip)', () => {
    const props = setup();
    for (const pointerType of ['touch', 'pen']) {
      startWire(SCARLETT_CH2, ch2, { pointerType });
      fireEvent.pointerUp(window, ptr(spareIn.x, spareIn.y, { pointerType, buttons: 0 }));
    }
    expect(props.onReconnectCable).toHaveBeenCalledTimes(2);
  });

  it('is cancelled when the cable disappears mid-drag', () => {
    const { props, rerender } = setup();
    startWire(SCARLETT_CH2, ch2);
    expect(overlay()).not.toBeNull();
    rerender(<RigCanvas {...props} diagram={{ ...JAM_STATION_DIAGRAM, cables: JAM_STATION_DIAGRAM.cables.filter((c) => c.id !== 'cbass') }} />);
    expect(overlay()).toBeNull();
    release(spareIn);
    expect(props.onReconnectCable).not.toHaveBeenCalled();
  });

  it('lets a wire drag take over from a connection being started: the fixed plug is the origin', () => {
    setup({ connectFrom: { n: 'ndrums', p: 'outl' } });
    startWire(SCARLETT_CH2, ch2);
    expect(rowOf(BASS_OUT).className).toContain('ring-primary'); // the cable's other end, not the half-made connection
    expect(rowOf(/Alesis Nitro Max: Out L/).className).not.toContain('ring-primary');
    const line = overlay()!.querySelector('line')!;
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(bassOut.x);
    expect(Number(line.getAttribute('y1'))).toBeCloseTo(bassOut.y);
  });

  describe('removing is deliberate', () => {
    const inGutter = { x: layout3.gutters[0].x + 4, y: layout3.height / 2 };

    it('does not remove when let go close to where it was picked up', () => {
      const props = setup();
      startWire(SCARLETT_CH2, ch2);
      release({ x: ch2.x - 20, y: ch2.y }); // empty gutter, but only 20px from the pin
      expect(props.onRemoveCable).not.toHaveBeenCalled();
      expect(props.onReconnectCable).not.toHaveBeenCalled();
    });

    it('does not remove when the release is outside the box the diagram scrolls in', () => {
      visibleBox = { width: 100, height: 100 };
      const props = setup();
      startWire(SCARLETT_CH2, ch2);
      release(inGutter);
      expect(props.onRemoveCable).not.toHaveBeenCalled();
    });

    it('does not remove in the margin around the diagram, only on it', () => {
      const props = setup();
      startWire(SCARLETT_CH2, ch2);
      release({ x: -20, y: 10 });
      startWire(SCARLETT_CH2, ch2);
      release({ x: 10, y: layout3.height + 20 });
      expect(props.onRemoveCable).not.toHaveBeenCalled();
      startWire(SCARLETT_CH2, ch2);
      release(inGutter);
      expect(props.onRemoveCable).toHaveBeenCalledTimes(1);
    });

    it('a release anywhere on the plug itself counts as the port, not as removal', () => {
      const props = setup();
      startWire(SCARLETT_CH2, ch2);
      release({ x: ch2.x - GEO.plugHit / 2, y: ch2.y });
      expect(props.onRemoveCable).not.toHaveBeenCalled();
      expect(props.onReconnectCable).toHaveBeenCalledWith('cbass', { n: 'nscarlet', p: 'in02' }, { n: 'nscarlet', p: 'in02' });
    });
  });

  it('is cancelled when wire dragging gets switched off mid-drag', () => {
    const { props, rerender } = setup();
    startWire(SCARLETT_CH2, ch2);
    expect(overlay()).not.toBeNull();
    rerender(<RigCanvas {...props} onRemoveCable={undefined} />);
    expect(overlay()).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('keeps a card drag and a wire drag apart', () => {
    const props = setup();
    startWire(SCARLETT_CH2, ch2);
    expect(screen.queryByText('Stage 4')).toBeNull(); // no spare column for a wire
    release(spareIn);
    expect(props.onMoveNode).not.toHaveBeenCalled();
  });
});

