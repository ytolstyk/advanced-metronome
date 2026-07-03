// Barrel re-exports — prefer importing directly from the specific module for new code.
// Kept for backward compatibility with existing callers.
export type { DrumExtractionStatus, DrumExtractionResult } from './drumExtractionApi';
export { extractDrumPattern } from './drumExtractionApi';

export type { ChordDetectionResult } from './chordDetectionApi';
export { detectChordProgression } from './chordDetectionApi';

export type { SuggestedProgression } from './chordSuggestApi';
export { suggestChordProgressions, SUGGESTION_COUNT } from './chordSuggestApi';
