// Rig diagram layout and cable routing. Pure geometry: no DOM measuring, no React.
//
// Why cables can never cross a card: cards sit only in columns; cables run only in the 5 gutters
// between/around columns and in one channel above every card. Every pin is on a card's outer edge
// and every cable is built from a stub into the adjacent gutter, a vertical run on its own lane
// (unique x) and, when its two ends use different gutters, one horizontal run on its own channel row
// (unique y). Column `c` is also shifted down by colShift*c px while card heights/gaps are multiples of the grid,
// so pins in different columns never share a y and two stubs can't overlap collinearly in a gutter.
//
// The standalone Jam Station page bundles this file; it may import only ./rigTypes (the build script checks).

import type { ResolvedNode, RigCable, RigGear, RigPort } from './rigTypes';
import { RIG_COLS } from './rigTypes';

export const GEO = {
  /**
   * The vertical grid. Header, row and gap heights are multiples of it, so every pin in a column sits
   * at the same offset within a grid cell; `colShift` then moves each column to its own offset (it
   * must stay below `grid / (columns - 1)`, which the routing tests assert).
   */
  grid: 32,
  cardW: 280,
  headerH: 64,
  rowH: 32,
  cardGap: 32,
  /** Column c is shifted down by colShift * c. */
  colShift: 8,
  lanePitch: 22,
  /** Clear space on each side of a gutter's lanes (>= stub-chip inset + chip radius + 4). */
  gutterPad: 36,
  channelPitch: 22,
  chipD: 20,
  /** A Z cable whose vertical run is shorter than this puts its chip on the source stub instead. */
  minRunForChip: 28,
  chipStubInset: 22,
  cornerR: 8,
  bottomPad: 32,
} as const;

export interface Pt {
  x: number;
  y: number;
}

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlacedNode {
  id: string;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  gear: RigGear;
}

export interface PlacedPort {
  nodeId: string;
  portId: string;
  index: number;
  side: 'L' | 'R';
  /** Pin centre: exactly on the card's outer edge. */
  x: number;
  y: number;
}

export interface RoutedCable {
  id: string;
  /** 1-based number shown on the chip and in the cable schedule. */
  n: number;
  cable: RigCable;
  from: PlacedPort;
  to: PlacedPort;
  shape: 'z' | 'channel';
  points: Pt[];
  segments: Seg[];
  /** SVG path with rounded corners. */
  path: string;
  /** Null when no clear spot was found; the Cable schedule still lists the cable. */
  chip: Pt | null;
}

export interface RigLayout {
  width: number;
  height: number;
  cols: number;
  nodes: PlacedNode[];
  ports: PlacedPort[];
  cables: RoutedCable[];
  /** Gutter i lies left of column i; x/width in diagram pixels. */
  gutters: { x: number; w: number }[];
}

const ceilToGrid = (v: number): number => Math.ceil(v / GEO.grid) * GEO.grid;

interface End {
  node: ResolvedNode;
  port: RigPort;
  index: number;
  side: 'L' | 'R';
  gutter: number;
}

function sideFor(port: RigPort, ownCol: number, peerCol: number | null): 'L' | 'R' {
  if (port.dir === 'in') return 'L';
  if (port.dir === 'out') return 'R';
  // io: faces the peer when the peer is strictly to the left, right otherwise (and when unconnected).
  return peerCol !== null && peerCol < ownCol ? 'L' : 'R';
}

interface VSeg {
  gutter: number;
  cableIdx: number;
  /** Which end of the cable this vertical run serves ('s' source/from, 'd' destination/to). */
  end: 's' | 'd';
  pinY: number;
  farY: number;
}

/** Lane order is a crossing-reduction heuristic only; correctness never depends on it. */
function orderLanes(segs: VSeg[]): VSeg[] {
  const down = segs.filter(s => s.farY > s.pinY).sort((a, b) => b.pinY - a.pinY || a.cableIdx - b.cableIdx);
  const up = segs.filter(s => s.farY <= s.pinY).sort((a, b) => a.pinY - b.pinY || a.cableIdx - b.cableIdx);
  return [...down, ...up];
}

function dedupe(points: Pt[]): Pt[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

function toSegments(points: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < points.length; i++) {
    out.push({ x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y });
  }
  return out;
}

