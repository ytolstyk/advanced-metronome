import { describe, expect, it } from 'vitest';
import { band, BOB, ME, makeView, OWNER } from './availabilityTestHelpers';
import {
  RIG_FORMAT,
  RIG_ID_PATTERN,
  assembleRigMembers,
  hasPendingCleanup,
  newRigId,
  parseDiagram,
  parseGear,
  parseRigRow,
  resolveNodes,
  rigRowBytes,
  rigRowMaxBytes,
  serializeDraft,
  worstCaseDraft,
} from './rigData';
import type { RigDraft, RigRead, RigRowRecord } from './rigData';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from './rigPresets';
import { RIG_LIMITS } from './rigTypes';
import type { RigGear } from './rigTypes';

const JAM: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [JAM_STATION_DIAGRAM] };

function rowOf(draft: RigDraft, over: Partial<RigRowRecord> = {}): RigRowRecord {
  const { gear, diagrams } = serializeDraft(draft);
  return { bandId: 'band-1', owner: ME, format: RIG_FORMAT, rev: 1, gear, diagrams, ...over };
}

const gearById = new Map(JAM_STATION_GEAR.map((g) => [g.id, g]));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('newRigId', () => {
  it('makes ids the validator accepts', () => {
    for (let i = 0; i < 50; i++) expect(newRigId()).toMatch(RIG_ID_PATTERN);
  });
});

describe('size budget', () => {
  it('derives a cap from the limits that leaves room under the 400 KB DynamoDB item limit', () => {
    expect(rigRowMaxBytes()).toBeGreaterThan(0);
    expect(rigRowMaxBytes()).toBeLessThanOrEqual(250_000);
  });

  it('lets a maximal valid row (4-byte characters, longest ids) round-trip through the validator', () => {
    const draft = worstCaseDraft();
    const { gear, diagrams } = serializeDraft(draft);
    expect(rigRowBytes(gear, diagrams)).toBeLessThanOrEqual(rigRowMaxBytes());
    const parsed = parseRigRow(rowOf(draft));
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.hiddenGear + parsed.unreadableDiagrams + parsed.brokenLinks).toBe(0);
    expect(parsed.draft).toEqual(draft);
    expect(parsed.draft.gear).toHaveLength(RIG_LIMITS.gearMax);
    expect(parsed.draft.diagrams[0].cables).toHaveLength(RIG_LIMITS.cablesMax);
  });

  it('refuses a row over the cap without parsing it', () => {
    const big = rowOf(JAM, { gear: `[${'"x",'.repeat(rigRowMaxBytes())}"x"]` });
    expect(parseRigRow(big)).toEqual({ kind: 'unreadable', reason: 'too-big' });
  });
});

