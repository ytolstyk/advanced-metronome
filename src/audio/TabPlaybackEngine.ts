import { playTabNote } from './tabGuitarSynths'
import type { Beat, TabTrack } from '../tabEditorTypes'
import { beatDurationSeconds, fretToFreq, effectiveBpmAt, computeFillRests, measureCapacityTicks, measureUsedTicks, DURATION_TICKS } from '../tabEditorState'

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
  private prevNoteKill: Map<number, GainNode | null> = new Map()
  private prevLetRing: Map<number, boolean> = new Map()
  private prevBeat: Beat | null = null

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
    this.prevNoteKill = new Map()
    this.prevLetRing = new Map()
    this.prevBeat = null

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
    this.prevNoteKill = new Map()
    this.prevLetRing = new Map()
    this.prevBeat = null
  }

  updateTrack(track: TabTrack): void {
    this.track = track
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
        const note = measure.beats[bi]?.notes.find(n => n.string === stringIndex)
        if (note) return fretToFreq(openMidi, note.fret)
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
    if (!measure) { this.measureIndex++; this.beatIndex = 0; return }

    if (this.beatIndex >= measure.beats.length) {
      const timeSig = track.masterBars[this.measureIndex]?.timeSignature ?? track.masterBars[0]!.timeSignature
      const remainingTicks = measureCapacityTicks(timeSig) - measureUsedTicks(measure.beats)
      const fillRests = remainingTicks > 0 ? computeFillRests(remainingTicks) : []
      const fillIdx = this.beatIndex - measure.beats.length

      if (fillIdx < fillRests.length) {
        const restDuration = fillRests[fillIdx]!
        const t = this.nextBeatTime
        const bpm = effectiveBpmAt(track, this.measureIndex)
        const dur = (DURATION_TICKS[restDuration] / 240) * (60 / bpm)

        const mi = this.measureIndex
        const bi = this.beatIndex
        const delay = (t - ctx.currentTime) * 1000
        const intendedTime = performance.now() + Math.max(0, delay)
        setTimeout(() => this.onBeat?.(mi, bi, intendedTime), Math.max(0, delay))

        this.nextBeatTime += dur
        this.beatIndex++
      } else {
        this.measureIndex++
        this.beatIndex = 0
      }
      return
    }

    const beat = measure.beats[this.beatIndex]
    const t = this.nextBeatTime
    const bpm = beat.tempoChange ?? effectiveBpmAt(track, this.measureIndex)
    const dur = beatDurationSeconds(beat.duration, beat.dot, bpm)

    if (beat.tremoloMarks !== undefined) {
      // Tremolo: marks mirrors alphatab's TremoloPickingEffect.marks — plays 2^marks picks per beat.
      // Interval = undotted beat duration / 2^marks, matching alphatab exactly.
      const noDot = { dotted: false, doubleDotted: false, triplet: false }
      const count = 1 << beat.tremoloMarks
      const interval = beatDurationSeconds(beat.duration, noDot, bpm) / count

      for (let i = 0; i < count; i++) {
        const pickTime = t + i * interval
        for (const note of beat.notes) {
          const s = note.string
          const openMidi = track.openMidi[s - 1]
          if (openMidi === undefined) continue

          if (i === 0) {
            const prevKill = this.prevNoteKill.get(s)
            if (prevKill && !this.prevLetRing.get(s)) {
              prevKill.gain.cancelAndHoldAtTime(pickTime)
              prevKill.gain.linearRampToValueAtTime(0, pickTime + 0.005)
            }
          }

          const freq = fretToFreq(openMidi, note.fret)
          const pickMods = { ...note.modifiers }
          delete pickMods.letRing
          delete pickMods.vibrato
          delete pickMods.trill
          delete pickMods.bend
          delete pickMods.hammerOn
          delete pickMods.pullOff
          delete pickMods.legatoSlide
          delete pickMods.slideInBelow
          delete pickMods.slideInAbove
          delete pickMods.slideOutDown
          delete pickMods.slideOutUp
          const killNode = playTabNote({
            ctx,
            freq,
            fret: note.fret,
            openMidi,
            modifiers: pickMods,
            startTime: pickTime,
            beatDuration: interval,
            nextFreq: null,
            vol: 0.65,
          })

          if (i < count - 1) {
            const nextPickTime = t + (i + 1) * interval
            killNode.gain.cancelAndHoldAtTime(nextPickTime)
            killNode.gain.linearRampToValueAtTime(0, nextPickTime + 0.005)
          } else {
            this.prevNoteKill.set(s, killNode)
            this.prevLetRing.set(s, false)
          }
        }
      }
    } else {
      // Determine which strings are tied into this beat (should not be re-plucked).
      // A string is tied if this beat is a measure-overflow tie (tiedFrom) or
      // if the immediately preceding beat had tiedToNext and had a note on that string.
      const prevBeatTiedToNext = this.prevBeat?.tiedToNext === true
      const prevBeatStrings = prevBeatTiedToNext
        ? new Set(this.prevBeat!.notes.map((n) => n.string))
        : null

      // Schedule notes for all strings
      for (const note of beat.notes) {
        const s = note.string  // 1-based
        const openMidi = track.openMidi[s - 1]  // low→high array; string 1=lowest → index 0
        if (openMidi === undefined) continue

        // Tied destination: let the origin note ring through without re-plucking
        const isTiedDest = beat.tiedFrom === true || (prevBeatStrings?.has(s) ?? false)
        if (isTiedDest) continue

        const prevKill = this.prevNoteKill.get(s)
        if (prevKill && !this.prevLetRing.get(s)) {
          prevKill.gain.cancelAndHoldAtTime(t)
          prevKill.gain.linearRampToValueAtTime(0, t + 0.005)
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
          bendData: note.bendData,
          startTime: t,
          beatDuration: dur,
          nextFreq,
          vol: 0.65,
          trillFret: note.trillFret,
          trillSpeed: note.trillSpeed,
        })

        this.prevNoteKill.set(s, killNode)
        this.prevLetRing.set(s, note.modifiers.letRing === true)
      }
    }

    this.prevBeat = beat

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
