import { describe, expect, it } from 'vitest';
import { columnsWhileDragging, dropMarker, dropSlotAt, dropTargetAt, isOverStage, isWithinStage, releaseRemoves } from './rigDrag';
import { GEO, computeRigLayout } from './rigRouting';
import { resolveNodes } from './rigData';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from './rigPresets';

const resolved = resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR);
const layout = computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables, 4);
const inCol = (c: number) => layout.nodes.filter((n) => n.col === c);
const colX = (c: number) => layout.colXs[c];
const mid = (c: number) => colX(c) + GEO.cardW / 2;

describe('dropSlotAt', () => {
  it('picks the column nearest the pointer', () => {
    for (let c = 0; c < layout.cols; c++) {
      expect(dropSlotAt(layout, 'x', mid(c) + 10, 0).col).toBe(c);
    }
    expect(dropSlotAt(layout, 'x', -500, 0).col).toBe(0);
    expect(dropSlotAt(layout, 'x', 99999, 0).col).toBe(layout.cols - 1);
  });

  it('counts the cards whose middle is above the pointer', () => {
    const [a, b, c] = inCol(0);
    expect(dropSlotAt(layout, 'x', mid(0), a.y - 5).index).toBe(0);
    expect(dropSlotAt(layout, 'x', mid(0), a.y + a.h / 2 + 1).index).toBe(1);
    expect(dropSlotAt(layout, 'x', mid(0), b.y + b.h / 2 + 1).index).toBe(2);
    expect(dropSlotAt(layout, 'x', mid(0), c.y + c.h + 500).index).toBe(3);
  });

  it('ignores the dragged card itself', () => {
    const [a, b] = inCol(0);
    // below everything: the other two cards, not three
    expect(dropSlotAt(layout, a.id, mid(0), 99999).index).toBe(2);
    // just below b's middle: only b is above, a is skipped
    expect(dropSlotAt(layout, a.id, mid(0), b.y + b.h / 2 + 1).index).toBe(1);
  });

  it('lands in an empty column at the top', () => {
    expect(dropSlotAt(layout, 'x', mid(3), 400)).toEqual({ col: 3, index: 0 });
  });
});

describe('dropMarker', () => {
  it('sits in the gap above the card that follows the slot', () => {
    const [a, b] = inCol(0);
    expect(dropMarker(layout, 'x', { col: 0, index: 1 })).toEqual({ x: colX(0), y: b.y - GEO.cardGap / 2, w: GEO.cardW });
    expect(dropMarker(layout, 'x', { col: 0, index: 0 }).y).toBe(a.y - GEO.cardGap / 2);
  });

  it('sits under the last card for the end slot', () => {
    const last = inCol(0).at(-1)!;
    expect(dropMarker(layout, 'x', { col: 0, index: 3 }).y).toBe(last.y + last.h + GEO.cardGap / 2);
  });

  it('skips the dragged card when placing the line', () => {
    const [a, b, c] = inCol(0);
    expect(dropMarker(layout, a.id, { col: 0, index: 0 }).y).toBe(b.y - GEO.cardGap / 2);
    expect(dropMarker(layout, c.id, { col: 0, index: 2 }).y).toBe(b.y + b.h + GEO.cardGap / 2);
  });

  it('uses the column top for an empty column', () => {
    expect(dropMarker(layout, 'x', { col: 3, index: 0 })).toEqual({ x: colX(3), y: layout.colTops[3], w: GEO.cardW });
  });
});

describe('layout with spare columns', () => {
  it('keeps empty columns up to minCols, never beyond four, and the default is unchanged', () => {
    const base = computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables);
    expect(base.cols).toBe(3);
    expect(computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables, 4).cols).toBe(4);
    expect(computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables, 99).cols).toBe(4);
    expect(computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables, 4).nodes.map((n) => n.y)).toEqual(base.nodes.map((n) => n.y));
  });

  it('exposes where each column starts', () => {
    expect(layout.colTops).toHaveLength(layout.cols);
    layout.colTops.forEach((top, c) => {
      const first = inCol(c)[0];
      if (first) expect(first.y).toBe(top);
    });
  });
});

describe('layout.colXs', () => {
  it('is the left edge of each column, one cardW + gutter apart', () => {
    expect(layout.colXs).toHaveLength(layout.cols);
    layout.colXs.forEach((x, c) => {
      expect(x).toBe(layout.gutters[c].x + layout.gutters[c].w);
      inCol(c).forEach((n) => expect(n.x).toBe(x));
    });
  });
});

