import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  const onSettled = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete it?"
      description="This is permanent."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onSettled={onSettled}
      {...props}
    />,
  );
  return { onConfirm, onOpenChange, onSettled };
}

describe('ConfirmDialog', () => {
  it('renders the title, description, children and both buttons', () => {
    setup({ children: <label>Extra<input type="checkbox" /></label> });
    expect(screen.getByRole('heading', { name: 'Delete it?' })).toBeInTheDocument();
    expect(screen.getByText('This is permanent.')).toBeInTheDocument();
    expect(screen.getByLabelText('Extra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('renders nothing when closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirming runs the action, then onSettled, then closes', async () => {
    const order: string[] = [];
    const { onConfirm, onOpenChange, onSettled } = setup();
    onConfirm.mockImplementation(async () => void order.push('confirm'));
    onSettled.mockImplementation(() => void order.push('settled'));
    onOpenChange.mockImplementation((open: boolean) => void order.push(`open:${open}`));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(order).toEqual(['confirm', 'settled', 'open:false']);
  });

  it('on failure it shows the error inline, runs onSettled, and stays open', async () => {
    const { onConfirm, onOpenChange, onSettled } = setup();
    onConfirm.mockRejectedValue(new Error('Server said no'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server said no');
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('uses a generic message when the failure carries no message', async () => {
    const { onConfirm } = setup();
    onConfirm.mockRejectedValue('weird');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('works without an onSettled callback', async () => {
    const { onOpenChange } = setup({ onSettled: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('while busy: shows Working…, disables both buttons, and ignores attempts to close', async () => {
    const gate = deferred();
    const { onConfirm, onOpenChange } = setup();
    onConfirm.mockReturnValue(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const working = await screen.findByRole('button', { name: 'Working…' });
    expect(working).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('cancel closes without running the action', () => {
    const { onConfirm, onOpenChange, onSettled } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('clears a previous error when the dialog is dismissed', async () => {
    const { onConfirm } = setup();
    onConfirm.mockRejectedValueOnce(new Error('first failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('a retry after a failure clears the old error while running and can then succeed', async () => {
    const gate = deferred();
    const { onConfirm, onOpenChange } = setup();
    onConfirm.mockRejectedValueOnce(new Error('first failure')).mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('first failure');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
