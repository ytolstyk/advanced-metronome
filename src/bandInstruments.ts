/**
 * Instruments a member can say they play. The stored value is the `key` (never the label), so a
 * label can be reworded later; a key this client doesn't know is dropped when read. Icons live with
 * the components (`components/Bands/instrumentIcons.ts`) so this module stays free of React.
 */
export const INSTRUMENT_OPTIONS = [
  { key: 'guitar', label: 'Guitar' },
  { key: 'bass', label: 'Bass' },
  { key: 'drums', label: 'Drums' },
  { key: 'vocals', label: 'Vocals' },
  { key: 'keys', label: 'Keys' },
  { key: 'strings', label: 'Strings' },
  { key: 'winds', label: 'Winds & brass' },
  { key: 'other', label: 'Other' },
] as const;

export type InstrumentKey = (typeof INSTRUMENT_OPTIONS)[number]['key'];

const KEYS: ReadonlySet<string> = new Set(INSTRUMENT_OPTIONS.map((option) => option.key));

/** A hostile row can carry a huge array; only its head is looked at. The result is bounded by the options. */
const MAX_SCANNED_ENTRIES = 32;

export function isInstrumentKey(value: unknown): value is InstrumentKey {
  return typeof value === 'string' && KEYS.has(value);
}

/**
 * The known instruments in `raw`, once each, in palette order. Used on read (a row written by
 * something else is cleaned, not hidden: instruments are cosmetic) and before every write.
 */
export function normalizeInstruments(raw: readonly unknown[] | null | undefined): InstrumentKey[] {
  const picked = new Set(raw?.slice(0, MAX_SCANNED_ENTRIES));
  return INSTRUMENT_OPTIONS.map((option) => option.key).filter((key) => picked.has(key));
}

/** The options (key and label) for what `raw` lists, in palette order. */
export function instrumentOptionsFor(raw: readonly unknown[] | null | undefined) {
  const keys = new Set(normalizeInstruments(raw));
  return INSTRUMENT_OPTIONS.filter((option) => keys.has(option.key));
}
