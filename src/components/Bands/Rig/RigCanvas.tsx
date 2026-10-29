import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DRAG_GRIP_ATTRIBUTE, usePointerDrag } from '../../../hooks/usePointerDrag';
import { columnsWhileDragging, dropSlotAt, isOverStage } from '../../../rigDrag';
import { canConnect, cableAtPort, portKey } from '../../../rigEdit';
import type { PortRef } from '../../../rigEdit';
import { resolveNodes } from '../../../rigData';
import { GEO, arrowPoints, computeRigLayout } from '../../../rigRouting';
import type { PlacedNode, PlacedPort, RigLayout } from '../../../rigRouting';
import type { RigDiagram, RigGear } from '../../../rigTypes';
import { GEAR_KIND_COLOR, RIG_PALETTE } from '../../../rigUtils';
import { describeCables } from '../../../rigView';
import { CardDragOverlay } from './CardDragOverlay';
import { PortRow } from './PortRow';
import { WireDragOverlay } from './WireDragOverlay';
import { useWireDrag, wireWouldRemove } from './useWireDrag';

const TITLE_H = 28;

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
  /** A card was dragged into column `col` at position `index` (0 = top). */
  onMoveNode?: (nodeId: string, col: number, index: number) => void;
  /** The cable's end at `grabbed` was dragged onto the port `target`. */
  onReconnectCable?: (cableId: string, grabbed: PortRef, target: PortRef) => void;
  /** The end of a cable was let go on empty canvas: the cable is dropped. */
  onRemoveCable?: (cableId: string) => void;
}

