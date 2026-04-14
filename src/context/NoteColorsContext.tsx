import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { DEFAULT_NOTE_FILL, lightenHex } from '../data/noteColors';
import { loadNoteColors, saveNoteColors } from '../api/noteColorsApi';
import { NoteColorsContext } from './noteColorsContextDef';

export function NoteColorsProvider({ children }: { children: ReactNode }) {
  const [noteFill, setNoteFill] = useState<Record<string, string>>(DEFAULT_NOTE_FILL);
  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadNoteColors().then(colors => {
      if (colors) setNoteFill(colors);
    });
  }, [authStatus]);

  const noteStroke = useMemo(
    () => Object.fromEntries(Object.entries(noteFill).map(([n, hex]) => [n, lightenHex(hex)])),
    [noteFill],
  );

  const scheduleSave = useCallback((fill: Record<string, string>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void saveNoteColors(fill); }, 500);
  }, []);

  const setNoteColor = useCallback((note: string, fillHex: string) => {
    setNoteFill(prev => {
      const next = { ...prev, [note]: fillHex };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const resetToDefaults = useCallback(() => {
    setNoteFill(DEFAULT_NOTE_FILL);
    void saveNoteColors(DEFAULT_NOTE_FILL);
  }, []);

  const value = useMemo(
    () => ({ noteFill, noteStroke, setNoteColor, resetToDefaults }),
    [noteFill, noteStroke, setNoteColor, resetToDefaults],
  );

  return <NoteColorsContext.Provider value={value}>{children}</NoteColorsContext.Provider>;
}
