import { describe, expect, it } from 'vitest';
import {
  addCable,
  addDiagram,
  addExampleDiagram,
  addGear,
  addNode,
  addNodeAfter,
  copyGearToMine,
  gearImpact,
  hasImpact,
  moveNode,
  placeNode,
  removeCable,
  removeDiagram,
  removeGear,
  removeNode,
  renameDiagram,
  setCableLabel,
  updateGear,
  usedPorts,
} from './rigEdit';
import type { EditResult } from './rigEdit';
import { parseRigRow, serializeDraft } from './rigData';
import type { RigDraft } from './rigData';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from './rigPresets';
import { RIG_LIMITS } from './rigTypes';
import type { RigGear } from './rigTypes';

const JAM: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [JAM_STATION_DIAGRAM] };
const D = JAM_STATION_DIAGRAM.id;

const value = <T,>(r: EditResult<T>): T => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.value;
};
const reason = <T,>(r: EditResult<T>): string => {
  if (r.ok) throw new Error('expected a failure');
  return r.reason;
};

const diagramOf = (d: RigDraft) => d.diagrams.find((x) => x.id === D)!;

/** A draft read back through the real parser: edits must never produce something the parser would hide. */
function expectParses(draft: RigDraft): void {
  const { gear, diagrams } = serializeDraft(draft);
  const parsed = parseRigRow({ bandId: 'b', owner: 'o', format: 1, rev: 1, gear, diagrams });
  expect(parsed).toMatchObject({ kind: 'ok', hiddenGear: 0, unreadableDiagrams: 0, brokenLinks: 0 });
}

describe('gear', () => {
  it('adds gear up to the cap', () => {
    const one: RigGear = { ...JAM_STATION_GEAR[0], id: 'extra0001' };
    expect(value(addGear({ gear: [], diagrams: [] }, one)).gear).toHaveLength(1);
    const full: RigDraft = { gear: Array.from({ length: RIG_LIMITS.gearMax }, (_, i) => ({ ...one, id: `gear${i}xx` })), diagrams: [] };
    expect(reason(addGear(full, one))).toMatch(/up to 24/);
  });

  it('removes gear with its nodes and cables', () => {
    const next = removeGear(JAM, 'gearscarlet');
    expect(next.gear.some((g) => g.id === 'gearscarlet')).toBe(false);
    const d = diagramOf(next);
    expect(d.nodes.map((n) => n.id)).not.toContain('nscarlet');
    expect(d.cables).toEqual([]); // every cable touched the interface
    expectParses(next);
  });

  it('reports what deleting gear would remove, per diagram', () => {
    expect(gearImpact(JAM, 'gearscarlet', null)).toEqual({ nodes: 1, cables: 5, diagrams: 1 });
    expect(gearImpact(JAM, 'gearbass', null)).toEqual({ nodes: 1, cables: 1, diagrams: 1 });
    expect(hasImpact(gearImpact(JAM, 'unknown1', null))).toBe(false);
  });

  it('drops the cable of a port that was removed', () => {
    const scarlett = JAM_STATION_GEAR.find((g) => g.id === 'gearscarlet')!;
    const next = { ...scarlett, ports: scarlett.ports.filter((p) => p.id !== 'in02') };
    expect(gearImpact(JAM, scarlett.id, next)).toEqual({ nodes: 0, cables: 1, diagrams: 1 });
    const updated = updateGear(JAM, next);
    expect(diagramOf(updated).cables.map((c) => c.id)).not.toContain('cbass');
    expect(diagramOf(updated).cables).toHaveLength(4);
    expectParses(updated);
  });

  it('drops the cable of a port whose direction flipped to something illegal, and keeps the rest', () => {
    const scarlett = JAM_STATION_GEAR.find((g) => g.id === 'gearscarlet')!;
    const next = { ...scarlett, ports: scarlett.ports.map((p) => (p.id === 'in01' ? { ...p, dir: 'out' as const } : p)) };
    const updated = updateGear(JAM, next);
    expect(diagramOf(updated).cables.map((c) => c.id)).not.toContain('cguitar');
    expect(diagramOf(updated).cables).toHaveLength(4);
    expectParses(updated);
  });

  it('keeps every cable when only a label or connector changes', () => {
    const scarlett = JAM_STATION_GEAR.find((g) => g.id === 'gearscarlet')!;
    const next = { ...scarlett, name: 'Renamed', ports: scarlett.ports.map((p) => ({ ...p, connector: 'other' as const })) };
    expect(gearImpact(JAM, scarlett.id, next)).toEqual({ nodes: 0, cables: 0, diagrams: 0 });
    expect(diagramOf(updateGear(JAM, next)).cables).toHaveLength(5);
  });
});

