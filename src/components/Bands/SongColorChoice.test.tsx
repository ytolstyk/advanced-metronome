import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SONG_COLOR_OPTIONS } from '../../bandSongColors';
import { SONG_COLOR_KEYS, type SongColorKey } from '../../bandTypes';
import { SongColorChoice } from './SongColorChoice';

function setup(value: SongColorKey | null = null, labels?: ReadonlyMap<SongColorKey, string>) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <span id="color-heading">Color</span>
      <SongColorChoice labelledBy="color-heading" value={value} labels={labels} onChange={onChange} />
    </>,
  );
  return { onChange, user };
}

describe('SongColorChoice', () => {
  describe('rendering', () => {
    it('is a group labelled by the given element', () => {
      setup();
      expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument();
    });

    it('renders one radio per palette color, in palette order, named by the palette color', () => {
      setup();
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(SONG_COLOR_KEYS.length);
      SONG_COLOR_OPTIONS.forEach((option, i) => {
        expect(radios[i]).toBe(screen.getByRole('radio', { name: option.label }));
      });
    });

    it('paints each swatch with its palette color and gives it a title', () => {
      setup();
      for (const option of SONG_COLOR_OPTIONS) {
        const radio = screen.getByRole('radio', { name: option.label });
        expect(radio).toHaveStyle({ backgroundColor: option.hex });
        expect(radio).toHaveAttribute('title', option.label);
      }
    });

    it('has no checked radio and says "No color" when nothing is chosen', () => {
      setup(null);
      for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByText('No color')).toBeInTheDocument();
    });

    it('marks only the chosen color, shows a check inside it and names it below', () => {
      setup('blue');
      expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
      for (const option of SONG_COLOR_OPTIONS.filter((o) => o.key !== 'blue')) {
        expect(screen.getByRole('radio', { name: option.label })).toHaveAttribute('aria-checked', 'false');
      }
      expect(screen.getByRole('radio', { name: 'Blue' }).querySelector('svg')).not.toBeNull();
      expect(screen.getAllByRole('radio').filter((r) => r.querySelector('svg'))).toHaveLength(1);
      expect(screen.getByText('Blue')).toBeInTheDocument();
      expect(screen.queryByText('No color')).not.toBeInTheDocument();
    });

    it('puts the check in a dark chip hidden from assistive tech', () => {
      setup('red');
      const chip = screen.getByRole('radio', { name: 'Red' }).querySelector('svg')!.parentElement!;
      expect(chip).toHaveClass('rounded-full', 'bg-black/60');
      expect(chip).toHaveAttribute('aria-hidden', 'true');
    });

    it('announces the chosen color politely', () => {
      setup('red');
      expect(screen.getByText('Red').closest('p')).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('band labels', () => {
    const labels = new Map<SongColorKey, string>([['red', 'Ballad']]);

    it('keeps the palette color in the accessible name of a labeled swatch and uses the label as its title', () => {
      setup(null, labels);
      const radio = screen.getByRole('radio', { name: 'Red, Ballad' });
      expect(radio).toHaveAttribute('title', 'Ballad');
      expect(screen.getByRole('radio', { name: 'Green' })).toHaveAttribute('title', 'Green');
    });

    it('names the chosen color by its label below', () => {
      setup('red', labels);
      expect(screen.getByText('Ballad')).toBeInTheDocument();
    });

    it('names the chosen color by its palette name when it has no label', () => {
      setup('green', labels);
      expect(screen.getByText('Green')).toBeInTheDocument();
    });

    it('works without a labels prop and with an empty map', () => {
      setup('red', new Map());
      expect(screen.getByText('Red')).toBeInTheDocument();
    });
  });

  describe('choosing', () => {
    it.each(SONG_COLOR_OPTIONS)('clicking $label reports "$key"', async ({ key, label }) => {
      const { user, onChange } = setup();
      await user.click(screen.getByRole('radio', { name: label }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(key);
    });

    it('clicking another color while one is chosen reports the new one', async () => {
      const { user, onChange } = setup('red');
      await user.click(screen.getByRole('radio', { name: 'Blue' }));
      expect(onChange).toHaveBeenCalledWith('blue');
    });

    it('clicking the chosen color again clears it (reports null)', async () => {
      const { user, onChange } = setup('red');
      await user.click(screen.getByRole('radio', { name: 'Red' }));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('is controlled: the choice follows the value prop, not clicks', async () => {
      const { user } = setup('red');
      await user.click(screen.getByRole('radio', { name: 'Blue' }));
      expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'false');
    });

    it('works with a labeled swatch', async () => {
      const { user, onChange } = setup(null, new Map<SongColorKey, string>([['teal', 'Funk']]));
      await user.click(screen.getByRole('radio', { name: 'Teal, Funk' }));
      expect(onChange).toHaveBeenCalledWith('teal');
    });
  });

  describe('keyboard', () => {
    it('is a single tab stop: Tab enters the group once and the next Tab leaves it', async () => {
      const { user } = setup();
      render(<button type="button">after</button>);
      await user.tab();
      const first = screen.getAllByRole('radio').find((r) => r === document.activeElement);
      expect(first).toBeDefined();
      await user.tab();
      expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    });

    it('arrow keys move focus between swatches', async () => {
      const { user } = setup();
      await user.tab();
      const radios = screen.getAllByRole('radio');
      const start = radios.indexOf(document.activeElement as HTMLElement);
      expect(start).toBeGreaterThanOrEqual(0);
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(radios[(start + 1) % radios.length]);
      await user.keyboard('{ArrowLeft}');
      expect(document.activeElement).toBe(radios[start]);
    });

    it('Enter or Space on a focused swatch chooses it', async () => {
      const { user, onChange } = setup();
      await user.tab();
      await user.keyboard('{ArrowRight}');
      const focused = document.activeElement as HTMLElement;
      await user.keyboard(' ');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(SONG_COLOR_KEYS).toContain(onChange.mock.calls[0][0]);
      expect(focused).toHaveAttribute('role', 'radio');
    });
  });
});
