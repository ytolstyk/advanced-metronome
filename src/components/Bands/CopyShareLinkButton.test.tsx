import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CopyShareLinkButton } from './CopyShareLinkButton';

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('CopyShareLinkButton', () => {
  it('is named after the set list and starts as "Copy link"', () => {
    render(<CopyShareLinkButton setListId="sl-1" setListName="Main Set" />);
    const button = screen.getByRole('button', { name: 'Copy share link for Main Set' });
    expect(button).toHaveTextContent('Copy link');
  });

  it('copies origin + /shared/<id> (no band id in the URL) and flashes "Copied!"', async () => {
    writeText.mockResolvedValue(undefined);
    render(<CopyShareLinkButton setListId="sl-1" setListName="Main Set" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link for Main Set' }));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Copied!'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/sl-1`);
  });

  it('encodes the set list id in the copied link', async () => {
    writeText.mockResolvedValue(undefined);
    render(<CopyShareLinkButton setListId="a/b c?x" setListName="Odd" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/a%2Fb%20c%3Fx`);
  });

  it('shows "Couldn’t copy" when the browser refuses, and never claims success', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<CopyShareLinkButton setListId="sl-1" setListName="Main Set" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Couldn’t copy'));
    expect(screen.getByRole('button')).not.toHaveTextContent('Copied!');
  });

  it('recovers: a later successful copy replaces the failure label', async () => {
    writeText.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    render(<CopyShareLinkButton setListId="sl-1" setListName="Main Set" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Couldn’t copy'));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Copied!'));
  });

  it('the "Copied!" flash reverts to "Copy link" after two seconds', async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue(undefined);
    render(<CopyShareLinkButton setListId="sl-1" setListName="Main Set" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copied!');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copy link');
  });
});
