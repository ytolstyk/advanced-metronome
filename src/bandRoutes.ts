/** The only place Bands URLs are built: ids come from rows, so they are always encoded. */
export const bandPath = (bandId: string): string => `/bands/${encodeURIComponent(bandId)}`;

export const setListPath = (bandId: string, setListId: string): string =>
  `${bandPath(bandId)}/setlists/${encodeURIComponent(setListId)}`;
