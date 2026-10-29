import { describe, expect, it } from 'vitest';
import { GEO, computeRigLayout } from './rigRouting';
import type { RigLayout, Seg } from './rigRouting';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from './rigPresets';
import { RIG_COLS, RIG_LIMITS } from './rigTypes';
import type { Connector, ResolvedNode, RigCable, RigGear, RigPort } from './rigTypes';
import { orderPorts } from './rigUtils';

// ── helpers ────────────────────────────────────────────────────────────────

/** Small deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const horizontal = (s: Seg): boolean => s.y1 === s.y2;
const lo = (a: number, b: number): number => Math.min(a, b);
const hi = (a: number, b: number): number => Math.max(a, b);

/** Does a segment pass through the open interior of a card? Touching the edge (a pin) doesn't count. */
function segmentHitsCard(s: Seg, c: { x: number; y: number; w: number; h: number }): boolean {
  if (horizontal(s)) {
    return s.y1 > c.y && s.y1 < c.y + c.h && lo(s.x1, s.x2) < c.x + c.w && hi(s.x1, s.x2) > c.x;
  }
  return s.x1 > c.x && s.x1 < c.x + c.w && lo(s.y1, s.y2) < c.y + c.h && hi(s.y1, s.y2) > c.y;
}

/** Distance from a point to an axis-aligned segment. */
function distanceToSegment(p: { x: number; y: number }, s: Seg): number {
  const dx = Math.max(lo(s.x1, s.x2) - p.x, 0, p.x - hi(s.x1, s.x2));
  const dy = Math.max(lo(s.y1, s.y2) - p.y, 0, p.y - hi(s.y1, s.y2));
  return Math.hypot(dx, dy);
}

function collinearOverlap(a: Seg, b: Seg): boolean {
  if (horizontal(a) !== horizontal(b)) return false;
  if (horizontal(a)) {
    return a.y1 === b.y1 && lo(a.x1, a.x2) < hi(b.x1, b.x2) && lo(b.x1, b.x2) < hi(a.x1, a.x2);
  }
  return a.x1 === b.x1 && lo(a.y1, a.y2) < hi(b.y1, b.y2) && lo(b.y1, b.y2) < hi(a.y1, a.y2);
}

/** The invariants the plan promises; used for the example and for random diagrams. */
function expectCleanLayout(layout: RigLayout): void {
  for (const c of layout.cables) {
    for (const s of c.segments) {
      expect(s.x1 === s.x2 || s.y1 === s.y2).toBe(true);
      for (const n of layout.nodes) expect(segmentHitsCard(s, n)).toBe(false);
    }
  }
  for (let i = 0; i < layout.cables.length; i++) {
    for (let j = i + 1; j < layout.cables.length; j++) {
      for (const a of layout.cables[i].segments) {
        for (const b of layout.cables[j].segments) expect(collinearOverlap(a, b)).toBe(false);
      }
    }
  }
  // pins sit on card edges
  for (const p of layout.ports) {
    const n = layout.nodes.find(x => x.id === p.nodeId)!;
    expect(p.x).toBe(p.side === 'L' ? n.x : n.x + n.w);
  }
  // pin y differs across columns
  const yByCol = new Map<number, Set<number>>();
  for (const p of layout.ports) {
    const col = layout.nodes.find(x => x.id === p.nodeId)!.col;
    if (!yByCol.has(col)) yByCol.set(col, new Set());
    yByCol.get(col)!.add(p.y);
  }
  const cols = [...yByCol.keys()];
  for (const a of cols) {
    for (const b of cols) {
      if (a >= b) continue;
      for (const y of yByCol.get(a)!) expect(yByCol.get(b)!.has(y)).toBe(false);
    }
  }
  // placed chips stay off cards and each other
  const chips = layout.cables.flatMap(c => (c.chip ? [c.chip] : []));
  const r = GEO.chipD / 2;
  for (const c of layout.cables) {
    if (!c.chip) continue;
    // the chip sits on its own cable, and its whole disc stays inside the drawing
    expect(Math.min(...c.segments.map(s => distanceToSegment(c.chip!, s)))).toBeLessThanOrEqual(1);
    expect(c.chip.x - r).toBeGreaterThanOrEqual(0);
    expect(c.chip.x + r).toBeLessThanOrEqual(layout.width);
    expect(c.chip.y - r).toBeGreaterThanOrEqual(0);
    expect(c.chip.y + r).toBeLessThanOrEqual(layout.height);
  }
  for (const chip of chips) {
    for (const n of layout.nodes) {
      const hit = chip.x + r > n.x && chip.x - r < n.x + n.w && chip.y + r > n.y && chip.y - r < n.y + n.h;
      expect(hit).toBe(false);
    }
  }
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      expect(Math.hypot(chips[i].x - chips[j].x, chips[i].y - chips[j].y)).toBeGreaterThanOrEqual(GEO.chipD);
    }
  }
}

