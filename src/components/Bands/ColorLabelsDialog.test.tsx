import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SONG_COLOR_OPTIONS } from '../../bandSongColors';
import { BAND_LIMITS, SONG_COLOR_KEYS, type SongColorKey } from '../../bandTypes';
import { ColorLabelsDialog } from './ColorLabelsDialog';

function setup(props: Partial<React.ComponentProps<typeof ColorLabelsDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <ColorLabelsDialog
      open
      onOpenChange={onOpenChange}
      bandName="The Band"
      labels={new Map<SongColorKey, string>()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, onOpenChange };
}

const input = (colorLabel: string) => screen.getByLabelText(`${colorLabel} label`);
const typeLabel = (colorLabel: string, value: string) => fireEvent.change(input(colorLabel), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('ColorLabelsDialog', () => {
  describe('rendering', () => {
    it('shows a titled dialog that names the band and says everyone can change the names', () => {
      setup({ bandName: 'Hot Rats' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Color labels' })).toBeInTheDocument();
      expect(screen.getByText(/Name the colors for Hot Rats/)).toBeInTheDocument();
      expect(screen.getByText(/Everyone in the band sees these names and can change them/)).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
      setup({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('has one labelled input per palette color, in palette order, with the palette name as placeholder', () => {
      setup();
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(SONG_COLOR_KEYS.length);
      SONG_COLOR_OPTIONS.forEach((option, i) => {
        expect(inputs[i]).toBe(input(option.label));
        expect(inputs[i]).toHaveAttribute('placeholder', option.label);
      });
    });

    it('limits each input to the label length and turns off autocomplete', () => {
      setup();
      for (const textbox of screen.getAllByRole('textbox')) {
        expect(textbox).toHaveAttribute('maxlength', String(BAND_LIMITS.colorLabelMax));
        expect(textbox).toHaveAttribute('autocomplete', 'off');
      }
    });

    it('starts every input empty when the band has no labels', () => {
      setup();
      for (const textbox of screen.getAllByRole('textbox')) expect(textbox).toHaveValue('');
    });

    it('seeds the inputs from the band labels', () => {
      setup({ labels: new Map<SongColorKey, string>([['red', 'Ballad'], ['blue', 'Fast thrash']]) });
      expect(input('Red')).toHaveValue('Ballad');
      expect(input('Blue')).toHaveValue('Fast thrash');
      expect(input('Green')).toHaveValue('');
    });

    it('shows a swatch per color in its palette color, hidden from assistive tech', () => {
      setup();
      const swatches = screen.getAllByRole('listitem').map((li) => li.querySelector('span[aria-hidden="true"]'));
      SONG_COLOR_OPTIONS.forEach((option, i) => {
        expect(swatches[i]).not.toBeNull();
        expect(swatches[i]).toHaveStyle({ backgroundColor: option.hex });
      });
    });

    it('offers Save and Cancel, both enabled', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });
  });

  describe('saving', () => {
    it('with no edits calls onSave with an empty object and closes', async () => {
      const { onSave, onOpenChange } = setup({ labels: new Map<SongColorKey, string>([['red', 'Ballad']]) });
      save();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({});
    });

    it('passes ONLY the edited colors, not the whole palette', async () => {
      const { onSave } = setup({ labels: new Map<SongColorKey, string>([['red', 'Ballad'], ['blue', 'Thrash']]) });
      typeLabel('Green', 'Slow');
      typeLabel('Blue', 'Heavy');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave).toHaveBeenCalledWith({ green: 'Slow', blue: 'Heavy' });
      expect(Object.keys(onSave.mock.calls[0][0] as object).sort()).toEqual(['blue', 'green']);
    });

    it('an untouched seeded label is left out (a label another member changed meanwhile stays safe)', async () => {
      const { onSave } = setup({ labels: new Map<SongColorKey, string>([['red', 'Ballad']]) });
      typeLabel('Teal', 'Funk');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave.mock.calls[0][0]).not.toHaveProperty('red');
    });

    it('clearing a seeded label sends "" for that color', async () => {
      const { onSave } = setup({ labels: new Map<SongColorKey, string>([['red', 'Ballad']]) });
      typeLabel('Red', '');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave).toHaveBeenCalledWith({ red: '' });
    });

    it('editing a label and then restoring the original text is not an edit', async () => {
      const { onSave } = setup({ labels: new Map<SongColorKey, string>([['red', 'Ballad']]) });
      typeLabel('Red', 'Something else');
      typeLabel('Red', 'Ballad');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave).toHaveBeenCalledWith({});
    });

    it('sends the typed text as is; sanitising is the writer\'s job', async () => {
      const { onSave } = setup();
      typeLabel('Red', '  spaced  ');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(onSave).toHaveBeenCalledWith({ red: '  spaced  ' });
    });

    it('seeds from the sanitised label, so a hostile stored label is not shown as is', () => {
      setup({ labels: new Map<SongColorKey, string>([['red', 'Bal​lad']]) });
      expect(input('Red')).toHaveValue('Ballad');
    });

    it('submits with the Enter key from an input', async () => {
      const { onSave } = setup();
      typeLabel('Red', 'Ballad');
      fireEvent.submit(input('Red').closest('form')!);
      await waitFor(() => expect(onSave).toHaveBeenCalledWith({ red: 'Ballad' }));
    });

    it('closes only after onSave resolved', async () => {
      const order: string[] = [];
      const { onSave, onOpenChange } = setup();
      onSave.mockImplementation(async () => void order.push('save'));
      onOpenChange.mockImplementation((open: boolean) => void order.push(`open:${open}`));
      save();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(order).toEqual(['save', 'open:false']);
    });
  });

  describe('failure', () => {
    it('shows the error inline, stays open and keeps what was typed', async () => {
      const { onSave, onOpenChange } = setup();
      onSave.mockRejectedValue(new Error('Could not save the color label. Please try again.'));
      typeLabel('Red', 'Ballad');
      save();
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the color label. Please try again.');
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(input('Red')).toHaveValue('Ballad');
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('a retry after a failure sends the same edits again', async () => {
      const { onSave, onOpenChange } = setup();
      onSave.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
      typeLabel('Red', 'Ballad');
      save();
      await screen.findByRole('alert');
      save();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][0]).toEqual({ red: 'Ballad' });
    });

    it('clears the previous error when saving again', async () => {
      const { onSave } = setup();
      onSave.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
      save();
      await screen.findByRole('alert');
      save();
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });
  });

  describe('busy state', () => {
    it('shows Saving…, disables the buttons and ignores dismissal while saving', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const { onSave, onOpenChange } = setup();
      onSave.mockReturnValue(gate);
      save();
      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();
      await act(async () => {
        release();
        await gate;
      });
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
  });

  describe('cancelling', () => {
    it('Cancel closes without saving', () => {
      const { onSave, onOpenChange } = setup();
      typeLabel('Red', 'Ballad');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSave).not.toHaveBeenCalled();
    });

    it('Escape closes without saving when idle', () => {
      const { onSave, onOpenChange } = setup();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
