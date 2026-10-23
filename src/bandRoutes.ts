/** The only place Bands URLs are built: ids come from rows, so they are always encoded. */
export const bandPath = (bandId: string): string => `/bands/${encodeURIComponent(bandId)}`;

export const availabilityPath = (bandId: string): string => `${bandPath(bandId)}/availability`;

export const setListPath = (bandId: string, setListId: string): string =>
  `${bandPath(bandId)}/setlists/${encodeURIComponent(setListId)}`;

/**
 * The public, signed-out friendly link to a shared set list. The URL carries only the set list id,
 * not the band id (which also works as a join link), so pasting it somewhere doesn't advertise the
 * band. The API still returns the band id to a link holder who looks at the network traffic.
 */
export const sharedSetListPath = (setListId: string): string => `/shared/${encodeURIComponent(setListId)}`;
