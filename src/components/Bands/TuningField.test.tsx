import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BAND_LIMITS } from '../../bandTypes';
import { TUNING_PRESETS } from '../../bandTunings';
import { TuningField } from './TuningField';

// Radix Select leans on pointer-capture and scrolling APIs jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

/** Holds the value like the song form does, and exposes every change. */
function setup(initial: string) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <>
        <label htmlFor="tuning">Tuning</label>
        <TuningField
          id="tuning"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
        <output data-testid="value">{value}</output>
      </>
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  return { onChange, user };
}

const trigger = () => screen.getByRole('combobox', { name: 'Tuning' });
const customInput = () => screen.queryByRole('textbox', { name: 'Custom tuning' });

describe('TuningField', () => {
  it('shows the current preset on the trigger and no custom input', () => {
    setup('Drop D');
    expect(trigger()).toHaveTextContent('Drop D');
    expect(customInput()).not.toBeInTheDocument();
  });

  it('offers every preset plus Custom…', async () => {
    const { user } = setup('E Standard');
    await user.click(trigger());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([...TUNING_PRESETS, 'Custom…']);
  });

  it('picking a preset reports it and keeps the custom input hidden', async () => {
    const { onChange, user } = setup('E Standard');
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'DADGAD' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('DADGAD');
    expect(trigger()).toHaveTextContent('DADGAD');
    expect(customInput()).not.toBeInTheDocument();
  });

  it('choosing Custom… reveals a required, length-limited text input and clears the value', async () => {
    const { onChange, user } = setup('Drop D');
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'Custom…' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    const input = customInput();
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('maxlength', String(BAND_LIMITS.tuningMax));
    expect(trigger()).toHaveTextContent('Custom…');
  });

  it('typing in the custom input reports each change', async () => {
    const { onChange, user } = setup('E Standard');
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'Custom…' }));
    await user.type(customInput()!, 'D G');
    expect(onChange).toHaveBeenLastCalledWith('D G');
    expect(screen.getByTestId('value')).toHaveTextContent('D G');
  });

  it('an existing non-preset value opens in Custom with the text shown', () => {
    setup('D G D G B D');
    expect(trigger()).toHaveTextContent('Custom…');
    expect(customInput()).toHaveValue('D G D G B D');
  });

  it('a blank initial value shows the dropdown (default applies on save), not the custom input', () => {
    setup('');
    expect(customInput()).not.toBeInTheDocument();
  });

  it('typing a preset name in the custom input stays in custom mode', async () => {
    const { user } = setup('D G D G B D');
    const input = customInput()!;
    await user.clear(input);
    await user.type(input, 'Drop D');
    expect(screen.getByTestId('value')).toHaveTextContent('Drop D');
    expect(trigger()).toHaveTextContent('Custom…');
    expect(customInput()).toHaveValue('Drop D');
  });

  it('switching from Custom back to a preset hides the input and reports the preset', async () => {
    const { onChange, user } = setup('D G D G B D');
    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'Open G' }));
    expect(onChange).toHaveBeenLastCalledWith('Open G');
    expect(customInput()).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Open G');
  });
});
