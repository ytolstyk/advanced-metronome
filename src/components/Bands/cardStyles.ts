/** Raised card look shared by the band, set list and song cards so they stand out from the page. */
export const CARD_SURFACE = 'border border-surface-border bg-surface shadow-lg shadow-black/50 [&_.text-muted-foreground]:text-surface-muted-foreground';
/** For a card that is a link. */
export const CARD_SURFACE_INTERACTIVE = `${CARD_SURFACE} transition-colors hover:bg-surface-hover`;