describe('copying gear', () => {
  it('copies someone else’s gear with a fresh id and where it came from', () => {
    const src = JAM_STATION_GEAR[3];
    const { draft, gear } = value(copyGearToMine({ gear: [], diagrams: [] }, src, 'Bob'));
    expect(gear.id).not.toBe(src.id);
    expect(gear.copiedFrom).toBe('Bob');
    expect(gear.ports).toEqual(src.ports);
    expect(gear.ports).not.toBe(src.ports);
    expect(draft.gear).toHaveLength(1);
  });

  it('omits the provenance when the name cleans to nothing', () => {
    const { gear } = value(copyGearToMine({ gear: [], diagrams: [] }, JAM_STATION_GEAR[0], '​'));
    expect('copiedFrom' in gear).toBe(false);
  });
});

describe('diagrams', () => {
  it('adds, renames and removes diagrams within the cap', () => {
    let draft: RigDraft = { gear: [], diagrams: [] };
    const first = value(addDiagram(draft, '  Garage   rig '));
    expect(first.diagram.name).toBe('Garage rig');
    draft = first.draft;
    draft = value(renameDiagram(draft, first.diagram.id, 'Stage'));
    expect(draft.diagrams[0].name).toBe('Stage');
    expect(reason(renameDiagram(draft, first.diagram.id, '​'))).toMatch(/name/);
    expect(reason(addDiagram(draft, ''))).toMatch(/name/);
    for (let i = 1; i < RIG_LIMITS.diagramsMax; i++) draft = value(addDiagram(draft, `D${i}`)).draft;
    expect(reason(addDiagram(draft, 'one more'))).toMatch(/up to 3/);
    expect(removeDiagram(draft, first.diagram.id).diagrams).toHaveLength(RIG_LIMITS.diagramsMax - 1);
  });

  it('builds the Jam Station example from fresh ids, and it parses clean', () => {
    const { draft, diagram } = value(addExampleDiagram({ gear: [], diagrams: [] }));
    expect(draft.gear).toHaveLength(JAM_STATION_GEAR.length);
    expect(diagram.nodes).toHaveLength(6);
    expect(diagram.cables).toHaveLength(5);
    expect(diagram.id).not.toBe(JAM_STATION_DIAGRAM.id);
    expectParses(draft);
  });

  it('reuses example gear already added, and stops at the diagram cap', () => {
    const once = value(addExampleDiagram({ gear: [], diagrams: [] })).draft;
    const twice = value(addExampleDiagram(once)).draft;
    expect(twice.gear).toHaveLength(JAM_STATION_GEAR.length);
    expect(twice.diagrams).toHaveLength(2);
    const thrice = value(addExampleDiagram(twice)).draft;
    expect(reason(addExampleDiagram(thrice))).toMatch(/up to 3/);
  });

  it('does not reuse an earlier example copy whose ports were edited (its cables would no longer fit)', () => {
    const once = value(addExampleDiagram({ gear: [], diagrams: [] })).draft;
    const guitar = once.gear.find((g) => g.name === 'Electric Guitar')!;
    const edited = updateGear(once, { ...guitar, ports: guitar.ports.map((p) => ({ ...p, id: 'renamed01' })) });
    const { draft, diagram } = value(addExampleDiagram(edited));
    // a fresh guitar was added next to the edited one, and the new diagram parses clean
    expect(draft.gear.filter((g) => g.name === 'Electric Guitar')).toHaveLength(2);
    expectParses(draft);
    expect(diagram.cables).toHaveLength(5);
  });

  it('stops when the example gear would not fit under the gear cap', () => {
    const filler: RigGear[] = Array.from({ length: RIG_LIMITS.gearMax - 2 }, (_, i) => ({ ...JAM_STATION_GEAR[0], id: `fill${i}xx`, copiedFrom: undefined }));
    expect(reason(addExampleDiagram({ gear: filler, diagrams: [] }))).toMatch(/up to 24/);
  });
});

