import { describe, expect, it } from 'vitest';
import { BAND_LIMITS, type InviteFailure } from '../../bandTypes';
import { inviteErrorMessage, withInviteErrors } from './inviteMessages';

const failure = (reason: string) => Object.assign(new Error('raw internal message'), { reason });

describe('inviteErrorMessage', () => {
  it.each<[InviteFailure, string]>([
    ['invalid-code', 'That code doesn’t look right'],
    ['not-found', 'No band found for that code.'],
    ['revoked', 'no longer valid'],
    ['deleted', 'That band has been deleted.'],
    ['banned', 'You were removed from this band.'],
    ['full', `This band is full (${BAND_LIMITS.maxMembers} members).`],
  ])('maps the "%s" reason to friendly text instead of the raw message', (reason, text) => {
    const msg = inviteErrorMessage(failure(reason));
    expect(msg).toContain(text);
    expect(msg).not.toContain('raw internal message');
  });

  it('falls back to the error message for an unknown reason', () => {
    expect(inviteErrorMessage(failure('something-new'))).toBe('raw internal message');
  });

  it('uses the plain message for ordinary errors and a generic one for non-errors', () => {
    expect(inviteErrorMessage(new Error('network down'))).toBe('network down');
    expect(inviteErrorMessage('string')).toBe('Something went wrong');
    expect(inviteErrorMessage(null)).toBe('Something went wrong');
    expect(inviteErrorMessage(undefined)).toBe('Something went wrong');
  });
});

describe('withInviteErrors', () => {
  it('returns the call result untouched on success', async () => {
    await expect(withInviteErrors(async () => 42)).resolves.toBe(42);
  });

  it('rethrows an invite failure as an Error carrying the friendly message', async () => {
    const err = await withInviteErrors(async () => {
      throw failure('banned');
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('You were removed from this band.');
    expect((err as Error & { reason?: string }).reason).toBeUndefined();
  });

  it('rethrows non-invite failures with their own message', async () => {
    await expect(
      withInviteErrors(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('never treats inherited property names as invite reasons', () => {
    for (const reason of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      const err = Object.assign(new Error('raw internal message'), { reason });
      expect(inviteErrorMessage(err)).toBe('raw internal message');
    }
  });
});
