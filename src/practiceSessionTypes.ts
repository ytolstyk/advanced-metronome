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
