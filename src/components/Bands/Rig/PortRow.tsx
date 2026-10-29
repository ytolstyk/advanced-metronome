import type { PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { DRAG_GRIP_ATTRIBUTE } from '../../../hooks/usePointerDrag';
import { GEO } from '../../../rigRouting';
import type { PlacedNode, PlacedPort } from '../../../rigRouting';
import { CONNECTOR_LABEL, RIG_PALETTE } from '../../../rigUtils';
import { describePort } from '../../../rigView';

const PIN = 14;
/** How far the grab area of a connected pin reaches past the dot on every side. */
const PLUG_GROW = (GEO.plugHit - PIN) / 2;
const DIR_MARK = { in: '▸', out: '◂', io: '⇄' } as const;

interface PortRowProps {
  node: PlacedNode;
  placed: PlacedPort;
  /** The colour of the cable on this port, if it has one. */
  color: string | undefined;
  editable: boolean;
  /** A connection or a wire drag is in progress: ports that can't take it fade. */
  connecting: boolean;
  isOrigin: boolean;
  isTarget: boolean;
  onClick: () => void;
  /** Set on a connected port while wire ends can be dragged: pressing the plug picks the cable's end up. */
  onPlugPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
}

/** One port of a card: its label, connector and the pin the cables attach to (a button when editable). */
export function PortRow({ node, placed, color, editable, connecting, isOrigin, isTarget, onClick, onPlugPointerDown }: PortRowProps) {
  const port = node.gear.ports[placed.index];
  const cls = cn(
    'absolute left-0 right-0 flex items-center justify-between gap-2 border-t border-surface-border/60 px-3 font-mono text-[11px] text-foreground',
    editable && 'hover:bg-surface-hover',
    connecting && !isTarget && !isOrigin && 'opacity-50',
    isTarget && 'bg-sky-500/15 ring-1 ring-inset ring-sky-400',
    isOrigin && 'bg-primary/20 ring-1 ring-inset ring-primary',
  );
  const style = { top: GEO.headerH + placed.index * GEO.rowH, height: GEO.rowH };
  // The card and row borders are 1px each: -1 puts the pin's centre exactly on the card edge.
  const pinTop = (GEO.rowH - PIN) / 2 - 2;
  const pinEdge = -PIN / 2 - 1;
  const edge = placed.side === 'L' ? 'left' : 'right';
  const body = (
    <>
      <span className="truncate">{DIR_MARK[port.dir]} {port.label}</span>
      <span className="max-w-[45%] shrink-0 truncate text-surface-muted-foreground">{port.note ?? CONNECTOR_LABEL[port.connector]}</span>
      <span
        aria-hidden="true"
        className="absolute rounded-full border-2 border-background"
        style={{ width: PIN, height: PIN, top: pinTop, [edge]: pinEdge, backgroundColor: color ?? RIG_PALETTE.freePin }}
      />
    </>
  );
  // The plug is a sibling of the row, not inside its button: some browsers don't deliver pointer events to a
  // button's children. It sits in the card at the row's offset (+1 for the row's top border).
  const plug = onPlugPointerDown && (
    <span
      {...{ [DRAG_GRIP_ATTRIBUTE]: '' }}
      aria-hidden="true"
      title="Drag to move this end of the cable"
      className="absolute cursor-grab touch-none"
      style={{ width: GEO.plugHit, height: GEO.plugHit, top: style.top + 1 + pinTop - PLUG_GROW, [edge]: pinEdge - PLUG_GROW }}
      onPointerDown={onPlugPointerDown}
    />
  );
  if (!editable) {
    return (
      <div className={cls} style={style} title={describePort(port)}>
        {body}
      </div>
    );
  }
  return (
    <>
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
      {plug}
    </>
  );
}
