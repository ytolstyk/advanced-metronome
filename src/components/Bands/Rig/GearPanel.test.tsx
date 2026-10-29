import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GearPanel } from './GearPanel';
import type { MemberGear } from './GearPanel';
import { RIG_LIMITS } from '../../../rigTypes';
import type { RigGear } from '../../../rigTypes';

const gear = (id: string, over: Partial<RigGear> = {}): RigGear => ({
  id,
  name: `Gear ${id}`,
  kind: 'pedal',
  ports: [{ id: 'p1', label: 'In', dir: 'in', connector: 'ts' }],
  ...over,
});

const manyGear = (n: number): RigGear[] => Array.from({ length: n }, (_, i) => gear(`g${i}`));

function setup(over: Partial<Parameters<typeof GearPanel>[0]> = {}) {
  const props = {
    mine: [gear('a')],
    others: [] as MemberGear[],
    editable: true,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    ...over,
  };
  render(<GearPanel {...props} />);
  return props;
}

describe('GearPanel', () => {
  it('shows an empty hint when you have no gear', () => {
    setup({ mine: [] });
    expect(screen.getByText(/You haven’t added any gear yet/)).toBeInTheDocument();
  });

  it('summarises each piece: kind, port count (singular and plural), specs and where it was copied from', () => {
    setup({
      mine: [
        gear('a', { ports: [{ id: 'p1', label: 'In', dir: 'in', connector: 'ts' }], specs: 'True bypass' }),
        gear('b', {
          kind: 'amp',
          copiedFrom: 'Bob',
          ports: [
            { id: 'p1', label: 'In', dir: 'in', connector: 'ts' },
            { id: 'p2', label: 'Out', dir: 'out', connector: 'ts' },
          ],
        }),
      ],
    });
    expect(screen.getByText('pedal · 1 port')).toBeInTheDocument();
    expect(screen.getByText('True bypass')).toBeInTheDocument();
    expect(screen.getByText('amp · 2 ports · copied from Bob')).toBeInTheDocument();
  });

  it('wires Add, Edit and Delete to the right piece of gear', () => {
    const mine = [gear('a'), gear('b')];
    const props = setup({ mine });
    fireEvent.click(screen.getByRole('button', { name: 'Add gear' }));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Gear b' }));
    expect(props.onEdit).toHaveBeenCalledWith(mine[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gear a' }));
    expect(props.onDelete).toHaveBeenCalledWith(mine[0]);
  });

  it('lists other members’ gear under their name and copies it with their name', () => {
    const bobGear = gear('x', { name: 'Fuzz' });
    const props = setup({ others: [{ owner: 'sub-bob', name: 'Bob', gear: [bobGear] }] });
    expect(screen.getByRole('heading', { name: 'Bob’s gear' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Fuzz to my gear' }));
    expect(props.onCopy).toHaveBeenCalledWith(bobGear, 'Bob');
  });

  it('skips a member who has no gear', () => {
    setup({ others: [{ owner: 'sub-bob', name: 'Bob', gear: [] }] });
    expect(screen.queryByRole('heading', { name: 'Bob’s gear' })).not.toBeInTheDocument();
  });

  it('is read-only when not editable: no add, edit, delete or copy controls', () => {
    setup({ editable: false, others: [{ owner: 'sub-bob', name: 'Bob', gear: [gear('x', { name: 'Fuzz' })] }] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Gear a')).toBeInTheDocument();
    expect(screen.getByText('Fuzz')).toBeInTheDocument();
  });

  it('stops adding and copying at the gear cap, and says why', () => {
    setup({
      mine: manyGear(RIG_LIMITS.gearMax),
      others: [{ owner: 'sub-bob', name: 'Bob', gear: [gear('x', { name: 'Fuzz' })] }],
    });
    expect(screen.getByRole('button', { name: 'Add gear' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy Fuzz to my gear' })).toBeDisabled();
    expect(screen.getByText(new RegExp(`most gear a member can keep \\(${RIG_LIMITS.gearMax}\\)`))).toBeInTheDocument();
  });

  it('is still open for adding one below the cap', () => {
    setup({ mine: manyGear(RIG_LIMITS.gearMax - 1) });
    expect(screen.getByRole('button', { name: 'Add gear' })).toBeEnabled();
    expect(screen.queryByText(/most gear a member can keep/)).not.toBeInTheDocument();
  });

  it('keeps Yours and each member in separate lists', () => {
    setup({ others: [{ owner: 'sub-bob', name: 'Bob', gear: [gear('x', { name: 'Fuzz' })] }] });
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getByText('Gear a')).toBeInTheDocument();
    expect(within(lists[1]).getByText('Fuzz')).toBeInTheDocument();
  });
});
