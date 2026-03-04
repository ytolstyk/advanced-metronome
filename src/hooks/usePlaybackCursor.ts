export function usePlaybackCursor(
  currentBeat: number,
  totalBeats: number,
): number {
  if (totalBeats === 0) return 0;
  return currentBeat / totalBeats;
}
