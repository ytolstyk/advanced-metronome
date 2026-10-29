// Gear & rig drafts: immutable edit helpers. Every edit that could leave a cable pointing at a port
// that no longer exists (or no longer fits) cascades, and `*Impact` reports what would be removed so
// the UI can ask first. Pure.

import { sanitizeText } from './bandUtils';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from './rigPresets';
import { RIG_COLS, RIG_LIMITS } from './rigTypes';
import type { RigCable, RigDiagram, RigGear, RigNode, RigPort, RigPortRef } from './rigTypes';
import { newRigId, type RigDraft } from './rigData';
import { connectionProblem, orderPorts } from './rigUtils';

export type EditResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const ok = <T>(value: T): EditResult<T> => ({ ok: true, value });
const fail = <T>(reason: string): EditResult<T> => ({ ok: false, reason });

const EXAMPLE_TAG_PREFIX = 'Example: ';

export interface Impact {
  nodes: number;
  cables: number;
  diagrams: number;
}

const NO_IMPACT: Impact = { nodes: 0, cables: 0, diagrams: 0 };
export const hasImpact = (i: Impact): boolean => i.nodes + i.cables > 0;

// ── Gear ───────────────────────────────────────────────────────────────────

export function addGear(draft: RigDraft, gear: RigGear): EditResult<RigDraft> {
  if (draft.gear.length >= RIG_LIMITS.gearMax) return fail(`You can keep up to ${RIG_LIMITS.gearMax} pieces of gear`);
  return ok({ ...draft, gear: [...draft.gear, gear] });
}

/** The same rule the row parser applies: both ports resolve in `gearById` and the direction is legal. */
function cableIsValid(diagram: RigDiagram, gearById: ReadonlyMap<string, RigGear>, c: RigCable): boolean {
  const portOf = (ref: { n: string; p: string }): RigPort | undefined => {
    const node = diagram.nodes.find((n) => n.id === ref.n);
    return node ? gearById.get(node.gearId)?.ports.find((p) => p.id === ref.p) : undefined;
  };
  const from = portOf(c.from);
  const to = portOf(c.to);
  return !!from && !!to && orderPorts(from, to)?.[0] === from;
}

/** Gear lookup after `gearId` becomes `next` (null = deleted). */
function gearAfter(draft: RigDraft, gearId: string, next: RigGear | null): Map<string, RigGear> {
  const map = new Map(draft.gear.map((g) => [g.id, g]));
  if (next) map.set(gearId, next);
  else map.delete(gearId);
  return map;
}

/** What changing `gearId` to `next` (or deleting it, `next === null`) would remove from the draft's diagrams. */
export function gearImpact(draft: RigDraft, gearId: string, next: RigGear | null): Impact {
  const after = gearAfter(draft, gearId, next);
  const impact = { ...NO_IMPACT };
  for (const d of draft.diagrams) {
    const nodes = next ? 0 : d.nodes.filter((n) => n.gearId === gearId).length;
    const cables = d.cables.filter((c) => !cableIsValid(d, after, c)).length;
    if (nodes + cables > 0) impact.diagrams++;
    impact.nodes += nodes;
    impact.cables += cables;
  }
  return impact;
}

/** Replaces a gear item, dropping the cables its change made invalid. */
export function updateGear(draft: RigDraft, next: RigGear): RigDraft {
  const after = gearAfter(draft, next.id, next);
  const diagrams = draft.diagrams.map((d) => {
    const cables = d.cables.filter((c) => cableIsValid(d, after, c));
    return cables.length === d.cables.length ? d : { ...d, cables };
  });
  return { gear: draft.gear.map((g) => (g.id === next.id ? next : g)), diagrams };
}

/** Deletes a gear item with the nodes that use it and their cables. */
export function removeGear(draft: RigDraft, gearId: string): RigDraft {
  const diagrams = draft.diagrams.map((d) => {
    const gone = new Set(d.nodes.filter((n) => n.gearId === gearId).map((n) => n.id));
    if (gone.size === 0) return d;
    return {
      ...d,
      nodes: d.nodes.filter((n) => !gone.has(n.id)),
      cables: d.cables.filter((c) => !gone.has(c.from.n) && !gone.has(c.to.n)),
    };
  });
  return { gear: draft.gear.filter((g) => g.id !== gearId), diagrams };
}

