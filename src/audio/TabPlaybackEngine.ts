import { pluckString } from './pluckString'
import type { TabTrack } from '../tabEditorTypes'
import { beatDurationSeconds, fretToFreq, effectiveBpmAt } from '../tabEditorState'

const SCHEDULE_AHEAD_TIME = 0.1
const SCHEDULER_INTERVAL = 25

export class TabPlaybackEngine {
  private ctx: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private track: TabTrack | null = null
  private measureIndex = 0
  private beatIndex = 0
  private nextBeatTime = 0
  private isRunning = false
  private isPaused = false
  private onBeat: ((mi: number, bi: number) => void) | null = null
  private onStop: (() => void) | null = null

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  start(
    track: TabTrack,
    fromMeasure: number,
    fromBeat: number,
    onBeat: (mi: number, bi: number) => void,
    onStop: () => void,
  ): void {
    this.stop()
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') void ctx.resume()

    this.track = track
    this.measureIndex = fromMeasure
    this.beatIndex = fromBeat
    this.onBeat = onBeat
    this.onStop = onStop
    this.nextBeatTime = ctx.currentTime + 0.05
    this.isRunning = true
    this.isPaused = false

    this.timer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL)
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return
    this.isPaused = true
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) return
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') void ctx.resume()
    this.nextBeatTime = ctx.currentTime + 0.05
    this.isPaused = false
    this.timer = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.isRunning = false
    this.isPaused = false
  }

  updateTrack(track: TabTrack): void {
    this.track = track
  }

  private scheduler(): void {
    const ctx = this.ctx!
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      if (!this.isRunning || !this.track) break
      this.scheduleNext()
    }
  }

  private scheduleNext(): void {
    if (!this.track || !this.ctx) return
    const ctx = this.ctx
    const track = this.track

    // Check if we've reached the end
    if (this.measureIndex >= track.measures.length) {
      const delay = (this.nextBeatTime - ctx.currentTime) * 1000
      setTimeout(() => {
        this.stop()
        this.onStop?.()
      }, Math.max(0, delay))
      this.isRunning = false
      return
    }

    const measure = track.measures[this.measureIndex]
    if (!measure || this.beatIndex >= measure.beats.length) {
      this.measureIndex++
      this.beatIndex = 0
      return
    }

    const beat = measure.beats[this.beatIndex]
    const t = this.nextBeatTime
    const bpm = beat.tempoChange ?? effectiveBpmAt(track, this.measureIndex)

    // Schedule notes for all strings
    for (let s = 0; s < beat.notes.length; s++) {
      const note = beat.notes[s]
      if (note.fret >= 0 && track.openMidi[s] !== undefined) {
        const freq = fretToFreq(track.openMidi[s], note.fret)
        pluckString(ctx, freq, t, 0.65)
      }
    }

    // Fire onBeat callback at the right time
    const mi = this.measureIndex
    const bi = this.beatIndex
    const delay = (t - ctx.currentTime) * 1000
    setTimeout(() => this.onBeat?.(mi, bi), Math.max(0, delay))

    // Advance
    const dur = beatDurationSeconds(beat.duration, beat.dot, bpm)
    this.nextBeatTime += dur
    this.beatIndex++
    if (this.beatIndex >= measure.beats.length) {
      this.beatIndex = 0
      this.measureIndex++
    }
  }
}
