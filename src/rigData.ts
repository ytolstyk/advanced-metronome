// Gear & rig rows: strict parsing of untrusted JSON, the size budget, and assembling everyone's rows
// into a view. Pure (no network). Auth rules can't look inside a row, so any signed-in user can write
// anything under a band id; every reader re-validates and HIDES what is wrong rather than repairing it.

import type { BandRecord, ValidMember } from './bandTypes';
import { isCleanText } from './bandUtils';
// TODO: pickParticipants (and its cap) is a Bands rule that happens to live in availabilityUtils; move it to
// bandUtils the next time Availability is touched, so rig code doesn't depend on Availability internals.
import { pickParticipants } from './availabilityUtils';
import { CONNECTORS, GEAR_KINDS, PORT_DIRS, RIG_COLS, RIG_LIMITS } from './rigTypes';
import type { Connector, GearKind, PortDir, ResolvedNode, RigCable, RigDiagram, RigGear, RigNode, RigPort } from './rigTypes';
import { orderPorts } from './rigUtils';

export const RIG_FORMAT = 1;

/** Ids are short, lowercase alphanumerics (the client mints 8 characters). */
export const RIG_ID_PATTERN = new RegExp(`^[a-z0-9]{${RIG_LIMITS.idMin},${RIG_LIMITS.idMax}}$`);

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newRigId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

// ── Records ────────────────────────────────────────────────────────────────

/** A stored `BandRig` row as the API returns it. `gear` and `diagrams` are untrusted JSON strings. */
export interface RigRowRecord {
  bandId: string;
  owner: string;
  format: number;
  rev: number;
  gear: string;
  diagrams: string;
  updatedAt?: string | null;
}

export type RigRead = { status: 'ok'; row: RigRowRecord | null } | { status: 'failed' };

/** What one person has: the gear list and diagrams that passed validation. */
export interface RigDraft {
  gear: RigGear[];
  diagrams: RigDiagram[];
}

export const EMPTY_DRAFT: RigDraft = { gear: [], diagrams: [] };

// ── Size budget ────────────────────────────────────────────────────────────

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

export function serializeDraft(draft: RigDraft): { gear: string; diagrams: string } {
  return { gear: JSON.stringify(draft.gear), diagrams: JSON.stringify(draft.diagrams) };
}

/** Bytes of the two JSON strings a row stores. */
export const rigRowBytes = (gear: string, diagrams: string): number => utf8Length(gear) + utf8Length(diagrams);

const rep = (unit: string, n: number): string => unit.repeat(n);

/**
 * The largest valid row the limits allow: every text at max length in 4-byte characters, ids at max
 * length, every node on its own gear and every cable on its own pair of ports.
 */
export function worstCaseDraft(): RigDraft {
  const emoji = '\u{1F3B8}';
  const id = (n: number): string => `z${String(n).padStart(RIG_LIMITS.idMax - 1, '0')}`;
  const gear: RigGear[] = Array.from({ length: RIG_LIMITS.gearMax }, (_, g) => ({
    id: id(g),
    name: rep(emoji, RIG_LIMITS.nameMax),
    kind: 'interface' as GearKind,
    specs: rep(emoji, RIG_LIMITS.specsMax),
    copiedFrom: rep(emoji, RIG_LIMITS.copiedFromMax),
    ports: Array.from({ length: RIG_LIMITS.portsPerGearMax }, (_, p): RigPort => ({
      id: id(p),
      label: rep(emoji, RIG_LIMITS.portLabelMax),
      dir: p % 2 === 0 ? 'out' : 'in',
      connector: 'speakon',
      note: rep(emoji, RIG_LIMITS.noteMax),
    })),
  }));
  const diagrams: RigDiagram[] = Array.from({ length: RIG_LIMITS.diagramsMax }, (_, d) => ({
    id: id(d),
    name: rep(emoji, RIG_LIMITS.nameMax),
    nodes: Array.from({ length: RIG_LIMITS.nodesMax }, (_, n): RigNode => ({ id: id(n), gearId: id(n), col: n % RIG_COLS })),
    cables: Array.from({ length: RIG_LIMITS.cablesMax }, (_, c): RigCable => {
      // output port (even index) of one node into an input port (odd index) of the next
      const half = Math.floor(c / RIG_LIMITS.nodesMax);
      return {
        id: id(c),
        from: { n: id(c % RIG_LIMITS.nodesMax), p: id(2 * half) },
        to: { n: id((c + 1) % RIG_LIMITS.nodesMax), p: id(2 * half + 1) },
        label: rep(emoji, RIG_LIMITS.cableLabelMax),
      };
    }),
  }));
  return { gear, diagrams };
}

