import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextPromptDialog } from './TextPromptDialog';

function setup(props: Partial<React.ComponentProps<typeof TextPromptDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  const onSettled = vi.fn();
  render(
    <TextPromptDialog
      open
      onOpenChange={onOpenChange}
      title="Rename"
      label="Name"
      maxLength={20}
      submitLabel="Save"
      onSubmit={onSubmit}
      onSettled={onSettled}
      {...props}
    />,
  );
  return { onSubmit, onOpenChange, onSettled };
}

const typeName = (value: string) => fireEvent.change(screen.getByLabelText('Name'), { target: { value } });

describe('TextPromptDialog', () => {
  it('starts with the initial value and applies the length limit', () => {
    setup({ initialValue: 'Main Set' });
    const input = screen.getByLabelText('Name');
    expect(input).toHaveValue('Main Set');
    expect(input).toHaveAttribute('maxlength', '20');
  });

  it('starts empty when there is no initial value', () => {
    setup();
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('shows the description only when one is given', () => {
    const { onSubmit } = setup({ description: 'Pick a good one.' });
    expect(screen.getByText('Pick a good one.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the typed value, then onSettled, then closes', async () => {
    const order: string[] = [];
    const { onSubmit, onOpenChange, onSettled } = setup({ initialValue: 'Old' });
    onSubmit.mockImplementation(async (v: string) => void order.push(`submit:${v}`));
    onSettled.mockImplementation(() => void order.push('settled'));
    onOpenChange.mockImplementation((open: boolean) => void order.push(`open:${open}`));
    typeName('New name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(order).toEqual(['submit:New name', 'settled', 'open:false']);
  });

  it('shows a failure inline, runs onSettled and stays open with the text kept', async () => {
    const { onSubmit, onOpenChange, onSettled } = setup();
    onSubmit.mockRejectedValue(new Error('Name already taken'));
    typeName('Dupe');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name already taken');
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Dupe');
  });

  it('while saving: shows Saving…, disables the buttons and ignores dismissal', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { onSubmit, onOpenChange } = setup();
    onSubmit.mockReturnValue(gate);
    typeName('Slow');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
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

  it('cancel closes without submitting', () => {
    const { onSubmit, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('works without an onSettled callback', async () => {
    const { onOpenChange } = setup({ onSettled: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
