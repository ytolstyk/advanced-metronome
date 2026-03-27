export type ModuleType = 'technique' | 'theory';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface TabLine {
  string: string;
  steps: (string | null)[];
}

export interface FretHighlight {
  string: number;
  fret: number;
  color?: 'root' | 'accent' | 'default';
}

export interface PracticeStep {
  string: number; // 0=low E, 5=high e
  fret: number;
}

export interface PracticeNotes {
  steps: (PracticeStep | PracticeStep[])[];
  defaultBpm: number;
}

export interface LessonExample {
  name: string;
  tab: TabLine[];
  fretHighlights: FretHighlight[];
  practiceNotes: PracticeNotes;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  difficulty: Difficulty;
  explanation: string;
  practiceRoutine: string;
  tab: TabLine[];
  fretHighlights: FretHighlight[];
  practiceNotes: PracticeNotes;
  order: number;
  examples?: LessonExample[];
}

export interface LessonModule {
  id: string;
  title: string;
  type: ModuleType;
  description: string;
  lessons: Lesson[];
}
