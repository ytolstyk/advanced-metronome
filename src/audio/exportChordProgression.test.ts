/**
 * Unit tests for exportChordProgression.
 *
 * OfflineAudioContext, chord synths, wavEncoder, URL, and DOM APIs are all
 * mocked so tests run in jsdom without real Web Audio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Stable mock references (must be created before vi.mock() calls) ─────────

const { mockPlayGuitar, mockPlayPiano, mockPlayPad, mockEncodeWav } = vi.hoisted(() => {
  return {
    mockPlayGuitar: vi.fn(),
    mockPlayPiano: vi.fn(),
    mockPlayPad: vi.fn(),
    mockEncodeWav: vi.fn(() => new Blob(['fake-wav'], { type: 'audio/wav' })),
  }
})

vi.mock('./chordSynths', () => ({
  playGuitarChord: mockPlayGuitar,
  playPianoChord: mockPlayPiano,
  playPadChord: mockPlayPad,
}))

vi.mock('./wavEncoder', () => ({
  encodeWav: mockEncodeWav,
}))

// ─── OfflineAudioContext mock ────────────────────────────────────────────────

/**
 * Minimal OfflineAudioContext stand-in. startRendering() resolves with a fake
 * AudioBuffer. The destination is a plain object satisfying AudioNode typing.
 */
class FakeOfflineAudioContext {
  readonly numberOfChannels: number
  readonly length: number
  readonly sampleRate: number
  readonly destination: AudioDestinationNode

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels
    this.length = length
    this.sampleRate = sampleRate
    this.destination = {} as AudioDestinationNode
  }

  startRendering(): Promise<AudioBuffer> {
    const buf = {
      numberOfChannels: this.numberOfChannels,
      length: this.length,
      sampleRate: this.sampleRate,
      getChannelData: vi.fn(() => new Float32Array(this.length)),
    } as unknown as AudioBuffer
    return Promise.resolve(buf)
  }
}

// ─── DOM/URL mocks ───────────────────────────────────────────────────────────

let fakeObjectUrl: string
let anchorClickSpy: ReturnType<typeof vi.fn>
let anchorElement: { href: string; download: string; style: { display: string }; click: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.clearAllMocks()

  fakeObjectUrl = 'blob:fake-url-' + Math.random()

  // Mock URL.createObjectURL / revokeObjectURL
  vi.spyOn(URL, 'createObjectURL').mockReturnValue(fakeObjectUrl)
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)

  // Mock document.createElement so we capture anchor click
  anchorElement = { href: '', download: '', click: vi.fn(), style: { display: '' } }
  anchorClickSpy = anchorElement.click
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return anchorElement as unknown as HTMLElement
    // For any other tag fall through to a real element (unlikely in these tests)
    return document.createElement.call(document, tag)
  })
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
  vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

  // Replace global OfflineAudioContext
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
})

import { exportChordProgression } from './exportChordProgression'
import type { RootNote, ChordType } from '../data/chords'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlot(root: RootNote, type: ChordType, beats: number) {
  return { root, type, beats }
}

const BASIC_SLOTS = [
  makeSlot('C', 'major', 4),
  makeSlot('A', 'minor', 4),
  makeSlot('F', 'major', 4),
  makeSlot('G', 'major', 4),
]

// ─── Empty slots (early-exit path) ───────────────────────────────────────────

describe('exportChordProgression – empty slots', () => {
  it('returns without creating an OfflineAudioContext when slots is empty', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctxSpy = vi.spyOn(globalThis as any, 'OfflineAudioContext')
    await exportChordProgression([], 120, 'guitar')
    expect(ctxSpy).not.toHaveBeenCalled()
  })

  it('does not trigger a download when slots is empty', async () => {
    await exportChordProgression([], 120, 'guitar')
    expect(anchorClickSpy).not.toHaveBeenCalled()
  })

  it('does not call any synth when slots is empty', async () => {
    await exportChordProgression([], 120, 'guitar')
    expect(mockPlayGuitar).not.toHaveBeenCalled()
    expect(mockPlayPiano).not.toHaveBeenCalled()
    expect(mockPlayPad).not.toHaveBeenCalled()
  })
})

// ─── Instrument routing ──────────────────────────────────────────────────────

describe('exportChordProgression – instrument routing', () => {
  it('calls playGuitarChord for each slot when instrument is "guitar"', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'guitar')
    expect(mockPlayGuitar).toHaveBeenCalledTimes(BASIC_SLOTS.length)
    expect(mockPlayPiano).not.toHaveBeenCalled()
    expect(mockPlayPad).not.toHaveBeenCalled()
  })

  it('calls playPianoChord for each slot when instrument is "piano"', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'piano')
    expect(mockPlayPiano).toHaveBeenCalledTimes(BASIC_SLOTS.length)
    expect(mockPlayGuitar).not.toHaveBeenCalled()
    expect(mockPlayPad).not.toHaveBeenCalled()
  })

  it('calls playPadChord for each slot when instrument is "pad"', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'pad')
    expect(mockPlayPad).toHaveBeenCalledTimes(BASIC_SLOTS.length)
    expect(mockPlayGuitar).not.toHaveBeenCalled()
    expect(mockPlayPiano).not.toHaveBeenCalled()
  })
})

