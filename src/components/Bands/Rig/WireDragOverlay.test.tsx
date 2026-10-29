import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { Point, PointerStore } from '../../../hooks/usePointerDrag';
import { resolveNodes } from '../../../rigData';
import { computeRigLayout } from '../../../rigRouting';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../../../rigPresets';
import { RIG_PALETTE } from '../../../rigUtils';
import { WireDragOverlay } from './WireDragOverlay';

const layout = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables);
const pin = (nodeId: string, portId: string) => layout.ports.find((p) => p.nodeId === nodeId && p.portId === portId)!;

const CABLE_COLOR = '#22c55e';
const ANCHOR = pin('nbass', 'out1');
const onPort = pin('nspeaker', 'in02');
const onEmpty = { x: layout.gutters[0].x + 4, y: layout.height / 2 };
const drums = layout.nodes.find((n) => n.id === 'ndrums')!;
const onCardBody = { x: drums.x + 40, y: drums.y + 10 };
const offStage = { x: layout.width + 100, y: 20 };

/** A pointer store the test can move by hand. */
function makeStore(start: Point) {
  let point = start;
  const listeners = new Set<() => void>();
  const store: PointerStore = {
    get: () => point,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    store,
    moveTo: (next: Point) =>
      act(() => {
        point = next;
        listeners.forEach((l) => l());
      }),
    listenerCount: () => listeners.size,
  };
}

function setup(start: Point) {
  const pointer = makeStore(start);
  const view = render(<WireDragOverlay layout={layout} anchor={ANCHOR} color={CABLE_COLOR} pointer={pointer.store} />);
  const root = view.container.firstElementChild as HTMLElement;
  const lines = () => Array.from(root.querySelectorAll('line'));
  const dot = () => root.querySelector('circle')!;
  return { ...pointer, ...view, root, lines, dot };
}

