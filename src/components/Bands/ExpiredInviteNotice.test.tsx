import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExpiredInviteNotice } from './ExpiredInviteNotice';

describe('ExpiredInviteNotice', () => {
  it('tells an expired link\u2019s holder to ask the owner for a new one', () => {
    render(<ExpiredInviteNotice reason="expired" onEnterCode={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: 'This invite link has expired' })).toBeInTheDocument();
    expect(screen.getByText(/Ask the band owner to send you a new link/)).toBeInTheDocument();
    expect(screen.getByText(/Invite section on their band page/)).toBeInTheDocument();
  });

  it('explains a replaced link (or a deleted band) without blaming the reader', () => {
    render(<ExpiredInviteNotice reason="revoked" onEnterCode={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { name: 'This invite link is no longer valid' })).toBeInTheDocument();
    expect(screen.getByText(/replaced this link with a newer one, or the band no longer exists/)).toBeInTheDocument();
  });

  it('offers entering a code and going back', () => {
    const onEnterCode = vi.fn();
    const onDismiss = vi.fn();
    render(<ExpiredInviteNotice reason="expired" onEnterCode={onEnterCode} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter a new code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to my bands' }));
    expect(onEnterCode).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
