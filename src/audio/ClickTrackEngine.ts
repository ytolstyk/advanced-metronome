import { accentClick, beatClick, subClick, countdownClick } from './clickSynth';

export type SubdivisionLabel =
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | 'sixteenth'
  | 'quarter-triplet' | 'eighth-triplet';

export interface TimeSignature { numerator: number; denominator: number }

export interface TrackPiece {
  id: string;
  label: string;
  color: string;
  groupId: string | null;
  timeSignature: TimeSignature;
  subdivision: SubdivisionLabel;
  bpm: number;
  repeats: number;
}

const SCHEDULE_AHEAD_TIME = 0.1;
const SCHEDULER_INTERVAL = 25;

// How many sub-clicks per beat (quarter note) for each subdivision label
function subsPerBeat(sub: SubdivisionLabel, numerator: number): number {
  switch (sub) {
    case 'whole': return 1 / numerator;   // one click per measure
    case 'half': return 0.5;
    case 'quarter': return 1;
    case 'eighth': return 2;
    case 'sixteenth': return 4;
    case 'quarter-triplet': return 3;
    case 'eighth-triplet': return 6;
  }
}

export class ClickTrackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  // Playback cursor
  private pieces: TrackPiece[] = [];
  private startPieceIndex = 0;
  private speedMultiplier = 1;
  // Cursor within sequence
  private countdownStep = 0;   // 3..1 when in countdown, 0 when done
  private pieceIndex = 0;
  private repetition = 0;
  private subIndex = 0;        // 0-based sub index within current beat

  private nextBeatTime = 0;
  private isRunning = false;
  private isPaused = false;

  private onProgress: ((pieceIndex: number, repetition: number) => void) | null = null;
  private onCountdown: ((n: number) => void) | null = null;
  private onStop: (() => void) | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  start(
    pieces: TrackPiece[],
    startPieceIndex: number,
    speedMultiplier: number,
    countdown: boolean,
    onProgress: (pieceIndex: number, repetition: number) => void,
    onCountdownFn: (n: number) => void,
    onStop: () => void,
  ): void {
    this.stop();
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    this.pieces = pieces;
    this.startPieceIndex = startPieceIndex;
    this.speedMultiplier = speedMultiplier;
    this.onProgress = onProgress;
    this.onCountdown = onCountdownFn;
    this.onStop = onStop;

    this.pieceIndex = startPieceIndex;
    this.repetition = 0;
    this.subIndex = 0;
    this.countdownStep = countdown ? 3 : 0;
    this.nextBeatTime = ctx.currentTime + 0.05;
    this.isRunning = true;
    this.isPaused = false;

    this.timer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL);
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') { void ctx.resume(); }
    // Re-anchor nextBeatTime to now (skip the gap)
    this.nextBeatTime = ctx.currentTime + 0.05;
    this.isPaused = false;
    this.timer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL);
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.isRunning = false;
    this.isPaused = false;
  }

  updateSpeed(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  private countdownBeatDuration(): number {
    // Use first piece BPM for countdown tempo, or 120 fallback
    const piece = this.pieces[this.startPieceIndex] ?? this.pieces[0];
    const bpm = piece?.bpm ?? 120;
    return 60 / (bpm * this.speedMultiplier);
  }

  private getBeatDuration(piece: TrackPiece): number {
    return (60 / (piece.bpm * this.speedMultiplier)) * (4 / piece.timeSignature.denominator);
  }

  private getSubDuration(piece: TrackPiece): number {
    const subs = subsPerBeat(piece.subdivision, piece.timeSignature.numerator);
    if (subs <= 0) return this.getBeatDuration(piece) * piece.timeSignature.numerator;
    return this.getBeatDuration(piece) / subs;
  }

  private scheduler(): void {
    const ctx = this.ctx!;
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      if (!this.isRunning) break;
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const t = this.nextBeatTime;

    // ── Countdown phase ──
    if (this.countdownStep > 0) {
      countdownClick(ctx, dest, t);
      const n = this.countdownStep;
      const delay = (t - ctx.currentTime) * 1000;
      setTimeout(() => { this.onCountdown?.(n); }, Math.max(0, delay));
      this.countdownStep--;
      this.nextBeatTime += this.countdownBeatDuration();
      return;
    }

    // ── Check if done ──
    if (this.pieceIndex >= this.pieces.length) {
      const delay = (t - ctx.currentTime) * 1000;
      setTimeout(() => { this.stop(); this.onStop?.(); }, Math.max(0, delay));
      this.isRunning = false;
      return;
    }

    const piece = this.pieces[this.pieceIndex];
    const { numerator } = piece.timeSignature;
    const subs = subsPerBeat(piece.subdivision, numerator);

    // Determine how many sub-ticks exist in one full measure
    // For 'whole': one click per measure (subs = 1/numerator means 1 beat / numerator beats = 1 per measure)
    // We'll work in sub-ticks per measure
    let subTicksPerMeasure: number;
    if (piece.subdivision === 'whole') {
      subTicksPerMeasure = 1;
    } else {
      subTicksPerMeasure = Math.round(numerator * subs);
    }

    // Which sub-tick within the measure are we on?
    const subTickInMeasure = this.subIndex;

    // Fire synth
    if (subTickInMeasure === 0) {
      accentClick(ctx, dest, t);
      // Notify on each new measure (beat 0, sub 0)
      const pi = this.pieceIndex;
      const rep = this.repetition;
      const delay = (t - ctx.currentTime) * 1000;
      setTimeout(() => { this.onProgress?.(pi, rep); }, Math.max(0, delay));
    } else if (this.subIndex % Math.max(1, Math.round(subs)) === 0) {
      beatClick(ctx, dest, t);
    } else {
      subClick(ctx, dest, t);
    }

    // Advance sub-tick
    this.subIndex++;
    if (this.subIndex >= subTicksPerMeasure) {
      this.subIndex = 0;
      this.repetition++;
      if (this.repetition >= piece.repeats) {
        this.repetition = 0;
        this.pieceIndex++;
      }
    }

    this.nextBeatTime += this.getSubDuration(piece);
  }
}
