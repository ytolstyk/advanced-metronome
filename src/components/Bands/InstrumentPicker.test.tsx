import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { INSTRUMENT_OPTIONS, type InstrumentKey } from '../../bandInstruments';
import { InstrumentPicker } from './InstrumentPicker';

function setup(value: readonly InstrumentKey[] = []) {
  const onChange = vi.fn();
  render(
    <>
      <span id="lbl">What do you play?</span>
      <InstrumentPicker labelledBy="lbl" value={value} onChange={onChange} />
    </>,
  );
  return { onChange };
}

describe('InstrumentPicker', () => {
  it('renders one button per instrument with its label, all unpressed when nothing is picked', () => {
    setup();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(INSTRUMENT_OPTIONS.map((o) => o.label));
    for (const button of buttons) expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('is a group labelled by the given element', () => {
    setup();
    expect(screen.getByRole('group', { name: 'What do you play?' })).toBeInTheDocument();
  });

  it('shows exactly the passed instruments as pressed', () => {
    setup(['bass', 'vocals']);
    expect(screen.getByRole('button', { name: 'Bass' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vocals' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guitar' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Bass' })).toHaveAttribute('data-state', 'on');
  });

  it('hides the icons from assistive technology (the label names the button)', () => {
    setup();
    const svgs = screen.getByRole('button', { name: 'Guitar' }).querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('adds a clicked instrument to the current picks', () => {
    const { onChange } = setup(['guitar']);
    fireEvent.click(screen.getByRole('button', { name: 'Drums' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['guitar', 'drums']);
  });

  it('removes a clicked instrument that was already picked', () => {
    const { onChange } = setup(['guitar', 'drums']);
    fireEvent.click(screen.getByRole('button', { name: 'Guitar' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['drums']);
  });

  it('can end up with nothing picked', () => {
    const { onChange } = setup(['keys']);
    fireEvent.click(screen.getByRole('button', { name: 'Keys' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('lets several instruments be on at once when driven by state', () => {
    function Harness() {
      const [value, setValue] = useState<InstrumentKey[]>([]);
      return (
        <>
          <span id="lbl">Plays</span>
          <InstrumentPicker labelledBy="lbl" value={value} onChange={setValue} />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Guitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Winds & brass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['Guitar', 'Winds & brass', 'Other']);
  });

  it('is operable from the keyboard (Tab to it, Space toggles)', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Guitar' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['guitar']);
  });
});