let cachedMax: number | null = null;

/** Largest row we will read or write: the measured worst case plus 25% headroom. Derived, never typed in. */
export function rigRowMaxBytes(): number {
  if (cachedMax === null) {
    const { gear, diagrams } = serializeDraft(worstCaseDraft());
    cachedMax = Math.ceil(rigRowBytes(gear, diagrams) * 1.25);
  }
  return cachedMax;
}

// ── Parsing one row ────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasOwn = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isId = (v: unknown): v is string => typeof v === 'string' && RIG_ID_PATTERN.test(v);
// A lone surrogate is invalid text and JSON.stringify writes it as 6 bytes, which would break the size budget.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const cleanText = (v: unknown, max: number, required: boolean): v is string =>
  typeof v === 'string' && isCleanText(v, max, required) && !LONE_SURROGATE.test(v);
const optionalText = (v: unknown, max: number): boolean => v === undefined || cleanText(v, max, false);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function parsePort(raw: unknown): RigPort | null {
  if (!isRecord(raw)) return null;
  const { id, label, dir, connector, note } = raw;
  if (!isId(id) || !cleanText(label, RIG_LIMITS.portLabelMax, true)) return null;
  if (!isOneOf<PortDir>(PORT_DIRS, dir) || !isOneOf<Connector>(CONNECTORS, connector)) return null;
  if (!optionalText(note, RIG_LIMITS.noteMax)) return null;
  return note ? { id, label, dir, connector, note: note as string } : { id, label, dir, connector };
}

/** A gear item, or null when anything in it is wrong (the whole item is then hidden). */
export function parseGear(raw: unknown): RigGear | null {
  if (!isRecord(raw)) return null;
  const { id, name, kind, specs, copiedFrom, ports } = raw;
  if (!isId(id) || !cleanText(name, RIG_LIMITS.nameMax, true) || !isOneOf<GearKind>(GEAR_KINDS, kind)) return null;
  if (!optionalText(specs, RIG_LIMITS.specsMax) || !optionalText(copiedFrom, RIG_LIMITS.copiedFromMax)) return null;
  if (!Array.isArray(ports) || ports.length < 1 || ports.length > RIG_LIMITS.portsPerGearMax) return null;
  const parsed: RigPort[] = [];
  for (const p of ports) {
    const port = parsePort(p);
    if (!port) return null;
    parsed.push(port);
  }
  if (new Set(parsed.map((p) => p.id)).size !== parsed.length) return null;
  const gear: RigGear = { id, name, kind, ports: parsed };
  if (specs) gear.specs = specs as string;
  if (copiedFrom) gear.copiedFrom = copiedFrom as string;
  return gear;
}

export type DiagramParse =
  | { status: 'ok'; diagram: RigDiagram; /** Nodes/cables hidden because their gear or ports changed. */ broken: number }
  | { status: 'unreadable' };

function parseRef(raw: unknown): { n: string; p: string } | null {
  return isRecord(raw) && isId(raw.n) && isId(raw.p) ? { n: raw.n, p: raw.p } : null;
}

/**
 * A diagram against the gear list it can use. Structural problems (bad shapes, duplicate ids, too
 * many items) make the whole diagram unreadable; a node whose gear is missing or a cable whose
 * ports changed is only hidden and counted in `broken`.
 */
