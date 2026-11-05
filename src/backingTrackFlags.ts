/**
 * Whether the deployed backend accepts new backing track uploads. `amplify/backend.ts` publishes its
 * `BACKING_TRACKS_ENABLED` switch into `amplify_outputs.json` (`custom.backingTracksUploads`), so the
 * app and the Lambda read one source of truth. `Amplify.getConfig()` does not expose `custom`, hence the
 * direct read. `import.meta.glob` (not a plain JSON import) so a missing file, as in a fresh clone or a
 * test run, reads as "off" instead of breaking the build. Outputs from before this flag existed also read
 * as off, which is the safe default.
 */
type Outputs = { custom?: { backingTracksUploads?: unknown } };

const files = import.meta.glob<Outputs>('../amplify_outputs.json', { eager: true, import: 'default' });

export const backingTrackUploadsOn = (): boolean => Object.values(files)[0]?.custom?.backingTracksUploads === true;