describe('parseRigRow', () => {
  it('reads the Jam Station example back unchanged', () => {
    const parsed = parseRigRow(rowOf(JAM));
    expect(parsed).toMatchObject({ kind: 'ok', hiddenGear: 0, unreadableDiagrams: 0, brokenLinks: 0 });
    if (parsed.kind === 'ok') expect(parsed.draft).toEqual(JAM);
  });

  it('reads an empty row', () => {
    expect(parseRigRow(rowOf({ gear: [], diagrams: [] }))).toMatchObject({ kind: 'ok', draft: { gear: [], diagrams: [] } });
  });

  it.each([
    ['format 0', { format: 0 }, { kind: 'unreadable', reason: 'format' }],
    ['non-integer format', { format: 1.5 }, { kind: 'unreadable', reason: 'format' }],
    ['a newer format', { format: 2 }, { kind: 'newer' }],
    ['gear that is not JSON', { gear: 'nope' }, { kind: 'unreadable', reason: 'malformed' }],
    ['gear that is an object', { gear: '{}' }, { kind: 'unreadable', reason: 'malformed' }],
    ['diagrams that are not JSON', { diagrams: '[' }, { kind: 'unreadable', reason: 'malformed' }],
    ['fields that are not strings', { gear: 5 as unknown as string }, { kind: 'unreadable', reason: 'malformed' }],
  ] as const)('hides the row for %s', (_name, over, expected) => {
    expect(parseRigRow(rowOf(JAM, over as Partial<RigRowRecord>))).toEqual(expected);
  });

  it('hides the row when there are more gear items or diagrams than the limits allow', () => {
    const manyGear = Array.from({ length: RIG_LIMITS.gearMax + 1 }, () => JAM_STATION_GEAR[0]);
    expect(parseRigRow(rowOf(JAM, { gear: JSON.stringify(manyGear) }))).toEqual({ kind: 'unreadable', reason: 'bounds' });
    const manyDiagrams = Array.from({ length: RIG_LIMITS.diagramsMax + 1 }, () => JAM_STATION_DIAGRAM);
    expect(parseRigRow(rowOf(JAM, { diagrams: JSON.stringify(manyDiagrams) }))).toEqual({ kind: 'unreadable', reason: 'bounds' });
  });

  it('hides the row when two gear items share an id', () => {
    const dup = [JAM_STATION_GEAR[0], JAM_STATION_GEAR[0]];
    expect(parseRigRow(rowOf(JAM, { gear: JSON.stringify(dup) }))).toEqual({ kind: 'unreadable', reason: 'malformed' });
  });

  it('hides one bad gear item and keeps the rest, counting it', () => {
    const bad = { ...JAM_STATION_GEAR[0], name: 'Sneaky​name' };
    const parsed = parseRigRow(rowOf(JAM, { gear: JSON.stringify([bad, JAM_STATION_GEAR[1]]) }));
    expect(parsed).toMatchObject({ kind: 'ok', hiddenGear: 1 });
    if (parsed.kind === 'ok') expect(parsed.draft.gear.map((g) => g.id)).toEqual([JAM_STATION_GEAR[1].id]);
  });

  it('counts links that lost their gear (the diagram stays, the broken parts are hidden)', () => {
    const parsed = parseRigRow(rowOf(JAM, { gear: JSON.stringify(JAM_STATION_GEAR.filter((g) => g.id !== 'gearbass')) }));
    expect(parsed).toMatchObject({ kind: 'ok', unreadableDiagrams: 0 });
    if (parsed.kind !== 'ok') return;
    expect(parsed.brokenLinks).toBe(2); // the bass node and its cable
    expect(hasPendingCleanup(parsed)).toBe(true);
    expect(parsed.draft.diagrams[0].nodes.map((n) => n.id)).not.toContain('nbass');
    expect(parsed.draft.diagrams[0].cables.map((c) => c.id)).not.toContain('cbass');
  });

  it('does not let __proto__ keys leak into parsed objects', () => {
    const evil = `[{"id":"gear0001","name":"Evil","kind":"other","ports":[{"id":"port0001","label":"A","dir":"in","connector":"ts","__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}]`;
    const parsed = parseRigRow({ ...rowOf(JAM), gear: evil, diagrams: '[]' });
    expect(parsed.kind).toBe('ok');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (parsed.kind === 'ok') {
      expect(Object.keys(parsed.draft.gear[0])).not.toContain('__proto__');
      expect(Object.getPrototypeOf(parsed.draft.gear[0])).toBe(Object.prototype);
    }
  });
});

describe('parseGear', () => {
  const ok = JAM_STATION_GEAR[3];

  it('accepts valid gear and drops unknown keys', () => {
    expect(parseGear({ ...clone(ok), extra: 'x' })).toEqual(ok);
  });

  it.each([
    ['a non-object', 5],
    ['a bad id', { ...ok, id: 'AB' }],
    ['a too-long id', { ...ok, id: 'a'.repeat(13) }],
    ['an unknown kind', { ...ok, kind: 'banjo' }],
    ['no ports', { ...ok, ports: [] }],
    ['too many ports', { ...ok, ports: Array.from({ length: 13 }, (_, i) => ({ id: `port${i}`, label: 'P', dir: 'in', connector: 'ts' })) }],
    ['duplicate port ids', { ...ok, ports: [ok.ports[0], ok.ports[0]] }],
    ['an unknown connector', { ...ok, ports: [{ ...ok.ports[0], connector: 'banana' }] }],
    ['an unknown direction', { ...ok, ports: [{ ...ok.ports[0], dir: 'sideways' }] }],
    ['an over-long name', { ...ok, name: 'x'.repeat(RIG_LIMITS.nameMax + 1) }],
    ['an empty name', { ...ok, name: '' }],
    ['padded text', { ...ok, name: ' padded ' }],
    ['non-string specs', { ...ok, specs: 5 }],
  ])('rejects %s', (_name, raw) => {
    expect(parseGear(raw)).toBeNull();
  });
});