export function parseDiagram(raw: unknown, gearById: ReadonlyMap<string, RigGear>): DiagramParse {
  const unreadable: DiagramParse = { status: 'unreadable' };
  if (!isRecord(raw) || !isId(raw.id) || !cleanText(raw.name, RIG_LIMITS.nameMax, true)) return unreadable;
  if (!Array.isArray(raw.nodes) || raw.nodes.length > RIG_LIMITS.nodesMax) return unreadable;
  if (!Array.isArray(raw.cables) || raw.cables.length > RIG_LIMITS.cablesMax) return unreadable;

  const nodeIds = new Set<string>();
  const nodes: RigNode[] = [];
  let broken = 0;
  for (const n of raw.nodes) {
    if (!isRecord(n) || !isId(n.id) || !isId(n.gearId) || !Number.isInteger(n.col)) return unreadable;
    const col = n.col as number;
    if (col < 0 || col >= RIG_COLS || nodeIds.has(n.id)) return unreadable;
    nodeIds.add(n.id);
    // Format 1 nodes use the diagram owner's own gear only. A node with an `owner` is some other
    // format; if cross-member references are ever added they MUST bump RIG_FORMAT, so that old clients
    // see `newer` and refuse to save instead of silently pruning them.
    if (hasOwn(n, 'owner')) return unreadable;
    if (!gearById.has(n.gearId)) {
      broken++;
      continue;
    }
    nodes.push({ id: n.id, gearId: n.gearId, col });
  }

  const cableIds = new Set<string>();
  const used = new Set<string>();
  const nodeGear = new Map(nodes.map((n) => [n.id, gearById.get(n.gearId)!]));
  const cables: RigCable[] = [];
  for (const c of raw.cables) {
    if (!isRecord(c) || !isId(c.id) || !optionalText(c.label, RIG_LIMITS.cableLabelMax)) return unreadable;
    const from = parseRef(c.from);
    const to = parseRef(c.to);
    if (!from || !to || cableIds.has(c.id)) return unreadable;
    cableIds.add(c.id);
    const fromPort = nodeGear.get(from.n)?.ports.find((p) => p.id === from.p);
    const toPort = nodeGear.get(to.n)?.ports.find((p) => p.id === to.p);
    const keys = [`${from.n}:${from.p}`, `${to.n}:${to.p}`];
    const legal = fromPort && toPort && from.n !== to.n && orderPorts(fromPort, toPort)?.[0] === fromPort;
    if (!legal || keys.some((k) => used.has(k))) {
      broken++;
      continue;
    }
    keys.forEach((k) => used.add(k));
    const cable: RigCable = { id: c.id, from, to };
    if (c.label) cable.label = c.label as string;
    cables.push(cable);
  }
  return { status: 'ok', diagram: { id: raw.id, name: raw.name, nodes, cables }, broken };
}

export type RowFailure = 'too-big' | 'malformed' | 'bounds' | 'format';

export type ParsedRig =
  | {
      kind: 'ok';
      draft: RigDraft;
      /** Gear items hidden because they were invalid. */
      hiddenGear: number;
      /** Diagrams that couldn't be read at all. */
      unreadableDiagrams: number;
      /** Nodes/cables hidden because their gear or ports changed. */
      brokenLinks: number;
    }
  | { kind: 'unreadable'; reason: RowFailure }
  /** Written by a newer version of the app: readable by nobody here, and the owner must not overwrite it. */
  | { kind: 'newer' };

