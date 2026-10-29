import { describe, expect, it } from 'vitest';
import { CABLE_COLOR, cableKind, connectionProblem, orderPorts } from './rigUtils';
import type { Connector, PortDir, RigPort } from './rigTypes';

const port = (dir: PortDir, connector: Connector): RigPort => ({ id: 'p001', label: 'P', dir, connector });

describe('orderPorts', () => {
  it.each([
    ['out then in', 'out', 'in', true],
    ['in then out', 'in', 'out', true],
    ['io and io', 'io', 'io', true],
    ['out and out', 'out', 'out', false],
    ['in and in', 'in', 'in', false],
    ['out and io', 'out', 'io', false],
    ['io and in', 'io', 'in', false],
  ] as const)('%s', (_name, a, b, ok) => {
    expect(orderPorts({ dir: a }, { dir: b }) !== null).toBe(ok);
  });

  it('puts the output first whichever port was clicked first', () => {
    const out: { dir: PortDir; tag: string } = { dir: 'out', tag: 'o' };
    const inn: { dir: PortDir; tag: string } = { dir: 'in', tag: 'i' };
    expect(orderPorts(inn, out)).toEqual([out, inn]);
    expect(orderPorts(out, inn)).toEqual([out, inn]);
  });
});

describe('connectionProblem', () => {
  it('is null for a legal pair', () => {
    expect(connectionProblem(port('out', 'ts'), port('in', 'ts'))).toBeNull();
    expect(connectionProblem(port('io', 'usb'), port('io', 'usb'))).toBeNull();
  });

  it('explains illegal pairs in plain language', () => {
    expect(connectionProblem(port('in', 'ts'), port('in', 'ts'))).toBe("Two inputs can't be connected");
    expect(connectionProblem(port('out', 'ts'), port('out', 'ts'))).toBe("Two outputs can't be connected");
    expect(connectionProblem(port('io', 'usb'), port('in', 'ts'))).toMatch(/USB\/MIDI/);
  });
});

describe('cableKind', () => {
  it('names a matching pair after its connector and colours it', () => {
    const k = cableKind(port('out', 'ts'), port('in', 'ts'));
    expect(k).toMatchObject({ type: 'ts', label: '1/4" TS', needsAdapter: false, undirected: false, color: CABLE_COLOR.ts });
  });

  it('lets a combo jack take the connector plugged into it', () => {
    expect(cableKind(port('out', 'ts'), port('in', 'combo'))).toMatchObject({ type: 'ts', label: '1/4" TS', needsAdapter: false });
    expect(cableKind(port('out', 'xlr'), port('in', 'combo'))).toMatchObject({ type: 'xlr', needsAdapter: false });
  });

  it('lets "other" match anything without an adapter note', () => {
    expect(cableKind(port('out', 'other'), port('in', 'usb'))).toMatchObject({ type: 'usb', needsAdapter: false });
  });

  it('treats TRS to XLR as an ordinary cable, coloured XLR', () => {
    const k = cableKind(port('out', 'trs'), port('in', 'xlr'));
    expect(k).toMatchObject({ type: 'xlr', label: '1/4" TRS ➔ XLR', needsAdapter: false, color: CABLE_COLOR.xlr });
  });

  it('flags a non-standard mismatch as needing an adapter, in a neutral colour', () => {
    const k = cableKind(port('out', 'speakon'), port('in', 'xlr'));
    expect(k).toMatchObject({ needsAdapter: true, label: 'Speakon ➔ XLR', color: CABLE_COLOR.other });
  });

  it('marks io-to-io as undirected', () => {
    expect(cableKind(port('io', 'usb'), port('io', 'usb')).undirected).toBe(true);
  });
});