describe('lone surrogates', () => {
  it('hide a gear item (they would be written as 6 bytes each and break the size budget)', () => {
    const lone = { ...JAM_STATION_GEAR[0], name: 'Bad\ud800name' };
    expect(parseGear(lone)).toBeNull();
    expect(parseGear({ ...JAM_STATION_GEAR[0], specs: 'trail\udc00' })).toBeNull();
    expect(parseGear({ ...JAM_STATION_GEAR[0], name: 'Fine \u{1F3B8} pair' })).not.toBeNull();
  });
});

describe('parseDiagram', () => {
  const diagram = () => clone(JAM_STATION_DIAGRAM);

  it('accepts the example', () => {
    expect(parseDiagram(diagram(), gearById)).toEqual({ status: 'ok', diagram: JAM_STATION_DIAGRAM, broken: 0 });
  });

  it.each([
    ['a duplicate node id', (d: ReturnType<typeof diagram>) => { d.nodes[1].id = d.nodes[0].id; }],
    ['a duplicate cable id', (d: ReturnType<typeof diagram>) => { d.cables[1].id = d.cables[0].id; }],
    ['a column out of range', (d: ReturnType<typeof diagram>) => { d.nodes[0].col = 4; }],
    ['a huge column', (d: ReturnType<typeof diagram>) => { d.nodes[0].col = 1e9; }],
    ['a fractional column', (d: ReturnType<typeof diagram>) => { d.nodes[0].col = 1.5; }],
    ['a malformed cable endpoint', (d: ReturnType<typeof diagram>) => { (d.cables[0] as unknown as { from: unknown }).from = 'x'; }],
    ['too many cables', (d: ReturnType<typeof diagram>) => { d.cables = Array.from({ length: 33 }, (_, i) => ({ ...JAM_STATION_DIAGRAM.cables[0], id: `cab${i}xx` })); }],
    ['an over-long cable label', (d: ReturnType<typeof diagram>) => { d.cables[0].label = 'x'.repeat(31); }],
    ['an empty name', (d: ReturnType<typeof diagram>) => { d.name = ''; }],
  ])('makes the diagram unreadable for %s', (_name, mutate) => {
    const d = diagram();
    mutate(d);
    expect(parseDiagram(d, gearById)).toEqual({ status: 'unreadable' });
  });

  it('makes a diagram unreadable when a node carries an owner (that is a different format, never silently pruned)', () => {
    const d = diagram();
    (d.nodes[0] as unknown as { owner: string }).owner = 'someone';
    expect(parseDiagram(d, gearById)).toEqual({ status: 'unreadable' });
  });

  it('hides a cable stored input-to-output, one on a port that does not exist, a loop on one node, and a reused port', () => {
    const d = diagram();
    d.cables[0] = { ...d.cables[0], from: d.cables[0].to, to: d.cables[0].from }; // reversed
    d.cables[1].from.p = 'nope'; // missing port
    d.cables[2].to = { n: d.cables[2].from.n, p: 'outl' }; // loop on one node
    d.cables[4] = { ...d.cables[3], id: 'cdupe' }; // reuses the USB ports
    const parsed = parseDiagram(d, gearById);
    expect(parsed).toMatchObject({ status: 'ok', broken: 4 });
    if (parsed.status === 'ok') expect(parsed.diagram.cables.map((c) => c.id)).toEqual(['cusb']);
  });

  it('keeps an io-to-io cable whichever way round it is stored', () => {
    const d = diagram();
    const usb = d.cables.find((c) => c.id === 'cusb')!;
    [usb.from, usb.to] = [usb.to, usb.from];
    expect(parseDiagram(d, gearById)).toMatchObject({ status: 'ok', broken: 0 });
  });
});