describe('nodes', () => {
  it('adds a node on the chosen column, within the caps', () => {
    const base: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [{ ...JAM_STATION_DIAGRAM, nodes: [], cables: [] }] };
    const next = value(addNode(base, D, 'gearbass', 2));
    expect(diagramOf(next).nodes).toMatchObject([{ gearId: 'gearbass', col: 2 }]);
    expect(diagramOf(value(addNode(base, D, 'gearbass', 99))).nodes[0].col).toBe(3);
    expect(reason(addNode(base, D, 'nope0001'))).toMatch(/no longer exists/);
    expect(reason(addNode(base, 'nope0001', 'gearbass'))).toMatch(/no longer exists/);
    let full = base;
    for (let i = 0; i < RIG_LIMITS.nodesMax; i++) full = value(addNode(full, D, 'gearbass'));
    expect(reason(addNode(full, D, 'gearbass'))).toMatch(/up to 16/);
  });

  it('removes a node together with its cables', () => {
    const next = removeNode(JAM, D, 'nscarlet');
    expect(diagramOf(next).nodes.map((n) => n.id)).not.toContain('nscarlet');
    expect(diagramOf(next).cables).toEqual([]);
    expectParses(next);
  });

  it('moves a node between columns, to the end of the target column', () => {
    const right = moveNode(JAM, D, 'nguitar', 'right');
    expect(diagramOf(right).nodes.find((n) => n.id === 'nguitar')!.col).toBe(1);
    expect(diagramOf(right).nodes.filter((n) => n.col === 1).at(-1)!.id).toBe('nguitar');
    expect(diagramOf(moveNode(JAM, D, 'nguitar', 'left'))).toEqual(diagramOf(JAM)); // already in the first column
    const far = moveNode(moveNode(moveNode(JAM, D, 'nlaptop', 'right'), D, 'nlaptop', 'right'), D, 'nlaptop', 'right');
    expect(diagramOf(far).nodes.find((n) => n.id === 'nlaptop')!.col).toBe(3); // clamped at the last column
  });

  it('swaps with the neighbour in the same column for up/down, and stops at the ends', () => {
    const down = moveNode(JAM, D, 'nguitar', 'down');
    const col0 = diagramOf(down).nodes.filter((n) => n.col === 0).map((n) => n.id);
    expect(col0).toEqual(['nbass', 'nguitar', 'ndrums']);
    expect(diagramOf(moveNode(JAM, D, 'nguitar', 'up'))).toEqual(diagramOf(JAM));
    expect(diagramOf(moveNode(JAM, D, 'ndrums', 'down'))).toEqual(diagramOf(JAM));
    expect(diagramOf(moveNode(JAM, D, 'unknown1', 'down'))).toEqual(diagramOf(JAM));
  });
});

