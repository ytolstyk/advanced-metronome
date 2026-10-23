/** Raised card look shared by the band, set list and song cards so they stand out from the page. */
export const CARD_SURFACE = 'border border-surface-border bg-surface shadow-lg shadow-black/50 [&_.text-muted-foreground]:text-surface-muted-foreground';
/** For a card that is a link. */
export const CARD_SURFACE_INTERACTIVE = `${CARD_SURFACE} transition-colors hover:bg-surface-hover`;

/** Native `<select>` look shared by the band forms. */
export const SELECT_CLASS =
  'min-h-11 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';
/** A small label stacked over its field. */
export const FIELD_LABEL_CLASS = 'grid gap-1 text-xs text-muted-foreground';
