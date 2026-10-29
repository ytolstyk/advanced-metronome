import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CONNECTOR_LABEL, GEAR_KIND_COLOR, orderPorts } from '../../../rigUtils';
import { GEO, arrowPoints, computeRigLayout } from '../../../rigRouting';
import type { PlacedNode, PlacedPort } from '../../../rigRouting';
import { resolveNodes } from '../../../rigData';
import { describeCables, describePort } from '../../../rigView';
import type { RigDiagram, RigGear } from '../../../rigTypes';
import type { PortRef } from '../../../rigEdit';

const TITLE_H = 28;
const PIN = 14;

const DIR_MARK = { in: '▸', out: '◂', io: '⇄' } as const;

interface RigCanvasProps {
  diagram: RigDiagram;
  /** The gear this diagram's nodes refer to (its owner's gear list). */
  gear: readonly RigGear[];
  /** Ports, node headers and cable chips become buttons. */
  editable: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  selectedCableId: string | null;
  onSelectCable: (id: string | null) => void;
  /** The output the person started a connection from, if any. */
  connectFrom: PortRef | null;
  onPortClick: (ref: PortRef) => void;
}

/**
 * A rig diagram: cards in columns, cables in the gutters between them. Geometry comes from
 * `computeRigLayout`, so a cable can never cross a card; this component only draws it.
 */