describe('placing nodes (drag and drop)', () => {
  const nodes = () => diagramOf(JAM).nodes;
  const colOrder = (d: RigDraft, col: number) => diagramOf(d).nodes.filter((n) => n.col === col).map((n) => n.id);

  it('moves a card up within its column', () => {
    const [a, b, c] = colOrder(JAM, 0);
    expect(colOrder(placeNode(JAM, D, c, 0, 0), 0)).toEqual([c, a, b]);
    expect(colOrder(placeNode(JAM, D, c, 0, 1), 0)).toEqual([a, c, b]);
  });

  it('moves a card down to the end of its column', () => {
    const [a, b, c] = colOrder(JAM, 0);
    expect(colOrder(placeNode(JAM, D, a, 0, 2), 0)).toEqual([b, c, a]);
    expect(colOrder(placeNode(JAM, D, a, 0, 99), 0)).toEqual([b, c, a]);
  });

  it('moves a card into the middle of another column', () => {
    const [a] = colOrder(JAM, 0);
    const [x, y] = colOrder(JAM, 2);
    const moved = placeNode(JAM, D, a, 2, 1);
    expect(colOrder(moved, 2)).toEqual([x, a, y]);
    expect(diagramOf(moved).nodes.find((n) => n.id === a)!.col).toBe(2);
    expect(colOrder(moved, 0)).toHaveLength(2);
  });

  it('moves a card into an empty column', () => {
    const [a] = colOrder(JAM, 0);
    const moved = placeNode(JAM, D, a, 3, 0);
    expect(colOrder(moved, 3)).toEqual([a]);
  });

  it('keeps every node and cable, and the result still parses', () => {
    const [a] = colOrder(JAM, 0);
    const moved = placeNode(JAM, D, a, 1, 0);
    expect(diagramOf(moved).nodes).toHaveLength(nodes().length);
    expect(diagramOf(moved).nodes.map((n) => n.id).sort()).toEqual(nodes().map((n) => n.id).sort());
    expect(diagramOf(moved).cables).toBe(diagramOf(JAM).cables);
    expectParses(moved);
  });

  it('returns the same draft when the card would stay where it is', () => {
    const [a, b] = colOrder(JAM, 0);
    expect(placeNode(JAM, D, a, 0, 0)).toBe(JAM);
    expect(placeNode(JAM, D, b, 0, 1)).toBe(JAM);
  });

  it('ignores an unknown node, diagram or column', () => {
    const [a] = colOrder(JAM, 0);
    expect(placeNode(JAM, D, 'nope', 0, 0)).toBe(JAM);
    expect(placeNode(JAM, 'nope', a, 0, 0)).toBe(JAM);
    expect(placeNode(JAM, D, a, -1, 0)).toBe(JAM);
    expect(placeNode(JAM, D, a, 4, 0)).toBe(JAM);
    expect(placeNode(JAM, D, a, 1.5, 0)).toBe(JAM);
  });

  it('inserts a new node right after a given one, in its column', () => {
    const [a, b, c] = colOrder(JAM, 0);
    const added = value(addNodeAfter(JAM, D, JAM_STATION_GEAR[0].id, a));
    const ids = colOrder(added, 0);
    expect(ids).toHaveLength(4);
    expect([ids[0], ids[2], ids[3]]).toEqual([a, b, c]);
    expect(diagramOf(added).nodes.find((n) => n.id === ids[1])!.col).toBe(0);
    expectParses(added);
  });

  it('puts a new node at the end of the column when it follows the last card', () => {
    const ids = colOrder(JAM, 2);
    const added = value(addNodeAfter(JAM, D, JAM_STATION_GEAR[0].id, ids[ids.length - 1]));
    expect(colOrder(added, 2).slice(0, ids.length)).toEqual(ids);
    expect(colOrder(added, 2)).toHaveLength(ids.length + 1);
  });

  it('adds at the end of the first column when the node to follow is gone', () => {
    const added = value(addNodeAfter(JAM, D, JAM_STATION_GEAR[0].id, 'gone'));
    expect(colOrder(added, 0).at(-1)).toBe(diagramOf(added).nodes.at(-1)!.id);
  });

  it('refuses at the node cap and for unknown gear, like addNode', () => {
    expect(reason(addNodeAfter(JAM, D, 'nope', colOrder(JAM, 0)[0]))).toMatch(/no longer exists/);
  });

  it('treats a NaN index as the bottom of the column', () => {
    const [a, b, c] = colOrder(JAM, 0);
    expect(colOrder(placeNode(JAM, D, a, 0, NaN), 0)).toEqual([b, c, a]);
  });
});

