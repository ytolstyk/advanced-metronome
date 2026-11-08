import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackingTrackPlayer } from './BackingTrackPlayer';
import { createProgressStore } from '../../utils/playerProgress';

function setup(initial = { currentTime: 83, duration: 245, paused: false }) {
  const progress = createProgressStore();
  progress.set(initial);
  const player = { progress, onSeek: vi.fn(), onSkip: vi.fn(), onTogglePause: vi.fn() };
  render(<BackingTrackPlayer label="No drums" player={player} />);
  return { progress, player };
}

describe('BackingTrackPlayer', () => {
  it('shows elapsed and total time', () => {
    setup();
    expect(screen.getByText('1:23')).toBeInTheDocument();
    expect(screen.getByText('4:05')).toBeInTheDocument();
  });

  it('follows the store as the track plays', () => {
    const { progress } = setup();
    act(() => progress.set({ currentTime: 84, duration: 245, paused: false }));
    expect(screen.getByText('1:24')).toBeInTheDocument();
  });

  it('offers Pause while playing and Resume while paused', async () => {
    const { progress, player } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Pause No drums' }));
    expect(player.onTogglePause).toHaveBeenCalledTimes(1);
    act(() => progress.set({ currentTime: 83, duration: 245, paused: true }));
    expect(screen.getByRole('button', { name: 'Resume No drums' })).toBeInTheDocument();
  });

  it('jumps 10 seconds each way', async () => {
    const { player } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Back 10 seconds' }));
    await userEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(player.onSkip).toHaveBeenNthCalledWith(1, -10);
    expect(player.onSkip).toHaveBeenNthCalledWith(2, 10);
  });

  it('exposes a keyboard-operable seek slider that seeks on commit', async () => {
    const { player } = setup();
    const thumb = screen.getByRole('slider', { name: 'Seek No drums' });
    expect(thumb).toHaveAttribute('aria-valuenow', '83');
    expect(thumb).toHaveAttribute('aria-valuetext', '1:23 of 4:05');
    expect(thumb).toHaveAttribute('aria-valuemax', '245');
    thumb.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(player.onSeek).toHaveBeenCalledWith(84);
  });

  it('announces whole seconds even when the store holds a fraction', () => {
    setup({ currentTime: 83.7, duration: 245, paused: false });
    expect(screen.getByRole('slider', { name: 'Seek No drums' })).toHaveAttribute('aria-valuenow', '83');
  });

  it('disables seeking until the length is known', () => {
    setup({ currentTime: 2, duration: null as unknown as number, paused: false });
    expect(screen.getByRole('button', { name: 'Back 10 seconds' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Forward 10 seconds' })).toBeDisabled();
    expect(screen.getByText('–:––')).toBeInTheDocument();
    expect(screen.getByText('0:02')).toBeInTheDocument();
  });
});