describe('resolveNodes', () => {
  it('joins nodes to their gear and skips nodes whose gear is gone', () => {
    const nodes = resolveNodes(JAM_STATION_DIAGRAM, JAM_STATION_GEAR);
    expect(nodes).toHaveLength(6);
    expect(nodes[0].gear.name).toBe('Electric Guitar');
    expect(resolveNodes(JAM_STATION_DIAGRAM, [])).toEqual([]);
  });
});

describe('assembleRigMembers', () => {
  const view = makeView();
  const args = (reads: Map<string, RigRead>, sub = ME) => ({
    band: view.band,
    members: view.members,
    sub,
    isMember: true,
    displayNames: view.displayNames,
    reads,
  });

  it('lists the owner and the caller first, then members, each in its own state', () => {
    const reads = new Map<string, RigRead>([
      [OWNER, { status: 'ok', row: null }],
      [ME, { status: 'ok', row: rowOf(JAM, { rev: 4 }) }],
      [BOB, { status: 'failed' }],
    ]);
    const members = assembleRigMembers(args(reads));
    expect(members.map((m) => [m.owner, m.state])).toEqual([[OWNER, 'none'], [ME, 'ok'], [BOB, 'failed']]);
    expect(members[1]).toMatchObject({ name: 'Me', rev: 4 });
    expect(members[1].draft.diagrams).toHaveLength(1);
  });

  it('treats a missing read as failed, never as "nothing"', () => {
    const members = assembleRigMembers(args(new Map()));
    expect(members.every((m) => m.state === 'failed')).toBe(true);
  });

  it('hides a row stored under another band or owner, and an unparseable one', () => {
    const reads = new Map<string, RigRead>([
      [OWNER, { status: 'ok', row: rowOf(JAM, { owner: BOB }) }],
      [ME, { status: 'ok', row: rowOf(JAM, { bandId: 'other-band' }) }],
      [BOB, { status: 'ok', row: rowOf(JAM, { gear: '[' , owner: BOB }) }],
    ]);
    const members = assembleRigMembers(args(reads));
    expect(members.map((m) => m.state)).toEqual(['unreadable', 'unreadable', 'unreadable']);
    expect(members.every((m) => m.draft.gear.length === 0)).toBe(true);
  });

  it('flags a row from a newer app', () => {
    const reads = new Map<string, RigRead>([[ME, { status: 'ok', row: rowOf(JAM, { format: 2 }) }]]);
    expect(assembleRigMembers(args(reads)).find((m) => m.owner === ME)?.state).toBe('newer');
  });

  it('only looks at valid members: a banned member or stranger never appears', () => {
    const stranger = 'sub-mallory';
    const reads = new Map<string, RigRead>([[stranger, { status: 'ok', row: rowOf(JAM, { owner: stranger }) }]]);
    expect(assembleRigMembers(args(reads)).map((m) => m.owner)).not.toContain(stranger);
    const banned = makeView({}, band({ bannedSubs: [BOB] }));
    const withoutBob = assembleRigMembers({ ...args(reads), band: banned.band, members: banned.members.filter((m) => m.owner !== BOB) });
    expect(withoutBob.map((m) => m.owner)).not.toContain(BOB);
  });

  it('reports no usable rev for a stored rev that is not a positive integer', () => {
    const reads = new Map<string, RigRead>([[ME, { status: 'ok', row: rowOf(JAM, { rev: 0 }) }]]);
    expect(assembleRigMembers(args(reads)).find((m) => m.owner === ME)?.rev).toBeNull();
  });
});

describe('gear fixtures', () => {
  it('worst-case gear items individually parse', () => {
    const g: RigGear = worstCaseDraft().gear[0];
    expect(parseGear(g)).toEqual(g);
  });
});
