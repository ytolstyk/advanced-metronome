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

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ left: ORIGIN.x, top: ORIGIN.y, x: ORIGIN.x, y: ORIGIN.y, width: layout.width, height: layout.height, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect,
  );
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
    expect(document.querySelector('[data-drag-grip]')).toBeNull();
  });

  it('is centred when it cannot be edited, left-aligned when it can', () => {
    const { container, rerender, props } = setup();
    expect(container.querySelector('.mx-auto')).toBeNull();
    rerender(<RigCanvas {...props} editable={false} />);
    expect(container.querySelector('.mx-auto')).not.toBeNull();
  });
});
