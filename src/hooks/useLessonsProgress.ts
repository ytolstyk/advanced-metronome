import { useContext } from 'react';
import { LessonsProgressContext } from '@/context/lessonsContextDef';

export function useLessonsProgress() {
  const ctx = useContext(LessonsProgressContext);
  if (!ctx) throw new Error('useLessonsProgress must be used within LessonsProgressProvider');
  return ctx;
}