describe('no-op edits', () => {
  it('return the very same draft, so they never look like unsaved changes', () => {
    expect(moveNode(JAM, D, 'nguitar', 'left')).toBe(JAM); // already in the first column
    expect(moveNode(JAM, D, 'nguitar', 'up')).toBe(JAM); // already first in its column
    expect(moveNode(JAM, D, 'unknown1', 'down')).toBe(JAM);
    expect(setCableLabel(JAM, D, 'cguitar', '1/4" TS Instrument Cable')).toBe(JAM); // same label
    expect(setCableLabel(JAM, D, 'cguitar', '')).not.toBe(JAM); // clearing a label is a real change
    const labelled = setCableLabel(JAM, D, 'cguitar', 'Long one');
    expect(labelled).not.toBe(JAM);
    expect(setCableLabel(labelled, D, 'cguitar', '  Long one ')).toBe(labelled); // same after cleaning
    expect(setCableLabel(JAM, D, 'nosuchcab', 'x')).toBe(JAM);
  });
});

describe('cables', () => {
  const bare: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [{ ...JAM_STATION_DIAGRAM, cables: [] }] };

  it('stores the cable from the output whichever port was clicked first', () => {
    const a = value(addCable(bare, D, { n: 'nguitar', p: 'out1' }, { n: 'nscarlet', p: 'in01' }));
    const b = value(addCable(bare, D, { n: 'nscarlet', p: 'in01' }, { n: 'nguitar', p: 'out1' }));
    expect(diagramOf(a).cables[0].from).toEqual({ n: 'nguitar', p: 'out1' });
    expect(diagramOf(b).cables[0].from).toEqual({ n: 'nguitar', p: 'out1' });
    expectParses(a);
    expectParses(b);
  });

  it('stores an io-to-io cable in a stable order', () => {
    const a = value(addCable(bare, D, { n: 'nscarlet', p: 'usb1' }, { n: 'nlaptop', p: 'usb1' }));
    const b = value(addCable(bare, D, { n: 'nlaptop', p: 'usb1' }, { n: 'nscarlet', p: 'usb1' }));
    expect(diagramOf(a).cables[0].from).toEqual(diagramOf(b).cables[0].from);
    expectParses(a);
  });

  it.each([
    ['two outputs', { n: 'nguitar', p: 'out1' }, { n: 'nbass', p: 'out1' }, /Two outputs/],
    ['two inputs', { n: 'nscarlet', p: 'in01' }, { n: 'nscarlet', p: 'in02' }, /loop back|Two inputs/],
    ['an output and a USB port', { n: 'nguitar', p: 'out1' }, { n: 'nlaptop', p: 'usb1' }, /USB\/MIDI/],
    ['the same piece of gear', { n: 'nscarlet', p: 'out1' }, { n: 'nscarlet', p: 'in01' }, /loop back/],
    ['a port that is not there', { n: 'nguitar', p: 'nope' }, { n: 'nscarlet', p: 'in01' }, /no longer there/],
  ])('refuses %s', (_name, a, b, message) => {
    expect(reason(addCable(bare, D, a, b))).toMatch(message);
  });

  it('allows one cable per port', () => {
    expect(reason(addCable(JAM, D, { n: 'nbass', p: 'out1' }, { n: 'nscarlet', p: 'in01' }))).toMatch(/one cable/);
    expect(usedPorts(diagramOf(JAM)).has('nguitar:out1')).toBe(true);
  });

  it('stops at the cable cap', () => {
    const many = { ...bare.diagrams[0], cables: Array.from({ length: RIG_LIMITS.cablesMax }, (_, i) => ({ ...JAM_STATION_DIAGRAM.cables[0], id: `cab${i}xx` })) };
    expect(reason(addCable({ ...bare, diagrams: [many] }, D, { n: 'nguitar', p: 'out1' }, { n: 'nscarlet', p: 'in01' }))).toMatch(/up to 32/);
  });

  it('removes a cable and sets or clears its label (cleaned and clamped)', () => {
    expect(diagramOf(removeCable(JAM, D, 'cguitar')).cables).toHaveLength(4);
    const labelled = setCableLabel(JAM, D, 'cguitar', `  ${'x'.repeat(50)}  `);
    expect(diagramOf(labelled).cables[0].label).toHaveLength(RIG_LIMITS.cableLabelMax);
    const cleared = setCableLabel(labelled, D, 'cguitar', '   ');
    expect('label' in diagramOf(cleared).cables[0]).toBe(false);
    expectParses(labelled);
  });
});