describe('WireDragOverlay', () => {
  it('is decoration only: hidden from assistive tech and out of the way of the pointer', () => {
    const { root } = setup(onPort);
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.className).toContain('pointer-events-none');
  });

  it('draws a casing line and a dashed cable line from the anchor to the pointer, with a dot at the loose end', () => {
    const { lines, dot } = setup(onPort);
    const [casing, cable] = lines();
    expect(lines()).toHaveLength(2);
    for (const line of [casing, cable]) {
      expect(Number(line.getAttribute('x1'))).toBe(ANCHOR.x);
      expect(Number(line.getAttribute('y1'))).toBe(ANCHOR.y);
      expect(Number(line.getAttribute('x2'))).toBe(onPort.x);
      expect(Number(line.getAttribute('y2'))).toBe(onPort.y);
    }
    expect(casing).toHaveAttribute('stroke', RIG_PALETTE.casing);
    expect(cable).toHaveAttribute('stroke-dasharray');
    expect(Number(casing.getAttribute('stroke-width'))).toBeGreaterThan(Number(cable.getAttribute('stroke-width')));
    expect(dot().getAttribute('cx')).toBe(String(onPort.x));
    expect(dot().getAttribute('cy')).toBe(String(onPort.y));
  });

  it('is as big as the diagram, so it never adds scroll room', () => {
    const { root } = setup(onPort);
    const svg = root.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', String(layout.width));
    expect(svg).toHaveAttribute('height', String(layout.height));
  });

  describe('colour', () => {
    it('is the cable colour over a port', () => {
      const { lines, dot } = setup(onPort);
      expect(lines()[1]).toHaveAttribute('stroke', CABLE_COLOR);
      expect(dot()).toHaveAttribute('fill', CABLE_COLOR);
    });

    it('is red over empty canvas on the diagram, where letting go removes the cable', () => {
      const { lines, dot } = setup(onEmpty);
      expect(lines()[1]).toHaveAttribute('stroke', RIG_PALETTE.remove);
      expect(dot()).toHaveAttribute('fill', RIG_PALETTE.remove);
    });

    it('is grey over a card away from its ports, where letting go does nothing', () => {
      const { lines, dot } = setup(onCardBody);
      expect(lines()[1]).toHaveAttribute('stroke', RIG_PALETTE.muted);
      expect(dot()).toHaveAttribute('fill', RIG_PALETTE.muted);
    });

    it('is the cable colour again off the diagram: empty there, but letting go does not remove', () => {
      const { lines, dot } = setup(offStage);
      expect(lines()[1]).toHaveAttribute('stroke', CABLE_COLOR);
      expect(dot()).toHaveAttribute('fill', CABLE_COLOR);
    });

    it('keeps the casing dark whatever the state', () => {
      const { lines, moveTo } = setup(onEmpty);
      expect(lines()[0]).toHaveAttribute('stroke', RIG_PALETTE.casing);
      moveTo(onCardBody);
      expect(lines()[0]).toHaveAttribute('stroke', RIG_PALETTE.casing);
    });
  });

  describe('the remove hint', () => {
    it('shows over empty canvas, next to the pointer, in the remove colour', () => {
      const { root } = setup(onEmpty);
      const hint = root.querySelector('span')!;
      expect(hint).toHaveTextContent('Release to remove the cable');
      expect(hint.style.left).toBe(`${onEmpty.x + 14}px`);
      expect(hint.style.top).toBe(`${onEmpty.y + 10}px`);
      expect(hint.style.border).toContain('1px solid');
    });

    it.each([
      ['a port', onPort],
      ['a card’s body', onCardBody],
      ['off the diagram', offStage],
    ])('is not shown over %s', (_name, point) => {
      const { root } = setup(point);
      expect(root.querySelector('span')).toBeNull();
    });
  });

  describe('following the pointer', () => {
    it('moves the loose end and re-evaluates the state on every move', () => {
      const { lines, dot, root, moveTo } = setup(onPort);
      expect(root.querySelector('span')).toBeNull();
      moveTo(onEmpty);
      expect(Number(lines()[1].getAttribute('x2'))).toBe(onEmpty.x);
      expect(Number(lines()[1].getAttribute('y2'))).toBe(onEmpty.y);
      expect(dot().getAttribute('cx')).toBe(String(onEmpty.x));
      expect(lines()[1]).toHaveAttribute('stroke', RIG_PALETTE.remove);
      expect(root.querySelector('span')).not.toBeNull();
      moveTo(onCardBody);
      expect(lines()[1]).toHaveAttribute('stroke', RIG_PALETTE.muted);
      expect(root.querySelector('span')).toBeNull();
      moveTo(onPort);
      expect(lines()[1]).toHaveAttribute('stroke', CABLE_COLOR);
    });

    it('keeps the anchor where it was', () => {
      const { lines, moveTo } = setup(onPort);
      moveTo(onEmpty);
      expect(Number(lines()[0].getAttribute('x1'))).toBe(ANCHOR.x);
      expect(Number(lines()[0].getAttribute('y1'))).toBe(ANCHOR.y);
    });

    it('stops listening when it unmounts', () => {
      const { unmount, listenerCount } = setup(onPort);
      expect(listenerCount()).toBe(1);
      unmount();
      expect(listenerCount()).toBe(0);
    });
  });
});

describe('WireDragOverlay with a custom removal rule', () => {
  it('shows the hint only where the rule says a release removes the cable', () => {
    const { store, moveTo } = makeStore({ x: 5, y: 5 });
    render(<WireDragOverlay layout={layout} anchor={ANCHOR} color={CABLE_COLOR} pointer={store} wouldRemove={() => false} />);
    moveTo(onEmpty); // empty canvas, but the rule says no
    expect(screen.queryByText('Release to remove the cable')).toBeNull();
  });

  it('follows the rule when it says yes, asking it with the pointer position', () => {
    const { store } = makeStore({ x: 5, y: 5 });
    const rule = vi.fn(() => true);
    render(<WireDragOverlay layout={layout} anchor={ANCHOR} color={CABLE_COLOR} pointer={store} wouldRemove={rule} />);
    expect(screen.getByText('Release to remove the cable')).toBeInTheDocument();
    expect(rule).toHaveBeenCalledWith({ x: 5, y: 5 });
  });
});
