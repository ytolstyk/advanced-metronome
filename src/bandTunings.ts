/** Tunings offered in the song form. The stored value is the label itself (a custom tuning is free text). */
export const TUNING_PRESETS = [
  'E Standard',
  'Eb Standard',
  'D Standard',
  'C# Standard',
  'C Standard',
  'Drop D',
  'Drop C#',
  'Drop C',
  'Drop B',
  'DADGAD',
  'Open G',
  'Open D',
  'Open E',
  'Open A',
] as const;

/** What a song is in when nobody chose: rows written before the field existed read as this too. */
export const DEFAULT_TUNING = TUNING_PRESETS[0];

export function isPresetTuning(tuning: string): boolean {
  return (TUNING_PRESETS as readonly string[]).includes(tuning);
}

/** The tuning to show for a stored value (`null` = a song suggested before tunings existed). */
export function tuningOrDefault(tuning: string | null | undefined): string {
  return tuning || DEFAULT_TUNING;
}
