import { Hub } from 'aws-amplify/utils';

/**
 * A shared invite link (`/bands?join=CODE`) must survive the sign-in round trip, so the code is
 * kept in sessionStorage until it is used, dismissed or the user signs out. It is a capability, so
 * it never goes to localStorage and is stripped from the URL as soon as it is read.
 */
const KEY = 'band-join-code';

export function readJoinCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeJoinCode(code: string): void {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {
    /* storage unavailable: the code is still held in component state for this visit */
  }
}

export function clearJoinCode(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Call once at startup: forgets a pending code on sign-out, whichever page the user signs out from. */
export function registerJoinCodeCleanup(): () => void {
  return Hub.listen('auth', ({ payload }) => {
    if (payload.event === 'signedOut') clearJoinCode();
  });
}
