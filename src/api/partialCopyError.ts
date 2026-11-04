/** A copy that wrote some songs and then failed: `landedSongIds` are the SOURCE song ids that were created. */
export class PartialCopyError extends Error {
  readonly landedSongIds: ReadonlySet<string>;
  constructor(message: string, landedSongIds: ReadonlySet<string>, cause: unknown) {
    super(message, { cause });
    this.name = 'PartialCopyError';
    this.landedSongIds = landedSongIds;
  }
}
