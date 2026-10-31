// Single-line text sanitising shared by Bands and the click-track importer (a leaf module: no imports).

// Control chars, soft hyphen, zero-width / invisible-operator chars, bidi overrides/isolates and
// the Hangul filler (all common in spoofed names). Written as escapes so this file stays free of
// invisible characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff]/g;

/** Whitespace (tabs, newlines, ...) becomes single spaces, then control/zero-width/bidi chars go. */
export function stripUnsafeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(UNSAFE_TEXT, '').replace(/\s+/g, ' ').trim();
}

/** Length in characters as a person counts them (an emoji is one, not two). */
export function textLength(text: string): number {
  return Array.from(text).length;
}

export function clampText(text: string, max: number): string {
  return textLength(text) <= max ? text : Array.from(text).slice(0, max).join('');
}

/** Single-line text: sanitised and clamped to `max` characters (never splits a surrogate pair). */
export function sanitizeText(raw: string, max: number): string {
  // trimEnd: clamping can end on the space between two words, which would not be "clean" text.
  return clampText(stripUnsafeText(raw), max).trimEnd();
}