/**
 * A rig diagram: cards in columns, cables in the gutters between them. Geometry comes from
 * `computeRigLayout`, so a cable can never cross a card; this component only draws it. When
 * editable, a card can be dragged by its header (or its grip, on touch) to another spot in its
 * column or another column, with a spare column on the right while dragging. The plug at the end of a
 * connected cable can be dragged to another port, or let go on empty canvas to remove the cable.
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
  onMoveNode,
  onReconnectCable,
  onRemoveCable,
}: RigCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<RigLayout | null>(null);
  const resolved = useMemo(() => resolveNodes(diagram, gear), [diagram, gear]);
  const draggable = editable && onMoveNode !== undefined;
  const wiresDraggable = editable && onReconnectCable !== undefined && onRemoveCable !== undefined;

  const cards = usePointerDrag({
    stageRef,
    onDrop: (nodeId, at) => {
      const current = layoutRef.current;
      // Letting go away from the diagram cancels instead of moving the card.
      if (!draggable || !current || !isOverStage(current, at.x, at.y)) return;
      const slot = dropSlotAt(current, nodeId, at.x, at.y);
      onMoveNode?.(nodeId, slot.col, slot.index);
    },
  });
  const wires = useWireDrag({
    stageRef,
    layoutRef,
    diagram,
    enabled: wiresDraggable,
    onReconnect: (cableId, grabbed, target) => onReconnectCable?.(cableId, grabbed, target),
    onRemove: (cableId) => onRemoveCable?.(cableId),
  });

  const dragging = draggable && cards.drag !== null;
  const layout = useMemo(
    () => computeRigLayout(resolved, diagram.cables, dragging ? columnsWhileDragging(resolved) : 1),
    [resolved, diagram.cables, dragging],
  );
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const draggedNode = dragging ? layout.nodes.find((n) => n.id === cards.drag?.payload) : undefined;
  // The card was removed (a refresh, or edited elsewhere) mid-drag: there is nothing to drop any more.
  const dragLost = dragging && !draggedNode;
  const { cancel: cancelCardDrag } = cards;
  useEffect(() => {
    if (dragLost) cancelCardDrag();
  }, [dragLost, cancelCardDrag]);

  const infos = useMemo(() => describeCables(diagram, gear), [diagram, gear]);
  const infoById = useMemo(() => new Map(infos.map((i) => [i.cable.id, i])), [infos]);
  /** Colour of the cable on each connected port. */
  const portColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of infos) {
      map.set(portKey(i.cable.from), i.kind.color);
      map.set(portKey(i.cable.to), i.kind.color);
    }
    return map;
  }, [infos]);

  // A wire end in the air takes over from a connection being started: its fixed plug is the origin.
  const wire = wires.active;
  const origin: PortRef | null = wire ? wire.fixed : connectFrom;
  const wireAnchor = wire ? layout.ports.find((p) => p.nodeId === wire.fixed.n && p.portId === wire.fixed.p) : undefined;
  const beginWire = (e: ReactPointerEvent<HTMLElement>, nodeId: string, pin: PlacedPort) => {
    const grabbed = { n: nodeId, p: pin.portId };
    const cable = cableAtPort(diagram, grabbed);
    if (cable) wires.begin(e, cable.id, grabbed, pin);
  };

  if (diagram.nodes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {editable ? 'This diagram is empty. Add a piece of your gear below.' : 'This diagram is empty.'}
      </p>
    );
  }

  const isTarget = (n: PlacedNode, p: PlacedPort): boolean =>
    origin !== null && canConnect(diagram, gear, origin, { n: n.id, p: p.portId }, wire?.cableId);

  return (
    <div role="group" aria-label={`Rig diagram: ${diagram.name}`} className="overflow-x-auto rounded-xl border border-border bg-background/40 p-3">
      {/* Left-aligned while editable: a centred stage would jump sideways when the spare column appears mid-drag. */}
      <div className={cn('relative', !draggable && 'mx-auto')} style={{ width: layout.width, height: layout.height + TITLE_H }}>
        {Array.from({ length: layout.cols }, (_, c) => (
          <div
            key={c}
            className="absolute truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ left: layout.colXs[c], top: 4, width: GEO.cardW }}
          >
            Stage {c + 1}
          </div>
        ))}

        <div ref={stageRef} className="absolute left-0" style={{ top: TITLE_H, width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
            {layout.cables.map((c) => {
              const info = infoById.get(c.id);
              if (!info) return null;
              const color = info.kind.color;
              const selected = c.id === selectedCableId;
              const pts = c.points;
              return (
                <g key={c.id} opacity={c.id === wire?.cableId ? 0.25 : 1}>
                  <path d={c.path} fill="none" stroke={RIG_PALETTE.casing} strokeWidth={selected ? 9 : 7} strokeLinecap="round" />
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
                  className={cn(
                    'absolute rounded-xl border bg-surface shadow-lg shadow-black/40',
                    selected && 'ring-2 ring-primary',
                    draggedNode?.id === n.id && 'opacity-40',
                  )}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h, borderColor: `${tint}66` }}
                >
                  <HeaderTag
                    editable={editable}
                    draggable={draggable}
                    selected={selected}
                    onSelect={() => {
                      if (!cards.takeSuppressedClick()) onSelectNode(selected ? null : n.id);
                    }}
                    onPointerDown={(e) => cards.begin(e, { payload: n.id, x: n.x, y: n.y })}
                    name={n.gear.name}
                  >
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
                        color={portColor.get(portKey({ n: n.id, p: p.portId }))}
                        editable={editable}
                        connecting={origin !== null}
                        isOrigin={origin?.n === n.id && origin.p === p.portId}
                        isTarget={isTarget(n, p)}
                        onClick={() => {
                          if (!wires.takeSuppressedClick()) onPortClick({ n: n.id, p: p.portId });
                        }}
                        onPlugPointerDown={wiresDraggable && portColor.has(portKey({ n: n.id, p: p.portId })) ? (e) => beginWire(e, n.id, p) : undefined}
                      />
                    ))}
                </div>
              );
            })}
          </div>

          {draggedNode && cards.drag && <CardDragOverlay layout={layout} node={draggedNode} drag={cards.drag} pointer={cards.pointer} />}
          {wire && wireAnchor && (
            <WireDragOverlay
              layout={layout}
              anchor={wireAnchor}
              color={infoById.get(wire.cableId)?.kind.color ?? RIG_PALETTE.cableFallback}
              pointer={wires.pointer}
              wouldRemove={(at) => wireWouldRemove(layout, stageRef.current, wire.grabbed, at)}
            />
          )}

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
  draggable,
  selected,
  onSelect,
  onPointerDown,
  name,
  children,
}: {
  editable: boolean;
  draggable: boolean;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  name: string;
  children: ReactNode;
}) {
  const cls = 'flex flex-col items-start overflow-hidden px-3 pt-2 text-left';
  const style = { height: GEO.headerH };
  if (!editable) return <div className={cls} style={style}>{children}</div>;
  return (
    <div className="relative select-none" style={style} onPointerDown={draggable ? onPointerDown : undefined}>
      <button
        type="button"
        className={cn(cls, 'h-full w-full rounded-t-xl hover:bg-surface-hover', draggable && 'cursor-grab pr-9')}
        aria-pressed={selected}
        aria-label={`Select ${name}`}
        onClick={onSelect}
      >
        {children}
      </button>
      {draggable && (
        <span
          {...{ [DRAG_GRIP_ATTRIBUTE]: '' }}
          title="Drag to move"
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded text-muted-foreground"
        >
          <GripVertical size={16} />
        </span>
      )}
    </div>
  );
}