// ── Minting gear (copies and the example) ──────────────────────────────────

const stampTag = (prefix: string, name: string): string => sanitizeText(`${prefix}${name}`, RIG_LIMITS.copiedFromMax);

const freshPorts = (ports: RigPort[]): RigPort[] => ports.map((p) => ({ ...p }));

/** Same ports (ids, directions, connectors): the only case where an existing item can stand in for another. */
const samePorts = (a: readonly RigPort[], b: readonly RigPort[]): boolean =>
  a.length === b.length && a.every((p, i) => p.id === b[i].id && p.dir === b[i].dir && p.connector === b[i].connector);

/** Someone else's gear as yours: a snapshot with its own id, labelled with where it came from. */
export function copyGearToMine(draft: RigDraft, source: RigGear, fromName: string): EditResult<{ draft: RigDraft; gear: RigGear }> {
  const gear: RigGear = {
    ...source,
    id: newRigId(),
    copiedFrom: sanitizeText(fromName, RIG_LIMITS.copiedFromMax) || undefined,
    ports: freshPorts(source.ports),
  };
  if (!gear.copiedFrom) delete gear.copiedFrom;
  const added = addGear(draft, gear);
  return added.ok ? ok({ draft: added.value, gear }) : fail(added.reason);
}

// ── Diagrams ───────────────────────────────────────────────────────────────

export function addDiagram(draft: RigDraft, nameInput: string): EditResult<{ draft: RigDraft; diagram: RigDiagram }> {
  if (draft.diagrams.length >= RIG_LIMITS.diagramsMax) return fail(`You can keep up to ${RIG_LIMITS.diagramsMax} diagrams`);
  const name = sanitizeText(nameInput, RIG_LIMITS.nameMax);
  if (!name) return fail('Give the diagram a name');
  const diagram: RigDiagram = { id: newRigId(), name, nodes: [], cables: [] };
  return ok({ draft: { ...draft, diagrams: [...draft.diagrams, diagram] }, diagram });
}

/** The Jam Station example as a new diagram, with its gear added to yours (reusing copies already there). */
export function addExampleDiagram(draft: RigDraft): EditResult<{ draft: RigDraft; diagram: RigDiagram }> {
  if (draft.diagrams.length >= RIG_LIMITS.diagramsMax) return fail(`You can keep up to ${RIG_LIMITS.diagramsMax} diagrams`);
  let next = draft;
  const gearIdFor = new Map<string, string>();
  for (const g of JAM_STATION_GEAR) {
    const tag = stampTag(EXAMPLE_TAG_PREFIX, g.name);
    // The tag is only a label: reuse an earlier copy only if its ports still match what the example's
    // cables expect (it may have been edited since), otherwise add a fresh one.
    const existing = next.gear.find((x) => x.copiedFrom === tag && samePorts(x.ports, g.ports));
    if (existing) {
      gearIdFor.set(g.id, existing.id);
      continue;
    }
    const gear: RigGear = { ...g, id: newRigId(), copiedFrom: tag, ports: freshPorts(g.ports) };
    const added = addGear(next, gear);
    if (!added.ok) return fail(added.reason);
    next = added.value;
    gearIdFor.set(g.id, gear.id);
  }
  const nodeIdFor = new Map(JAM_STATION_DIAGRAM.nodes.map((n) => [n.id, newRigId()]));
  const diagram: RigDiagram = {
    id: newRigId(),
    name: JAM_STATION_DIAGRAM.name,
    nodes: JAM_STATION_DIAGRAM.nodes.map((n) => ({ id: nodeIdFor.get(n.id)!, gearId: gearIdFor.get(n.gearId)!, col: n.col })),
    cables: JAM_STATION_DIAGRAM.cables.map((c) => ({
      ...c,
      id: newRigId(),
      from: { n: nodeIdFor.get(c.from.n)!, p: c.from.p },
      to: { n: nodeIdFor.get(c.to.n)!, p: c.to.p },
    })),
  };
  return ok({ draft: { ...next, diagrams: [...next.diagrams, diagram] }, diagram });
}

export const removeDiagram = (draft: RigDraft, diagramId: string): RigDraft => ({
  ...draft,
  diagrams: draft.diagrams.filter((d) => d.id !== diagramId),
});

