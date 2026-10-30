import { describe, expect, it, vi } from 'vitest';
import { isTransientAuthError, retryTransientAuth } from './transientAuth';

const noUser = () => Object.assign(new Error('No current user'), { name: 'NoSignedUser' });

describe('isTransientAuthError', () => {
  it('matches Amplify\'s failed-session error by name or message only', () => {
    expect(isTransientAuthError(noUser())).toBe(true);
    expect(isTransientAuthError(new Error('No current user'))).toBe(true);
    expect(isTransientAuthError(new Error('Not authenticated'))).toBe(false);
    expect(isTransientAuthError('No current user')).toBe(false);
  });
});

describe('retryTransientAuth', () => {
  it('retries a transient failure and returns the later success', async () => {
    const run = vi.fn().mockRejectedValueOnce(noUser()).mockResolvedValue('ok');
    await expect(retryTransientAuth(run, [1])).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up after the delays are spent', async () => {
    const run = vi.fn().mockRejectedValue(noUser());
    await expect(retryTransientAuth(run, [1, 1])).rejects.toThrow('No current user');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retryTransientAuth(run, [1])).rejects.toThrow('boom');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