function parseJsonArray(text: string): unknown[] | null {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** One member's stored row, strictly. The caller has already matched `row.bandId`/`row.owner` to who it expected. */
export function parseRigRow(row: RigRowRecord): ParsedRig {
  if (!Number.isInteger(row.format) || row.format < 1) return { kind: 'unreadable', reason: 'format' };
  if (row.format > RIG_FORMAT) return { kind: 'newer' };
  if (typeof row.gear !== 'string' || typeof row.diagrams !== 'string') return { kind: 'unreadable', reason: 'malformed' };
  if (rigRowBytes(row.gear, row.diagrams) > rigRowMaxBytes()) return { kind: 'unreadable', reason: 'too-big' };
  const rawGear = parseJsonArray(row.gear);
  const rawDiagrams = parseJsonArray(row.diagrams);
  if (!rawGear || !rawDiagrams) return { kind: 'unreadable', reason: 'malformed' };
  if (rawGear.length > RIG_LIMITS.gearMax || rawDiagrams.length > RIG_LIMITS.diagramsMax) {
    return { kind: 'unreadable', reason: 'bounds' };
  }

  const gear: RigGear[] = [];
  const seen = new Set<string>();
  let hiddenGear = 0;
  for (const g of rawGear) {
    const item = parseGear(g);
    if (!item) {
      hiddenGear++;
      continue;
    }
    if (seen.has(item.id)) return { kind: 'unreadable', reason: 'malformed' };
    seen.add(item.id);
    gear.push(item);
  }
  const gearById = new Map(gear.map((g) => [g.id, g]));

  const diagrams: RigDiagram[] = [];
  const diagramIds = new Set<string>();
  let unreadableDiagrams = 0;
  let brokenLinks = 0;
  for (const d of rawDiagrams) {
    const parsed = parseDiagram(d, gearById);
    if (parsed.status === 'unreadable' || diagramIds.has(parsed.diagram.id)) {
      unreadableDiagrams++;
      continue;
    }
    diagramIds.add(parsed.diagram.id);
    brokenLinks += parsed.broken;
    diagrams.push(parsed.diagram);
  }
  return { kind: 'ok', draft: { gear, diagrams }, hiddenGear, unreadableDiagrams, brokenLinks };
}

// ── Nodes with their gear ──────────────────────────────────────────────────

/** A diagram's nodes joined to the gear they use (what layout and drawing work from). */
export function resolveNodes(diagram: RigDiagram, gear: readonly RigGear[]): ResolvedNode[] {
  const byId = new Map(gear.map((g) => [g.id, g]));
  const out: ResolvedNode[] = [];
  for (const n of diagram.nodes) {
    const g = byId.get(n.gearId);
    if (g) out.push({ id: n.id, col: n.col, gear: g });
  }
  return out;
}

// ── Everyone's rows ────────────────────────────────────────────────────────

export interface MemberRig {
  owner: string;
  /** Display name. */
  name: string;
  state: 'ok' | 'none' | 'unreadable' | 'failed' | 'newer';
  draft: RigDraft;
  hiddenGear: number;
  unreadableDiagrams: number;
  brokenLinks: number;
  /** The stored row's `rev` (own-row conditional writes), when one exists and is readable. */
  rev: number | null;
}

const EMPTY_MEMBER = {
  draft: EMPTY_DRAFT,
  hiddenGear: 0,
  unreadableDiagrams: 0,
  brokenLinks: 0,
  rev: null,
} as const;

/**
 * Validates every participant's row independently (no row refers to another). Only valid, non-banned
 * members (plus the owner) are shown; a row for anyone else, or for another band, is never looked at.
 */
export function assembleRigMembers(args: {
  band: BandRecord;
  members: ValidMember[];
  sub: string;
  isMember: boolean;
  displayNames: ReadonlyMap<string, string>;
  reads: ReadonlyMap<string, RigRead>;
}): MemberRig[] {
  const { band, members, sub, isMember, displayNames, reads } = args;
  const { subs } = pickParticipants(members, band, sub, isMember);
  return subs.map((owner): MemberRig => {
    const name = displayNames.get(owner) ?? 'Member';
    const read = reads.get(owner);
    if (!read || read.status === 'failed') return { owner, name, state: 'failed', ...EMPTY_MEMBER };
    const row = read.row;
    if (!row) return { owner, name, state: 'none', ...EMPTY_MEMBER };
    if (row.bandId !== band.id || row.owner !== owner) return { owner, name, state: 'unreadable', ...EMPTY_MEMBER };
    const parsed = parseRigRow(row);
    if (parsed.kind === 'newer') return { owner, name, state: 'newer', ...EMPTY_MEMBER };
    if (parsed.kind === 'unreadable') return { owner, name, state: 'unreadable', ...EMPTY_MEMBER };
    return {
      owner,
      name,
      state: 'ok',
      draft: parsed.draft,
      hiddenGear: parsed.hiddenGear,
      unreadableDiagrams: parsed.unreadableDiagrams,
      brokenLinks: parsed.brokenLinks,
      rev: Number.isInteger(row.rev) && row.rev >= 1 ? row.rev : null,
    };
  });
}

/** True when the member's own row has content hidden on read, so Save would prune it (the owner is told). */
export const hasPendingCleanup = (m: Pick<MemberRig, 'hiddenGear' | 'unreadableDiagrams' | 'brokenLinks'>): boolean =>
  m.hiddenGear + m.unreadableDiagrams + m.brokenLinks > 0;
