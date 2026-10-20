import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, act } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

const KEY = 'auth-return-path';

type HubListener = (capsule: { payload: { event: string } }) => void;

const hub = vi.hoisted(() => ({
  listeners: new Set<(capsule: { payload: { event: string } }) => void>(),
}));

// The listener is captured when ReturnToPage is imported, because the real module subscribes at load.
vi.mock('aws-amplify/utils', () => ({
  Hub: {
    listen: (_channel: string, listener: HubListener) => {
      hub.listeners.add(listener);
      return () => {
        hub.listeners.delete(listener);
      };
    },
  },
}));

function emit(event: string): void {
  for (const listener of [...hub.listeners]) listener({ payload: { event } });
}

/** Lets the resolved `returnTarget` promise run its `.then` callbacks inside act. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function remember(path: string, at = Date.now()): void {
  sessionStorage.setItem(KEY, JSON.stringify({ path, at }));
}

function setWindowUrl(url: string): void {
  window.history.replaceState({}, '', url);
}

function Probe() {
  const { pathname, search, hash } = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="location">{pathname + search + hash}</div>
      <div data-testid="nav-type">{type}</div>
    </>
  );
}

/**
 * ReturnToPage decides and subscribes at module load, so the URL and storage must be set up first
 * and every test needs a fresh copy of the module.
 */
async function loadAt(url: string) {
  setWindowUrl(url);
  vi.resetModules();
  const mod = await import('./ReturnToPage');
  return mod.ReturnToPage;
}

type Component = Awaited<ReturnType<typeof loadAt>>;

function renderMemory(ReturnToPage: Component, url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ReturnToPage />
      <Probe />
    </MemoryRouter>,
  );
}

const OAUTH_LANDING = '/?code=abc&state=xyz';

beforeEach(() => {
  hub.listeners.clear();
  sessionStorage.clear();
  setWindowUrl('/');
});

