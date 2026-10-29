import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import type { Point, PointerStore } from '../../../hooks/usePointerDrag';
import { dropMarker, dropSlotAt } from '../../../rigDrag';
import { resolveNodes } from '../../../rigData';
import { GEO, computeRigLayout } from '../../../rigRouting';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../../../rigPresets';
import { CardDragOverlay } from './CardDragOverlay';

// Four columns, as while dragging: three used and the spare one on the right.
const layout = computeRigLayout(resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR), JAM_STATION_DIAGRAM.cables, 4);
const nodeOf = (id: string) => layout.nodes.find((n) => n.id === id)!;
const OFFSET = { offsetX: 12, offsetY: 20 };

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
  };
}

function setup(nodeId: string, start: Point) {
  const pointer = makeStore(start);
  const node = nodeOf(nodeId);
  const view = render(<CardDragOverlay layout={layout} node={node} drag={{ payload: nodeId, ...OFFSET }} pointer={pointer.store} />);
  const root = view.container.firstElementChild as HTMLElement;
  const ghost = () => root.querySelector<HTMLElement>('.shadow-xl')!;
  const marker = () => root.querySelector<HTMLElement>('.bg-primary');
  const placeholders = () => Array.from(root.querySelectorAll<HTMLElement>('.border-dashed'));
  return { ...pointer, ...view, root, ghost, marker, placeholders, node };
}

const inColumn = (c: number, y: number) => ({ x: layout.colXs[c] + GEO.cardW / 2, y });

describe('CardDragOverlay', () => {
  it('is decoration only: hidden from assistive tech and out of the way of the pointer', () => {
    const { root } = setup('nguitar', inColumn(0, 100));
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.className).toContain('pointer-events-none');
  });

  it('shows the ghost with the gear name and kind', () => {
    const { ghost } = setup('nguitar', inColumn(0, 100));
    expect(ghost()).toHaveTextContent('Electric Guitar');
    expect(ghost()).toHaveTextContent('guitar');
    expect(ghost().style.width).toBe(`${GEO.cardW}px`);
    expect(ghost().style.height).toBe(`${GEO.headerH}px`);
  });

  it('puts the ghost where the card was grabbed: the pointer minus the grab offset', () => {
    const at = inColumn(1, 300);
    const { ghost } = setup('nguitar', at);
    expect(ghost().style.transform).toBe(`translate3d(${at.x - OFFSET.offsetX}px, ${at.y - OFFSET.offsetY}px, 0)`);
  });

  it('keeps the ghost inside the stage vertically, so it never adds scroll room', () => {
    const above = setup('nguitar', inColumn(0, -200));
    expect(above.ghost().style.transform).toContain(', 0px, 0)');
    above.unmount();
    const below = setup('nguitar', inColumn(0, layout.height + 500));
    expect(below.ghost().style.transform).toContain(`, ${layout.height - GEO.headerH}px, 0)`);
  });

  describe('the drop line', () => {
    it('sits where the card would land, as the layout says', () => {
      const at = inColumn(1, nodeOf('nscarlet').y + nodeOf('nscarlet').h + 40);
      const { marker } = setup('nguitar', at);
      const expected = dropMarker(layout, 'nguitar', dropSlotAt(layout, 'nguitar', at.x, at.y));
      expect(marker()!.style.left).toBe(`${expected.x}px`);
      expect(marker()!.style.width).toBe(`${expected.w}px`);
      expect(Number.parseFloat(marker()!.style.top)).toBe(expected.y - 2);
    });

    it('follows the pointer from one column to another', () => {
      const { marker, moveTo } = setup('nguitar', inColumn(1, 100));
      expect(marker()!.style.left).toBe(`${layout.colXs[1]}px`);
      moveTo(inColumn(3, 100));
      expect(marker()!.style.left).toBe(`${layout.colXs[3]}px`);
    });

    it('is hidden once the pointer is well away from the diagram, where letting go cancels', () => {
      const { marker, ghost, moveTo } = setup('nguitar', inColumn(0, 100));
      expect(marker()).not.toBeNull();
      expect(ghost().className).toContain('border-primary');
      moveTo({ x: layout.width + 500, y: 100 });
      expect(marker()).toBeNull();
      expect(ghost().className).toContain('opacity-60');
      expect(ghost().className).not.toContain('border-primary');
      moveTo(inColumn(0, 100));
      expect(marker()).not.toBeNull();
    });
  });

  describe('empty columns', () => {
    it('outlines the spare column, and a column the card would leave empty', () => {
      // the interface is alone in its column: lifting it leaves that column empty too
      const { placeholders } = setup('nscarlet', inColumn(1, 100));
      const lefts = placeholders().map((p) => p.style.left);
      expect(lefts).toEqual([`${layout.colXs[1]}px`, `${layout.colXs[3]}px`]);
    });

    it('does not outline a column that has other cards', () => {
      const { placeholders } = setup('nguitar', inColumn(0, 100));
      const lefts = placeholders().map((p) => p.style.left);
      expect(lefts).toEqual([`${layout.colXs[3]}px`]);
    });

    it('sizes each outline like a header, at the top of its column', () => {
      const { placeholders } = setup('nguitar', inColumn(0, 100));
      const [spare] = placeholders();
      expect(spare.style.width).toBe(`${GEO.cardW}px`);
      expect(spare.style.height).toBe(`${GEO.headerH}px`);
      expect(spare.style.top).toBe(`${layout.colTops[3]}px`);
    });
  });
});
