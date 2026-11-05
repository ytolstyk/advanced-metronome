/**
 * Where to send a takedown request for a backing track someone uploaded without the right to share it
 * (shown in the Terms of Service and the Privacy Policy).
 *
 * LAUNCH GATE: replace the placeholder with a real, monitored email address before turning uploads on.
 * `amplify/backend.ts` refuses to build with `BACKING_TRACKS_ENABLED=true` while this still starts with
 * `TODO`, so uploads cannot go live pointing at nothing.
 */
export const TAKEDOWN_CONTACT = 'TODO-set-before-launch';

export const isTakedownContactSet = (contact: string = TAKEDOWN_CONTACT): boolean => !contact.startsWith('TODO');
