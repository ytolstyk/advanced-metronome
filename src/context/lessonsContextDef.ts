import { createContext } from 'react';

export interface LessonsProgressContextValue {
  progress: Map<string, 'active' | 'completed'>;
  favorites: Set<string>;
  markViewed: (lessonId: string, moduleId: string) => void;
  markComplete: (lessonId: string, moduleId: string) => void;
  toggleFavorite: (lessonId: string, moduleId: string) => void;
  isFavorite: (lessonId: string) => boolean;
  isComplete: (lessonId: string) => boolean;
  isActive: (lessonId: string) => boolean;
  getModuleProgress: (moduleId: string, lessons: { id: string }[]) => { completed: number; total: number };
}

export const LessonsProgressContext = createContext<LessonsProgressContextValue | null>(null);
