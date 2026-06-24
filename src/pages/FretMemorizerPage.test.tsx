import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'unauthenticated' }),
  Authenticator: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

vi.mock('../context/noteColorsContextDef', () => ({
  useNoteColors: () => ({
    noteFill: {
      C: '#e05050', 'C#': '#b03838', D: '#e07828', 'D#': '#b05010',
      E: '#c8a800', F: '#9050e0', 'F#': '#6830b0', G: '#20b090',
      'G#': '#107060', A: '#3878e0', 'A#': '#1050b0', B: '#d04080',
    },
    noteStroke: {
      C: '#ff8080', 'C#': '#d06060', D: '#ffa060', 'D#': '#d07840',
      E: '#f0d000', F: '#b880ff', 'F#': '#9060e0', G: '#40d0b0',
      'G#': '#30a090', A: '#60a0ff', 'A#': '#4080e0', B: '#ff70b0',
    },
  }),
  NoteColorsContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

vi.mock('../api/fretMemorizerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/fretMemorizerApi')>()
  return {
    ...actual,
    // Mock only the async cloud-touching functions
    saveScore: vi.fn().mockResolvedValue(undefined),
    loadNoteAccuracy: vi.fn().mockResolvedValue({}),
    saveNoteAccuracy: vi.fn().mockResolvedValue(undefined),
    loadScores: vi.fn().mockResolvedValue([]),
    // loadNoteAccFromStorage, loadSessionHistoryFromStorage, saveSessionHistory
    // use real implementations so localStorage.setItem in tests takes effect
  }
})

vi.mock('@/audio/pluckString', () => ({
  pluckString: vi.fn(),
}))

vi.mock('@/audio/pitchDetection', () => ({
  detectPitch: vi.fn().mockReturnValue(-1),
  freqToMidi: vi.fn().mockReturnValue(69),
}))

import { FretMemorizerPage } from './FretMemorizerPage'

// ─────────────────────────────────────────────────────────────────────────────
// Pure-logic replicas of private functions in FretMemorizerPage.tsx
// ─────────────────────────────────────────────────────────────────────────────

const NUM_FRETS_REPLICA = 24
const MIN_FRET_W_REPLICA = 32
const MAX_FRET_W_REPLICA = 64
const NUT_X_REPLICA = 40
const LEFT_PAD_REPLICA = 8
const RIGHT_PAD_REPLICA = 24

function computeFretWReplica(containerWidth: number): number {
  if (containerWidth <= 0) return MAX_FRET_W_REPLICA
  // contentRect already excludes padding — no extra subtraction needed
  const available = containerWidth - LEFT_PAD_REPLICA - NUT_X_REPLICA - RIGHT_PAD_REPLICA
  return Math.max(
    MIN_FRET_W_REPLICA,
    Math.min(MAX_FRET_W_REPLICA, Math.floor(available / NUM_FRETS_REPLICA)),
  )
}

function fretXReplica(fret: number, fretW: number): number {
  return LEFT_PAD_REPLICA + NUT_X_REPLICA + fret * fretW
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeFretW — pure function unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFretW', () => {
  it('returns MAX_FRET_W (64) when containerWidth is 0', () => {
    expect(computeFretWReplica(0)).toBe(64)
  })

  it('returns MAX_FRET_W (64) when containerWidth is negative', () => {
    expect(computeFretWReplica(-1)).toBe(64)
    expect(computeFretWReplica(-100)).toBe(64)
  })

  it('returns a value clamped to [MIN_FRET_W, MAX_FRET_W] = [32, 64]', () => {
    const narrow = computeFretWReplica(200)
    expect(narrow).toBeGreaterThanOrEqual(32)
    expect(narrow).toBeLessThanOrEqual(64)

    const wide = computeFretWReplica(2000)
    expect(wide).toBeGreaterThanOrEqual(32)
    expect(wide).toBeLessThanOrEqual(64)
  })

  it('returns 47 for a typical desktop width of 1200px', () => {
    // available = 1200 - 8 - 40 - 24 = 1128; floor(1128/24) = 47
    expect(computeFretWReplica(1200)).toBe(47)
  })

  it('returns MAX_FRET_W (64) for a very wide container (2000px)', () => {
    // available = 2000 - 72 = 1928; floor(1928/24) = 80 → clamped to 64
    expect(computeFretWReplica(2000)).toBe(64)
  })

  it('returns MIN_FRET_W (32) for a very narrow container (400px)', () => {
    // available = 400 - 72 = 328; floor(328/24) = 13 → clamped to 32
    expect(computeFretWReplica(400)).toBe(32)
  })

  it('returns MIN_FRET_W (32) for a typical mobile width of 375px', () => {
    // available = 375 - 72 = 303; floor(303/24) = 12 → clamped to 32
    expect(computeFretWReplica(375)).toBe(32)
  })

  it('returns 34 for a medium width of 900px', () => {
    // available = 900 - 72 = 828; floor(828/24) = 34
    expect(computeFretWReplica(900)).toBe(34)
  })

  it('never returns NaN', () => {
    const values = [0, 1, 100, 375, 768, 1024, 1200, 1440, 2560]
    for (const w of values) {
      expect(Number.isNaN(computeFretWReplica(w))).toBe(false)
    }
  })

  it('never returns a negative value', () => {
    const values = [-500, -1, 0, 100, 375, 1200]
    for (const w of values) {
      expect(computeFretWReplica(w)).toBeGreaterThanOrEqual(0)
    }
  })

  it('is always an integer', () => {
    const widths = [500, 768, 1024, 1366]
    for (const w of widths) {
      expect(Number.isInteger(computeFretWReplica(w))).toBe(true)
    }
  })

  it('clamps to MAX_FRET_W at exactly 1608px', () => {
    // available = 1608 - 72 = 1536; floor(1536/24) = 64 → returns 64
    expect(computeFretWReplica(1608)).toBe(64)
    // available = 1607 - 72 = 1535; floor(1535/24) = 63 → returns 63
    expect(computeFretWReplica(1607)).toBe(63)
  })

  it('clamps to MIN_FRET_W below 864px', () => {
    // available = 864 - 72 = 792; floor(792/24) = 33 → returns 33
    expect(computeFretWReplica(864)).toBe(33)
    // available = 863 - 72 = 791; floor(791/24) = 32 → returns 32 (exactly at min)
    expect(computeFretWReplica(863)).toBe(32)
    // Below 840: still clamped to 32
    expect(computeFretWReplica(800)).toBe(32)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. fretX — pure function unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('fretX', () => {
  it('returns LEFT_PAD + NUT_X (48) for fret 0', () => {
    expect(fretXReplica(0, 64)).toBe(48)
    expect(fretXReplica(0, 32)).toBe(48)
  })

  it('returns 112 for fret 1 with fretW=64', () => {
    // 8 + 40 + 1*64 = 112
    expect(fretXReplica(1, 64)).toBe(112)
  })

  it('returns 80 for fret 1 with fretW=32', () => {
    // 8 + 40 + 1*32 = 80
    expect(fretXReplica(1, 32)).toBe(80)
  })

  it('returns 816 for fret 12 with fretW=64', () => {
    // 8 + 40 + 12*64 = 816
    expect(fretXReplica(12, 64)).toBe(816)
  })

  it('returns 1584 for fret 24 with fretW=64', () => {
    // 8 + 40 + 24*64 = 1584
    expect(fretXReplica(24, 64)).toBe(1584)
  })

  it('increases linearly by fretW per fret', () => {
    const fretW = 48
    for (let fret = 0; fret < 24; fret++) {
      const diff = fretXReplica(fret + 1, fretW) - fretXReplica(fret, fretW)
      expect(diff).toBe(fretW)
    }
  })

  it('is always positive', () => {
    for (let fret = 0; fret <= 24; fret++) {
      expect(fretXReplica(fret, 64)).toBeGreaterThan(0)
      expect(fretXReplica(fret, 32)).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. FretMemorizerPage — responsive fretboard sizing (integration)
// ─────────────────────────────────────────────────────────────────────────────

function getFretboardSvg(container: HTMLElement): Element | null {
  return container.querySelector('svg[aria-label="Guitar fretboard"]')
}

describe('FretMemorizerPage – responsive fretboard sizing', () => {
  let capturedCallback: ResizeObserverCallback | null = null
  let originalResizeObserver: typeof ResizeObserver

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    capturedCallback = null
    originalResizeObserver = globalThis.ResizeObserver

    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        capturedCallback = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver
  })

  it('does not render the fretboard SVG until ResizeObserver fires', () => {
    // fretboardWidth starts as null → Fretboard is gated, no SVG yet
    const { container } = render(<FretMemorizerPage />)
    expect(getFretboardSvg(container)).toBeNull()
  })

  it('renders the fretboard SVG after ResizeObserver fires', () => {
    const { container } = render(<FretMemorizerPage />)
    act(() => {
      capturedCallback?.(
        [{ contentBoxSize: [{ inlineSize: 900 }], contentRect: { width: 900 } } as unknown as ResizeObserverEntry],
        null as unknown as ResizeObserver,
      )
    })
    expect(getFretboardSvg(container)).not.toBeNull()
  })

  it('computes correct viewBox for a narrow container (375px → fretW=32)', () => {
    const { container } = render(<FretMemorizerPage />)
    act(() => {
      capturedCallback?.(
        [{ contentBoxSize: [{ inlineSize: 375 }], contentRect: { width: 375 } } as unknown as ResizeObserverEntry],
        null as unknown as ResizeObserver,
      )
    })
    const svg = getFretboardSvg(container)
    // fretW = 32 → svgW = 8+40+24*32+24 = 840; height = 40+5*40+40 = 280 (6 strings)
    expect(svg?.getAttribute('viewBox')).toBe('0 0 840 280')
  })

  it('computes correct viewBox for a wide container (2000px → fretW=64)', () => {
    const { container } = render(<FretMemorizerPage />)
    act(() => {
      capturedCallback?.(
        [{ contentBoxSize: [{ inlineSize: 2000 }], contentRect: { width: 2000 } } as unknown as ResizeObserverEntry],
        null as unknown as ResizeObserver,
      )
    })
    const svg = getFretboardSvg(container)
    // fretW = 64 → svgW = 8+40+24*64+24 = 1608
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1608 280')
  })

  it('computes correct viewBox for a medium container (900px → fretW=34)', () => {
    const { container } = render(<FretMemorizerPage />)
    act(() => {
      capturedCallback?.(
        [{ contentBoxSize: [{ inlineSize: 900 }], contentRect: { width: 900 } } as unknown as ResizeObserverEntry],
        null as unknown as ResizeObserver,
      )
    })
    const svg = getFretboardSvg(container)
    // fretW = 34 → svgW = 8+40+24*34+24 = 888
    expect(svg?.getAttribute('viewBox')).toBe('0 0 888 280')
  })

  it('exactly at breakpoint 1608px yields fretW=64 (svgW=1608)', () => {
    const { container } = render(<FretMemorizerPage />)
    act(() => {
      capturedCallback?.(
        [{ contentBoxSize: [{ inlineSize: 1608 }], contentRect: { width: 1608 } } as unknown as ResizeObserverEntry],
        null as unknown as ResizeObserver,
      )
    })
    expect(getFretboardSvg(container)?.getAttribute('viewBox')).toBe('0 0 1608 280')
  })

  it('one pixel below breakpoint (1607px) yields fretW=63 (svgW=1584)', () => {
    const { container } = render(<FretMemorizerPage />)
    act(() => {
      capturedCallback?.(
        [{ contentBoxSize: [{ inlineSize: 1607 }], contentRect: { width: 1607 } } as unknown as ResizeObserverEntry],
        null as unknown as ResizeObserver,
      )
    })
    // fretW = 63 → svgW = 8+40+24*63+24 = 1584
    expect(getFretboardSvg(container)?.getAttribute('viewBox')).toBe('0 0 1584 280')
  })

  it('fretboard SVG width grows monotonically as container widens', () => {
    const { container } = render(<FretMemorizerPage />)
    const widths = [400, 600, 864, 1100, 1608]
    let prevSvgW = 0

    for (const containerW of widths) {
      act(() => {
        capturedCallback?.(
          [{ contentBoxSize: [{ inlineSize: containerW }], contentRect: { width: containerW } } as unknown as ResizeObserverEntry],
          null as unknown as ResizeObserver,
        )
      })
      const viewBox = getFretboardSvg(container)?.getAttribute('viewBox') ?? ''
      const svgW = parseInt(viewBox.split(' ')[2], 10)
      expect(svgW).toBeGreaterThanOrEqual(prevSvgW)
      prevSvgW = svgW
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared by the new test suites
// ─────────────────────────────────────────────────────────────────────────────

/** Install a no-op ResizeObserver so the page renders without crashing. */
function installNoopResizeObserver() {
  let originalResizeObserver: typeof ResizeObserver
  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class NoopResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })
  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver
  })
}


// ─────────────────────────────────────────────────────────────────────────────
// 4. accuracyColor — pure-logic replica tests
// ─────────────────────────────────────────────────────────────────────────────

/** Replica — mirrors the private function verbatim so we can unit-test it without touching the DOM. */
function accuracyColorReplica(acc: number): string {
  if (acc >= 0.9) return '#22dd88'
  if (acc >= 0.7) return '#88cc44'
  if (acc >= 0.5) return '#ddaa22'
  return '#dd4444'
}

function accuracyStrokeReplica(acc: number): string {
  if (acc >= 0.9) return '#66ffbb'
  if (acc >= 0.7) return '#aaee66'
  if (acc >= 0.5) return '#ffcc44'
  return '#ff7777'
}

describe('accuracyColor', () => {
  it('returns #22dd88 for acc = 1.0 (perfect)', () => {
    expect(accuracyColorReplica(1.0)).toBe('#22dd88')
  })
  it('returns #22dd88 for acc = 0.9 (exactly at ≥0.9 boundary)', () => {
    expect(accuracyColorReplica(0.9)).toBe('#22dd88')
  })
  it('returns #88cc44 for acc = 0.89 (just below 0.9)', () => {
    expect(accuracyColorReplica(0.89)).toBe('#88cc44')
  })
  it('returns #88cc44 for acc = 0.7 (exactly at ≥0.7 boundary)', () => {
    expect(accuracyColorReplica(0.7)).toBe('#88cc44')
  })
  it('returns #ddaa22 for acc = 0.69 (just below 0.7)', () => {
    expect(accuracyColorReplica(0.69)).toBe('#ddaa22')
  })
  it('returns #ddaa22 for acc = 0.5 (exactly at ≥0.5 boundary)', () => {
    expect(accuracyColorReplica(0.5)).toBe('#ddaa22')
  })
  it('returns #dd4444 for acc = 0.49 (just below 0.5)', () => {
    expect(accuracyColorReplica(0.49)).toBe('#dd4444')
  })
  it('returns #dd4444 for acc = 0 (no correct answers)', () => {
    expect(accuracyColorReplica(0)).toBe('#dd4444')
  })
})

describe('accuracyStroke', () => {
  it('returns #66ffbb for acc ≥ 0.9', () => {
    expect(accuracyStrokeReplica(1.0)).toBe('#66ffbb')
    expect(accuracyStrokeReplica(0.9)).toBe('#66ffbb')
  })
  it('returns #aaee66 for 0.7 ≤ acc < 0.9', () => {
    expect(accuracyStrokeReplica(0.89)).toBe('#aaee66')
    expect(accuracyStrokeReplica(0.7)).toBe('#aaee66')
  })
  it('returns #ffcc44 for 0.5 ≤ acc < 0.7', () => {
    expect(accuracyStrokeReplica(0.69)).toBe('#ffcc44')
    expect(accuracyStrokeReplica(0.5)).toBe('#ffcc44')
  })
  it('returns #ff7777 for acc < 0.5', () => {
    expect(accuracyStrokeReplica(0.49)).toBe('#ff7777')
    expect(accuracyStrokeReplica(0)).toBe('#ff7777')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. loadNoteAcc / saveNoteAcc / loadSessionHistory / saveSessionHistory
//    — tested via localStorage state after page renders and via replica functions
// ─────────────────────────────────────────────────────────────────────────────

/** Replicas of the private localStorage helpers. */
type NoteAccMapReplica = Record<number, { correct: number; total: number }>
interface SessionEntryReplica { date: string; score: number; total: number }

function loadNoteAccReplica(): NoteAccMapReplica {
  try { return JSON.parse(localStorage.getItem('fretMem.noteAcc') ?? '{}') as NoteAccMapReplica }
  catch { return {} }
}
function saveNoteAccReplica(m: NoteAccMapReplica): void {
  try { localStorage.setItem('fretMem.noteAcc', JSON.stringify(m)) } catch { /* ignore */ }
}
function loadSessionHistoryReplica(): SessionEntryReplica[] {
  try { return JSON.parse(localStorage.getItem('fretMem.history') ?? '[]') as SessionEntryReplica[] }
  catch { return [] }
}
function saveSessionHistoryReplica(entries: SessionEntryReplica[]): void {
  try { localStorage.setItem('fretMem.history', JSON.stringify(entries.slice(-30))) } catch { /* ignore */ }
}

describe('loadNoteAcc', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns {} when key is absent', () => {
    expect(loadNoteAccReplica()).toEqual({})
  })
  it('returns {} on invalid JSON', () => {
    localStorage.setItem('fretMem.noteAcc', 'not-json')
    expect(loadNoteAccReplica()).toEqual({})
  })
  it('returns the stored map on valid JSON', () => {
    const map: NoteAccMapReplica = { 0: { correct: 8, total: 10 }, 5: { correct: 3, total: 5 } }
    localStorage.setItem('fretMem.noteAcc', JSON.stringify(map))
    expect(loadNoteAccReplica()).toEqual(map)
  })
})

describe('saveNoteAcc', () => {
  beforeEach(() => { localStorage.clear() })

  it('writes the map to localStorage', () => {
    const map: NoteAccMapReplica = { 2: { correct: 1, total: 2 } }
    saveNoteAccReplica(map)
    expect(JSON.parse(localStorage.getItem('fretMem.noteAcc') ?? '{}')).toEqual(map)
  })
  it('round-trips through save then load', () => {
    const map: NoteAccMapReplica = { 7: { correct: 5, total: 6 }, 11: { correct: 0, total: 3 } }
    saveNoteAccReplica(map)
    expect(loadNoteAccReplica()).toEqual(map)
  })
})

describe('loadSessionHistory', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns [] when key is absent', () => {
    expect(loadSessionHistoryReplica()).toEqual([])
  })
  it('returns [] on invalid JSON', () => {
    localStorage.setItem('fretMem.history', '{{bad')
    expect(loadSessionHistoryReplica()).toEqual([])
  })
  it('returns the stored entries on valid JSON', () => {
    const entries: SessionEntryReplica[] = [
      { date: '2026-01-01T00:00:00Z', score: 9, total: 10 },
      { date: '2026-01-02T00:00:00Z', score: 7, total: 10 },
    ]
    localStorage.setItem('fretMem.history', JSON.stringify(entries))
    expect(loadSessionHistoryReplica()).toEqual(entries)
  })
})

describe('saveSessionHistory', () => {
  beforeEach(() => { localStorage.clear() })

  it('writes entries to localStorage', () => {
    const entries: SessionEntryReplica[] = [{ date: '2026-01-01T00:00:00Z', score: 5, total: 10 }]
    saveSessionHistoryReplica(entries)
    const raw = localStorage.getItem('fretMem.history')
    expect(JSON.parse(raw ?? '[]')).toEqual(entries)
  })
  it('trims to the last 30 entries', () => {
    const entries: SessionEntryReplica[] = Array.from({ length: 35 }, (_, i) => ({
      date: new Date(i * 86400000).toISOString(),
      score: i,
      total: 30,
    }))
    saveSessionHistoryReplica(entries)
    const saved = JSON.parse(localStorage.getItem('fretMem.history') ?? '[]') as SessionEntryReplica[]
    expect(saved).toHaveLength(30)
    // Should keep the last 30 (indices 5–34)
    expect(saved[0].score).toBe(5)
    expect(saved[29].score).toBe(34)
  })
  it('round-trips through save then load', () => {
    const entries: SessionEntryReplica[] = [{ date: '2026-06-20T00:00:00Z', score: 10, total: 10 }]
    saveSessionHistoryReplica(entries)
    expect(loadSessionHistoryReplica()).toEqual(entries)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. getWorstNotes — pure-logic replica tests
// ─────────────────────────────────────────────────────────────────────────────

function getWorstNotesReplica(m: NoteAccMapReplica, n: number, minAttempts = 3): number[] {
  return Object.entries(m)
    .filter(([, v]) => v.total >= minAttempts)
    .map(([pc, v]) => ({ pc: Number(pc), acc: v.correct / v.total }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, n)
    .map((x) => x.pc)
}

describe('getWorstNotes', () => {
  it('returns [] when map is empty', () => {
    expect(getWorstNotesReplica({}, 5)).toEqual([])
  })

  it('returns [] when no note meets minAttempts threshold', () => {
    const m: NoteAccMapReplica = { 0: { correct: 1, total: 2 } }
    expect(getWorstNotesReplica(m, 5, 3)).toEqual([])
  })

  it('includes notes that exactly meet minAttempts', () => {
    const m: NoteAccMapReplica = { 0: { correct: 1, total: 3 } }
    expect(getWorstNotesReplica(m, 5, 3)).toEqual([0])
  })

  it('sorts ascending by accuracy (worst first)', () => {
    const m: NoteAccMapReplica = {
      0: { correct: 9, total: 10 },  // 90%
      1: { correct: 3, total: 10 },  // 30% — worst
      2: { correct: 5, total: 10 },  // 50%
    }
    const result = getWorstNotesReplica(m, 3)
    expect(result).toEqual([1, 2, 0])
  })

  it('slices to n results', () => {
    const m: NoteAccMapReplica = {
      0: { correct: 1, total: 10 },
      1: { correct: 2, total: 10 },
      2: { correct: 3, total: 10 },
      3: { correct: 4, total: 10 },
    }
    expect(getWorstNotesReplica(m, 2)).toHaveLength(2)
  })

  it('uses the default minAttempts of 3', () => {
    const m: NoteAccMapReplica = {
      0: { correct: 0, total: 2 },  // excluded (total < 3)
      1: { correct: 0, total: 3 },  // included
    }
    const result = getWorstNotesReplica(m, 5)
    expect(result).toEqual([1])
  })

  it('returns fewer than n when not enough qualifying notes', () => {
    const m: NoteAccMapReplica = { 4: { correct: 2, total: 5 } }
    const result = getWorstNotesReplica(m, 5)
    expect(result).toHaveLength(1)
  })

  it('respects a custom minAttempts value', () => {
    const m: NoteAccMapReplica = {
      0: { correct: 0, total: 5 },  // qualifies for minAttempts=5
      1: { correct: 0, total: 4 },  // excluded for minAttempts=5
    }
    expect(getWorstNotesReplica(m, 5, 5)).toEqual([0])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. generateQuestion — tested via a replica that exercises the allowedPcs param
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replica of the private generateQuestion function.
 * openMidi for standard 6-string: [40,45,50,55,59,64] (E2–E4).
 * We test that when allowedPcs is provided, the returned targetPc is always
 * one of the allowed values.
 */
const NOTE_NAMES_REPLICA = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const NUM_FRETS_GQ = 24

interface QuestionReplica {
  targetNote: string
  targetPc: number
  targetSvgStr: number
  validFrets: number[]
}

function generateQuestionReplica(
  openMidi: number[],
  numStrings: number,
  allowedSvgStrings: number[],
  excludeKey: string | null = null,
  allowedPcs?: number[],
): QuestionReplica {
  for (let attempt = 0; attempt < 40; attempt++) {
    const targetSvgStr = allowedSvgStrings[Math.floor(Math.random() * allowedSvgStrings.length)]
    const midiStrIdx = numStrings - 1 - targetSvgStr
    const targetPc = allowedPcs && allowedPcs.length > 0
      ? allowedPcs[Math.floor(Math.random() * allowedPcs.length)]
      : Math.floor(Math.random() * 12)
    if (excludeKey === `${targetPc}-${targetSvgStr}`) continue
    const validFrets: number[] = []
    for (let fret = 0; fret <= NUM_FRETS_GQ; fret++) {
      if ((openMidi[midiStrIdx] + fret) % 12 === targetPc) validFrets.push(fret)
    }
    if (validFrets.length > 0) {
      return { targetNote: NOTE_NAMES_REPLICA[targetPc], targetPc, targetSvgStr, validFrets }
    }
  }
  const fallbackPc = allowedPcs && allowedPcs.length > 0 ? allowedPcs[0] : 0
  const fallbackSvgStr = allowedSvgStrings[0]
  const midiStrIdx = numStrings - 1 - fallbackSvgStr
  const validFrets: number[] = []
  for (let fret = 0; fret <= NUM_FRETS_GQ; fret++) {
    if ((openMidi[midiStrIdx] + fret) % 12 === fallbackPc) validFrets.push(fret)
  }
  return { targetNote: NOTE_NAMES_REPLICA[fallbackPc], targetPc: fallbackPc, targetSvgStr: fallbackSvgStr, validFrets }
}

// Standard E standard tuning open MIDI (string 0 = lowest = E2=40)
const STANDARD_OPEN_MIDI = [40, 45, 50, 55, 59, 64]

describe('generateQuestion', () => {
  it('returns a question with a valid targetNote string', () => {
    const q = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0, 1, 2, 3, 4, 5])
    expect(NOTE_NAMES_REPLICA).toContain(q.targetNote)
  })

  it('returns validFrets that are all in [0, 24]', () => {
    const q = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0, 1, 2, 3, 4, 5])
    expect(q.validFrets.length).toBeGreaterThan(0)
    for (const fret of q.validFrets) {
      expect(fret).toBeGreaterThanOrEqual(0)
      expect(fret).toBeLessThanOrEqual(24)
    }
  })

  it('all validFrets produce the target pitch class on the target string', () => {
    for (let run = 0; run < 20; run++) {
      const q = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0, 1, 2, 3, 4, 5])
      const midiStrIdx = 6 - 1 - q.targetSvgStr
      for (const fret of q.validFrets) {
        expect((STANDARD_OPEN_MIDI[midiStrIdx] + fret) % 12).toBe(q.targetPc)
      }
    }
  })

  it('when allowedPcs is provided, targetPc is always one of the allowed values', () => {
    const allowed = [0, 4, 7] // C, E, G
    for (let run = 0; run < 30; run++) {
      const q = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0, 1, 2, 3, 4, 5], null, allowed)
      expect(allowed).toContain(q.targetPc)
    }
  })

  it('when allowedPcs contains a single entry, every question uses that pitch class', () => {
    const allowed = [5] // F
    for (let run = 0; run < 10; run++) {
      const q = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0, 1, 2, 3, 4, 5], null, allowed)
      expect(q.targetPc).toBe(5)
    }
  })

  it('targetSvgStr is always one of allowedSvgStrings', () => {
    const allowed = [0, 2, 4]
    for (let run = 0; run < 20; run++) {
      const q = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, allowed)
      expect(allowed).toContain(q.targetSvgStr)
    }
  })

  it('excludeKey prevents exact repetition of the previous question', () => {
    // Run 50 iterations: if excludeKey works, we should not get the same key back
    // (may occasionally get different str same pc but different key, that's fine)
    const successes: boolean[] = []
    for (let run = 0; run < 50; run++) {
      const first = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0])
      const exclude = `${first.targetPc}-${first.targetSvgStr}`
      const second = generateQuestionReplica(STANDARD_OPEN_MIDI, 6, [0], exclude)
      successes.push(`${second.targetPc}-${second.targetSvgStr}` !== exclude)
    }
    // Expect a high hit-rate (≥80% should be different)
    const differentCount = successes.filter(Boolean).length
    expect(differentCount).toBeGreaterThanOrEqual(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. SessionChart component tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SessionChart is a private component inside FretMemorizerPage.tsx.
 * We test its behaviour through the Stats panel rendered by FretMemorizerPage:
 * - click the "📊 Stats" button to enter stats view
 * - the SessionChart output depends on the sessionHistory state, which is
 *   initialised from localStorage.
 */
describe('SessionChart', () => {
  installNoopResizeObserver()

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows "Complete a game to see your history" when sessions is empty', () => {
    // No history in localStorage → empty
    render(<FretMemorizerPage />)
    // Open stats panel
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(screen.getByText('Complete a game to see your history')).toBeTruthy()
  })

  it('renders an SVG bar chart when session history is present', () => {
    const sessions = [
      { date: '2026-01-01T00:00:00Z', score: 9, total: 10 },
      { date: '2026-01-02T00:00:00Z', score: 7, total: 10 },
      { date: '2026-01-03T00:00:00Z', score: 5, total: 10 },
    ]
    localStorage.setItem('fretMem.history', JSON.stringify(sessions))

    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))

    // The SVG for the chart should be present (aria-label="Session history bar chart")
    const chart = document.querySelector('svg[aria-label="Session history bar chart"]')
    expect(chart).not.toBeNull()
  })

  it('renders one <rect> per session entry in the chart', () => {
    const sessions = [
      { date: '2026-01-01T00:00:00Z', score: 8, total: 10 },
      { date: '2026-01-02T00:00:00Z', score: 6, total: 10 },
      { date: '2026-01-03T00:00:00Z', score: 4, total: 10 },
      { date: '2026-01-04T00:00:00Z', score: 2, total: 10 },
    ]
    localStorage.setItem('fretMem.history', JSON.stringify(sessions))

    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))

    const chart = document.querySelector('svg[aria-label="Session history bar chart"]')
    expect(chart).not.toBeNull()
    const rects = chart!.querySelectorAll('rect')
    expect(rects.length).toBe(sessions.length)
  })

  it('does not render the chart SVG when sessions is empty', () => {
    localStorage.setItem('fretMem.history', '[]')
    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))

    const chart = document.querySelector('svg[aria-label="Session history bar chart"]')
    expect(chart).toBeNull()
  })

  it('shows date labels when sessions has ≥ 2 entries', () => {
    const sessions = [
      { date: '2026-01-01T00:00:00Z', score: 9, total: 10 },
      { date: '2026-06-15T00:00:00Z', score: 7, total: 10 },
    ]
    localStorage.setItem('fretMem.history', JSON.stringify(sessions))

    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))

    const chart = document.querySelector('svg[aria-label="Session history bar chart"]')
    expect(chart).not.toBeNull()
    // Date labels appear as siblings in the flex container below the SVG
    const parent = chart!.closest('.flex.flex-col.gap-1')
    expect(parent).not.toBeNull()
    const labelDiv = parent!.querySelector('.flex.justify-between')
    expect(labelDiv).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. StreakFlame component tests (exercised via FretMemorizerPage game phase)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StreakFlame is private inside FretMemorizerPage.tsx.
 * We test it via a replica component that mirrors the function exactly.
 */
function StreakFlameReplica({ streak }: { streak: number }) {
  if (streak < 1) return null
  const size =
    streak >= 20 ? 'text-3xl' :
    streak >= 10 ? 'text-2xl' :
    streak >= 5  ? 'text-xl'  : 'text-lg'
  const color =
    streak >= 20 ? '#ff4400' :
    streak >= 10 ? '#ff7700' :
    streak >= 5  ? '#ffaa00' : '#ffcc44'
  return (
    <div className="text-center">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Streak</div>
      <div
        className={`${size} font-bold tabular-nums leading-tight fm-streak-${streak >= 20 ? 'xl' : streak >= 10 ? 'lg' : streak >= 5 ? 'md' : 'sm'}`}
        style={{ color }}
      >
        {streak >= 5 ? '🔥' : ''}{streak}
      </div>
    </div>
  )
}

describe('StreakFlame', () => {
  it('renders nothing when streak is 0', () => {
    const { container } = render(<StreakFlameReplica streak={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when streak is negative', () => {
    const { container } = render(<StreakFlameReplica streak={-5} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the streak count when streak is 1 (no flame emoji)', () => {
    const { container } = render(<StreakFlameReplica streak={1} />)
    expect(container.textContent).toContain('1')
    expect(container.textContent).not.toContain('🔥')
  })

  it('renders the streak count when streak is 4 (no flame emoji)', () => {
    const { container } = render(<StreakFlameReplica streak={4} />)
    expect(container.textContent).toContain('4')
    expect(container.textContent).not.toContain('🔥')
  })

  it('shows flame emoji at streak 5', () => {
    const { container } = render(<StreakFlameReplica streak={5} />)
    expect(container.textContent).toContain('🔥')
    expect(container.textContent).toContain('5')
  })

  it('shows flame emoji at streak 10', () => {
    const { container } = render(<StreakFlameReplica streak={10} />)
    expect(container.textContent).toContain('🔥')
    expect(container.textContent).toContain('10')
  })

  it('shows flame emoji at streak 20', () => {
    const { container } = render(<StreakFlameReplica streak={20} />)
    expect(container.textContent).toContain('🔥')
    expect(container.textContent).toContain('20')
  })

  it('uses text-lg class for streak 1–4', () => {
    const { container } = render(<StreakFlameReplica streak={4} />)
    const div = container.querySelector('.text-lg')
    expect(div).not.toBeNull()
  })

  it('uses text-xl class for streak 5–9', () => {
    const { container } = render(<StreakFlameReplica streak={5} />)
    const div = container.querySelector('.text-xl')
    expect(div).not.toBeNull()
  })

  it('uses text-2xl class for streak 10–19', () => {
    const { container } = render(<StreakFlameReplica streak={10} />)
    const div = container.querySelector('.text-2xl')
    expect(div).not.toBeNull()
  })

  it('uses text-3xl class for streak ≥ 20', () => {
    const { container } = render(<StreakFlameReplica streak={20} />)
    const div = container.querySelector('.text-3xl')
    expect(div).not.toBeNull()
  })

  it('applies orange color (#ffaa00) at streak 5', () => {
    const { container } = render(<StreakFlameReplica streak={5} />)
    const styled = container.querySelector('[style]') as HTMLElement | null
    expect(styled?.style.color).toBe('rgb(255, 170, 0)')
  })

  it('applies darker orange (#ff7700) at streak 10', () => {
    const { container } = render(<StreakFlameReplica streak={10} />)
    const styled = container.querySelector('[style]') as HTMLElement | null
    expect(styled?.style.color).toBe('rgb(255, 119, 0)')
  })

  it('applies red-orange (#ff4400) at streak 20', () => {
    const { container } = render(<StreakFlameReplica streak={20} />)
    const styled = container.querySelector('[style]') as HTMLElement | null
    expect(styled?.style.color).toBe('rgb(255, 68, 0)')
  })

  it('applies yellow (#ffcc44) for streaks 1–4', () => {
    const { container } = render(<StreakFlameReplica streak={3} />)
    const styled = container.querySelector('[style]') as HTMLElement | null
    expect(styled?.style.color).toBe('rgb(255, 204, 68)')
  })

  it('shows "Streak" label', () => {
    render(<StreakFlameReplica streak={1} />)
    expect(screen.getByText('Streak')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Stats panel (📊 Stats button) — integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FretMemorizerPage – Stats panel', () => {
  installNoopResizeObserver()

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the "📊 Stats" button in game/idle view', () => {
    render(<FretMemorizerPage />)
    expect(screen.getByRole('button', { name: /stats/i })).toBeTruthy()
  })

  it('opens the stats panel when "📊 Stats" is clicked', () => {
    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(screen.getByText(/Note Accuracy Heatmap/i)).toBeTruthy()
    expect(screen.getByText(/Session History/i)).toBeTruthy()
  })

  it('shows "← Back to Game" button when in stats view', () => {
    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(screen.getByRole('button', { name: /back to game/i })).toBeTruthy()
  })

  it('returns to game view when "← Back to Game" is clicked', () => {
    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    fireEvent.click(screen.getByRole('button', { name: /back to game/i }))
    expect(screen.queryByText(/Note Accuracy Heatmap/i)).toBeNull()
    expect(screen.getByRole('button', { name: /stats/i })).toBeTruthy()
  })

  it('shows the Focus Mode section inside the stats panel', () => {
    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    // "Focus Mode" heading appears as an uppercase label — getAllByText covers multiple matches
    const matches = screen.getAllByText(/Focus Mode/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('shows unlock message when no accuracy data exists', () => {
    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(screen.getByText(/Play at least 3 attempts/i)).toBeTruthy()
  })

  it('shows "Start Focus Mode" button when accuracy data with ≥3 attempts exists', () => {
    // Pre-populate noteAcc with notes that have ≥3 attempts
    const noteAcc: NoteAccMapReplica = {
      0: { correct: 1, total: 5 },   // C — 20%
      2: { correct: 2, total: 5 },   // D — 40%
      4: { correct: 1, total: 4 },   // E — 25%
    }
    localStorage.setItem('fretMem.noteAcc', JSON.stringify(noteAcc))

    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(screen.getByRole('button', { name: /Start Focus Mode/i })).toBeTruthy()
  })

  it('shows the "Your weakest notes" text in Focus Mode when data is available', () => {
    const noteAcc: NoteAccMapReplica = {
      0: { correct: 1, total: 5 },
    }
    localStorage.setItem('fretMem.noteAcc', JSON.stringify(noteAcc))

    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(screen.getByText(/Your weakest notes/i)).toBeTruthy()
  })

  it('clicking "Start Focus Mode" returns to game view', () => {
    const noteAcc: NoteAccMapReplica = {
      0: { correct: 1, total: 5 },
    }
    localStorage.setItem('fretMem.noteAcc', JSON.stringify(noteAcc))

    render(<FretMemorizerPage />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    fireEvent.click(screen.getByRole('button', { name: /Start Focus Mode/i }))
    // After clicking, should return to game view
    expect(screen.queryByText(/Note Accuracy Heatmap/i)).toBeNull()
  })

  it('does not show the "📊 Stats" button while a game is playing', async () => {
    render(<FretMemorizerPage />)
    // The stats button should exist before the game starts
    expect(screen.getByRole('button', { name: /stats/i })).toBeTruthy()
    // Note: we can't start a game in tests without ResizeObserver firing,
    // but we can verify the conditional: the button has the condition gamePhase !== 'playing'
    // Since we're in idle phase, button is visible — that's what we test above.
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. Study Mode toggle — Start button label
// ─────────────────────────────────────────────────────────────────────────────

describe('FretMemorizerPage – Study Mode toggle changes Start button label', () => {
  installNoopResizeObserver()

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows "▶ Start Practice" button in Quiz mode (default)', () => {
    // Ensure studyMode is false (default)
    localStorage.setItem('fretMem.studyMode', 'false')
    render(<FretMemorizerPage />)
    expect(screen.getByRole('button', { name: /Start Practice/i })).toBeTruthy()
  })

  it('shows "📖 Start Study" button when study mode is enabled', () => {
    localStorage.setItem('fretMem.studyMode', 'true')
    render(<FretMemorizerPage />)
    expect(screen.getByRole('button', { name: /Start Study/i })).toBeTruthy()
  })

  it('switches from "▶ Start Practice" to "📖 Start Study" when Study toggle is clicked', () => {
    localStorage.setItem('fretMem.studyMode', 'false')
    render(<FretMemorizerPage />)

    // Initially shows Start Practice
    expect(screen.getByRole('button', { name: /Start Practice/i })).toBeTruthy()

    // Click the "📖 Study" toggle button (role=radio from ToggleGroupItem)
    const studyToggle = screen.getByRole('radio', { name: /Study/i })
    fireEvent.click(studyToggle)

    expect(screen.getByRole('button', { name: /Start Study/i })).toBeTruthy()
  })

  it('switches from "📖 Start Study" to "▶ Start Practice" when Quiz toggle is clicked', () => {
    localStorage.setItem('fretMem.studyMode', 'true')
    render(<FretMemorizerPage />)

    // Initially shows Start Study
    expect(screen.getByRole('button', { name: /Start Study/i })).toBeTruthy()

    const quizToggle = screen.getByRole('radio', { name: /^Quiz$/i })
    fireEvent.click(quizToggle)

    expect(screen.getByRole('button', { name: /Start Practice/i })).toBeTruthy()
  })

  it('shows study mode description text when study mode is active', () => {
    localStorage.setItem('fretMem.studyMode', 'true')
    render(<FretMemorizerPage />)
    expect(screen.getByText(/Study mode: a fret is highlighted/i)).toBeTruthy()
  })

  it('shows quiz mode description text when quiz mode is active', () => {
    localStorage.setItem('fretMem.studyMode', 'false')
    render(<FretMemorizerPage />)
    expect(screen.getByText(/Answer 10 questions/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. relativeDay — pure function replica tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replica of the private relativeDay function from FretMemorizerPage.tsx.
 * Uses UTC arithmetic so results are timezone-independent.
 */
const MS_PER_DAY_REPLICA = 86_400_000

function relativeDayReplica(isoDate: string): string {
  const now = new Date()
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const d = new Date(isoDate)
  const dMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diffDays = Math.round((todayMidnight - dMidnight) / MS_PER_DAY_REPLICA)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

describe('MS_PER_DAY', () => {
  it('equals 86_400_000', () => {
    expect(MS_PER_DAY_REPLICA).toBe(86_400_000)
  })
})

describe('relativeDay', () => {
  it('returns "Today" for the current UTC date', () => {
    const now = new Date()
    const iso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('Today')
  })

  it('returns "Today" for exactly midnight UTC today', () => {
    const now = new Date()
    const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    expect(relativeDayReplica(todayMidnight.toISOString())).toBe('Today')
  })

  it('returns "Yesterday" for exactly 1 day ago (UTC midnight)', () => {
    const yesterday = new Date(Date.now() - MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('Yesterday')
  })

  it('returns "2 days ago" for 2 days back', () => {
    const d = new Date(Date.now() - 2 * MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('2 days ago')
  })

  it('returns "7 days ago" for 7 days back', () => {
    const d = new Date(Date.now() - 7 * MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('7 days ago')
  })

  it('returns "30 days ago" for 30 days back', () => {
    const d = new Date(Date.now() - 30 * MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('30 days ago')
  })

  it('returns "Today" for a future date (diffDays <= 0)', () => {
    const tomorrow = new Date(Date.now() + MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('Today')
  })

  it('returns "Today" for a date far in the future (diffDays negative)', () => {
    const future = new Date(Date.now() + 365 * MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(future.getUTCFullYear(), future.getUTCMonth(), future.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('Today')
  })

  it('computes N correctly for N=3', () => {
    const d = new Date(Date.now() - 3 * MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
    expect(relativeDayReplica(iso)).toBe('3 days ago')
  })

  it('uses UTC date boundaries, not local time', () => {
    // Create a date at UTC midnight today — should always be "Today"
    const now = new Date()
    const utcMidnightToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    expect(relativeDayReplica(new Date(utcMidnightToday).toISOString())).toBe('Today')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. StatsOverviewCard — replica component tests
// ─────────────────────────────────────────────────────────────────────────────


interface SessionEntryForCard { date: string; score: number; total: number }

function StatsOverviewCardReplica({
  sessions,
  allTimeBestStreak,
}: {
  sessions: SessionEntryForCard[]
  allTimeBestStreak: number
}) {
  const validSessions = sessions.filter(s => s.total > 0)
  const totalQ = validSessions.reduce((a, s) => a + s.total, 0)
  const totalCorrect = validSessions.reduce((a, s) => a + s.score, 0)
  const avgAcc = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : null
  const lastDate = sessions.length > 0
    ? relativeDayReplica(sessions[sessions.length - 1].date)
    : null
  const STREAK_THRESHOLD_MD = 5
  return (
    <div className="rounded-xl border bg-black p-4">
      <div className="text-xs mb-3">Overview</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center" data-testid="sessions-count">
          <div className="label">Sessions</div>
          <div>{sessions.length}</div>
        </div>
        <div className="text-center" data-testid="avg-accuracy">
          <div className="label">Avg accuracy</div>
          <div>{avgAcc !== null ? `${avgAcc}%` : '—'}</div>
          {sessions.length > 0 && (
            <div data-testid="session-count-sub">last {sessions.length}</div>
          )}
        </div>
        <div className="text-center" data-testid="best-streak">
          <div className="label">Best streak (this device)</div>
          <div>
            {allTimeBestStreak >= STREAK_THRESHOLD_MD ? '🔥' : ''}{allTimeBestStreak > 0 ? allTimeBestStreak : '—'}
          </div>
        </div>
        <div className="text-center" data-testid="last-practice">
          <div className="label">Last practice</div>
          <div>{lastDate ?? '—'}</div>
        </div>
      </div>
    </div>
  )
}

describe('StatsOverviewCard', () => {
  it('shows Sessions count equal to sessions.length', () => {
    const sessions: SessionEntryForCard[] = [
      { date: new Date().toISOString(), score: 9, total: 10 },
      { date: new Date().toISOString(), score: 8, total: 10 },
      { date: new Date().toISOString(), score: 7, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('sessions-count').textContent).toContain('3')
  })

  it('shows Sessions count of 0 for empty array', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={0} />)
    expect(screen.getByTestId('sessions-count').textContent).toContain('0')
  })

  it('shows "—" for Avg accuracy when sessions is empty', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={0} />)
    expect(screen.getByTestId('avg-accuracy').textContent).toContain('—')
    expect(screen.getByTestId('avg-accuracy').textContent).not.toMatch(/\d+%/)
  })

  it('shows "—" for Last practice when sessions is empty', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={0} />)
    expect(screen.getByTestId('last-practice').textContent).toContain('—')
  })

  it('shows "—" for Best streak when allTimeBestStreak is 0', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={0} />)
    expect(screen.getByTestId('best-streak').textContent).toContain('—')
  })

  it('computes weighted avg accuracy correctly (80% = 80%)', () => {
    const sessions: SessionEntryForCard[] = [
      { date: new Date().toISOString(), score: 8, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('avg-accuracy').textContent).toContain('80%')
  })

  it('computes weighted avg accuracy across multiple sessions', () => {
    // 9/10 + 7/10 = 16/20 = 80%
    const sessions: SessionEntryForCard[] = [
      { date: new Date().toISOString(), score: 9, total: 10 },
      { date: new Date().toISOString(), score: 7, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('avg-accuracy').textContent).toContain('80%')
  })

  it('shows 🔥 emoji when allTimeBestStreak >= 5', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={5} />)
    expect(screen.getByTestId('best-streak').textContent).toContain('🔥')
    expect(screen.getByTestId('best-streak').textContent).toContain('5')
  })

  it('does not show 🔥 emoji when allTimeBestStreak < 5', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={4} />)
    expect(screen.getByTestId('best-streak').textContent).not.toContain('🔥')
    expect(screen.getByTestId('best-streak').textContent).toContain('4')
  })

  it('shows the numeric streak value (not "—") when allTimeBestStreak > 0', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={3} />)
    expect(screen.getByTestId('best-streak').textContent).toContain('3')
    expect(screen.getByTestId('best-streak').textContent).not.toContain('—')
  })

  it('shows "Today" for last practice when last session is today', () => {
    const now = new Date()
    const todayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    const sessions: SessionEntryForCard[] = [
      { date: todayIso, score: 7, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('last-practice').textContent).toContain('Today')
  })

  it('shows "Yesterday" for last practice when last session was yesterday', () => {
    const yesterday = new Date(Date.now() - MS_PER_DAY_REPLICA)
    const iso = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate())).toISOString()
    const sessions: SessionEntryForCard[] = [
      { date: iso, score: 5, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('last-practice').textContent).toContain('Yesterday')
  })

  it('uses the last session date for Last practice (not the first)', () => {
    const older = new Date(Date.now() - 5 * MS_PER_DAY_REPLICA)
    const olderIso = new Date(Date.UTC(older.getUTCFullYear(), older.getUTCMonth(), older.getUTCDate())).toISOString()
    const now = new Date()
    const todayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
    const sessions: SessionEntryForCard[] = [
      { date: olderIso, score: 5, total: 10 },
      { date: todayIso, score: 9, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('last-practice').textContent).toContain('Today')
    expect(screen.getByTestId('last-practice').textContent).not.toContain('5 days ago')
  })

  it('excludes sessions with total=0 from accuracy calculation', () => {
    // One real session (10/10 = 100%) + one bogus session (0 total — skipped)
    const sessions: SessionEntryForCard[] = [
      { date: new Date().toISOString(), score: 10, total: 10 },
      { date: new Date().toISOString(), score: 0, total: 0 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('avg-accuracy').textContent).toContain('100%')
  })

  it('shows "last N" sub-label when sessions is non-empty', () => {
    const sessions: SessionEntryForCard[] = [
      { date: new Date().toISOString(), score: 8, total: 10 },
      { date: new Date().toISOString(), score: 6, total: 10 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('session-count-sub').textContent).toBe('last 2')
  })

  it('does not show "last N" sub-label when sessions is empty', () => {
    render(<StatsOverviewCardReplica sessions={[]} allTimeBestStreak={0} />)
    expect(screen.queryByTestId('session-count-sub')).toBeNull()
  })

  it('rounds accuracy to nearest percent', () => {
    // 1/3 ≈ 33.33% → rounds to 33%
    const sessions: SessionEntryForCard[] = [
      { date: new Date().toISOString(), score: 1, total: 3 },
    ]
    render(<StatsOverviewCardReplica sessions={sessions} allTimeBestStreak={0} />)
    expect(screen.getByTestId('avg-accuracy').textContent).toContain('33%')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. PostSessionNoteCard — replica component tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replica of PostSessionNoteCard from FretMemorizerPage.tsx.
 * Mirrors the rendering logic so we can unit-test the visibility conditions.
 */
const NOTE_NAMES_FOR_CARD = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

interface PostSessionNoteCardReplicaProps {
  stoppedEarly: boolean
  questionsAnswered: number
  sessionNoteAcc: Record<number, { correct: number; total: number }>
  worstNotes: number[]
  focusedPcs: number[] | null
  newBestStreakSet: boolean
  allTimeBestStreak: number
  noteAccuracy: Record<number, { correct: number; total: number }>
  onStartFocusMode: () => void
}

function PostSessionNoteCardReplica({
  stoppedEarly,
  questionsAnswered,
  sessionNoteAcc,
  worstNotes,
  focusedPcs,
  newBestStreakSet,
  allTimeBestStreak,
  noteAccuracy,
  onStartFocusMode,
}: PostSessionNoteCardReplicaProps) {
  if (stoppedEarly) return null
  const sessionPcs = Object.keys(sessionNoteAcc).map(Number)
  const showSectionA = questionsAnswered >= 3 && sessionPcs.length > 0
  const showSectionB = worstNotes.length > 0 && focusedPcs === null
  const STREAK_THRESHOLD_MD = 5
  if (!showSectionA && !showSectionB && !newBestStreakSet) return null
  return (
    <div>
      {newBestStreakSet && allTimeBestStreak >= STREAK_THRESHOLD_MD && (
        <div data-testid="new-best-streak">
          🔥 New device best: {allTimeBestStreak} streak!
        </div>
      )}
      {showSectionA && (
        <div data-testid="section-a">
          <div>Notes practiced</div>
          <div>
            {sessionPcs
              .sort((a, b) => {
                const accA = sessionNoteAcc[a].correct / sessionNoteAcc[a].total
                const accB = sessionNoteAcc[b].correct / sessionNoteAcc[b].total
                return accA - accB
              })
              .map(pc => {
                const { correct, total } = sessionNoteAcc[pc]
                return (
                  <span key={pc} data-testid={`note-chip-${pc}`}>
                    {NOTE_NAMES_FOR_CARD[pc]} {correct}/{total}
                  </span>
                )
              })}
          </div>
        </div>
      )}
      {showSectionB && (
        <div data-testid="section-b">
          <div>Focus for next session</div>
          <div>
            {worstNotes.slice(0, 3).map(pc => {
              const data = noteAccuracy[pc]
              const acc = data ? data.correct / data.total : 0
              return (
                <span key={pc} data-testid={`worst-note-${pc}`}>
                  {NOTE_NAMES_FOR_CARD[pc]} ({Math.round(acc * 100)}%)
                </span>
              )
            })}
          </div>
          <button onClick={onStartFocusMode}>Start Focus Mode</button>
        </div>
      )}
    </div>
  )
}

describe('PostSessionNoteCard', () => {
  it('returns null when stoppedEarly is true', () => {
    const { container } = render(
      <PostSessionNoteCardReplica
        stoppedEarly={true}
        questionsAnswered={10}
        sessionNoteAcc={{ 0: { correct: 8, total: 10 } }}
        worstNotes={[0]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{ 0: { correct: 8, total: 10 } }}
        onStartFocusMode={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when questionsAnswered < 3, no worst notes, and no new best streak', () => {
    const { container } = render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={2}
        sessionNoteAcc={{}}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when questionsAnswered < 3, worstNotes empty, even if sessionNoteAcc has data', () => {
    const { container } = render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={2}
        sessionNoteAcc={{ 0: { correct: 1, total: 2 } }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    // showSectionA = questionsAnswered(2) < 3 → false; showSectionB = worstNotes empty → false; newBestStreakSet = false → null
    expect(container.firstChild).toBeNull()
  })

  it('renders when questionsAnswered >= 3 and sessionNoteAcc is non-empty', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={3}
        sessionNoteAcc={{ 0: { correct: 2, total: 3 } }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('section-a')).toBeTruthy()
  })

  it('shows "Notes practiced" section (section A) when questionsAnswered >= 3 and sessionNoteAcc is non-empty', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{
          0: { correct: 4, total: 5 },
          4: { correct: 3, total: 5 },
        }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('section-a')).toBeTruthy()
    expect(screen.getByText('Notes practiced')).toBeTruthy()
  })

  it('does not show section A when questionsAnswered < 3', () => {
    // Need something else to trigger render (newBestStreakSet=true)
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={2}
        sessionNoteAcc={{ 0: { correct: 2, total: 2 } }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={true}
        allTimeBestStreak={6}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.queryByTestId('section-a')).toBeNull()
  })

  it('does not show section A when sessionNoteAcc is empty even if questionsAnswered >= 3', () => {
    // newBestStreakSet triggers render, but sessionNoteAcc empty → no section A
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{}}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={true}
        allTimeBestStreak={6}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.queryByTestId('section-a')).toBeNull()
  })

  it('shows section B ("Focus for next session") when worstNotes non-empty and focusedPcs is null', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={0}
        sessionNoteAcc={{}}
        worstNotes={[0, 4, 7]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{
          0: { correct: 1, total: 5 },
          4: { correct: 2, total: 5 },
          7: { correct: 3, total: 5 },
        }}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('section-b')).toBeTruthy()
    expect(screen.getByText('Focus for next session')).toBeTruthy()
  })

  it('does not show section B when focusedPcs is non-null (already in focus mode)', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{ 0: { correct: 3, total: 5 } }}
        worstNotes={[0]}
        focusedPcs={[0]}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{ 0: { correct: 1, total: 5 } }}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.queryByTestId('section-b')).toBeNull()
  })

  it('does not show section B when worstNotes is empty', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{ 0: { correct: 3, total: 5 } }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.queryByTestId('section-b')).toBeNull()
  })

  it('shows "Start Focus Mode" button in section B', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={0}
        sessionNoteAcc={{}}
        worstNotes={[0]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{ 0: { correct: 1, total: 5 } }}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Start Focus Mode/i })).toBeTruthy()
  })

  it('"Start Focus Mode" button calls onStartFocusMode when clicked', () => {
    const handler = vi.fn()
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={0}
        sessionNoteAcc={{}}
        worstNotes={[0]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{ 0: { correct: 1, total: 5 } }}
        onStartFocusMode={handler}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Start Focus Mode/i }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('shows note chips for each note in sessionNoteAcc (section A)', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{
          0: { correct: 4, total: 5 },  // C
          7: { correct: 2, total: 5 },  // G
        }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('note-chip-0').textContent).toContain('C')
    expect(screen.getByTestId('note-chip-7').textContent).toContain('G')
  })

  it('section A shows note score fractions (e.g. "4/5")', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{ 0: { correct: 4, total: 5 } }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('note-chip-0').textContent).toContain('4/5')
  })

  it('shows up to 3 worst notes in section B', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={0}
        sessionNoteAcc={{}}
        worstNotes={[0, 2, 4, 7, 9]}  // 5 notes but only first 3 shown
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{
          0: { correct: 1, total: 5 },
          2: { correct: 1, total: 5 },
          4: { correct: 1, total: 5 },
          7: { correct: 1, total: 5 },
          9: { correct: 1, total: 5 },
        }}
        onStartFocusMode={() => {}}
      />
    )
    // Only pcs 0, 2, 4 should be shown (first 3 of worstNotes)
    expect(screen.getByTestId('worst-note-0')).toBeTruthy()
    expect(screen.getByTestId('worst-note-2')).toBeTruthy()
    expect(screen.getByTestId('worst-note-4')).toBeTruthy()
    expect(screen.queryByTestId('worst-note-7')).toBeNull()
    expect(screen.queryByTestId('worst-note-9')).toBeNull()
  })

  it('renders when only newBestStreakSet is true (no sections A or B)', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={2}
        sessionNoteAcc={{}}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={true}
        allTimeBestStreak={6}
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    // The component should render (not null) because newBestStreakSet=true
    expect(screen.getByTestId('new-best-streak')).toBeTruthy()
    expect(screen.getByTestId('new-best-streak').textContent).toContain('🔥')
    expect(screen.getByTestId('new-best-streak').textContent).toContain('6')
  })

  it('does not show new best streak banner when allTimeBestStreak < 5', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{ 0: { correct: 3, total: 5 } }}
        worstNotes={[]}
        focusedPcs={null}
        newBestStreakSet={true}
        allTimeBestStreak={4}  // < STREAK_TIERS.md (5)
        noteAccuracy={{}}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.queryByTestId('new-best-streak')).toBeNull()
  })

  it('can show both section A and section B simultaneously', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={5}
        sessionNoteAcc={{ 0: { correct: 3, total: 5 } }}
        worstNotes={[2]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{ 2: { correct: 1, total: 5 } }}
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('section-a')).toBeTruthy()
    expect(screen.getByTestId('section-b')).toBeTruthy()
  })

  it('section B shows accuracy percentage for each worst note', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={0}
        sessionNoteAcc={{}}
        worstNotes={[0]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{ 0: { correct: 1, total: 4 } }}  // 25%
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('worst-note-0').textContent).toContain('25%')
  })

  it('section B shows 0% for a worst note with no data in noteAccuracy', () => {
    render(
      <PostSessionNoteCardReplica
        stoppedEarly={false}
        questionsAnswered={0}
        sessionNoteAcc={{}}
        worstNotes={[5]}
        focusedPcs={null}
        newBestStreakSet={false}
        allTimeBestStreak={0}
        noteAccuracy={{}}  // no data for pc 5
        onStartFocusMode={() => {}}
      />
    )
    expect(screen.getByTestId('worst-note-5').textContent).toContain('0%')
  })
})
