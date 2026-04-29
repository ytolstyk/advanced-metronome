import { playTabNote } from './tabGuitarSynths'
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
  private onBeat: ((mi: number, bi: number, intendedTime: number) => void) | null = null
  private onStop: (() => void) | null = null
  private prevNoteKill: (GainNode | null)[] = []
  private prevLetRing: boolean[] = []

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  start(
    track: TabTrack,
    fromMeasure: number,
    fromBeat: number,
    onBeat: (mi: number, bi: number, intendedTime: number) => void,
    onStop: () => void,
  ): void {
    this.stop()
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') ctx.resume().catch(err => console.warn('AudioContext resume failed:', err))

    this.track = track
    this.measureIndex = fromMeasure
    this.beatIndex = fromBeat
    this.onBeat = onBeat
    this.onStop = onStop
    this.nextBeatTime = ctx.currentTime + 0.05
    this.isRunning = true
    this.isPaused = false
    const n = track.stringCount
    this.prevNoteKill = Array(n).fill(null) as null[]
    this.prevLetRing = Array(n).fill(false) as boolean[]

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
    if (ctx.state === 'suspended') ctx.resume().catch(err => console.warn('AudioContext resume failed:', err))
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
    this.prevNoteKill = []
    this.prevLetRing = []
  }

  updateTrack(track: TabTrack): void {
    this.track = track
    if (track.stringCount !== this.prevNoteKill.length) {
      const n = track.stringCount
      this.prevNoteKill = Array(n).fill(null) as null[]
      this.prevLetRing = Array(n).fill(false) as boolean[]
    }
  }

  private findNextFreqOnString(measureIndex: number, beatIndex: number, stringIndex: number, openMidi: number): number | null {
    const track = this.track
    if (!track) return null
    let mi = measureIndex
    let bi = beatIndex + 1
    while (mi < track.measures.length) {
      const measure = track.measures[mi]
      if (!measure) break
      while (bi < measure.beats.length) {
        const note = measure.beats[bi]?.notes[stringIndex]
        if (note && note.fret >= 0) return fretToFreq(openMidi, note.fret)
        bi++
      }
      mi++
      bi = 0
    }
    return null
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
    const dur = beatDurationSeconds(beat.duration, beat.dot, bpm)

    // Schedule notes for all strings
    for (let s = 0; s < beat.notes.length; s++) {
      const note = beat.notes[s]
      const openMidi = track.openMidi[s]
      if (note.fret < 0 || openMidi === undefined) continue

      if (this.prevNoteKill[s] && !this.prevLetRing[s]) {
        const kg = this.prevNoteKill[s]!
        kg.gain.cancelAndHoldAtTime(t)
        kg.gain.linearRampToValueAtTime(0, t + 0.005)
      }

      const freq = fretToFreq(openMidi, note.fret)
      const nextFreq = note.modifiers.legatoSlide
        ? this.findNextFreqOnString(this.measureIndex, this.beatIndex, s, openMidi)
        : null
      const killNode = playTabNote({
        ctx,
        freq,
        fret: note.fret,
        openMidi,
        modifiers: note.modifiers,
        bendAmount: (note.bendAmount ?? 1) * 2,
        startTime: t,
        beatDuration: dur,
        nextFreq,
        vol: 0.65,
      })

      this.prevNoteKill[s] = killNode
      this.prevLetRing[s] = note.modifiers.letRing === true
    }

    // Fire onBeat callback at the right time
    const mi = this.measureIndex
    const bi = this.beatIndex
    const delay = (t - ctx.currentTime) * 1000
    const intendedTime = performance.now() + Math.max(0, delay)
    setTimeout(() => this.onBeat?.(mi, bi, intendedTime), Math.max(0, delay))

    // Advance
    this.nextBeatTime += dur
    this.beatIndex++
    if (this.beatIndex >= measure.beats.length) {
      this.beatIndex = 0
      this.measureIndex++
    }
  }
}