function roundedPath(points: Pt[], r: number): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rad = Math.min(r, lenIn / 2, lenOut / 2);
    const ax = cur.x - ((cur.x - prev.x) / lenIn) * rad;
    const ay = cur.y - ((cur.y - prev.y) / lenIn) * rad;
    const bx = cur.x + ((next.x - cur.x) / lenOut) * rad;
    const by = cur.y + ((next.y - cur.y) / lenOut) * rad;
    d += ` L ${ax} ${ay} Q ${cur.x} ${cur.y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function chipHitsCard(p: Pt, nodes: PlacedNode[]): boolean {
  const r = GEO.chipD / 2;
  return nodes.some(n => p.x + r > n.x && p.x - r < n.x + n.w && p.y + r > n.y && p.y - r < n.y + n.h);
}

function chipHitsChip(p: Pt, placed: Pt[]): boolean {
  return placed.some(q => Math.hypot(p.x - q.x, p.y - q.y) < GEO.chipD + 2);
}

/** First clear spot at `base`, nudging along (dx, dy) in small steps, or null. */
function placeChip(base: Pt, along: Pt, nodes: PlacedNode[], placed: Pt[]): Pt | null {
  for (const step of [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36]) {
    const p = { x: base.x + along.x * step, y: base.y + along.y * step };
    if (!chipHitsCard(p, nodes) && !chipHitsChip(p, placed)) return p;
  }
  return null;
}

/** The arrowhead polygon (an SVG `points` string) for a cable end: tip just outside the pin, pointing from `from` towards `towards`. */
export function arrowPoints(from: Pt, towards: Pt): string {
  const len = Math.hypot(towards.x - from.x, towards.y - from.y) || 1;
  const dx = (towards.x - from.x) / len;
  const dy = (towards.y - from.y) / len;
  const tip = { x: towards.x - dx * 8, y: towards.y - dy * 8 };
  const base = { x: tip.x - dx * 9, y: tip.y - dy * 9 };
  return [tip, { x: base.x - dy * 5, y: base.y + dx * 5 }, { x: base.x + dy * 5, y: base.y - dx * 5 }]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

/**
 * Lay out `nodes` (array order = order within a column) and route `cables` (assumed valid: ports
 * exist, `from` is the output side). Cables with a missing node or port are skipped.
 */
export function computeRigLayout(nodes: ResolvedNode[], cables: RigCable[]): RigLayout {
  const cols = Math.min(RIG_COLS, Math.max(1, ...nodes.map(n => Math.floor(n.col) + 1)));
  const colOf = (n: ResolvedNode): number => Math.min(cols - 1, Math.max(0, Math.floor(n.col)));
  const byId = new Map(nodes.map(n => [n.id, n]));

  // 1. Resolve each cable's two ends: pin side and the gutter the stub runs into.
  const resolved: { cable: RigCable; idx: number; s: End; d: End }[] = [];
  cables.forEach((cable, idx) => {
    const sn = byId.get(cable.from.n);
    const dn = byId.get(cable.to.n);
    if (!sn || !dn) return;
    const si = sn.gear.ports.findIndex(p => p.id === cable.from.p);
    const di = dn.gear.ports.findIndex(p => p.id === cable.to.p);
    if (si < 0 || di < 0) return;
    const sp = sn.gear.ports[si];
    const dp = dn.gear.ports[di];
    const sSide = sideFor(sp, colOf(sn), colOf(dn));
    const dSide = sideFor(dp, colOf(dn), colOf(sn));
    resolved.push({
      cable,
      idx,
      s: { node: sn, port: sp, index: si, side: sSide, gutter: colOf(sn) + (sSide === 'R' ? 1 : 0) },
      d: { node: dn, port: dp, index: di, side: dSide, gutter: colOf(dn) + (dSide === 'R' ? 1 : 0) },
    });
  });

  // 2. Vertical placement. The channel (one row per cable that spans two gutters) sits above all cards.
  const channelCables = resolved.filter(r => r.s.gutter !== r.d.gutter);
  const channelRowY = new Map<number, number>();
  channelCables.forEach((r, k) => channelRowY.set(r.idx, 14 + k * GEO.channelPitch));
  const channelH = channelCables.length > 0 ? channelCables.length * GEO.channelPitch + 6 : 0;
  // A multiple of the grid so pin y in column c is congruent to rowH/2 + colShift*c (mod grid): distinct per column.
  const topBase = Math.max(GEO.grid, ceilToGrid(channelH + 16));

  const placedNodes: PlacedNode[] = [];
  const cursor: number[] = Array.from({ length: cols }, (_, c) => topBase + GEO.colShift * c);
  for (const n of nodes) {
    const c = colOf(n);
    const h = GEO.headerH + n.gear.ports.length * GEO.rowH;
    placedNodes.push({ id: n.id, col: c, x: 0, y: cursor[c], w: GEO.cardW, h, gear: n.gear });
    cursor[c] += h + GEO.cardGap;
  }
  const pinY = (pn: PlacedNode, index: number): number => pn.y + GEO.headerH + index * GEO.rowH + GEO.rowH / 2;
  const placedById = new Map(placedNodes.map(p => [p.id, p]));

  // 3. Vertical runs per gutter, ordered into lanes.
  const vsegs: VSeg[] = [];
  for (const r of resolved) {
    const sy = pinY(placedById.get(r.s.node.id)!, r.s.index);
    const dy = pinY(placedById.get(r.d.node.id)!, r.d.index);
    if (r.s.gutter === r.d.gutter) {
      vsegs.push({ gutter: r.s.gutter, cableIdx: r.idx, end: 's', pinY: sy, farY: dy });
    } else {
      const cy = channelRowY.get(r.idx)!;
      vsegs.push({ gutter: r.s.gutter, cableIdx: r.idx, end: 's', pinY: sy, farY: cy });
      vsegs.push({ gutter: r.d.gutter, cableIdx: r.idx, end: 'd', pinY: dy, farY: cy });
    }
  }
  const laneIndex = new Map<string, number>();
  const laneCount: number[] = Array.from({ length: cols + 1 }, () => 0);
  for (let g = 0; g <= cols; g++) {
    const inGutter = orderLanes(vsegs.filter(v => v.gutter === g));
    inGutter.forEach((v, i) => laneIndex.set(`${v.cableIdx}:${v.end}`, i));
    laneCount[g] = inGutter.length;
  }

  // 4. Horizontal placement from the gutter widths.
  const gutterW = laneCount.map(n => 2 * GEO.gutterPad + n * GEO.lanePitch);
  const gutterX: number[] = [0];
  const colX: number[] = [];
  for (let c = 0; c < cols; c++) {
    colX[c] = gutterX[c] + gutterW[c];
    gutterX[c + 1] = colX[c] + GEO.cardW;
  }
  for (const pn of placedNodes) pn.x = colX[pn.col];
  const width = gutterX[cols] + gutterW[cols];
  const laneX = (g: number, i: number): number => gutterX[g] + GEO.gutterPad + GEO.lanePitch / 2 + i * GEO.lanePitch;

  // 5. Ports (all of them, for rendering) and routes.
  const sideOfPort = new Map<string, 'L' | 'R'>();
  for (const r of resolved) {
    sideOfPort.set(`${r.s.node.id}:${r.s.port.id}`, r.s.side);
    sideOfPort.set(`${r.d.node.id}:${r.d.port.id}`, r.d.side);
  }
  const ports: PlacedPort[] = [];
  const portAt = new Map<string, PlacedPort>();
  for (const pn of placedNodes) {
    pn.gear.ports.forEach((port, index) => {
      const side = sideOfPort.get(`${pn.id}:${port.id}`) ?? sideFor(port, pn.col, null);
      const pp: PlacedPort = {
        nodeId: pn.id,
        portId: port.id,
        index,
        side,
        x: side === 'L' ? pn.x : pn.x + pn.w,
        y: pinY(pn, index),
      };
      ports.push(pp);
      portAt.set(`${pn.id}:${port.id}`, pp);
    });
  }

  const routed: RoutedCable[] = [];
  const placedChips: Pt[] = [];
  for (const r of resolved) {
    const from = portAt.get(`${r.s.node.id}:${r.s.port.id}`)!;
    const to = portAt.get(`${r.d.node.id}:${r.d.port.id}`)!;
    const lx = laneX(r.s.gutter, laneIndex.get(`${r.idx}:s`)!);
    let points: Pt[];
    let shape: 'z' | 'channel';
    let chip: Pt | null;
    if (r.s.gutter === r.d.gutter) {
      shape = 'z';
      points = dedupe([{ x: from.x, y: from.y }, { x: lx, y: from.y }, { x: lx, y: to.y }, { x: to.x, y: to.y }]);
      const run = Math.abs(to.y - from.y);
      if (run >= GEO.minRunForChip) {
        chip = placeChip({ x: lx, y: (from.y + to.y) / 2 }, { x: 0, y: 1 }, placedNodes, placedChips);
      } else {
        const dir = from.side === 'R' ? 1 : -1;
        chip = placeChip({ x: from.x + dir * GEO.chipStubInset, y: from.y }, { x: dir, y: 0 }, placedNodes, placedChips);
      }
    } else {
      shape = 'channel';
      const dx = laneX(r.d.gutter, laneIndex.get(`${r.idx}:d`)!);
      const cy = channelRowY.get(r.idx)!;
      points = dedupe([
        { x: from.x, y: from.y }, { x: lx, y: from.y }, { x: lx, y: cy },
        { x: dx, y: cy }, { x: dx, y: to.y }, { x: to.x, y: to.y },
      ]);
      const dir = dx >= lx ? 1 : -1;
      chip = placeChip({ x: lx + dir * 20, y: cy }, { x: dir, y: 0 }, placedNodes, placedChips);
    }
    if (chip) placedChips.push(chip);
    routed.push({
      id: r.cable.id,
      n: r.idx + 1,
      cable: r.cable,
      from,
      to,
      shape,
      points,
      segments: toSegments(points),
      path: roundedPath(points, GEO.cornerR),
      chip,
    });
  }

  const bottom = Math.max(topBase, ...cursor.map(c => c - GEO.cardGap));
  return {
    width,
    height: bottom + GEO.bottomPad,
    cols,
    nodes: placedNodes,
    ports,
    cables: routed,
    gutters: gutterX.slice(0, cols + 1).map((x, i) => ({ x, w: gutterW[i] })),
  };
}
