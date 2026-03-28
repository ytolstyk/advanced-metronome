import type { LessonModule, Lesson } from './types';
import { tappingModule } from './technique/tapping';
import { sweepPickingModule } from './technique/sweep-picking';
import { fingerPickingModule } from './technique/finger-picking';
import { pullOffsHammerOnsModule } from './technique/pull-offs-hammer-ons';
import { alternatePickingModule } from './technique/alternate-picking';
import { hybridPickingModule } from './technique/hybrid-picking';
import { chordsTheoryModule } from './theory/chords-theory';
import { readingTablatureModule } from './theory/reading-tablature';

export const TECHNIQUE_MODULES: LessonModule[] = [
  alternatePickingModule,
  pullOffsHammerOnsModule,
  fingerPickingModule,
  hybridPickingModule,
  tappingModule,
  sweepPickingModule,
];

export const THEORY_MODULES: LessonModule[] = [
  readingTablatureModule,
  chordsTheoryModule,
];

export const ALL_MODULES: LessonModule[] = [...TECHNIQUE_MODULES, ...THEORY_MODULES];

export function getModule(moduleId: string): LessonModule | undefined {
  return ALL_MODULES.find(m => m.id === moduleId);
}

export function getLesson(moduleId: string, lessonId: string): Lesson | undefined {
  return getModule(moduleId)?.lessons.find(l => l.id === lessonId);
}

export function getNextLesson(moduleId: string, lessonId: string): { moduleId: string; lessonId: string } | null {
  const mod = getModule(moduleId);
  if (!mod) return null;
  const idx = mod.lessons.findIndex(l => l.id === lessonId);
  if (idx < 0 || idx >= mod.lessons.length - 1) return null;
  return { moduleId, lessonId: mod.lessons[idx + 1].id };
}

export type { LessonModule, Lesson, LessonExample, FretHighlight, TabLine, Difficulty, ModuleType, PracticeNotes } from './types';