// ─── Timing / event scheduling ───────────────────────────────────────────────

describe('exportChordProgression – timing', () => {
  it('schedules the first chord at time 0', async () => {
    await exportChordProgression([makeSlot('C', 'major', 4)], 120, 'guitar')
    const [, , , , scheduledTime] = mockPlayGuitar.mock.calls[0] as unknown[]
    expect(scheduledTime).toBe(0)
  })

  it('schedules subsequent chords at cumulative beat offsets', async () => {
    // bpm=60 → beatDuration=1s; slot[0] = 4 beats → slot[1] starts at 4s
    const slots = [makeSlot('C', 'major', 4), makeSlot('G', 'major', 2)]
    await exportChordProgression(slots, 60, 'guitar')
    const call0Time = mockPlayGuitar.mock.calls[0][4] as number
    const call1Time = mockPlayGuitar.mock.calls[1][4] as number
    expect(call0Time).toBeCloseTo(0)
    expect(call1Time).toBeCloseTo(4) // 4 beats × 1s/beat
  })

  it('respects per-slot beat count for scheduling offset', async () => {
    // bpm=120 → beatDuration=0.5s; slot[0]=2 beats → slot[1] starts at 1s
    const slots = [makeSlot('A', 'minor', 2), makeSlot('E', 'minor', 4)]
    await exportChordProgression(slots, 120, 'piano')
    const t0 = mockPlayPiano.mock.calls[0][4] as number
    const t1 = mockPlayPiano.mock.calls[1][4] as number
    expect(t0).toBeCloseTo(0)
    expect(t1).toBeCloseTo(1) // 2 beats × 0.5s/beat
  })
})

// ─── Download trigger ────────────────────────────────────────────────────────

describe('exportChordProgression – download', () => {
  it('triggers an anchor click to initiate download', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'guitar')
    expect(anchorClickSpy).toHaveBeenCalledOnce()
  })

  it('sets the download filename to "chord-progression.wav"', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'guitar')
    expect(anchorElement.download).toBe('chord-progression.wav')
  })

  it('sets href to the object URL returned by URL.createObjectURL', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'guitar')
    expect(anchorElement.href).toBe(fakeObjectUrl)
  })

  it('revokes the object URL after the click (via setTimeout)', async () => {
    vi.useFakeTimers()
    try {
      await exportChordProgression(BASIC_SLOTS, 120, 'guitar')
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
      vi.advanceTimersByTime(100)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(fakeObjectUrl)
    } finally {
      vi.useRealTimers()
    }
  })

  it('calls encodeWav with the rendered AudioBuffer', async () => {
    await exportChordProgression(BASIC_SLOTS, 120, 'guitar')
    expect(mockEncodeWav).toHaveBeenCalledOnce()
    const [buf] = mockEncodeWav.mock.calls[0] as unknown[]
    // The buffer is the fake resolved AudioBuffer from FakeOfflineAudioContext
    expect(buf).toBeDefined()
  })
})

// ─── Single-slot edge case ───────────────────────────────────────────────────

describe('exportChordProgression – single slot', () => {
  it('completes successfully with a single chord slot', async () => {
    await expect(exportChordProgression([makeSlot('C', 'major', 4)], 120, 'guitar')).resolves.toBeUndefined()
  })

  it('calls the synth exactly once for a single slot', async () => {
    await exportChordProgression([makeSlot('D', 'major', 4)], 120, 'piano')
    expect(mockPlayPiano).toHaveBeenCalledOnce()
  })
})

// ─── chord root/type pass-through ────────────────────────────────────────────

describe('exportChordProgression – chord arguments', () => {
  it('passes correct root and type to the guitar synth', async () => {
    const slots = [makeSlot('F#', 'maj7', 4)]
    await exportChordProgression(slots, 120, 'guitar')
    const [, , root, type] = mockPlayGuitar.mock.calls[0] as unknown[]
    expect(root).toBe('F#')
    expect(type).toBe('maj7')
  })

  it('passes correct root and type to the piano synth', async () => {
    const slots = [makeSlot('B', 'minor', 2)]
    await exportChordProgression(slots, 120, 'piano')
    const [, , root, type] = mockPlayPiano.mock.calls[0] as unknown[]
    expect(root).toBe('B')
    expect(type).toBe('minor')
  })

  it('passes correct root and type to the pad synth', async () => {
    const slots = [makeSlot('G#', 'm7', 4)]
    await exportChordProgression(slots, 120, 'pad')
    const [, , root, type] = mockPlayPad.mock.calls[0] as unknown[]
    expect(root).toBe('G#')
    expect(type).toBe('m7')
  })
})
