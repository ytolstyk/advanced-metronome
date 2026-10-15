import { fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';

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

/** Opt-in display-name suggestion (never the email). Empty when the identity provider has none. */
export async function getDefaultDisplayName(): Promise<string> {
  try {
    const attrs = await fetchUserAttributes();
    return attrs.name ?? '';
  } catch {
    return '';
  }
}
