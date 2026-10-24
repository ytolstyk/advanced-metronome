import { INSTRUMENT_OPTIONS, normalizeInstruments, type InstrumentKey } from './bandInstruments';

export interface InstrumentCoverage {
  /** Instruments someone in `freeSubs` plays. */
  covered: InstrumentKey[];
  /** Instruments someone in the band plays that nobody in `freeSubs` does. */
  missing: InstrumentKey[];
  /** Nobody in the band has listed an instrument, so there is nothing to say. */
  unknown: boolean;
}

/** Which instruments can jam when `freeSubs` are free, out of everything `allSubs` play. */
export function instrumentCoverage(
  freeSubs: readonly string[],
  allSubs: readonly string[],
  instrumentsOf: (sub: string) => readonly InstrumentKey[],
): InstrumentCoverage {
  const covered = new Set(normalizeInstruments(freeSubs.flatMap((sub) => [...instrumentsOf(sub)])));
  const all = new Set(normalizeInstruments(allSubs.flatMap((sub) => [...instrumentsOf(sub)])));
  const inPaletteOrder = INSTRUMENT_OPTIONS.map((o) => o.key);
  return {
    covered: inPaletteOrder.filter((key) => covered.has(key)),
    missing: inPaletteOrder.filter((key) => all.has(key) && !covered.has(key)),
    unknown: all.size === 0,
  };
}
