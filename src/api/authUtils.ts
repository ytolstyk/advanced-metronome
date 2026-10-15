import { fetchAuthSession, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';

export async function isAuthenticated(): Promise<boolean> {
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

/** The signed-in user's Cognito `sub` (stable id; equals the `owner` value on their rows). */
export async function getCurrentUserSub(): Promise<string> {
  const { userId } = await getCurrentUser();
  return userId;
}

/**
 * The signed-in user's `sub`, or `null` when signed out (never throws). Unlike `getCurrentUser`
 * this refreshes expired tokens, so a returning visitor with a dead session reads as signed out
 * (and gets the public/guest path) instead of failing every request. For guests it also warms the
 * identity-pool credentials the first public read needs.
 */
export async function getSignedInSub(): Promise<string | null> {
  try {
    const sub = (await fetchAuthSession()).tokens?.idToken?.payload.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/** Opt-in display-name suggestion (never the email). Empty when the identity provider has none. */
export async function getDefaultDisplayName(): Promise<string> {
  try {
    const attrs = await fetchUserAttributes();
    return attrs.name ?? '';
  } catch {
    return '';
  }
}
