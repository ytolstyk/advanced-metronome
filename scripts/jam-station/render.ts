// Standalone Jam Station page renderer (vanilla DOM). Bundled with esbuild by
// scripts/build-jam-station.mjs. Layout and routing come from src/rigRouting.ts, the same code the
// app uses, so the two can't drift; this file only draws. Text goes in via textContent, never innerHTML.

import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR, JAM_STATION_STAGE_TITLES } from '../../src/rigPresets';
import { GEO, arrowPoints, computeRigLayout } from '../../src/rigRouting';
import type { PlacedNode, PlacedPort, RoutedCable } from '../../src/rigRouting';
import { CONNECTOR_LABEL, GEAR_KIND_COLOR } from '../../src/rigUtils';
import type { CableKind, CableType } from '../../src/rigUtils';
import { describeCables } from '../../src/rigView';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TITLE_H = 32;
const PIN = 14;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const gearById = new Map(JAM_STATION_GEAR.map(g => [g.id, g]));
const resolved = JAM_STATION_DIAGRAM.nodes.map(n => ({ id: n.id, col: n.col, gear: gearById.get(n.gearId)! }));
const layout = computeRigLayout(resolved, JAM_STATION_DIAGRAM.cables);

const infoById = new Map(describeCables(JAM_STATION_DIAGRAM, JAM_STATION_GEAR).map((i) => [i.cable.id, i]));
const portColor = new Map<string, string>();
for (const c of layout.cables) {
  const color = infoById.get(c.id)!.kind.color;
  portColor.set(`${c.from.nodeId}:${c.from.portId}`, color);
  portColor.set(`${c.to.nodeId}:${c.to.portId}`, color);
}

let showPulses = true;
let activeFilter: CableType | null = null;

// ── cards ──────────────────────────────────────────────────────────────────

