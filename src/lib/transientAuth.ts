/**
 * Amplify's data client throws "No current user" (name `NoSignedUser`) when `fetchAuthSession()`
 * itself rejects: a token refresh that lost a race (several requests refreshing at once after a
 * reload) or hit a brief network blip. The person is still signed in and the next attempt works,
 * so these are retried instead of shown. A genuinely signed-out user has no session to read and
 * fails earlier (`NotSignedInError`), so this never retries a real sign-out.
 */
export function isTransientAuthError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'NoSignedUser' || e.message === 'No current user');
}

const RETRY_DELAYS_MS = [300, 900];

export async function retryTransientAuth<T>(run: () => Promise<T>, delaysMs: readonly number[] = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!isTransientAuthError(e) || attempt >= delaysMs.length) throw e;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}