describe('isOverStage', () => {
  it('is true on the diagram and a little beyond its edge, false further out', () => {
    expect(isOverStage(layout, 10, 10)).toBe(true);
    expect(isOverStage(layout, layout.width, layout.height)).toBe(true);
    expect(isOverStage(layout, -40, -40)).toBe(true);
    expect(isOverStage(layout, layout.width + 40, 0)).toBe(true);
    expect(isOverStage(layout, -200, 10)).toBe(false);
    expect(isOverStage(layout, 10, layout.height + 200)).toBe(false);
    expect(isOverStage(layout, layout.width + 200, 10)).toBe(false);
  });
});

describe('columnsWhileDragging', () => {
  it('is the used columns plus one spare (the layout caps it at four)', () => {
    expect(columnsWhileDragging([])).toBe(2);
    expect(columnsWhileDragging([{ col: 0 }])).toBe(2);
    expect(columnsWhileDragging(resolved)).toBe(4);
    expect(computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables, columnsWhileDragging(resolved)).cols).toBe(4);
    expect(computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables, columnsWhileDragging([{ col: 3 }])).cols).toBe(4);
  });
});

describe('dropTargetAt', () => {
  const [guitar] = inCol(0);
  const rowY = (i: number) => guitar.y + GEO.headerH + i * GEO.rowH + GEO.rowH / 2;

  it('finds the port row under the pointer', () => {
    expect(dropTargetAt(layout, guitar.x + 40, rowY(0))).toEqual({ kind: 'port', ref: { n: guitar.id, p: guitar.gear.ports[0].id } });
  });

  it('counts a pin, which sits half outside the card, as the port', () => {
    expect(dropTargetAt(layout, guitar.x + GEO.cardW + 8, rowY(0))).toMatchObject({ kind: 'port' });
    expect(dropTargetAt(layout, guitar.x - 8, rowY(0))).toMatchObject({ kind: 'port' });
  });

  it('is the card for its header, and for a row that does not exist', () => {
    expect(dropTargetAt(layout, guitar.x + 40, guitar.y + 10)).toEqual({ kind: 'card' });
    expect(dropTargetAt(layout, guitar.x + 40, guitar.y + guitar.h - 1 + 0)).toMatchObject({ kind: 'port' });
  });

  it('is empty in a gutter, above or below the cards, and beside the pin reach', () => {
    expect(dropTargetAt(layout, guitar.x + GEO.cardW + 40, rowY(0))).toEqual({ kind: 'empty' });
    expect(dropTargetAt(layout, guitar.x + 40, guitar.y - 10)).toEqual({ kind: 'empty' });
    expect(dropTargetAt(layout, guitar.x + 40, layout.height + 10)).toEqual({ kind: 'empty' });
  });

  it('resolves every port of every card to itself', () => {
    for (const p of layout.ports) {
      expect(dropTargetAt(layout, p.x, p.y)).toEqual({ kind: 'port', ref: { n: p.nodeId, p: p.portId } });
    }
  });
});

describe('removing a cable by letting its end go', () => {
  it('isWithinStage has no margin', () => {
    expect(isWithinStage(layout, 0, 0)).toBe(true);
    expect(isWithinStage(layout, layout.width, layout.height)).toBe(true);
    expect(isWithinStage(layout, -1, 10)).toBe(false);
    expect(isWithinStage(layout, 10, layout.height + 1)).toBe(false);
  });

  it('removes only on empty canvas on the diagram', () => {
    const [guitar] = inCol(0);
    expect(releaseRemoves(layout, layout.gutters[0].x + 2, layout.height / 2)).toBe(true);
    expect(releaseRemoves(layout, guitar.x + 40, guitar.y + 10)).toBe(false); // a card
    expect(releaseRemoves(layout, guitar.x + 40, guitar.y + GEO.headerH + 10)).toBe(false); // a port
    expect(releaseRemoves(layout, -20, 10)).toBe(false); // in the margin around the diagram
    expect(releaseRemoves(layout, 10, layout.height + 20)).toBe(false);
  });

  it('counts the whole grab area of a pin as the port', () => {
    const [guitar] = inCol(0);
    const pin = layout.ports.find((p) => p.nodeId === guitar.id)!;
    const reach = GEO.plugHit / 2;
    expect(dropTargetAt(layout, pin.x + reach, pin.y)).toMatchObject({ kind: 'port' });
    expect(dropTargetAt(layout, pin.x - reach, pin.y)).toMatchObject({ kind: 'port' });
  });
});
