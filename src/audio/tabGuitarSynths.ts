import type { DurationValue, NoteModifiers, WhammyBarData } from '../tabEditorTypes'
import { Duration } from '../tabEditorTypes'
import { fretToFreq } from '../tabEditorState'

export interface PlayTabNoteOptions {
  ctx: AudioContext
  freq: number
  fret: number
  openMidi: number
  modifiers: NoteModifiers
  bendData?: import('../tabEditorTypes').BendData
  whammyBarData?: WhammyBarData
  startTime: number
  beatDuration: number
  nextFreq: number | null // destination for legatoSlide (next note on same string)
  vol: number
  trillFret?: number      // auxiliary trill fret; only used when modifiers.trill is set
  trillSpeed?: DurationValue // trill alternation speed
}

const HARMONIC_MULTIPLIER: Partial<Record<number, number>> = {
  12: 2,
  7: 3, 19: 3,
  5: 4, 24: 4,
  4: 5, 9: 5, 17: 5,
  3: 6, 15: 6, 22: 6,
}

function buildEnvelope(
  ctx: AudioContext,
  startTime: number,
  vol: number,
  attackSec: number,
  totalDuration: number,
): GainNode {
  const env = ctx.createGain()
  env.connect(ctx.destination)
  env.gain.setValueAtTime(0.001, startTime)
  env.gain.linearRampToValueAtTime(vol, startTime + attackSec)
  env.gain.exponentialRampToValueAtTime(0.001, startTime + totalDuration)
  return env
}

function spawnHarmonics(
  ctx: AudioContext,
  dest: AudioNode,
  baseFreq: number,
  oscStart: number,
  oscStop: number,
  count: number,
  gainFn: (h: number) => number,
): OscillatorNode[] {
  const oscs: OscillatorNode[] = []
  for (let h = 1; h <= count; h++) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = baseFreq * h
    const hg = ctx.createGain()
    hg.gain.value = gainFn(h)
    osc.connect(hg)
    hg.connect(dest)
    osc.start(oscStart)
    osc.stop(oscStop)
    oscs.push(osc)
  }
  return oscs
}

function attachVibrato(
  ctx: AudioContext,
  oscs: OscillatorNode[],
  baseFreq: number,
  startTime: number,
  stopTime: number,
): void {
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 6
  oscs.forEach((osc, idx) => {
    const h = idx + 1
    const depth = ctx.createGain()
    depth.gain.value = baseFreq * h * 0.0293
    lfo.connect(depth)
    depth.connect(osc.frequency)
  })
  lfo.start(startTime + 0.05)
  lfo.stop(stopTime)
}

