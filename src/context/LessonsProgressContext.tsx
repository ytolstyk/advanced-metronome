import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import {
  loadProgress,
  saveProgress,
  loadLessonFavorites,
  addLessonFavorite,
  removeLessonFavorite,
} from '../api/lessonsApi';
import { LessonsProgressContext } from './lessonsContextDef';

export function LessonsProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Map<string, 'active' | 'completed'>>(new Map());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const progressIdMapRef = useRef<Map<string, string>>(new Map());
  const favIdMapRef = useRef<Map<string, string>>(new Map());
  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus]);

  useEffect(() => {
    void loadProgress().then(({ map, idMap }) => {
      setProgress(new Map(map));
      progressIdMapRef.current = idMap;
    });
    void loadLessonFavorites().then(({ set, idMap }) => {
      setFavorites(new Set(set));
      favIdMapRef.current = idMap;
    });
  }, [authStatus]);

  const markViewed = useCallback((lessonId: string, moduleId: string) => {
    setProgress(prev => {
      if (prev.has(lessonId)) return prev;
      const next = new Map(prev);
      next.set(lessonId, 'active');
      void saveProgress(lessonId, moduleId, 'active', progressIdMapRef.current.get(lessonId)).then(id => {
        if (id) progressIdMapRef.current.set(lessonId, id);
      });
      return next;
    });
  }, []);

  const markComplete = useCallback((lessonId: string, moduleId: string) => {
    setProgress(prev => {
      const next = new Map(prev);
      next.set(lessonId, 'completed');
      void saveProgress(lessonId, moduleId, 'completed', progressIdMapRef.current.get(lessonId)).then(id => {
        if (id) progressIdMapRef.current.set(lessonId, id);
      });
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((lessonId: string, moduleId: string) => {
    if (favorites.has(lessonId)) {
      const cloudId = favIdMapRef.current.get(lessonId);
      favIdMapRef.current.delete(lessonId);
      setFavorites(prev => {
        const next = new Set(prev);
        next.delete(lessonId);
        return next;
      });
      void removeLessonFavorite(lessonId, cloudId);
    } else {
      setFavorites(prev => new Set([...prev, lessonId]));
      void addLessonFavorite(lessonId, moduleId).then(id => {
        if (id) favIdMapRef.current.set(lessonId, id);
      });
    }
  }, [favorites]);

  const isFavorite = useCallback((lessonId: string) => favorites.has(lessonId), [favorites]);
  const isComplete = useCallback((lessonId: string) => progress.get(lessonId) === 'completed', [progress]);
  const isActive = useCallback((lessonId: string) => progress.has(lessonId), [progress]);

  const getModuleProgress = useCallback(
    (_moduleId: string, lessons: { id: string }[]) => {
      let completed = 0;
      for (const l of lessons) {
        if (progress.get(l.id) === 'completed') completed++;
      }
      return { completed, total: lessons.length };
    },
    [progress],
  );

  return (
    <LessonsProgressContext.Provider
      value={{
        progress,
        favorites,
        markViewed,
        markComplete,
        toggleFavorite,
        isFavorite,
        isComplete,
        isActive,
        getModuleProgress,
      }}
    >
      {children}
    </LessonsProgressContext.Provider>
  );
}