export function renameDiagram(draft: RigDraft, diagramId: string, nameInput: string): EditResult<RigDraft> {
  const name = sanitizeText(nameInput, RIG_LIMITS.nameMax);
  if (!name) return fail('Give the diagram a name');
  return ok({ ...draft, diagrams: draft.diagrams.map((d) => (d.id === diagramId ? { ...d, name } : d)) });
}

/** Applies `fn` to one diagram. Returns the same draft object when `fn` changed nothing, so a no-op edit stays clean. */
const mapDiagram = (draft: RigDraft, id: string, fn: (d: RigDiagram) => RigDiagram): RigDraft => {
  let changed = false;
  const diagrams = draft.diagrams.map((d) => {
    if (d.id !== id) return d;
    const next = fn(d);
    if (next !== d) changed = true;
    return next;
  });
  return changed ? { ...draft, diagrams } : draft;
};

// ── Nodes ──────────────────────────────────────────────────────────────────

export function addNode(draft: RigDraft, diagramId: string, gearId: string, col = 0): EditResult<RigDraft> {
  const diagram = draft.diagrams.find((d) => d.id === diagramId);
  if (!diagram) return fail('That diagram no longer exists');
  if (!draft.gear.some((g) => g.id === gearId)) return fail('That gear no longer exists');
  if (diagram.nodes.length >= RIG_LIMITS.nodesMax) return fail(`A diagram holds up to ${RIG_LIMITS.nodesMax} pieces of gear`);
  const node: RigNode = { id: newRigId(), gearId, col: Math.min(RIG_COLS - 1, Math.max(0, col)) };
  return ok(mapDiagram(draft, diagramId, (d) => ({ ...d, nodes: [...d.nodes, node] })));
}

/** Adds a piece of gear right below `afterNodeId` in its column, so it can go in the middle of a chain. */
export function addNodeAfter(draft: RigDraft, diagramId: string, gearId: string, afterNodeId: string): EditResult<RigDraft> {
  const after = draft.diagrams.find((d) => d.id === diagramId)?.nodes.find((n) => n.id === afterNodeId);
  const added = addNode(draft, diagramId, gearId, after?.col ?? 0);
  if (!added.ok || !after) return added;
  const diagram = added.value.diagrams.find((d) => d.id === diagramId)!;
  const column = diagram.nodes.filter((n) => n.col === after.col);
  const position = column.findIndex((n) => n.id === afterNodeId) + 1;
  return ok(placeNode(added.value, diagramId, diagram.nodes[diagram.nodes.length - 1].id, after.col, position));
}

export const removeNode = (draft: RigDraft, diagramId: string, nodeId: string): RigDraft =>
  mapDiagram(draft, diagramId, (d) => ({
    ...d,
    nodes: d.nodes.filter((n) => n.id !== nodeId),
    cables: d.cables.filter((c) => c.from.n !== nodeId && c.to.n !== nodeId),
  }));

export type MoveDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Puts a node into column `col` at position `index` among the column's other cards (0 = top; past
 * the end, or not a number, means the bottom), which is what dragging a card does. `index` counts
 * cards as drawn, which is every node in the draft: parsing and `removeGear` prune the rest. Returns
 * the same draft when nothing would change.
 */
export function placeNode(draft: RigDraft, diagramId: string, nodeId: string, col: number, index: number): RigDraft {
  return mapDiagram(draft, diagramId, (d) => {
    const node = d.nodes.find((n) => n.id === nodeId);
    if (!node || !Number.isInteger(col) || col < 0 || col >= RIG_COLS) return d;
    const rest = d.nodes.filter((n) => n.id !== nodeId);
    const columnMates = rest.filter((n) => n.col === col);
    const slot = Number.isNaN(index) ? columnMates.length : Math.min(columnMates.length, Math.max(0, Math.floor(index)));
    const successor = columnMates[slot]; // the card that ends up directly below the placed one
    const predecessor = columnMates[slot - 1]; // directly above it (none at the top)
    const insertAt = successor
      ? rest.indexOf(successor)
      : predecessor
        ? rest.indexOf(predecessor) + 1
        : rest.length; // empty column: anywhere
    const placed = node.col === col ? node : { ...node, col };
    const nodes = [...rest.slice(0, insertAt), placed, ...rest.slice(insertAt)];
    return nodes.every((n, i) => n === d.nodes[i]) ? d : { ...d, nodes };
  });
}

