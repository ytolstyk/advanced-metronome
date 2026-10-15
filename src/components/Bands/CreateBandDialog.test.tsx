import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../api/bandsApi', () => ({ createBand: vi.fn() }));

import { createBand } from '../../api/bandsApi';
import { CreateBandDialog } from './CreateBandDialog';

function setup(props: Partial<React.ComponentProps<typeof CreateBandDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CreateBandDialog open onOpenChange={onOpenChange} defaultDisplayName="Alice" onCreated={onCreated} {...props} />,
  );
  return { onOpenChange, onCreated };
}

beforeEach(() => {
  vi.mocked(createBand).mockReset();
  vi.mocked(createBand).mockResolvedValue({ id: 'new-band' } as never);
});

describe('CreateBandDialog', () => {
  it('starts with an empty band name and the default display name, with length limits', () => {
    setup();
    expect(screen.getByLabelText('Band name')).toHaveValue('');
    expect(screen.getByLabelText('Band name')).toHaveAttribute('maxlength', '50');
    expect(screen.getByLabelText('Your name in this band')).toHaveValue('Alice');
    expect(screen.getByLabelText('Your name in this band')).toHaveAttribute('maxlength', '30');
  });

  it('creates the band with the typed values, closes, then reports the new id', async () => {
    const order: string[] = [];
    const { onOpenChange, onCreated } = setup();
    onOpenChange.mockImplementation((o: boolean) => void order.push(`open:${o}`));
    onCreated.mockImplementation((id: string) => void order.push(`created:${id}`));
    fireEvent.change(screen.getByLabelText('Band name'), { target: { value: 'Led Zep' } });
    fireEvent.change(screen.getByLabelText('Your name in this band'), { target: { value: 'Jimmy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create band' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-band'));
    expect(createBand).toHaveBeenCalledWith('Led Zep', 'Jimmy');
    expect(order).toEqual(['open:false', 'created:new-band']);
  });

  it('shows the failure inline and neither closes nor reports a band', async () => {
    vi.mocked(createBand).mockRejectedValue(new Error('You can own at most 10 bands'));
    const { onOpenChange, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Band name'), { target: { value: 'Another' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create band' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can own at most 10 bands');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Band name')).toHaveValue('Another');
    expect(screen.getByRole('button', { name: 'Create band' })).toBeEnabled();
  });

  it('shows Creating… and cannot be dismissed while the request runs', async () => {
    let release!: (v: { id: string }) => void;
    vi.mocked(createBand).mockReturnValue(
      new Promise<{ id: string }>((r) => {
        release = r;
      }) as never,
    );
    const { onOpenChange, onCreated } = setup();
    fireEvent.change(screen.getByLabelText('Band name'), { target: { value: 'Slow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create band' }));
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    release({ id: 'late' });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('late'));
  });

  it('cancel closes without creating anything', () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createBand).not.toHaveBeenCalled();
  });
});
