import { defineFunction } from '@aws-amplify/backend';

/**
 * Issues short-lived signed upload forms and commits verified uploads (see CLAUDE.md "Backing tracks").
 * Lives in the `data` resource group because the schema's custom mutations point at it and `backend.ts`
 * grants it narrow access to the data tables; keeping it out of its own stack avoids a stack cycle.
 *
 * `BACKING_TRACKS_ENABLED` (kill switch) is set in `backend.ts` from the build environment and defaults to
 * off; flipping it in the Lambda console is the instant kill switch (the next deploy resets it). It is not
 * read here because this file is type-checked by the app, which has no Node types.
 */
export const backingTrackFunction = defineFunction({
  name: 'backing-track',
  timeoutSeconds: 25,
  memoryMB: 512,
  resourceGroupName: 'data',
});
