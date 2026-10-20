import { useEffect } from 'react';

/**
 * Google sign-in leaves the app and comes back to the registered callback URL (the site root), so
 * the page the user was on is kept in sessionStorage while a sign-in dialog is open and restored on
 * return. Closing or unmounting the dialog forgets it; a redirect unloads the page without running
 * effect cleanups, so the value survives exactly that case.
 */
const RETURN_PATH_KEY = 'auth-return-path';
const MAX_AGE_MS = 30 * 60 * 1000;

/** Browsers strip tabs/newlines and turn `\` into `/` when resolving URLs, which can defeat prefix checks. */
function hasControlOrBackslash(value: string): boolean {
  return [...value].some((ch) => ch === '\\' || ch.charCodeAt(0) <= 0x1f || ch.charCodeAt(0) === 0x7f);
}

/** Canonical same-origin app path, or `null` for anything else (full URLs, `//host`, control chars). */
function toInternalPath(raw: string): string | null {
  if (!raw.startsWith('/') || raw.startsWith('//') || hasControlOrBackslash(raw)) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const canonical = url.pathname + url.search + url.hash;
    // `/.//host` canonicalises to `//host`
    return canonical.startsWith('//') ? null : canonical;
  } catch {
    return null;
  }
}

export function rememberCurrentLocation(): void {
  const { pathname, search, hash } = window.location;
  const path = toInternalPath(pathname + search + hash);
  if (!path) return;
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // sessionStorage unavailable: the user just lands on the home page after sign-in
  }
}

export function forgetReturnPath(): void {
  try {
    sessionStorage.removeItem(RETURN_PATH_KEY);
  } catch {
    // sessionStorage unavailable: nothing was stored
  }
}

/** Reads and clears the remembered path, or `null` when there is none, it is stale or invalid. */
export function takeReturnPath(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== 'object' || stored === null) return null;
    const { path, at } = stored as { path?: unknown; at?: unknown };
    if (typeof path !== 'string' || typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) return null;
    return toInternalPath(path);
  } catch {
    return null;
  }
}

/** While `active` (a sign-in dialog is showing), remember the current page for the OAuth round trip. */
export function useRememberReturnPath(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    rememberCurrentLocation();
    // Refresh at the moment of leaving, in case the page changed while the dialog was open.
    window.addEventListener('pagehide', rememberCurrentLocation);
    return () => {
      window.removeEventListener('pagehide', rememberCurrentLocation);
      forgetReturnPath();
    };
  }, [active]);
}
