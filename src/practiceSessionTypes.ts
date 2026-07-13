export type ToolId =
  | 'drums'
  | 'tuner'
  | 'chords'
  | 'scales'
  | 'circle'
  | 'click-track'
  | 'fret-memorizer'
  | 'tab-editor'
  | 'ear-training'
  | 'chord-progression'
  | 'caged'
  | 'metronome';

export interface SessionGoal {
  durationMinutes?: number;
  targetBpm?: number;
  skillFocus?: string;
  tools: ToolId[];
  tags?: string[];
}

export interface ActiveSession {
  id: string;
  goal: SessionGoal;
  startedAt: string;
  currentTool: ToolId | null;
  currentToolStartedAt: string | null;
  toolTimes: Partial<Record<ToolId, number>>;
  notes: string;
}

export interface CompletedSession {
  id: string;
  goal: SessionGoal;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  toolTimes: Partial<Record<ToolId, number>>;
  notes: string;
}

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface PlanInput {
  skillLevel: SkillLevel;
  goal: string;
  dailyMinutes: number;
  daysOfWeek: number[]; // 0=Sun … 6=Sat
}

export interface PlanSession {
  durationMin: number;
  targetBpm?: number;
  skillFocus: string;
  tools: ToolId[];
}

export interface PlanWeek {
  sessions: PlanSession[];
}

export interface PracticePlan {
  id: string;
  input: PlanInput;
  weeks: PlanWeek[];
  generatedAt: string;
}
