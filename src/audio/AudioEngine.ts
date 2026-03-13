import type { ChordInstrumentType, ChordPattern, Measure, Pattern } from '../types';
import { INSTRUMENT_IDS } from '../constants';
import { getTotalBeats } from '../state';
import { drumSynths } from './drumSynths';
import { playChordSynth } from './chordSynths';

const SCHEDULE_AHEAD_TIME = 0.1; // seconds
const SCHEDULER_INTERVAL = 25; // ms

export type BeatCallback = (beat: number, time: number) => void;
export type StopCallback = () => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private chordBusGain: GainNode | null = null;
  private chordVolumeGain: GainNode | null = null;
  private prevChordGain: GainNode | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private currentBeat = 0;
  private nextBeatTime = 0;
  private isRunning = false;
  private pattern: Pattern | null = null;
  private measures: Measure[] = [];
  private bpm = 120;
  private loopCount = 0;
  private currentLoop = 0;
  private onBeat: BeatCallback | null = null;
  private onStop: StopCallback | null = null;
  private humanize = 0; // 0–100
  private volume = 1;   // 0–1
  private chordVolume = 0.8; // 0–1
  private chordPattern: ChordPattern = [];
  private chordInstrument: ChordInstrumentType = 'guitar';

  getAudioContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.chordVolumeGain = this.ctx.createGain();
      this.chordVolumeGain.gain.value = this.chordVolume;
      this.chordVolumeGain.connect(this.ctx.destination);

      this.chordBusGain = this.ctx.createGain();
      this.chordBusGain.gain.value = 1;
      this.chordBusGain.connect(this.chordVolumeGain);
    }
    return this.ctx;
  }

  getCurrentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  getNextBeatTime(): number {
    return this.nextBeatTime;
  }

  getCurrentBeat(): number {
    return this.currentBeat;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  setOnBeat(cb: BeatCallback) {
    this.onBeat = cb;
  }

  setOnStop(cb: StopCallback) {
    this.onStop = cb;
  }

  setHumanize(pct: number) {
    this.humanize = pct;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  setChordVolume(v: number) {
    this.chordVolume = v;
    if (this.chordVolumeGain) this.chordVolumeGain.gain.value = v;
  }

  updateConfig(
    pattern: Pattern,
    measures: Measure[],
    bpm: number,
    loopCount: number,
    chordPattern: ChordPattern,
    chordInstrument: ChordInstrumentType,
  ) {
    this.pattern = pattern;
    this.measures = measures;
    this.bpm = bpm;
    this.loopCount = loopCount;
    this.chordPattern = chordPattern;
    this.chordInstrument = chordInstrument;
  }

  private getBeatDuration(beatIndex: number): number {
    let offset = 0;
    for (const measure of this.measures) {
      const stepsPerBeat = measure.timeSignature.stepsPerBeat ?? 1;
      const mSteps = measure.timeSignature.beats * stepsPerBeat;
      if (beatIndex < offset + mSteps) {
        const subdivision = measure.timeSignature.subdivision;
        return (60 / this.bpm) * (4 / subdivision) / stepsPerBeat;
      }
      offset += mSteps;
    }
    // Fallback
    return 60 / this.bpm;
  }

  private scheduleBeat() {
    if (!this.pattern || !this.ctx) return;

    const totalBeats = getTotalBeats(this.measures);
    if (totalBeats === 0) return;

    const dest = this.masterGain ?? this.ctx.destination;

    for (const id of INSTRUMENT_IDS) {
      if (this.pattern[id][this.currentBeat]) {
        if (this.humanize > 0) {
          const h = this.humanize / 100;
          const jitter = (Math.random() - 0.5) * 0.030 * h; // up to ±15ms
          const vel = 1 - 0.40 * h * Math.random();          // down to 60% at 100%
          const pitch = 1 + (Math.random() - 0.5) * 0.10 * h; // up to ±5% at 100%
          drumSynths[id](this.ctx, dest, this.nextBeatTime + jitter, vel, pitch);
        } else {
          drumSynths[id](this.ctx, dest, this.nextBeatTime);
        }
      }
    }

    const chord = this.chordPattern[this.currentBeat];
    if (chord && this.ctx && this.chordBusGain) {
      // Fade out the previous chord's gain node so its oscillators stop
      if (this.prevChordGain) {
        const fadeS = chord.fadeDuration / 1000;
        const prev = this.prevChordGain;
        if (fadeS > 0) {
          const fadeStart = Math.max(this.ctx.currentTime, this.nextBeatTime - fadeS);
          prev.gain.setValueAtTime(prev.gain.value, fadeStart);
          if (chord.fadeCurve === 'exponential') {
            prev.gain.exponentialRampToValueAtTime(0.001, this.nextBeatTime);
          } else {
            prev.gain.linearRampToValueAtTime(0, this.nextBeatTime);
          }
        } else {
          prev.gain.setValueAtTime(0, this.nextBeatTime);
        }
        // Disconnect after oscillators have finished
        setTimeout(() => prev.disconnect(), 4000);
      }

      // Route new chord through a fresh gain node
      const chordGain = this.ctx.createGain();
      chordGain.gain.value = 1;
      chordGain.connect(this.chordBusGain);
      playChordSynth(this.ctx, chordGain, chord, this.chordInstrument, this.nextBeatTime);
      this.prevChordGain = chordGain;
    }

    this.onBeat?.(this.currentBeat, this.nextBeatTime);

    const duration = this.getBeatDuration(this.currentBeat);
    this.nextBeatTime += duration;
    this.currentBeat++;

    if (this.currentBeat >= totalBeats) {
      this.currentBeat = 0;
      this.currentLoop++;

      if (this.loopCount > 0 && this.currentLoop >= this.loopCount) {
        // Schedule stop after last beat finishes
        const stopTime = (this.nextBeatTime - this.ctx.currentTime) * 1000;
        setTimeout(() => {
          this.stop();
          this.onStop?.();
        }, stopTime);
      }
    }
  }

  private scheduler() {
    const ctx = this.ctx;
    if (!ctx) return;

    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      this.scheduleBeat();
      if (!this.isRunning) break;
    }
  }

  start(
    pattern: Pattern,
    measures: Measure[],
    bpm: number,
    loopCount: number,
    chordPattern: ChordPattern,
    chordInstrument: ChordInstrumentType,
    startBeat = 0,
  ) {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    this.pattern = pattern;
    this.measures = measures;
    this.bpm = bpm;
    this.loopCount = loopCount;
    this.chordPattern = chordPattern;
    this.chordInstrument = chordInstrument;
    this.currentBeat = startBeat;
    this.currentLoop = 0;
    this.prevChordGain = null;
    this.isRunning = true;
    this.nextBeatTime = ctx.currentTime;

    this.schedulerTimer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL);
  }

  stop() {
    this.isRunning = false;
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.currentBeat = 0;
    this.currentLoop = 0;
    if (this.prevChordGain) {
      this.prevChordGain.gain.setValueAtTime(0, this.ctx?.currentTime ?? 0);
      this.prevChordGain = null;
    }
  }

  pause() {
    this.isRunning = false;
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  resume(
    pattern: Pattern,
    measures: Measure[],
    bpm: number,
    loopCount: number,
    chordPattern: ChordPattern,
    chordInstrument: ChordInstrumentType,
  ) {
    if (this.isRunning) return;

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    this.pattern = pattern;
    this.measures = measures;
    this.bpm = bpm;
    this.loopCount = loopCount;
    this.chordPattern = chordPattern;
    this.chordInstrument = chordInstrument;
    this.isRunning = true;
    this.nextBeatTime = ctx.currentTime;

    this.schedulerTimer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL);
  }

  previewDrum(instrumentId: string) {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const dest = this.masterGain ?? ctx.destination;
    drumSynths[instrumentId]?.(ctx, dest, ctx.currentTime);
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
