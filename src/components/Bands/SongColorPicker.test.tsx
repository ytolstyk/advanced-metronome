import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SONG_COLOR_OPTIONS } from '../../bandSongColors';
import { SONG_COLOR_KEYS, type SongColorKey } from '../../bandTypes';
import { SongColorPicker } from './SongColorPicker';

function setup(color: SongColorKey | undefined = undefined, title = 'Wonderwall') {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<SongColorPicker songTitle={title} color={color} onChange={onChange} />);
  return { onChange, user };
}

const open = async (user: ReturnType<typeof userEvent.setup>, title = 'Wonderwall') => {
  // The trigger label may carry a ", now <Label>" suffix when a color is set.
  await user.click(screen.getByRole('button', { name: new RegExp(`^Set color for ${title}(, now .+)?$`) }));
  return screen.findByRole('menu');
};

describe('SongColorPicker', () => {
  it('renders a trigger labelled with the song title and keeps the menu closed', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Set color for Wonderwall' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens a menu with one swatch per palette color plus "No color"', async () => {
    const { user } = setup();
    await open(user);
    for (const option of SONG_COLOR_OPTIONS) {
      expect(screen.getByRole('menuitem', { name: option.label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('menuitem')).toHaveLength(SONG_COLOR_KEYS.length + 1);
    expect(screen.getByRole('menuitem', { name: /No color/ })).toBeInTheDocument();
  });

  it('paints each swatch with its palette color', async () => {
    const { user } = setup();
    await open(user);
    for (const option of SONG_COLOR_OPTIONS) {
      const item = screen.getByRole('menuitem', { name: option.label });
      expect(item).toHaveStyle({ backgroundColor: option.hex });
      expect(item).toHaveAttribute('title', option.label);
    }
  });

  it.each(SONG_COLOR_OPTIONS)('picking $label calls onChange with "$key"', async ({ key, label }) => {
    const { user, onChange } = setup();
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: label }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(key);
  });

  it('closes the menu after a pick', async () => {
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: 'Red' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('marks only the current color with a check', async () => {
    const { user } = setup('blue');
    const menu = await open(user);
    expect(screen.getByRole('menuitem', { name: 'Blue, selected' }).querySelector('svg')).not.toBeNull();
    for (const option of SONG_COLOR_OPTIONS.filter((o) => o.key !== 'blue')) {
      expect(screen.getByRole('menuitem', { name: option.label }).querySelector('svg')).toBeNull();
    }
    expect(menu.querySelectorAll('svg')).toHaveLength(2); // the check + the "No color" X
  });

  it('shows no check anywhere when the song has no color', async () => {
    const { user } = setup(undefined);
    await open(user);
    for (const option of SONG_COLOR_OPTIONS) {
      expect(screen.getByRole('menuitem', { name: option.label }).querySelector('svg')).toBeNull();
    }
  });

  it('"No color" is disabled when there is no color, and does nothing', async () => {
    const { user, onChange } = setup(undefined);
    await open(user);
    const none = screen.getByRole('menuitem', { name: /No color/ });
    expect(none).toHaveAttribute('aria-disabled', 'true');
    await user.click(none);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"No color" clears the color with null when one is set', async () => {
    const { user, onChange } = setup('purple');
    await open(user);
    const none = screen.getByRole('menuitem', { name: /No color/ });
    expect(none).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(none);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('picking the already-selected color still calls onChange (the parent decides)', async () => {
    const { user, onChange } = setup('red');
    await open(user);
    await user.click(screen.getByRole('menuitem', { name: 'Red, selected' }));
    expect(onChange).toHaveBeenCalledWith('red');
  });

  it('works from the keyboard (Enter opens, arrows move, Enter selects)', async () => {
    const { user, onChange } = setup();
    screen.getByRole('button', { name: 'Set color for Wonderwall' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(SONG_COLOR_KEYS).toContain(onChange.mock.calls[0][0]);
  });

  describe('trigger', () => {
    it('has no ", now" suffix and shows the palette icon, not a swatch, when no color is set', () => {
      const { container } = render(<SongColorPicker songTitle="Wonderwall" color={undefined} onChange={() => {}} />);
      const trigger = screen.getByRole('button', { name: 'Set color for Wonderwall' });
      expect(trigger.getAttribute('aria-label')).not.toContain('now');
      expect(trigger.querySelector('svg')).not.toBeNull();
      expect(container.querySelector('span.rounded-full')).toBeNull();
    });

    it.each(SONG_COLOR_OPTIONS)('announces the current color: "$label"', ({ label }) => {
      const key = SONG_COLOR_OPTIONS.find((o) => o.label === label)!.key;
      render(<SongColorPicker songTitle="Wonderwall" color={key} onChange={() => {}} />);
      expect(screen.getByRole('button', { name: `Set color for Wonderwall, now ${label}` })).toBeInTheDocument();
    });

    it('shows a swatch dot in the current color instead of the palette icon', () => {
      render(<SongColorPicker songTitle="Wonderwall" color="blue" onChange={() => {}} />);
      const trigger = screen.getByRole('button', { name: 'Set color for Wonderwall, now Blue' });
      const dot = trigger.querySelector('span.rounded-full');
      expect(dot).not.toBeNull();
      expect(dot).toHaveStyle({ backgroundColor: SONG_COLOR_OPTIONS.find((o) => o.key === 'blue')!.hex });
      expect(dot).toHaveAttribute('aria-hidden', 'true');
      expect(trigger.querySelector('svg')).toBeNull();
    });
  });

  describe('swatch affordances', () => {
    it('puts the selected check inside a dark rounded chip', async () => {
      const { user } = setup('blue');
      await open(user);
      const check = screen.getByRole('menuitem', { name: 'Blue, selected' }).querySelector('svg')!;
      const chip = check.parentElement!;
      expect(chip).toHaveClass('rounded-full');
      expect(chip).toHaveClass('bg-black/60');
      expect(chip).toHaveAttribute('aria-hidden', 'true');
    });

    it('gives every swatch a focus ring', async () => {
      const { user } = setup();
      await open(user);
      for (const option of SONG_COLOR_OPTIONS) {
        expect(screen.getByRole('menuitem', { name: option.label }).className).toMatch(/focus:ring-2/);
      }
    });
  });

  it('labels the trigger with each song\'s own title', () => {
    render(
      <>
        <SongColorPicker songTitle="A" color={undefined} onChange={() => {}} />
        <SongColorPicker songTitle="B" color={undefined} onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Set color for A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set color for B' })).toBeInTheDocument();
  });
});
