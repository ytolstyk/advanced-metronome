// Gear & rig diagrams: what a cable is, in words, for drawing and for the Cable schedule. Pure.

import { cableKind, CONNECTOR_LABEL } from './rigUtils';
import type { CableKind } from './rigUtils';
import type { RigCable, RigDiagram, RigGear, RigPort } from './rigTypes';

export interface CableEnd {
  gear: RigGear;
  port: RigPort;
}

export interface CableInfo {
  cable: RigCable;
  /** 1-based, the number shown on the chip (matches `computeRigLayout`). */
  n: number;
  kind: CableKind;
  from: CableEnd;
  to: CableEnd;
  /** The person's label, or the connector description. */
  title: string;
  /** `Gear (port) ➔ Gear (port)`; `⇄` for USB/MIDI. */
  route: string;
}

/** A diagram's cables with both ends resolved; a cable whose end is missing is left out. */
export function describeCables(diagram: RigDiagram, gear: readonly RigGear[]): CableInfo[] {
  const gearById = new Map(gear.map((g) => [g.id, g]));
  const nodeGear = new Map(diagram.nodes.map((n) => [n.id, gearById.get(n.gearId)]));
  const out: CableInfo[] = [];
  diagram.cables.forEach((cable, index) => {
    const fg = nodeGear.get(cable.from.n);
    const tg = nodeGear.get(cable.to.n);
    const fp = fg?.ports.find((p) => p.id === cable.from.p);
    const tp = tg?.ports.find((p) => p.id === cable.to.p);
    if (!fg || !tg || !fp || !tp) return;
    const kind = cableKind(fp, tp);
    out.push({
      cable,
      n: index + 1,
      kind,
      from: { gear: fg, port: fp },
      to: { gear: tg, port: tp },
      title: cable.label ?? kind.label,
      route: `${fg.name} (${fp.label}) ${kind.undirected ? '⇄' : '➔'} ${tg.name} (${tp.label})`,
    });
  });
  return out;
}

/** `Output · Hi-Z` style text for a port's hover title and screen-reader label. */
export function describePort(port: RigPort): string {
  const dir = port.dir === 'in' ? 'input' : port.dir === 'out' ? 'output' : 'USB/MIDI';
  return `${port.label}, ${dir}, ${CONNECTOR_LABEL[port.connector]}${port.note ? `, ${port.note}` : ''}`;
}
