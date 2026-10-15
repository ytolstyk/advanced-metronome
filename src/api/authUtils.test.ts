import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: { getCurrentUser: vi.fn(), fetchAuthSession: vi.fn(), fetchUserAttributes: vi.fn() },
}));

vi.mock('aws-amplify/auth', () => auth);

import { getCurrentUserSub, getDefaultDisplayName, getSignedInSub, isAuthenticated } from './authUtils';

beforeEach(() => {
  auth.getCurrentUser.mockReset();
  auth.fetchAuthSession.mockReset();
  auth.fetchUserAttributes.mockReset();
});

describe('getSignedInSub', () => {
  const session = (sub: unknown) => ({ tokens: { idToken: { payload: { sub } } } });

  it('returns the Cognito sub from the (refreshed) session', async () => {
    auth.fetchAuthSession.mockResolvedValue(session('sub-123'));
    await expect(getSignedInSub()).resolves.toBe('sub-123');
  });

  it('returns null when the session has no tokens (signed out or a failed refresh)', async () => {
    auth.fetchAuthSession.mockResolvedValue({ tokens: undefined });
    await expect(getSignedInSub()).resolves.toBeNull();
  });

  it('returns null for a token without a usable sub', async () => {
    auth.fetchAuthSession.mockResolvedValue(session(undefined));
    await expect(getSignedInSub()).resolves.toBeNull();
    auth.fetchAuthSession.mockResolvedValue(session(''));
    await expect(getSignedInSub()).resolves.toBeNull();
  });

  it('never throws', async () => {
    auth.fetchAuthSession.mockRejectedValue(new Error('network'));
    await expect(getSignedInSub()).resolves.toBeNull();
  });

  it('does a single session lookup', async () => {
    auth.fetchAuthSession.mockResolvedValue(session('sub-123'));
    await getSignedInSub();
    expect(auth.fetchAuthSession).toHaveBeenCalledTimes(1);
  });
});

describe('isAuthenticated / getCurrentUserSub', () => {
  it('isAuthenticated reflects whether a user session exists', async () => {
    auth.getCurrentUser.mockResolvedValue({ userId: 'u' });
    await expect(isAuthenticated()).resolves.toBe(true);
    auth.getCurrentUser.mockRejectedValue(new Error('no'));
    await expect(isAuthenticated()).resolves.toBe(false);
  });

  it('getCurrentUserSub throws when signed out (unlike getSignedInSub)', async () => {
    auth.getCurrentUser.mockResolvedValue({ userId: 'sub-9' });
    await expect(getCurrentUserSub()).resolves.toBe('sub-9');
    auth.getCurrentUser.mockRejectedValue(new Error('no'));
    await expect(getCurrentUserSub()).rejects.toThrow('no');
  });
});

describe('getDefaultDisplayName', () => {
  it('returns the name attribute, or empty when absent or unavailable', async () => {
    auth.fetchUserAttributes.mockResolvedValue({ name: 'Ada', email: 'ada@example.com' });
    await expect(getDefaultDisplayName()).resolves.toBe('Ada');
    auth.fetchUserAttributes.mockResolvedValue({ email: 'ada@example.com' });
    await expect(getDefaultDisplayName()).resolves.toBe('');
    auth.fetchUserAttributes.mockRejectedValue(new Error('no'));
    await expect(getDefaultDisplayName()).resolves.toBe('');
  });
});
