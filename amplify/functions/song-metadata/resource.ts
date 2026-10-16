import { defineFunction } from '@aws-amplify/backend';

export const songMetadataFunction = defineFunction({
  name: 'song-metadata',
  timeoutSeconds: 10,
});
