import { createContext, useContext } from 'react';

export interface NoteColorsContextValue {
  noteFill: Record<string, string>;
  noteStroke: Record<string, string>;
  setNoteColor: (note: string, fillHex: string) => void;
  resetToDefaults: () => void;
}

export const NoteColorsContext = createContext<NoteColorsContextValue | null>(null);

export function useNoteColors(): NoteColorsContextValue {
  const ctx = useContext(NoteColorsContext);
  if (!ctx) throw new Error('useNoteColors must be used inside NoteColorsProvider');
  return ctx;
}
