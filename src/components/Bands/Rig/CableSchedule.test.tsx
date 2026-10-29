import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CableSchedule } from './CableSchedule';
import { describeCables } from '../../../rigView';
import type { CableInfo } from '../../../rigView';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../../../rigPresets';
import { RIG_LIMITS } from '../../../rigTypes';
import type { RigGear } from '../../../rigTypes';

const JAM_INFOS = describeCables(JAM_STATION_DIAGRAM, JAM_STATION_GEAR);

function setup(over: Partial<Parameters<typeof CableSchedule>[0]> = {}) {
  const onLabel = vi.fn<(id: string, label: string) => void>();
  const props = {
    cables: JAM_INFOS,
    editable: true,
    selectedCableId: null as string | null,
    onSelect: vi.fn<(id: string | null) => void>(),
    onRemove: vi.fn<(id: string) => void>(),
    onLabel,
    ...over,
  };
  const view = render(<CableSchedule {...props} />);
  return { props, onLabel, ...view };
}

describe('CableSchedule', () => {
  it('renders nothing without cables', () => {
    const { container } = setup({ cables: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every cable numbered, titled and routed', () => {
    setup();
    const items = within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(items[0]).getByText('1')).toBeInTheDocument();
    expect(within(items[0]).getByText('1/4" TS Instrument Cable')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Electric Guitar \(Output\) ➔ Focusrite Scarlett 18i8 \(Ch 1 · Guitar\)/)).toBeInTheDocument();
    expect(within(items[3]).getByText(/⇄/)).toBeInTheDocument();
  });

  it('flags a cable that needs an adapter', () => {
    const odd: RigGear = {
      id: 'g1',
      name: 'Odd',
      kind: 'other',
      ports: [{ id: 'o', label: 'Out', dir: 'out', connector: 'speakon' }],
    };
    const sink: RigGear = {
      id: 'g2',
      name: 'Sink',
      kind: 'other',
      ports: [{ id: 'i', label: 'In', dir: 'in', connector: 'xlr' }],
    };
    const infos: CableInfo[] = describeCables(
      {
        id: 'd',
        name: 'D',
        nodes: [
          { id: 'n1', gearId: 'g1', col: 0 },
          { id: 'n2', gearId: 'g2', col: 1 },
        ],
        cables: [{ id: 'c1', from: { n: 'n1', p: 'o' }, to: { n: 'n2', p: 'i' } }],
      },
      [odd, sink],
    );
    setup({ cables: infos });
    expect(screen.getByText(/Needs an adapter \(Speakon ➔ XLR\)/)).toBeInTheDocument();
  });

  it('does not flag ordinary cables', () => {
    setup();
    expect(screen.queryByText(/Needs an adapter/)).not.toBeInTheDocument();
  });

  describe('editable', () => {
    it('selects a cable by its row and deselects the selected one on a second click', () => {
      const { props, rerender } = setup();
      fireEvent.click(screen.getAllByRole('button', { pressed: false })[1]);
      expect(props.onSelect).toHaveBeenLastCalledWith('cbass');
      rerender(<CableSchedule {...props} selectedCableId="cbass" />);
      fireEvent.click(screen.getByRole('button', { pressed: true }));
      expect(props.onSelect).toHaveBeenLastCalledWith(null);
    });

    it('shows label and remove controls only for the selected cable', () => {
      const { props, rerender } = setup();
      expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
      rerender(<CableSchedule {...props} selectedCableId="cusb" />);
      expect(screen.getAllByLabelText('Label')).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Remove cable' })).toHaveLength(1);
    });

    it('starts the label field from the cable’s label, with the connector as the placeholder', () => {
      const unlabelled = JAM_INFOS.map((i) => (i.cable.id === 'cusb' ? { ...i, cable: { ...i.cable, label: undefined } } : i));
      setup({ cables: unlabelled, selectedCableId: 'cusb' });
      const input = screen.getByLabelText('Label');
      expect(input).toHaveValue('');
      expect(input).toHaveAttribute('placeholder', 'USB');
      expect(input).toHaveAttribute('maxlength', String(RIG_LIMITS.cableLabelMax));
    });

    it('reports the label on blur, and Enter commits it', () => {
      const { props, onLabel } = setup({ selectedCableId: 'cusb' });
      const input = screen.getByLabelText('Label');
      expect(input).toHaveValue('USB 2.0 (Type-C / Type-A)');
      fireEvent.change(input, { target: { value: 'Interface to laptop' } });
      fireEvent.blur(input);
      expect(props.onLabel).toHaveBeenCalledWith('cusb', 'Interface to laptop');

      onLabel.mockClear();
      input.focus();
      fireEvent.change(input, { target: { value: 'Via hub' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(props.onLabel).toHaveBeenCalledWith('cusb', 'Via hub');
    });

    it('removes the selected cable', () => {
      const { props } = setup({ selectedCableId: 'cdrums' });
      fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
      expect(props.onRemove).toHaveBeenCalledWith('cdrums');
    });
  });

  describe('read-only', () => {
    it('has no buttons or inputs, even for the selected cable', () => {
      setup({ editable: false, selectedCableId: 'cusb' });
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(5);
    });
  });
});
