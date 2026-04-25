import type { NoteModifiers } from '../tabEditorTypes'
import { fretToFreq } from '../tabEditorState'

export interface PlayTabNoteOptions {
  ctx: AudioContext
  freq: number
  fret: number
  openMidi: number
  modifiers: NoteModifiers
  bendAmount: number      // in semitones (pre-converted from note.bendAmount * 2)
  startTime: number
  beatDuration: number
  nextFreq: number | null // destination for legatoSlide (next note on same string)
  vol: number
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
  const { ctx, freq, fret, openMidi, modifiers, bendAmount, startTime, beatDuration, nextFreq, vol } = opts
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

  if (modifiers.naturalHarmonic) {
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
  const oscs = spawnHarmonics(ctx, env, freq, startTime, oscStop, 6, h => 0.5 / (h * h))

  if (modifiers.bend) {
    const targetFreq = freq * Math.pow(2, bendAmount / 12)
    const bendEndTime = startTime + Math.min(beatDuration * 0.6, 0.4)
    oscs.forEach((osc, idx) => {
      const h = idx + 1
      osc.frequency.setValueAtTime(freq * h, startTime)
      osc.frequency.exponentialRampToValueAtTime(targetFreq * h, bendEndTime)
    })
  }

  if (modifiers.vibrato) {
    attachVibrato(ctx, oscs, freq, startTime, oscStop)
  }

  return env
}
