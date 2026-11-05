import { defineStorage } from '@aws-amplify/backend';

/**
 * Backing-track audio. Signed-in users may only read (`get`, never `list`, which would let anyone
 * enumerate every band id and key). Nobody on the client side can write or delete: uploads go through
 * the `backing-track` Lambda, which hands out short-lived, size-capped signed forms for `pending/`
 * and copies verified files into `bt/`. The Lambda's own access is granted in `backend.ts`.
 *
 * `keepOnDelete` is left at its default (false): deleting a stack deletes its audio. Sandbox stacks
 * always delete the bucket regardless.
 */
export const storage = defineStorage({
  name: 'backingTracks',
  access: (allow) => ({
    'bt/*': [allow.authenticated.to(['get'])],
  }),
});