/** Left/right change the column (the node goes to the bottom of it); up/down swap with the neighbour in the column. */
export function moveNode(draft: RigDraft, diagramId: string, nodeId: string, dir: MoveDirection): RigDraft {
  const node = draft.diagrams.find((d) => d.id === diagramId)?.nodes.find((n) => n.id === nodeId);
  if (!node) return draft;
  if (dir === 'left' || dir === 'right') return placeNode(draft, diagramId, nodeId, node.col + (dir === 'left' ? -1 : 1), Infinity);
  const position = draft.diagrams
    .find((d) => d.id === diagramId)!
    .nodes.filter((n) => n.col === node.col)
    .findIndex((n) => n.id === nodeId);
  return placeNode(draft, diagramId, nodeId, node.col, position + (dir === 'up' ? -1 : 1));
}

// ── Cables ─────────────────────────────────────────────────────────────────

export type PortRef = RigPortRef;

const portKey = (r: PortRef): string => `${r.n}:${r.p}`;

/** The port a ref points at in this diagram, if it is still there. */
export function portAt(diagram: RigDiagram, gear: readonly RigGear[], ref: PortRef): RigPort | undefined {
  const node = diagram.nodes.find((n) => n.id === ref.n);
  return node ? gear.find((g) => g.id === node.gearId)?.ports.find((p) => p.id === ref.p) : undefined;
}

/** Ports of the diagram that already carry a cable (one cable per port). */
export const usedPorts = (diagram: RigDiagram): Set<string> =>
  new Set(diagram.cables.flatMap((c) => [portKey(c.from), portKey(c.to)]));

/**
 * Connects two ports. Click order doesn't matter: the stored cable always runs from the output.
 * `reason` is plain language for the UI.
 */
export function addCable(draft: RigDraft, diagramId: string, a: PortRef, b: PortRef): EditResult<RigDraft> {
  const diagram = draft.diagrams.find((d) => d.id === diagramId);
  if (!diagram) return fail('That diagram no longer exists');
  if (diagram.cables.length >= RIG_LIMITS.cablesMax) return fail(`A diagram holds up to ${RIG_LIMITS.cablesMax} cables`);
  if (a.n === b.n) return fail("A cable can't loop back to the same piece of gear");
  const pa = portAt(diagram, draft.gear, a);
  const pb = portAt(diagram, draft.gear, b);
  if (!pa || !pb) return fail('That port is no longer there');
  const used = usedPorts(diagram);
  if (used.has(portKey(a)) || used.has(portKey(b))) return fail('Each port takes one cable. Remove the existing one first');
  const problem = connectionProblem(pa, pb);
  if (problem) return fail(problem);
  const ordered = orderPorts({ ref: a, dir: pa.dir }, { ref: b, dir: pb.dir })!;
  let [from, to] = ordered.map((o) => o.ref);
  // USB/MIDI cables have no direction: store them in a fixed order so a pair always serialises the same.
  if (pa.dir === 'io' && portKey(from) > portKey(to)) [from, to] = [to, from];
  const cable: RigCable = { id: newRigId(), from, to };
  return ok(mapDiagram(draft, diagramId, (d) => ({ ...d, cables: [...d.cables, cable] })));
}

export const removeCable = (draft: RigDraft, diagramId: string, cableId: string): RigDraft =>
  mapDiagram(draft, diagramId, (d) => ({ ...d, cables: d.cables.filter((c) => c.id !== cableId) }));

export function setCableLabel(draft: RigDraft, diagramId: string, cableId: string, labelInput: string): RigDraft {
  const label = sanitizeText(labelInput, RIG_LIMITS.cableLabelMax);
  return mapDiagram(draft, diagramId, (d) => {
    const cables = d.cables.map((c) => {
      if (c.id !== cableId || (c.label ?? '') === label) return c;
      const updated: RigCable = { ...c };
      if (label) updated.label = label;
      else delete updated.label;
      return updated;
    });
    return cables.every((c, i) => c === d.cables[i]) ? d : { ...d, cables };
  });
}
