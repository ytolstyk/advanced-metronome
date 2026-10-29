// Gear & rig diagrams: shared types and limits. Pure data, no React, no network (the standalone
// Jam Station page bundles rigRouting.ts, so everything it imports must stay free of both).

/** Number of stage columns a diagram has. Cards live only in columns; cables run in the gaps between. */
export const RIG_COLS = 4;

export const CONNECTORS = ['ts', 'trs', 'xlr', 'combo', 'usb', 'midi', 'speakon', 'minijack', 'other'] as const;
export type Connector = (typeof CONNECTORS)[number];

export const PORT_DIRS = ['in', 'out', 'io'] as const;
export type PortDir = (typeof PORT_DIRS)[number];

export const GEAR_KINDS = [
  'guitar', 'bass', 'drums', 'keys', 'mic', 'interface', 'computer', 'amp', 'speaker', 'mixer', 'pedal', 'other',
] as const;
export type GearKind = (typeof GEAR_KINDS)[number];

export interface RigPort {
  id: string;
  label: string;
  dir: PortDir;
  connector: Connector;
  note?: string;
}

export interface RigGear {
  id: string;
  name: string;
  kind: GearKind;
  specs?: string;
  /** Display name of the member this was copied from (cosmetic; copies never sync). */
  copiedFrom?: string;
  ports: RigPort[];
}

export interface RigPortRef {
  /** Node id. */
  n: string;
  /** Port id on that node's gear. */
  p: string;
}

export interface RigNode {
  id: string;
  /** The diagram owner's own gear item. */
  gearId: string;
  col: number;
}

export interface RigCable {
  id: string;
  from: RigPortRef;
  to: RigPortRef;
  label?: string;
}

export interface RigDiagram {
  id: string;
  name: string;
  nodes: RigNode[];
  cables: RigCable[];
}

/** A node with its gear looked up: what layout and rendering work from. */
export interface ResolvedNode {
  id: string;
  col: number;
  gear: RigGear;
}

/**
 * Client-side limits (the schema can't enforce them: a hostile member can write anything, so every
 * reader re-checks). The row size cap is derived from these in rigData.
 */
export const RIG_LIMITS = {
  gearMax: 24,
  portsPerGearMax: 12,
  diagramsMax: 3,
  nodesMax: 16,
  cablesMax: 32,
  nameMax: 50,
  portLabelMax: 30,
  noteMax: 40,
  specsMax: 120,
  cableLabelMax: 30,
  copiedFromMax: 30,
  idMin: 4,
  idMax: 12,
} as const;