export function playTabNote(opts: PlayTabNoteOptions): GainNode {
  const { ctx, freq, fret, openMidi, modifiers, bendData, whammyBarData, startTime, beatDuration, nextFreq, vol, trillFret, trillSpeed } = opts
  const decayTotal = 2.2
  const oscStop = startTime + 2.5

  if (modifiers.dead) {
    const env = buildEnvelope(ctx, startTime, vol * 0.6, 0.003, 0.07)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 350
    filter.connect(env)
    spawnHarmonics(ctx, filter, freq, startTime, startTime + 0.10, 2, () => 0.4)
    return env
  }

  if (modifiers.palmMute) {
    const env = buildEnvelope(ctx, startTime, vol, 0.008, 0.20)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 800
    filter.Q.value = 3
    filter.connect(env)
    spawnHarmonics(ctx, filter, freq, startTime, startTime + 0.25, 3, h => 0.5 / (h * h))
    return env
  }

  if (modifiers.harmonicType) {
    const mult = HARMONIC_MULTIPLIER[fret] ?? null
    const openFreq = fretToFreq(openMidi, 0)
    const harmonicFreq = mult !== null ? Math.min(openFreq * mult, 18000) : freq
    const env = buildEnvelope(ctx, startTime, vol, 0.012, 3.5)
    const harmonicGains = [1.0, 0.12, 0.04]
    spawnHarmonics(ctx, env, harmonicFreq, startTime, startTime + 3.5, 3, h => harmonicGains[h - 1] ?? 0.01)
    return env
  }

  if (modifiers.staccato) {
    const gateDur = Math.min(beatDuration * 0.35, 0.18)
    const env = buildEnvelope(ctx, startTime, vol, 0.008, 0.008 + gateDur)
    spawnHarmonics(ctx, env, freq, startTime, startTime + gateDur + 0.05, 6, h => 0.5 / (h * h))
    return env
  }

  if (modifiers.legatoSlide && nextFreq !== null) {
    // Slide FROM this note's pitch TO the next note's pitch during this beat
    const slideEnd = startTime + beatDuration * 0.9
    const env = ctx.createGain()
    env.connect(ctx.destination)
    env.gain.setValueAtTime(0.001, startTime)
    env.gain.linearRampToValueAtTime(vol, startTime + 0.008)
    env.gain.setValueAtTime(vol, slideEnd)
    env.gain.linearRampToValueAtTime(0.001, slideEnd + 0.05)
    const oscs = spawnHarmonics(ctx, env, freq, startTime, slideEnd + 0.08, 6, h => 0.5 / (h * h))
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      osc.frequency.setValueAtTime(freq * h, startTime)
      osc.frequency.linearRampToValueAtTime(nextFreq * h, slideEnd)
    })
    return env
  }

  if (modifiers.slideInBelow && fret >= 4) {
    const slideStart = Math.max(startTime - 0.060, ctx.currentTime + 0.002)
    const startFreq = freq * Math.pow(2, -4 / 12)
    const env = buildEnvelope(ctx, slideStart, vol, 0.008, decayTotal)
    const oscs = spawnHarmonics(ctx, env, startFreq, slideStart, oscStop, 6, h => 0.5 / (h * h))
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      osc.frequency.setValueAtTime(startFreq * h, slideStart)
      osc.frequency.linearRampToValueAtTime(freq * h, startTime)
    })
    return env
  }

  if (modifiers.slideInAbove && fret <= 20) {
    const slideStart = Math.max(startTime - 0.060, ctx.currentTime + 0.002)
    const startFreq = freq * Math.pow(2, 4 / 12)
    const env = buildEnvelope(ctx, slideStart, vol, 0.008, decayTotal)
    const oscs = spawnHarmonics(ctx, env, startFreq, slideStart, oscStop, 6, h => 0.5 / (h * h))
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      osc.frequency.setValueAtTime(startFreq * h, slideStart)
      osc.frequency.linearRampToValueAtTime(freq * h, startTime)
    })
    return env
  }

  if (modifiers.slideOutDown || modifiers.slideOutUp) {
    const slideBeginTime = startTime + beatDuration * 0.6
    const slideEndTime = startTime + beatDuration * 0.85
    const semis = modifiers.slideOutDown ? -5 : 5
    const endFreq = freq * Math.pow(2, semis / 12)
    // Sustain at full volume until slide, then fade during the slide so it's audible
    const env = ctx.createGain()
    env.connect(ctx.destination)
    env.gain.setValueAtTime(0.001, startTime)
    env.gain.linearRampToValueAtTime(vol, startTime + 0.008)
    env.gain.setValueAtTime(vol, slideBeginTime)
    env.gain.linearRampToValueAtTime(0.001, slideEndTime)
    const oscs = spawnHarmonics(ctx, env, freq, startTime, slideEndTime + 0.02, 6, h => 0.5 / (h * h))
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      osc.frequency.setValueAtTime(freq * h, slideBeginTime)
      osc.frequency.linearRampToValueAtTime(endFreq * h, slideEndTime)
    })
    return env
  }

  if (modifiers.hammerOn) {
    const env = buildEnvelope(ctx, startTime, vol * 0.75, 0.020, decayTotal)
    spawnHarmonics(ctx, env, freq, startTime, oscStop, 6, h => 0.5 / (h * h))
    return env
  }

  if (modifiers.pullOff) {
    const env = buildEnvelope(ctx, startTime, vol * 0.55, 0.025, decayTotal)
    spawnHarmonics(ctx, env, freq, startTime, oscStop, 6, h => 0.5 / (h * h))
    return env
  }

  const effectiveVol = modifiers.ghost ? vol * 0.25 : vol
  const env = buildEnvelope(ctx, startTime, effectiveVol, 0.008, decayTotal)

  // For trill, spawn harmonics centered between base and trill frequency
  const hasTrill = modifiers.trill && trillFret !== undefined
  const trillFreq = hasTrill ? fretToFreq(openMidi, trillFret!) : null
  const baseOscFreq = hasTrill ? (freq + trillFreq!) / 2 : freq
  const oscs = spawnHarmonics(ctx, env, baseOscFreq, startTime, oscStop, 6, h => 0.5 / (h * h))

  if (hasTrill && trillFreq !== null) {
    // Square LFO jumps sharply between the two pitches
    // At 120BPM: 1/16 → 4Hz, 1/32 → 8Hz
    const lfoRate = trillSpeed === Duration.ThirtySecond ? 8 : 4
    const freqDiff = (trillFreq - freq) / 2
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = lfoRate
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = freqDiff * h
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)
    })
    lfo.start(startTime)
    lfo.stop(oscStop)
  }

  if (modifiers.bend && bendData && bendData.points.length >= 2) {
    const { points, segments } = bendData
    const totalDur = Math.min(beatDuration * 0.8, 1.2)
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      const preMult = Math.pow(2, (points[0]!.value / 4) / 12)
      osc.frequency.cancelScheduledValues(startTime)
      osc.frequency.setValueAtTime(freq * h * preMult, startTime)
      for (let si = 0; si < segments.length; si++) {
        const p1 = points[si]!
        const p2 = points[si + 1]!
        const curve = segments[si]!
        const segStartTime = startTime + (p1.offset / 60) * totalDur
        const segDur = ((p2.offset - p1.offset) / 60) * totalDur - 1e-5
        if (segDur < 0.001) continue
        const startMult = Math.pow(2, (p1.value / 4) / 12)
        const endMult = Math.pow(2, (p2.value / 4) / 12)
        const SAMPLES = 32
        const arr = new Float32Array(SAMPLES)
        for (let i = 0; i < SAMPLES; i++) {
          const t = i / (SAMPLES - 1)
          const shaped = curve === 'up' ? t * t : 1 - (1 - t) * (1 - t)
          arr[i] = freq * h * (startMult + (endMult - startMult) * shaped)
        }
        try {
          osc.frequency.setValueCurveAtTime(arr, segStartTime, segDur)
        } catch {
          // If a curve still overlaps (e.g. floating-point boundary), fall back to a
          // simple linear ramp so the bend is audible without crashing playback.
          osc.frequency.linearRampToValueAtTime(arr[SAMPLES - 1]!, segStartTime + segDur)
        }
      }
    })
  }

  if (whammyBarData && whammyBarData.points.length >= 2 && !modifiers.bend) {
    const pts = whammyBarData.points
    const totalDur = beatDuration * 0.98
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      const initMult = Math.pow(2, (pts[0]!.value / 4) / 12)
      osc.frequency.cancelScheduledValues(startTime)
      osc.frequency.setValueAtTime(freq * h * initMult, startTime)
      for (let i = 1; i < pts.length; i++) {
        const pt = pts[i]!
        const t = startTime + (pt.offset / 60) * totalDur
        const mult = Math.pow(2, (pt.value / 4) / 12)
        osc.frequency.linearRampToValueAtTime(freq * h * mult, t)
      }
    })
  }

  if (modifiers.vibrato) {
    attachVibrato(ctx, oscs, freq, startTime, oscStop)
  }

  return env
}
