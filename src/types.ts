export type InstrumentId =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'openhat'
  | 'clap'
  | 'rim'
  | 'tom';

export interface TimeSignature {
  beats: number;
  subdivision: number;
  stepsPerBeat?: number; // 1=straight (default), 2=half beats, 3=triplets, 4=quarter beats
}

export interface Measure {
  timeSignature: TimeSignature;
}

export type Pattern = Record<InstrumentId, boolean[]>;

export interface LoopConfig {
  measures: Measure[];
  bpm: number;
  loopCount: number; // 0 = infinite
  humanize: number;  // 0–100
  volume: number;    // 0–100
}

export interface AppState {
  config: LoopConfig;
  pattern: Pattern;
  isPlaying: boolean;
  currentBeat: number;
  currentLoop: number;
}
