import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

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

vi.mock('../api/fretMemorizerApi', () => ({
  saveScore: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/audio/pluckString', () => ({
  pluckString: vi.fn(),
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