function resolve(diagram = JAM_STATION_DIAGRAM, gear = JAM_STATION_GEAR): ResolvedNode[] {
  const byId = new Map(gear.map(g => [g.id, g]));
  return diagram.nodes.map(n => ({ id: n.id, col: n.col, gear: byId.get(n.gearId)! }));
}

const CONNECTORS_FOR_FUZZ: Connector[] = ['ts', 'trs', 'xlr', 'combo', 'usb', 'midi'];

function randomDiagram(rand: () => number, maxNodes: number, maxPorts: number): { nodes: ResolvedNode[]; cables: RigCable[] } {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const nodeCount = 1 + Math.floor(rand() * maxNodes);
  const nodes: ResolvedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const portCount = 1 + Math.floor(rand() * maxPorts);
    const ports: RigPort[] = [];
    for (let p = 0; p < portCount; p++) {
      ports.push({ id: `p${p}`, label: `P${p}`, dir: pick(['in', 'out', 'io'] as const), connector: pick(CONNECTORS_FOR_FUZZ) });
    }
    const gear: RigGear = { id: `g${i}`, name: `Gear ${i}`, kind: 'other', ports };
    nodes.push({ id: `n${i}`, col: Math.floor(rand() * 4), gear });
  }
  // free ports, then pair random compatible ones (one cable per port)
  const free = nodes.flatMap(n => n.gear.ports.map(p => ({ n: n.id, p: p.id, dir: p.dir })));
  const cables: RigCable[] = [];
  for (let attempt = 0; attempt < 200 && cables.length < RIG_LIMITS.cablesMax; attempt++) {
    if (free.length < 2) break;
    const ia = Math.floor(rand() * free.length);
    const ib = Math.floor(rand() * free.length);
    if (ia === ib || free[ia].n === free[ib].n) continue;
    const ordered = orderPorts(free[ia], free[ib]);
    if (!ordered) continue;
    cables.push({ id: `c${cables.length}`, from: { n: ordered[0].n, p: ordered[0].p }, to: { n: ordered[1].n, p: ordered[1].p } });
    free.splice(Math.max(ia, ib), 1);
    free.splice(Math.min(ia, ib), 1);
  }
  return { nodes, cables };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('computeRigLayout: Jam Station example', () => {
  const layout = computeRigLayout(resolve(), JAM_STATION_DIAGRAM.cables);

  it('routes every cable and keeps all invariants', () => {
    expect(layout.cables).toHaveLength(5);
    expectCleanLayout(layout);
  });

  it('uses 3 columns and all cables are single-gutter Z shapes', () => {
    expect(layout.cols).toBe(3);
    expect(layout.cables.every(c => c.shape === 'z')).toBe(true);
  });

  it('puts outputs on the right edge and inputs on the left', () => {
    for (const c of layout.cables) {
      expect(c.from.side).toBe('R');
      expect(c.to.side).toBe('L');
    }
  });

  it('places a chip for each cable', () => {
    expect(layout.cables.every(c => c.chip !== null)).toBe(true);
  });

  it('numbers cables in input order', () => {
    expect(layout.cables.map(c => c.n)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('layout constants', () => {
  it('keep the pin-y guarantee: everything vertical is a multiple of the grid, and the column shifts stay inside one grid cell', () => {
    expect(GEO.headerH % GEO.grid).toBe(0);
    // every card height (header + n rows) must be a grid multiple, whatever n is
    expect(GEO.rowH % GEO.grid).toBe(0);
    expect(GEO.cardGap % GEO.grid).toBe(0);
    expect(GEO.colShift * (RIG_COLS - 1)).toBeLessThan(GEO.grid);
    expect(GEO.colShift).toBeGreaterThan(0);
  });

  it('the gutter padding leaves room for the stub chip and its radius', () => {
    expect(GEO.gutterPad).toBeGreaterThanOrEqual(GEO.chipStubInset + GEO.chipD / 2 + 4);
    expect(GEO.lanePitch).toBeGreaterThanOrEqual(GEO.chipD + 2);
  });
});

describe('computeRigLayout: geometry rules', () => {
  const port = (id: string, dir: RigPort['dir']): RigPort => ({ id, label: id, dir, connector: 'trs' });
  const gear = (id: string, ports: RigPort[]): RigGear => ({ id, name: id, kind: 'other', ports });

  it('makes card heights and gaps multiples of 32 and shifts columns by 8px each', () => {
    const nodes: ResolvedNode[] = [0, 1, 2, 3].map(c => ({ id: `n${c}`, col: c, gear: gear(`g${c}`, [port('a', 'out'), port('b', 'in')]) }));
    const layout = computeRigLayout(nodes, []);
    const tops = layout.nodes.map(n => n.y);
    expect(tops.map((y, c) => y - c * GEO.colShift)).toEqual([tops[0], tops[0], tops[0], tops[0]]);
    expect(tops[0] % GEO.grid).toBe(0);
    for (const n of layout.nodes) expect(n.h % GEO.grid).toBe(0);
  });

  it('routes a column-skipping cable through the top channel', () => {
    const nodes: ResolvedNode[] = [
      { id: 'a', col: 0, gear: gear('ga', [port('o', 'out')]) },
      { id: 'b', col: 1, gear: gear('gb', [port('i', 'in'), port('o', 'out')]) },
      { id: 'c', col: 2, gear: gear('gc', [port('i', 'in')]) },
    ];
    const cables: RigCable[] = [{ id: 'cab1', from: { n: 'a', p: 'o' }, to: { n: 'c', p: 'i' } }];
    const layout = computeRigLayout(nodes, cables);
    expect(layout.cables[0].shape).toBe('channel');
    const topOfCards = Math.min(...layout.nodes.map(n => n.y));
    const channelY = Math.min(...layout.cables[0].points.map(p => p.y));
    expect(channelY).toBeLessThan(topOfCards - 16);
    expectCleanLayout(layout);
  });

  it('routes same-column and backward cables without touching cards', () => {
    const nodes: ResolvedNode[] = [
      { id: 'a', col: 1, gear: gear('ga', [port('o', 'out'), port('i', 'in')]) },
      { id: 'b', col: 1, gear: gear('gb', [port('i', 'in'), port('o', 'out')]) },
      { id: 'c', col: 0, gear: gear('gc', [port('i', 'in')]) },
    ];
    const cables: RigCable[] = [
      { id: 'cab1', from: { n: 'a', p: 'o' }, to: { n: 'b', p: 'i' } },
      { id: 'cab2', from: { n: 'b', p: 'o' }, to: { n: 'c', p: 'i' } },
    ];
    const layout = computeRigLayout(nodes, cables);
    expect(layout.cables.every(c => c.shape === 'channel')).toBe(true);
    expectCleanLayout(layout);
  });

  it('puts an io pin on the left when its peer is in a lower column, else on the right', () => {
    const io: RigPort = { id: 'u', label: 'USB', dir: 'io', connector: 'usb' };
    const nodes: ResolvedNode[] = [
      { id: 'a', col: 0, gear: gear('ga', [io]) },
      { id: 'b', col: 2, gear: gear('gb', [io]) },
    ];
    const layout = computeRigLayout(nodes, [{ id: 'cab1', from: { n: 'a', p: 'u' }, to: { n: 'b', p: 'u' } }]);
    expect(layout.cables[0].from.side).toBe('R');
    expect(layout.cables[0].to.side).toBe('L');
  });

  it('handles swapped pairs between two adjacent cards (no lane order can fix collinear stubs, the stagger does)', () => {
    const nodes: ResolvedNode[] = [
      { id: 'a', col: 0, gear: gear('ga', [port('o1', 'out'), port('o2', 'out'), port('o3', 'out'), port('o4', 'out')]) },
      { id: 'b', col: 1, gear: gear('gb', [port('i1', 'in'), port('i2', 'in'), port('i3', 'in'), port('i4', 'in')]) },
    ];
    const cables: RigCable[] = [
      { id: 'cab1', from: { n: 'a', p: 'o1' }, to: { n: 'b', p: 'i4' } },
      { id: 'cab2', from: { n: 'a', p: 'o4' }, to: { n: 'b', p: 'i1' } },
      { id: 'cab3', from: { n: 'a', p: 'o2' }, to: { n: 'b', p: 'i3' } },
      { id: 'cab4', from: { n: 'a', p: 'o3' }, to: { n: 'b', p: 'i2' } },
    ];
    expectCleanLayout(computeRigLayout(nodes, cables));
  });

  it('skips cables whose node or port is missing instead of throwing', () => {
    const nodes: ResolvedNode[] = [{ id: 'a', col: 0, gear: gear('ga', [port('o', 'out')]) }];
    const layout = computeRigLayout(nodes, [
      { id: 'cab1', from: { n: 'a', p: 'o' }, to: { n: 'zz', p: 'i' } },
      { id: 'cab2', from: { n: 'a', p: 'nope' }, to: { n: 'a', p: 'o' } },
    ]);
    expect(layout.cables).toHaveLength(0);
  });

  it('clamps an out-of-range col and handles an empty diagram', () => {
    expect(computeRigLayout([], []).nodes).toHaveLength(0);
    const nodes: ResolvedNode[] = [{ id: 'a', col: 99, gear: gear('ga', [port('o', 'out')]) }];
    const layout = computeRigLayout(nodes, []);
    expect(layout.nodes[0].col).toBe(3);
  });
});

describe('computeRigLayout: random diagrams', () => {
  it('never crosses a card, overlaps collinearly, or collides chips (400 seeded diagrams)', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rand = mulberry32(seed);
      const { nodes, cables } = randomDiagram(rand, 8, 6);
      expectCleanLayout(computeRigLayout(nodes, cables));
    }
  });

  it('holds at the size limits', () => {
    for (let seed = 1000; seed < 1040; seed++) {
      const rand = mulberry32(seed);
      const { nodes, cables } = randomDiagram(rand, RIG_LIMITS.nodesMax, RIG_LIMITS.portsPerGearMax);
      expectCleanLayout(computeRigLayout(nodes.slice(0, RIG_LIMITS.nodesMax), cables));
    }
  });
});
