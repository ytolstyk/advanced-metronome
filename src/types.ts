import type { RootNote, ChordType } from './data/chords';

export type ChordInstrumentType = 'guitar';

export interface ChordBeat {
  root: RootNote;
  type: ChordType;
  fadeDuration: number; // ms (0–500), how long previous chord fades out when THIS chord starts
  fadeCurve: 'linear' | 'exponential';
}

export type ChordPattern = (ChordBeat | null)[];

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
  chordPattern: ChordPattern;
  chordInstrument: ChordInstrumentType;
  chordVolume: number; // 0–100
  isPlaying: boolean;
  currentBeat: number;
  currentLoop: number;
}