function renderCard(n: PlacedNode, ports: PlacedPort[]): HTMLElement {
  const tint = GEAR_KIND_COLOR[n.gear.kind];
  const card = el('div', 'absolute rounded-xl border bg-slate-900/95 shadow-xl');
  Object.assign(card.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px`, borderColor: `${tint}55` });

  const head = el('div', 'flex flex-col items-start px-3 pt-2 overflow-hidden');
  head.style.height = `${GEO.headerH}px`;
  const badge = el('span', 'block max-w-full truncate text-[10px] leading-4 font-mono font-bold uppercase px-1.5 rounded border', n.gear.kind);
  Object.assign(badge.style, { color: tint, borderColor: `${tint}55`, backgroundColor: `${tint}18` });
  head.append(badge);
  const name = el('div', 'w-full truncate text-sm leading-5 font-bold text-white', n.gear.name);
  name.title = n.gear.name;
  head.append(name);
  if (n.gear.specs) {
    const specs = el('div', 'w-full truncate text-[11px] leading-4 text-slate-400', n.gear.specs);
    specs.title = n.gear.specs;
    head.append(specs);
  }
  card.append(head);

  ports.forEach(p => {
    const port = n.gear.ports[p.index];
    const row = el('div', 'absolute left-0 right-0 flex items-center justify-between gap-2 border-t border-slate-800/80 px-3 font-mono text-[11px]');
    Object.assign(row.style, { top: `${GEO.headerH + p.index * GEO.rowH}px`, height: `${GEO.rowH}px` });
    const dirMark = port.dir === 'in' ? '▸ ' : port.dir === 'out' ? '◂ ' : '⇄ ';
    const label = el('span', 'truncate text-slate-200', `${dirMark}${port.label}`);
    const note = el('span', 'shrink-0 max-w-[45%] truncate text-slate-500', port.note ?? CONNECTOR_LABEL[port.connector]);
    row.title = `${port.label} · ${CONNECTOR_LABEL[port.connector]}${port.note ? ` · ${port.note}` : ''}`;
    row.append(label, note);
    const pin = el('div', 'absolute rounded-full');
    Object.assign(pin.style, {
      width: `${PIN}px`, height: `${PIN}px`, top: `${(GEO.rowH - PIN) / 2}px`,
      [p.side === 'L' ? 'left' : 'right']: `${-PIN / 2}px`,
      backgroundColor: portColor.get(`${n.id}:${port.id}`) ?? '#334155',
      border: '2px solid #070b14', boxShadow: '0 0 8px rgba(0,0,0,.8)',
    });
    row.append(pin);
    card.append(row);
  });
  return card;
}

// ── cables ─────────────────────────────────────────────────────────────────

function arrowhead(from: { x: number; y: number }, towards: { x: number; y: number }, color: string): SVGPolygonElement {
  return svg('polygon', { points: arrowPoints(from, towards), fill: color });
}

function renderCables(root: SVGSVGElement, chips: HTMLElement, schedule: HTMLElement): void {
  const bg = svg('g', {});
  const main = svg('g', {});
  const pulses = svg('g', {});
  root.replaceChildren(bg, main, pulses);
  chips.replaceChildren();
  schedule.replaceChildren();

  for (const c of layout.cables) {
    const info = infoById.get(c.id)!;
    const kind = info.kind;
    if (activeFilter && kind.type !== activeFilter) continue;
    bg.append(svg('path', { d: c.path, fill: 'none', stroke: '#070b14', 'stroke-width': 7, 'stroke-linecap': 'round' }));
    const line = svg('path', { d: c.path, fill: 'none', stroke: kind.color, 'stroke-width': 3.5, 'stroke-linecap': 'round', class: 'cable-line' });
    main.append(line);
    const pts = c.points;
    main.append(arrowhead(pts[pts.length - 2], pts[pts.length - 1], kind.color));
    if (kind.undirected) main.append(arrowhead(pts[1], pts[0], kind.color));
    if (showPulses) {
      pulses.append(svg('path', { d: c.path, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.7, 'stroke-width': 3.5, class: 'signal-pulse' }));
      if (kind.undirected) {
        pulses.append(svg('path', { d: c.path, fill: 'none', stroke: '#f3e8ff', 'stroke-opacity': 0.6, 'stroke-width': 3.5, class: 'signal-pulse signal-pulse-reverse' }));
      }
    }
    const { title, route } = info;
    if (c.chip) {
      const chip = el('div', 'absolute flex items-center justify-center rounded-full font-mono text-[11px] font-bold text-white cursor-default', String(c.n));
      Object.assign(chip.style, {
        left: `${c.chip.x - GEO.chipD / 2}px`, top: `${c.chip.y - GEO.chipD / 2}px`,
        width: `${GEO.chipD}px`, height: `${GEO.chipD}px`, backgroundColor: '#070b14', border: `2px solid ${kind.color}`,
      });
      chip.title = `${title}: ${route}`;
      chip.addEventListener('mouseenter', () => line.setAttribute('stroke-width', '5.5'));
      chip.addEventListener('mouseleave', () => line.setAttribute('stroke-width', '3.5'));
      chips.append(chip);
    }
    schedule.append(scheduleRow(c, kind, title, route));
  }
}

function scheduleRow(c: RoutedCable, kind: CableKind, title: string, route: string): HTMLElement {
  const row = el('li', 'flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2');
  const num = el('span', 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white', String(c.n));
  Object.assign(num.style, { backgroundColor: '#070b14', border: `2px solid ${kind.color}` });
  const body = el('div', 'min-w-0');
  body.append(el('div', 'text-xs font-semibold text-white', title));
  body.append(el('div', 'text-[11px] text-slate-400 break-words', route));
  if (kind.needsAdapter) body.append(el('div', 'text-[11px] font-mono text-amber-400', 'Needs an adapter'));
  row.append(num, body);
  return row;
}

// ── page ───────────────────────────────────────────────────────────────────

function init(): void {
  const stage = document.getElementById('stage')!;
  Object.assign(stage.style, { width: `${layout.width}px`, height: `${layout.height + TITLE_H}px` });

  const titles = el('div', 'absolute left-0 top-0');
  for (let c = 0; c < layout.cols; c++) {
    const x = layout.gutters[c].x + layout.gutters[c].w;
    const t = el('div', 'absolute truncate font-mono text-xs font-bold uppercase tracking-wider text-slate-400', `Stage ${c + 1}: ${JAM_STATION_STAGE_TITLES[c] ?? ''}`);
    Object.assign(t.style, { left: `${x}px`, top: '6px', width: `${GEO.cardW}px` });
    titles.append(t);
  }

  const diagram = el('div', 'absolute left-0');
  Object.assign(diagram.style, { top: `${TITLE_H}px`, width: `${layout.width}px`, height: `${layout.height}px` });
  const cards = el('div', 'absolute inset-0 z-20');
  for (const n of layout.nodes) cards.append(renderCard(n, layout.ports.filter(p => p.nodeId === n.id)));
  const svgRoot = svg('svg', { width: layout.width, height: layout.height, class: 'absolute inset-0 z-10 pointer-events-none' });
  const chips = el('div', 'absolute inset-0 z-30 pointer-events-none [&>*]:pointer-events-auto');
  diagram.append(svgRoot, cards, chips);
  stage.append(titles, diagram);

  const schedule = document.getElementById('schedule-list')!;
  const redraw = (): void => renderCables(svgRoot, chips, schedule);
  redraw();

  document.querySelectorAll<HTMLButtonElement>('[data-cable-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.cableFilter as CableType;
      activeFilter = activeFilter === type ? null : type;
      redraw();
    });
  });
  document.getElementById('btn-reset-view')!.addEventListener('click', () => { activeFilter = null; redraw(); });
  document.getElementById('btn-toggle-flow')!.addEventListener('click', e => {
    showPulses = !showPulses;
    (e.currentTarget as HTMLElement).classList.toggle('opacity-60', !showPulses);
    redraw();
  });

  const modal = document.getElementById('gain-modal')!;
  const setModal = (open: boolean): void => {
    modal.classList.toggle('hidden', !open);
  };
  document.getElementById('btn-gain-modal')!.addEventListener('click', () => setModal(true));
  document.getElementById('btn-close-modal')!.addEventListener('click', () => setModal(false));
  document.getElementById('btn-modal-done')!.addEventListener('click', () => setModal(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setModal(false); });
}

init();
