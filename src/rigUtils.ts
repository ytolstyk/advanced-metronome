// Gear & rig diagrams: connection rules, cable kinds and the shared palette. Pure, and bundled into the
// standalone Jam Station page, so it may import only ./rigTypes (the build script checks).

import type { Connector, GearKind, RigPort } from './rigTypes';

export const CONNECTOR_LABEL: Record<Connector, string> = {
  ts: '1/4" TS',
  trs: '1/4" TRS',
  xlr: 'XLR',
  combo: 'XLR/TRS combo',
  usb: 'USB',
  midi: 'MIDI DIN',
  speakon: 'Speakon',
  minijack: '3.5 mm',
  other: 'Other',
};

export type CableType = 'ts' | 'trs' | 'xlr' | 'usb' | 'midi' | 'other';

export const CABLE_COLOR: Record<CableType, string> = {
  ts: '#f97316',
  trs: '#06b6d4',
  xlr: '#10b981',
  usb: '#a855f7',
  midi: '#f472b6',
  other: '#94a3b8',
};

/** Accent per kind of gear: the tint on a card's border and kind badge. */
export const GEAR_KIND_COLOR: Record<GearKind, string> = {
  guitar: '#f97316', bass: '#f97316', drums: '#06b6d4', keys: '#06b6d4', mic: '#06b6d4',
  interface: '#f43f5e', computer: '#a855f7', amp: '#10b981', speaker: '#10b981',
  mixer: '#f43f5e', pedal: '#f97316', other: '#94a3b8',
};

export interface CableKind {
  type: CableType;
  color: string;
  /** e.g. `1/4" TRS ➔ XLR`, or just `USB` when both ends match. */
  label: string;
  /** True for a connector mismatch that isn't an ordinary cable (an adapter would be needed). */
  needsAdapter: boolean;
  /** USB/MIDI-style cable with no signal direction. */
  undirected: boolean;
}

const STANDARD_CABLE_CONNECTORS = new Set<Connector>(['ts', 'trs', 'xlr']);

function typeOf(c: Connector): CableType {
  switch (c) {
    case 'ts': case 'trs': case 'xlr': case 'usb': case 'midi': return c;
    case 'combo': return 'trs';
    default: return 'other';
  }
}

/**
 * What a cable between two ports is. Only direction is ever a hard rule; a connector mismatch just
 * labels the cable (and flags `needsAdapter` when it isn't a common cable).
 */
export function cableKind(from: RigPort, to: RigPort): CableKind {
  const a = from.connector;
  const b = to.connector;
  const undirected = from.dir === 'io' && to.dir === 'io';
  const compatible = a === b || a === 'combo' || b === 'combo' || a === 'other' || b === 'other';
  if (compatible) {
    // A combo or other jack takes the connector of whatever is plugged into it.
    const effective = a === b || (a !== 'combo' && a !== 'other') ? a : b;
    const type = typeOf(effective);
    return { type, color: CABLE_COLOR[type], label: CONNECTOR_LABEL[effective], needsAdapter: false, undirected };
  }
  const standard = STANDARD_CABLE_CONNECTORS.has(a) && STANDARD_CABLE_CONNECTORS.has(b);
  // priority picks one colour for a mismatched pair: usb > xlr > trs > ts > midi
  const order: CableType[] = ['usb', 'xlr', 'trs', 'ts', 'midi', 'other'];
  const ta = typeOf(a);
  const tb = typeOf(b);
  const type = order.indexOf(ta) <= order.indexOf(tb) ? ta : tb;
  return {
    type,
    color: standard ? CABLE_COLOR[type] : CABLE_COLOR.other,
    label: `${CONNECTOR_LABEL[a]} ➔ ${CONNECTOR_LABEL[b]}`,
    needsAdapter: !standard,
    undirected,
  };
}

/**
 * Orders two ports into a stored cable (`from` is the output side), or null when the pair is not
 * allowed. Legal pairs are exactly `out→in` (either click order) and `io↔io`.
 */
export function orderPorts<T extends { dir: RigPort['dir'] }>(a: T, b: T): [T, T] | null {
  if (a.dir === 'out' && b.dir === 'in') return [a, b];
  if (a.dir === 'in' && b.dir === 'out') return [b, a];
  if (a.dir === 'io' && b.dir === 'io') return [a, b];
  return null;
}

/** Plain-language reason a pair can't be connected, or null when it can. */
export function connectionProblem(a: RigPort, b: RigPort): string | null {
  if (orderPorts(a, b)) return null;
  if (a.dir === b.dir) return `Two ${a.dir === 'in' ? 'inputs' : 'outputs'} can't be connected`;
  return a.dir === 'io' || b.dir === 'io' ? 'A USB/MIDI port only connects to another USB/MIDI port' : "These ports can't be connected";
}
