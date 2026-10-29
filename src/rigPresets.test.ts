import { describe, expect, it } from 'vitest';
import { isCleanText } from './bandUtils';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR, RIG_PRESETS } from './rigPresets';
import { CONNECTORS, GEAR_KINDS, PORT_DIRS, RIG_COLS, RIG_LIMITS } from './rigTypes';
import type { RigGear } from './rigTypes';
import { orderPorts } from './rigUtils';

const ID = new RegExp(`^[a-z0-9]{${RIG_LIMITS.idMin},${RIG_LIMITS.idMax}}$`);

function expectValidGear(g: Omit<RigGear, 'id' | 'copiedFrom'> & { id?: string }): void {
  if (g.id !== undefined) expect(g.id).toMatch(ID);
  expect(isCleanText(g.name, RIG_LIMITS.nameMax, true)).toBe(true);
  expect(isCleanText(g.specs, RIG_LIMITS.specsMax, false)).toBe(true);
  expect(GEAR_KINDS).toContain(g.kind);
  expect(g.ports.length).toBeGreaterThan(0);
  expect(g.ports.length).toBeLessThanOrEqual(RIG_LIMITS.portsPerGearMax);
  expect(new Set(g.ports.map(p => p.id)).size).toBe(g.ports.length);
  for (const p of g.ports) {
    expect(p.id).toMatch(ID);
    expect(isCleanText(p.label, RIG_LIMITS.portLabelMax, true)).toBe(true);
    expect(isCleanText(p.note, RIG_LIMITS.noteMax, false)).toBe(true);
    expect(PORT_DIRS).toContain(p.dir);
    expect(CONNECTORS).toContain(p.connector);
  }
}

describe('RIG_PRESETS', () => {
  it('has unique keys and every preset fits the limits', () => {
    expect(new Set(RIG_PRESETS.map(p => p.key)).size).toBe(RIG_PRESETS.length);
    for (const p of RIG_PRESETS) expectValidGear(p.gear);
  });
});

describe('Jam Station example', () => {
  it('has valid gear that fits the limits', () => {
    expect(JAM_STATION_GEAR.length).toBeLessThanOrEqual(RIG_LIMITS.gearMax);
    expect(new Set(JAM_STATION_GEAR.map(g => g.id)).size).toBe(JAM_STATION_GEAR.length);
    for (const g of JAM_STATION_GEAR) expectValidGear(g);
  });

  it('has a diagram within the limits whose nodes and cables all resolve', () => {
    const d = JAM_STATION_DIAGRAM;
    expect(d.id).toMatch(ID);
    expect(d.nodes.length).toBeLessThanOrEqual(RIG_LIMITS.nodesMax);
    expect(d.cables.length).toBeLessThanOrEqual(RIG_LIMITS.cablesMax);
    const gearById = new Map(JAM_STATION_GEAR.map(g => [g.id, g]));
    const nodeGear = new Map<string, RigGear>();
    for (const n of d.nodes) {
      expect(n.id).toMatch(ID);
      expect(n.col).toBeGreaterThanOrEqual(0);
      expect(n.col).toBeLessThan(RIG_COLS);
      expect(gearById.has(n.gearId)).toBe(true);
      nodeGear.set(n.id, gearById.get(n.gearId)!);
    }
    const used = new Set<string>();
    for (const c of d.cables) {
      expect(c.id).toMatch(ID);
      expect(isCleanText(c.label, RIG_LIMITS.cableLabelMax, false)).toBe(true);
      const from = nodeGear.get(c.from.n)?.ports.find(p => p.id === c.from.p);
      const to = nodeGear.get(c.to.n)?.ports.find(p => p.id === c.to.p);
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      expect(orderPorts(from!, to!)).not.toBeNull();
      for (const key of [`${c.from.n}:${c.from.p}`, `${c.to.n}:${c.to.p}`]) {
        expect(used.has(key)).toBe(false); // one cable per port
        used.add(key);
      }
    }
  });
});
