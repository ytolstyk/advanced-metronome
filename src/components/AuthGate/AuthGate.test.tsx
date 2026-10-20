import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'configuring' }));

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: auth.status }),
  Authenticator: () => <div data-testid="authenticator" />,
}));

import { AuthGate } from './AuthGate';

const RETURN_KEY = 'auth-return-path';

function rememberedPath(): string | null {
  const raw = sessionStorage.getItem(RETURN_KEY);
  return raw === null ? null : (JSON.parse(raw) as { path: string }).path;
}

beforeEach(() => {
  auth.status = 'unauthenticated';
  sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('AuthGate (default banner)', () => {
  it('renders children and no banner when authenticated', () => {
    auth.status = 'authenticated';
    render(<AuthGate>secret content</AuthGate>);
    expect(screen.getByText('secret content')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign In' })).not.toBeInTheDocument();
  });

  it('hides the children and shows the default message plus a Sign In button when signed out', () => {
    render(<AuthGate>secret content</AuthGate>);
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.getByText('Sign in to unlock this feature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows a custom message', () => {
    render(<AuthGate message="Sign in to save">x</AuthGate>);
    expect(screen.getByText('Sign in to save')).toBeInTheDocument();
  });

  it('is the compact banner, not the hero, by default', () => {
    const { container } = render(<AuthGate>x</AuthGate>);
    expect(container.querySelector('.auth-gate-banner')).not.toBeNull();
    expect(container.querySelector('.auth-gate-banner--inline')).toBeNull();
    expect(container.querySelector('.auth-gate-hero')).toBeNull();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('adds the inline modifier and a custom class', () => {
    const { container } = render(<AuthGate inline className="extra">x</AuthGate>);
    const banner = container.querySelector('.auth-gate-banner');
    expect(banner).toHaveClass('auth-gate-banner--inline', 'extra');
  });

  it('does not mount the Authenticator until Sign In is clicked, then does', () => {
    render(<AuthGate>x</AuthGate>);
    expect(screen.queryByTestId('authenticator')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByTestId('authenticator')).toBeInTheDocument();
  });

  it('treats any status other than authenticated as signed out', () => {
    auth.status = 'configuring';
    render(<AuthGate>secret content</AuthGate>);
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('with no children, an authenticated user sees nothing', () => {
    auth.status = 'authenticated';
    const { container } = render(<AuthGate />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AuthGate prominent', () => {
  it('renders children only when authenticated', () => {
    auth.status = 'authenticated';
    render(<AuthGate prominent title="T" message="M">secret content</AuthGate>);
    expect(screen.getByText('secret content')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('signed out: a labelled hero region with the default title, the message and no children', () => {
    render(<AuthGate prominent message="Create a band to begin">secret content</AuthGate>);
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Sign in required' });
    expect(region).toHaveClass('auth-gate-hero');
    expect(screen.getByRole('heading', { level: 2, name: 'Sign in required' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Create a band to begin');
  });

  it('uses a custom title as both the heading and the region name', () => {
    render(<AuthGate prominent title="Bands are for signed-in users" message="m" />);
    expect(screen.getByRole('region', { name: 'Bands are for signed-in users' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bands are for signed-in users' })).toBeInTheDocument();
  });

  it('falls back to the default message when none is given', () => {
    render(<AuthGate prominent />);
    expect(screen.getByText('Sign in to unlock this feature')).toBeInTheDocument();
  });

  it('shows one large call-to-action instead of the compact Sign In button, and no banner', () => {
    const { container } = render(<AuthGate prominent />);
    expect(screen.getByRole('button', { name: 'Sign in or create an account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign In' })).not.toBeInTheDocument();
    expect(container.querySelector('.auth-gate-banner')).toBeNull();
  });

  it('merges a custom className onto the hero', () => {
    render(<AuthGate prominent className="mt-4" />);
    expect(screen.getByRole('region')).toHaveClass('auth-gate-hero', 'mt-4');
  });

  it('opens the sign-in dialog from the call-to-action', () => {
    render(<AuthGate prominent />);
    expect(screen.queryByTestId('authenticator')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    expect(screen.getByTestId('authenticator')).toBeInTheDocument();
  });

  it('shows the children once the user signs in', () => {
    const { rerender } = render(<AuthGate prominent>secret content</AuthGate>);
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    act(() => { auth.status = 'authenticated'; });
    rerender(<AuthGate prominent>secret content</AuthGate>);
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });
});

describe('AuthGate prominent heading id and dialog', () => {
  it('links the region to its heading through a generated id (aria-labelledby)', () => {
    render(<AuthGate prominent title="Bands" />);
    const region = screen.getByRole('region', { name: 'Bands' });
    const heading = screen.getByRole('heading', { name: 'Bands' });
    expect(heading.id).not.toBe('');
    expect(region).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('gives two gates on one page distinct heading ids, each labelling its own region', () => {
    render(
      <>
        <AuthGate prominent title="First" />
        <AuthGate prominent title="Second" />
      </>,
    );
    const first = screen.getByRole('heading', { name: 'First' });
    const second = screen.getByRole('heading', { name: 'Second' });
    expect(first.id).not.toBe(second.id);
    expect(screen.getByRole('region', { name: 'First' })).toHaveAttribute('aria-labelledby', first.id);
    expect(screen.getByRole('region', { name: 'Second' })).toHaveAttribute('aria-labelledby', second.id);
  });

  it('keeps the same heading id across re-renders', () => {
    const { rerender } = render(<AuthGate prominent title="Bands" />);
    const id = screen.getByRole('heading', { name: 'Bands' }).id;
    rerender(<AuthGate prominent title="Bands" message="new message" />);
    expect(screen.getByRole('heading', { name: 'Bands' }).id).toBe(id);
  });

  it('mounts a single sign-in dialog (one Authenticator) when opened from the prominent banner', () => {
    render(<AuthGate prominent />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    expect(screen.getAllByTestId('authenticator')).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('mounts a single sign-in dialog from the compact banner too', () => {
    render(<AuthGate>x</AuthGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getAllByTestId('authenticator')).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('the dialog has an accessible (visually hidden) title', () => {
    render(<AuthGate prominent />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    expect(screen.getByRole('dialog', { name: 'Sign in or create an account' })).toBeInTheDocument();
  });
});

describe('AuthGate return path', () => {
  it('remembers the current page (path, query, hash) when the sign-in dialog opens', () => {
    window.history.pushState({}, '', '/bands/b1?tab=songs#vote');
    render(<AuthGate>x</AuthGate>);
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(rememberedPath()).toBe('/bands/b1?tab=songs#vote');
  });

  it('remembers the page when opened from the prominent call-to-action', () => {
    window.history.pushState({}, '', '/bands');
    render(<AuthGate prominent />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in or create an account' }));
    expect(rememberedPath()).toBe('/bands');
  });

  it('forgets the remembered page when the dialog is dismissed', () => {
    window.history.pushState({}, '', '/bands');
    render(<AuthGate>x</AuthGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(rememberedPath()).toBe('/bands');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it('remembers the page again when the dialog is reopened after being dismissed', () => {
    window.history.pushState({}, '', '/bands');
    render(<AuthGate>x</AuthGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(rememberedPath()).toBe('/bands');
  });

  it('stores nothing while the dialog has never been opened', () => {
    window.history.pushState({}, '', '/bands');
    render(<AuthGate prominent />);
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it('forgets the remembered page when the gate unmounts with the dialog open', () => {
    window.history.pushState({}, '', '/bands');
    const { unmount } = render(<AuthGate>x</AuthGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(rememberedPath()).toBe('/bands');
    unmount();
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it('forgets the remembered page when the user authenticates (gate swaps to children)', () => {
    window.history.pushState({}, '', '/bands');
    const { rerender } = render(<AuthGate>secret</AuthGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(rememberedPath()).toBe('/bands');
    act(() => { auth.status = 'authenticated'; });
    rerender(<AuthGate>secret</AuthGate>);
    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });
});