describe('ReturnToPage', () => {
  it('renders nothing', async () => {
    const ReturnToPage = await loadAt('/');
    const { container } = render(
      <MemoryRouter>
        <ReturnToPage />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe('OAuth landing (/?code&state)', () => {
    it('subscribes to the auth Hub at module load, before any component mounts', async () => {
      remember('/chords');
      await loadAt(OAUTH_LANDING);
      expect(hub.listeners.size).toBe(1);
    });

    it('consumes the remembered path at module load', async () => {
      remember('/chords');
      await loadAt(OAUTH_LANDING);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('does not navigate until the sign-in event arrives', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(OAUTH_LANDING);
    });

    it('navigates to the remembered page on signInWithRedirect', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });

    it('also navigates on signInWithRedirect_failure', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      emit('signInWithRedirect_failure');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });

    it('preserves the query string and hash of the remembered page', async () => {
      remember('/scales?root=D#top');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent('/scales?root=D#top');
    });

    it('replaces the history entry instead of pushing one', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    });

    it('stops listening to the Hub once the event has fired', async () => {
      remember('/chords');
      await loadAt(OAUTH_LANDING);
      emit('signInWithRedirect');
      expect(hub.listeners.size).toBe(0);
    });

    it('stops listening after a failure event too', async () => {
      remember('/chords');
      await loadAt(OAUTH_LANDING);
      emit('signInWithRedirect_failure');
      expect(hub.listeners.size).toBe(0);
    });

    it.each([
      ['signedIn', 'signedIn'],
      ['tokenRefresh', 'tokenRefresh'],
      ['signedOut', 'signedOut'],
    ])('ignores the unrelated %s event and keeps listening', async (_label, event) => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      emit(event);
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(OAUTH_LANDING);
      expect(hub.listeners.size).toBe(1);
    });

    it('registers no listener and never navigates when nothing was remembered', async () => {
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      expect(hub.listeners.size).toBe(0);
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(OAUTH_LANDING);
    });

    it('registers no listener when the remembered entry has expired (older than 30 minutes)', async () => {
      remember('/chords', Date.now() - 30 * 60 * 1000 - 1);
      await loadAt(OAUTH_LANDING);
      expect(hub.listeners.size).toBe(0);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('still honours an entry just inside the 30 minute window', async () => {
      remember('/chords', Date.now() - 29 * 60 * 1000);
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });

    it.each([
      ['an external URL', 'https://evil.com'],
      ['a protocol-relative URL', '//evil.com'],
      ['a backslash path', '/\\evil.com'],
      ['a dot-segment path that canonicalises to //', '/.//evil.com'],
    ])('never navigates to a tampered entry holding %s', async (_label, path) => {
      remember(path);
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      expect(hub.listeners.size).toBe(0);
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(OAUTH_LANDING);
    });

    it('survives StrictMode double effects and navigates once to the target', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      render(
        <StrictMode>
          <MemoryRouter initialEntries={[OAUTH_LANDING]}>
            <ReturnToPage />
            <Probe />
          </MemoryRouter>
        </StrictMode>,
      );
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });

    it('keeps the router state in sync with the URL under a real BrowserRouter', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      render(
        <BrowserRouter>
          <ReturnToPage />
          <Probe />
        </BrowserRouter>,
      );
      emit('signInWithRedirect');
      await flush();
      expect(window.location.pathname).toBe('/chords');
      expect(window.location.search).toBe('');
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });
  });

  describe('regression: the Hub event can arrive before the component mounts', () => {
    it('still navigates after mount when signInWithRedirect fired first', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      emit('signInWithRedirect');
      renderMemory(ReturnToPage, OAUTH_LANDING);
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });

    it('still navigates after mount when signInWithRedirect_failure fired first (user cancelled at Google)', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      emit('signInWithRedirect_failure');
      renderMemory(ReturnToPage, OAUTH_LANDING);
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });

    it('navigates under a real BrowserRouter when the event fired first', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      emit('signInWithRedirect');
      render(
        <BrowserRouter>
          <ReturnToPage />
          <Probe />
        </BrowserRouter>,
      );
      await flush();
      expect(window.location.pathname).toBe('/chords');
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/chords$/);
    });
  });

  describe('regression: only navigate while the window is still on the root', () => {
    it('does not navigate when the URL is no longer "/" at resolve time', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      renderMemory(ReturnToPage, OAUTH_LANDING);
      setWindowUrl('/tuner');
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(OAUTH_LANDING);
    });

    it('does not navigate when the event fired before mount and the window has since left the root', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      emit('signInWithRedirect');
      setWindowUrl('/tuner');
      renderMemory(ReturnToPage, '/tuner');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent('/tuner');
    });
  });

  describe('cancel on unmount', () => {
    it('does not navigate if the component unmounted before the event fired', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      const { unmount } = render(
        <BrowserRouter>
          <ReturnToPage />
        </BrowserRouter>,
      );
      unmount();
      emit('signInWithRedirect');
      await flush();
      expect(window.location.pathname).toBe('/');
      expect(window.location.search).toBe('?code=abc&state=xyz');
    });

    it('does not navigate if it unmounted after the event but before the promise callback ran', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt(OAUTH_LANDING);
      const { unmount } = render(
        <BrowserRouter>
          <ReturnToPage />
        </BrowserRouter>,
      );
      emit('signInWithRedirect');
      unmount();
      await flush();
      expect(window.location.pathname).toBe('/');
    });
  });

  describe('regression: any other load discards the path and subscribes to nothing', () => {
    it('plain load of the root forgets the key and registers no Hub listener', async () => {
      remember('/chords');
      await loadAt('/');
      expect(sessionStorage.getItem(KEY)).toBeNull();
      expect(hub.listeners.size).toBe(0);
    });

    it('root with code but no state forgets the key and registers no listener', async () => {
      remember('/chords');
      await loadAt('/?code=abc');
      expect(sessionStorage.getItem(KEY)).toBeNull();
      expect(hub.listeners.size).toBe(0);
    });

    it('state on a non-root page forgets the key and registers no listener', async () => {
      remember('/chords');
      await loadAt('/tuner?state=xyz');
      expect(sessionStorage.getItem(KEY)).toBeNull();
      expect(hub.listeners.size).toBe(0);
    });

    it('a deep link load forgets the key and registers no listener', async () => {
      remember('/chords');
      await loadAt('/scales');
      expect(sessionStorage.getItem(KEY)).toBeNull();
      expect(hub.listeners.size).toBe(0);
    });

    it('never navigates on a plain load, even if a sign-in event fires', async () => {
      remember('/chords');
      const ReturnToPage = await loadAt('/');
      renderMemory(ReturnToPage, '/');
      emit('signInWithRedirect');
      await flush();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
      expect(screen.getByTestId('nav-type')).toHaveTextContent('POP');
    });
  });
});
