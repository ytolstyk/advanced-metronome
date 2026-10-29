import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GearFormDialog } from './GearFormDialog';
import { RIG_PRESETS } from '../../../rigPresets';
import { RIG_LIMITS } from '../../../rigTypes';
import type { RigGear } from '../../../rigTypes';

const EXISTING: RigGear = {
  id: 'gear-1',
  name: 'Amp',
  kind: 'amp',
  specs: '50 W',
  copiedFrom: 'Bob',
  ports: [
    { id: 'in1', label: 'Input', dir: 'in', connector: 'ts', note: 'Hi' },
    { id: 'out1', label: 'Line out', dir: 'out', connector: 'xlr' },
  ],
};

function setup(initial: RigGear | null = null) {
  const onSave = vi.fn();
  const onOpenChange = vi.fn();
  render(<GearFormDialog open onOpenChange={onOpenChange} initial={initial} onSave={onSave} />);
  return { onSave, onOpenChange, dialog: screen.getByRole('dialog') };
}

const submit = (label: 'Add gear' | 'Save gear') => fireEvent.click(screen.getByRole('button', { name: label }));
const nameInputs = () => screen.getAllByLabelText('Port name');

describe('GearFormDialog: adding', () => {
  it('starts with a blank piece and one empty port', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Add gear' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(nameInputs()).toHaveLength(1);
    expect(screen.getByLabelText('Start from a preset')).toBeInTheDocument();
  });

  it('saves a trimmed, minimal gear with a fresh id for the gear and each port', () => {
    const { onSave, onOpenChange } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Tube Screamer  ' } });
    fireEvent.change(nameInputs()[0], { target: { value: ' Input ' } });
    submit('Add gear');
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as RigGear;
    expect(saved).toMatchObject({ name: 'Tube Screamer', kind: 'other' });
    expect(saved.id).toBeTruthy();
    expect(saved.ports).toHaveLength(1);
    expect(saved.ports[0]).toMatchObject({ label: 'Input', dir: 'in', connector: 'ts' });
    expect(saved.ports[0].id).toBeTruthy();
    // empty optional fields are left off rather than stored as ''
    expect(saved).not.toHaveProperty('specs');
    expect(saved).not.toHaveProperty('copiedFrom');
    expect(saved.ports[0]).not.toHaveProperty('note');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('gives every new port its own id', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Box' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add port' }));
    const inputs = nameInputs();
    fireEvent.change(inputs[0], { target: { value: 'A' } });
    fireEvent.change(inputs[1], { target: { value: 'B' } });
    submit('Add gear');
    const ports = (onSave.mock.calls[0][0] as RigGear).ports;
    expect(new Set(ports.map((p) => p.id)).size).toBe(2);
  });

  it('keeps specs, note, kind, direction and connector the person chose', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Box' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'mixer' } });
    fireEvent.change(screen.getByLabelText('Specs (optional)'), { target: { value: ' 16 ch ' } });
    fireEvent.change(nameInputs()[0], { target: { value: 'Out' } });
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'out' } });
    fireEvent.change(screen.getByLabelText('Connector'), { target: { value: 'xlr' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: ' Balanced ' } });
    submit('Add gear');
    expect(onSave.mock.calls[0][0]).toMatchObject({
      kind: 'mixer',
      specs: '16 ch',
      ports: [{ label: 'Out', dir: 'out', connector: 'xlr', note: 'Balanced' }],
    });
  });

  it('refuses a missing name, an unnamed port, and no ports, without saving', () => {
    const { onSave } = setup();
    submit('Add gear');
    expect(screen.getByRole('alert')).toHaveTextContent('Give the gear a name');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Box' } });
    submit('Add gear');
    expect(screen.getByRole('alert')).toHaveTextContent('Every port needs a name');

    fireEvent.click(screen.getByRole('button', { name: 'Remove port 1' }));
    submit('Add gear');
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one port');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only name as missing', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '    ' } });
    submit('Add gear');
    expect(screen.getByRole('alert')).toHaveTextContent('Give the gear a name');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('removes the port you point at, not the last one', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add port' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add port' }));
    const inputs = nameInputs();
    fireEvent.change(inputs[0], { target: { value: 'first' } });
    fireEvent.change(inputs[1], { target: { value: 'second' } });
    fireEvent.change(inputs[2], { target: { value: 'third' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove port 2' }));
    expect(nameInputs().map((i) => (i as HTMLInputElement).value)).toEqual(['first', 'third']);
  });

  it('stops adding ports at the per-gear limit', () => {
    setup();
    const add = screen.getByRole('button', { name: 'Add port' });
    for (let i = 1; i < RIG_LIMITS.portsPerGearMax; i++) fireEvent.click(add);
    expect(nameInputs()).toHaveLength(RIG_LIMITS.portsPerGearMax);
    expect(add).toBeDisabled();
  });

  it('fills the form from a preset, and the preset’s ports get new ids on save', () => {
    const preset = RIG_PRESETS[0];
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText('Start from a preset'), { target: { value: preset.key } });
    expect(screen.getByLabelText('Name')).toHaveValue(preset.gear.name);
    expect(nameInputs()).toHaveLength(preset.gear.ports.length);
    submit('Add gear');
    const saved = onSave.mock.calls[0][0] as RigGear;
    expect(saved.name).toBe(preset.gear.name);
    const presetPortIds = new Set(preset.gear.ports.map((p) => p.id));
    expect(saved.ports.some((p) => presetPortIds.has(p.id))).toBe(false);
  });

  it('closes without saving on Cancel', () => {
    const { onSave, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('GearFormDialog: editing', () => {
  it('shows the existing values and no preset picker', () => {
    const { dialog } = setup(EXISTING);
    expect(within(dialog).getByRole('heading', { name: 'Edit gear' })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Start from a preset')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Amp');
    expect(screen.getByLabelText('Kind')).toHaveValue('amp');
    expect(screen.getByLabelText('Specs (optional)')).toHaveValue('50 W');
    expect(nameInputs().map((i) => (i as HTMLInputElement).value)).toEqual(['Input', 'Line out']);
    expect(screen.getByRole('button', { name: 'Save gear' })).toBeInTheDocument();
  });

  it('keeps the gear id, every port id and copiedFrom, so cables stay attached', () => {
    const { onSave } = setup(EXISTING);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Big amp' } });
    submit('Save gear');
    expect(onSave).toHaveBeenCalledWith({
      id: 'gear-1',
      name: 'Big amp',
      kind: 'amp',
      specs: '50 W',
      copiedFrom: 'Bob',
      ports: [
        { id: 'in1', label: 'Input', dir: 'in', connector: 'ts', note: 'Hi' },
        { id: 'out1', label: 'Line out', dir: 'out', connector: 'xlr' },
      ],
    });
  });

  it('keeps the other ports’ ids when one is removed or a new one is added', () => {
    const { onSave } = setup(EXISTING);
    fireEvent.click(screen.getByRole('button', { name: 'Remove port 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add port' }));
    fireEvent.change(nameInputs()[1], { target: { value: 'Send' } });
    submit('Save gear');
    const ports = (onSave.mock.calls[0][0] as RigGear).ports;
    expect(ports).toHaveLength(2);
    expect(ports[0].id).toBe('out1');
    expect(ports[1].label).toBe('Send');
    expect(['in1', 'out1']).not.toContain(ports[1].id);
  });

  it('changing a port’s direction or connector keeps its id', () => {
    const { onSave } = setup(EXISTING);
    fireEvent.change(screen.getAllByLabelText('Direction')[0], { target: { value: 'out' } });
    fireEvent.change(screen.getAllByLabelText('Connector')[0], { target: { value: 'xlr' } });
    submit('Save gear');
    expect((onSave.mock.calls[0][0] as RigGear).ports[0]).toMatchObject({ id: 'in1', dir: 'out', connector: 'xlr' });
  });

  it('clearing specs and a note removes them from the saved gear', () => {
    const { onSave } = setup(EXISTING);
    fireEvent.change(screen.getByLabelText('Specs (optional)'), { target: { value: '' } });
    fireEvent.change(screen.getAllByLabelText('Note (optional)')[0], { target: { value: '' } });
    submit('Save gear');
    const saved = onSave.mock.calls[0][0] as RigGear;
    expect(saved).not.toHaveProperty('specs');
    expect(saved.ports[0]).not.toHaveProperty('note');
  });

  it('does not add copiedFrom to gear that was not copied', () => {
    const { onSave } = setup({ ...EXISTING, copiedFrom: undefined });
    submit('Save gear');
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('copiedFrom');
  });
});