export function RigCanvas({
  diagram,
  gear,
  editable,
  selectedNodeId,
  onSelectNode,
  selectedCableId,
  onSelectCable,
  connectFrom,
  onPortClick,
}: RigCanvasProps) {
  const layout = useMemo(() => computeRigLayout(resolveNodes(diagram, gear), diagram.cables), [diagram, gear]);
  const infos = useMemo(() => describeCables(diagram, gear), [diagram, gear]);
  const infoById = useMemo(() => new Map(infos.map((i) => [i.cable.id, i])), [infos]);
  const portColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of infos) {
      map.set(`${i.cable.from.n}:${i.cable.from.p}`, i.kind.color);
      map.set(`${i.cable.to.n}:${i.cable.to.p}`, i.kind.color);
    }
    return map;
  }, [infos]);
  const used = useMemo(() => new Set(portColor.keys()), [portColor]);
  const fromPort = connectFrom
    ? layout.nodes.find((n) => n.id === connectFrom.n)?.gear.ports.find((p) => p.id === connectFrom.p)
    : undefined;

  if (diagram.nodes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {editable ? 'This diagram is empty. Add a piece of your gear below.' : 'This diagram is empty.'}
      </p>
    );
  }

  const isTarget = (n: PlacedNode, p: PlacedPort): boolean => {
    if (!connectFrom || !fromPort || n.id === connectFrom.n) return false;
    if (used.has(`${n.id}:${p.portId}`)) return false;
    return orderPorts(fromPort, n.gear.ports[p.index]) !== null;
  };

  return (
    <div role="group" aria-label={`Rig diagram: ${diagram.name}`} className="overflow-x-auto rounded-xl border border-border bg-background/40 p-3">
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height + TITLE_H }}>
        {Array.from({ length: layout.cols }, (_, c) => (
          <div
            key={c}
            className="absolute truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ left: layout.gutters[c].x + layout.gutters[c].w, top: 4, width: GEO.cardW }}
          >
            Stage {c + 1}
          </div>
        ))}

        <div className="absolute left-0" style={{ top: TITLE_H, width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
            {layout.cables.map((c) => {
              const info = infoById.get(c.id);
              if (!info) return null;
              const color = info.kind.color;
              const selected = c.id === selectedCableId;
              const pts = c.points;
              return (
                <g key={c.id}>
                  <path d={c.path} fill="none" stroke="#1e1f2c" strokeWidth={selected ? 9 : 7} strokeLinecap="round" />
                  <path d={c.path} fill="none" stroke={color} strokeWidth={selected ? 5 : 3.5} strokeLinecap="round" />
                  <polygon points={arrowPoints(pts[pts.length - 2], pts[pts.length - 1])} fill={color} />
                  {info.kind.undirected && <polygon points={arrowPoints(pts[1], pts[0])} fill={color} />}
                </g>
              );
            })}
          </svg>

          <div className="absolute inset-0 z-20">
            {layout.nodes.map((n) => {
              const tint = GEAR_KIND_COLOR[n.gear.kind];
              const selected = n.id === selectedNodeId;
              return (
                <div
                  key={n.id}
                  className={cn('absolute rounded-xl border bg-surface shadow-lg shadow-black/40', selected && 'ring-2 ring-primary')}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h, borderColor: `${tint}66` }}
                >
                  <HeaderTag editable={editable} selected={selected} onSelect={() => onSelectNode(selected ? null : n.id)} name={n.gear.name}>
                    <span
                      className="block max-w-full truncate rounded border px-1.5 text-[10px] font-bold uppercase leading-4"
                      style={{ color: tint, borderColor: `${tint}66`, backgroundColor: `${tint}1f` }}
                    >
                      {n.gear.kind}
                    </span>
                    <span className="block w-full truncate text-sm font-bold leading-5 text-foreground" title={n.gear.name}>
                      {n.gear.name}
                    </span>
                    {n.gear.specs && (
                      <span className="block w-full truncate text-[11px] leading-4 text-surface-muted-foreground" title={n.gear.specs}>
                        {n.gear.specs}
                      </span>
                    )}
                  </HeaderTag>
                  {layout.ports
                    .filter((p) => p.nodeId === n.id)
                    .map((p) => (
                      <PortRow
                        key={p.portId}
                        node={n}
                        placed={p}
                        color={portColor.get(`${n.id}:${p.portId}`)}
                        editable={editable}
                        connecting={connectFrom !== null}
                        isOrigin={connectFrom?.n === n.id && connectFrom.p === p.portId}
                        isTarget={isTarget(n, p)}
                        onClick={() => onPortClick({ n: n.id, p: p.portId })}
                      />
                    ))}
                </div>
              );
            })}
          </div>

          <div className="pointer-events-none absolute inset-0 z-30">
            {layout.cables.map((c) => {
              const info = infoById.get(c.id);
              if (!info || !c.chip) return null;
              const selected = c.id === selectedCableId;
              const style = {
                left: c.chip.x - GEO.chipD / 2,
                top: c.chip.y - GEO.chipD / 2,
                width: GEO.chipD,
                height: GEO.chipD,
                borderColor: info.kind.color,
              };
              const cls = cn(
                'pointer-events-auto absolute flex items-center justify-center rounded-full border-2 bg-background text-[11px] font-bold text-foreground',
                selected && 'ring-2 ring-primary',
              );
              return editable ? (
                <button
                  key={c.id}
                  type="button"
                  className={cls}
                  style={style}
                  title={`${info.title}: ${info.route}`}
                  aria-label={`Cable ${info.n}: ${info.route}`}
                  aria-pressed={selected}
                  onClick={() => onSelectCable(selected ? null : c.id)}
                >
                  {info.n}
                </button>
              ) : (
                <span key={c.id} className={cls} style={style} title={`${info.title}: ${info.route}`}>
                  {info.n}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderTag({
  editable,
  selected,
  onSelect,
  name,
  children,
}: {
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  name: string;
  children: ReactNode;
}) {
  const cls = 'flex flex-col items-start overflow-hidden px-3 pt-2 text-left';
  const style = { height: GEO.headerH };
  if (!editable) return <div className={cls} style={style}>{children}</div>;
  return (
    <button type="button" className={cn(cls, 'w-full rounded-t-xl hover:bg-surface-hover')} style={style} aria-pressed={selected} aria-label={`Select ${name}`} onClick={onSelect}>
      {children}
    </button>
  );
}

function PortRow({
  node,
  placed,
  color,
  editable,
  connecting,
  isOrigin,
  isTarget,
  onClick,
}: {
  node: PlacedNode;
  placed: PlacedPort;
  color: string | undefined;
  editable: boolean;
  connecting: boolean;
  isOrigin: boolean;
  isTarget: boolean;
  onClick: () => void;
}) {
  const port = node.gear.ports[placed.index];
  const cls = cn(
    'absolute left-0 right-0 flex items-center justify-between gap-2 border-t border-surface-border/60 px-3 font-mono text-[11px] text-foreground',
    editable && 'hover:bg-surface-hover',
    connecting && !isTarget && !isOrigin && 'opacity-50',
    isTarget && 'bg-sky-500/15 ring-1 ring-inset ring-sky-400',
    isOrigin && 'bg-primary/20 ring-1 ring-inset ring-primary',
  );
  const style = { top: GEO.headerH + placed.index * GEO.rowH, height: GEO.rowH };
  const body = (
    <>
      <span className="truncate">{DIR_MARK[port.dir]} {port.label}</span>
      <span className="max-w-[45%] shrink-0 truncate text-surface-muted-foreground">{port.note ?? CONNECTOR_LABEL[port.connector]}</span>
      <span
        aria-hidden="true"
        className="absolute rounded-full border-2 border-background"
        style={{
          width: PIN,
          height: PIN,
          top: (GEO.rowH - PIN) / 2 - 2,
          // the card and row borders are 1px each: -1 puts the pin's centre exactly on the card edge
          [placed.side === 'L' ? 'left' : 'right']: -PIN / 2 - 1,
          backgroundColor: color ?? '#475569',
        }}
      />
    </>
  );
  return editable ? (
    <button
      type="button"
      className={cn(cls, 'text-left')}
      style={style}
      title={describePort(port)}
      aria-label={`${node.gear.name}: ${describePort(port)}${color ? ', connected' : ''}${isOrigin ? ', selected' : ''}`}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <div className={cls} style={style} title={describePort(port)}>
      {body}
    </div>
  );
}
