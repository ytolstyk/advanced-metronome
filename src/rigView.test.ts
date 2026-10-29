import { describe, expect, it } from 'vitest';
import { describeCables, describePort } from './rigView';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from './rigPresets';
import type { Connector, RigDiagram, RigGear, RigPort } from './rigTypes';
import { CONNECTOR_LABEL } from './rigUtils';

const port = (id: string, dir: RigPort['dir'], connector: Connector = 'trs', label = id): RigPort => ({ id, label, dir, connector });
const gear = (id: string, name: string, ports: RigPort[]): RigGear => ({ id, name, kind: 'other', ports });

const SYNTH = gear('gs', 'Synth', [port('out', 'out', 'trs', 'Main out'), port('usb', 'io', 'usb', 'USB')]);
const MIXER = gear('gm', 'Mixer', [port('in1', 'in', 'xlr', 'Ch 1'), port('usb', 'io', 'usb', 'USB')]);

const diagram = (cables: RigDiagram['cables']): RigDiagram => ({
  id: 'd1',
  name: 'D',
  nodes: [
    { id: 'ns', gearId: 'gs', col: 0 },
    { id: 'nm', gearId: 'gm', col: 1 },
  ],
  cables,
});

describe('describeCables', () => {
  it('resolves both ends, numbers cables from 1 and builds a directed route', () => {
    const [info] = describeCables(diagram([{ id: 'c1', from: { n: 'ns', p: 'out' }, to: { n: 'nm', p: 'in1' } }]), [SYNTH, MIXER]);
    expect(info.n).toBe(1);
    expect(info.from.gear).toBe(SYNTH);
    expect(info.from.port.id).toBe('out');
    expect(info.to.gear).toBe(MIXER);
    expect(info.to.port.id).toBe('in1');
    expect(info.route).toBe('Synth (Main out) ➔ Mixer (Ch 1)');
    expect(info.kind.needsAdapter).toBe(false);
    expect(info.kind.undirected).toBe(false);
  });

  it('uses the connector description as the title unless the person labelled the cable', () => {
    const base = { id: 'c1', from: { n: 'ns', p: 'usb' }, to: { n: 'nm', p: 'usb' } };
    const [plain] = describeCables(diagram([base]), [SYNTH, MIXER]);
    expect(plain.title).toBe('USB');
    const [labelled] = describeCables(diagram([{ ...base, label: 'To the DAW' }]), [SYNTH, MIXER]);
    expect(labelled.title).toBe('To the DAW');
  });

  it('draws USB/MIDI-style cables with a two-way arrow', () => {
    const [info] = describeCables(diagram([{ id: 'c1', from: { n: 'ns', p: 'usb' }, to: { n: 'nm', p: 'usb' } }]), [SYNTH, MIXER]);
    expect(info.kind.undirected).toBe(true);
    expect(info.route).toBe('Synth (USB) ⇄ Mixer (USB)');
  });

  it('keeps the position-based number when an earlier cable is left out', () => {
    const infos = describeCables(
      diagram([
        { id: 'broken', from: { n: 'ns', p: 'gone' }, to: { n: 'nm', p: 'in1' } },
        { id: 'ok', from: { n: 'ns', p: 'out' }, to: { n: 'nm', p: 'in1' } },
      ]),
      [SYNTH, MIXER],
    );
    expect(infos.map((i) => [i.cable.id, i.n])).toEqual([['ok', 2]]);
  });

  it.each([
    ['an unknown from node', { n: 'zz', p: 'out' }, { n: 'nm', p: 'in1' }],
    ['an unknown to node', { n: 'ns', p: 'out' }, { n: 'zz', p: 'in1' }],
    ['a from port the gear no longer has', { n: 'ns', p: 'nope' }, { n: 'nm', p: 'in1' }],
    ['a to port the gear no longer has', { n: 'ns', p: 'out' }, { n: 'nm', p: 'nope' }],
  ])('leaves out a cable with %s', (_name, from, to) => {
    expect(describeCables(diagram([{ id: 'c1', from, to }]), [SYNTH, MIXER])).toEqual([]);
  });

  it('leaves out a cable whose node points at gear that is not in the list', () => {
    const cables = [{ id: 'c1', from: { n: 'ns', p: 'out' }, to: { n: 'nm', p: 'in1' } }];
    expect(describeCables(diagram(cables), [SYNTH])).toEqual([]);
    expect(describeCables(diagram(cables), [])).toEqual([]);
  });

  it('returns nothing for a diagram with no cables', () => {
    expect(describeCables(diagram([]), [SYNTH, MIXER])).toEqual([]);
  });

  it('describes every cable of the Jam Station example', () => {
    const infos = describeCables(JAM_STATION_DIAGRAM, JAM_STATION_GEAR);
    expect(infos).toHaveLength(JAM_STATION_DIAGRAM.cables.length);
    expect(infos.map((i) => i.n)).toEqual(infos.map((_, i) => i + 1));
  });
});

describe('describePort', () => {
  it.each([
    ['in', 'input'],
    ['out', 'output'],
    ['io', 'USB/MIDI'],
  ] as const)('names a %s port "%s"', (dir, word) => {
    expect(describePort(port('p', dir, 'trs', 'Jack'))).toBe(`Jack, ${word}, ${CONNECTOR_LABEL.trs}`);
  });

  it('uses the human connector name', () => {
    expect(describePort(port('p', 'in', 'xlr', 'Mic'))).toBe('Mic, input, XLR');
  });

  it('appends the note when there is one', () => {
    expect(describePort({ ...port('p', 'in', 'combo', 'Ch 1'), note: 'Hi-Z' })).toBe('Ch 1, input, XLR/TRS combo, Hi-Z');
  });

  it('does not append an empty note', () => {
    expect(describePort({ ...port('p', 'out', 'ts', 'Out'), note: '' })).toBe('Out, output, 1/4" TS');
  });
});
