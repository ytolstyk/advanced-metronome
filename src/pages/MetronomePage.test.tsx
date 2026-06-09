import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock AWS Amplify UI (useAuthenticator) ────────────────────────────────
// MetronomePage uses useAuthenticator to decide when to save prefs to cloud.
// Without this mock the component throws "must be inside Authenticator.Provider".

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'unauthenticated' }),
  Authenticator: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

// ── Mock metronomeApi (prevent real localStorage / cloud calls in tests) ──

vi.mock('@/api/metronomeApi', () => ({
  loadMetronomePrefs: vi.fn().mockResolvedValue(null),
  saveMetronomePrefs: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock ClickTrackEngine before importing the page ────────────────────────

const mockStart = vi.fn()
const mockStop = vi.fn()
const mockPause = vi.fn()
const mockResume = vi.fn()
const mockDestroy = vi.fn()

vi.mock('@/audio/ClickTrackEngine', () => {
  class ClickTrackEngine {
    start = mockStart
    stop = mockStop
    pause = mockPause
    resume = mockResume
    destroy = mockDestroy
  }
  return { ClickTrackEngine }
})

// ── Import the page after mocking ─────────────────────────────────────────

import { MetronomePage } from './MetronomePage'

// ── Re-import helpers under test ──────────────────────────────────────────
// toTrackPieces and subTickToBeat are not exported, so we test their
// behaviour through the observable component outputs AND by duplicating the
// pure logic here (see dedicated describe blocks below that replicate the
// functions exactly so we can unit-test them in isolation).

import { subsPerBeat } from '@/audio/clickMath'
import type { SubdivisionLabel } from '@/audio/ClickTrackEngine'

// ── Pure-logic replicas (copied from MetronomePage.tsx) ───────────────────

const MIN_BPM = 40
const MAX_BPM = 300
const COLORS = ['#6ee7b7', '#93c5fd', '#fca5a5', '#fcd34d', '#c4b5fd', '#fb923c', '#34d399', '#60a5fa']

type Denominator = 2 | 4 | 8

interface MeasureConfig {
  id: string
  bpm: number
  numerator: number
  denominator: Denominator
  subdivision: SubdivisionLabel
  repeats: number
}

function clampBpm(v: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, v))
}

function toTrackPieces(measures: MeasureConfig[]) {
  return measures.map((m, i) => ({
    id: m.id,
    label: `Measure ${i + 1}`,
    color: COLORS[i % COLORS.length],
    groupId: null,
    timeSignature: { numerator: m.numerator, denominator: m.denominator },
    subdivision: m.subdivision,
    bpm: m.bpm,
    repeats: m.repeats,
  }))
}

function subTickToBeat(subTick: number, sub: SubdivisionLabel, numerator: number): number {
  const sps = subsPerBeat(sub, numerator)
  if (sps <= 0) return 0
  return Math.min(numerator - 1, Math.floor(subTick / sps))
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── 1. Page renders in simple mode by default ──────────────────────────────

describe('MetronomePage – initial render (simple mode)', () => {
  it('renders the mode toggle with Simple and Advanced buttons', () => {
    render(<MetronomePage />)
    const group = screen.getByRole('group', { name: /metronome mode/i })
    expect(within(group).getByRole('button', { name: /simple/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /advanced/i })).toBeInTheDocument()
  })

  it('has the Simple button active by default', () => {
    render(<MetronomePage />)
    const simpleBtn = screen.getByRole('button', { name: /simple/i })
    expect(simpleBtn.className).toContain('active')
  })

  it('does not have the Advanced button active by default', () => {
    render(<MetronomePage />)
    const advBtn = screen.getByRole('button', { name: /advanced/i })
    expect(advBtn.className).not.toContain('active')
  })

  it('displays the BPM value (120 by default)', () => {
    render(<MetronomePage />)
    // The BPM numeric value is rendered in a .metronome-bpm-value span
    const bpmDisplay = document.querySelector('.metronome-bpm-value')
    expect(bpmDisplay).toBeInTheDocument()
    expect(bpmDisplay?.textContent).toBe('120')
  })

  it('renders the BPM slider', () => {
    render(<MetronomePage />)
    // Radix Slider renders role="slider" with aria-valuemin/max matching BPM range
    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuemin', '40')
    expect(slider).toHaveAttribute('aria-valuemax', '300')
  })

  it('renders the Play button with correct label', () => {
    render(<MetronomePage />)
    expect(screen.getByRole('button', { name: /start metronome/i })).toBeInTheDocument()
  })

  it('does not show measure cards in simple mode', () => {
    render(<MetronomePage />)
    expect(screen.queryByText(/measure 1/i)).not.toBeInTheDocument()
  })

  it('does not show Add Measure button in simple mode', () => {
    render(<MetronomePage />)
    expect(screen.queryByRole('button', { name: /add measure/i })).not.toBeInTheDocument()
  })
})

// ── 2. Switching to Advanced mode ─────────────────────────────────────────

describe('MetronomePage – switching to Advanced mode', () => {
  it('shows at least one measure card after clicking Advanced', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByText('Measure 1')).toBeInTheDocument()
  })

  it('shows the Add Measure button in advanced mode', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByRole('button', { name: /add measure/i })).toBeInTheDocument()
  })

  it('marks the Advanced button as active after switching', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByRole('button', { name: /advanced/i }).className).toContain('active')
  })

  it('removes simple-mode controls (BPM slider) after switching', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    // Slider is in SimpleControls which is not rendered in advanced mode
    expect(screen.queryByRole('slider', { name: /bpm/i })).not.toBeInTheDocument()
  })
})

// ── 3. Adding a measure in Advanced mode ──────────────────────────────────

describe('MetronomePage – adding measures in Advanced mode', () => {
  it('starts with one measure card', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getAllByText(/^Measure \d+$/)).toHaveLength(1)
  })

  it('adds a second measure card after clicking Add Measure once', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.click(screen.getByRole('button', { name: /add measure/i }))
    expect(screen.getAllByText(/^Measure \d+$/)).toHaveLength(2)
  })

  it('adds multiple measure cards sequentially', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    const addBtn = screen.getByRole('button', { name: /add measure/i })
    await user.click(addBtn)
    await user.click(addBtn)
    await user.click(addBtn)
    expect(screen.getAllByText(/^Measure \d+$/)).toHaveLength(4)
  })

  it('hides Add Measure button when 16 measures are present', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    // Add 15 more (already have 1)
    for (let i = 0; i < 15; i++) {
      // button disappears at 16, so we can only click up to that point
      const addBtn = screen.queryByRole('button', { name: /add measure/i })
      if (!addBtn) break
      await user.click(addBtn)
    }
    expect(screen.queryByRole('button', { name: /add measure/i })).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Measure \d+$/)).toHaveLength(16)
  })
})

// ── 4. Deleting a measure ──────────────────────────────────────────────────

describe('MetronomePage – deleting measures in Advanced mode', () => {
  it('hides the delete button when only one measure remains', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    // With 1 measure, delete button should not exist
    expect(screen.queryByRole('button', { name: /delete measure/i })).not.toBeInTheDocument()
  })

  it('shows delete buttons when two or more measures exist', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.click(screen.getByRole('button', { name: /add measure/i }))
    const deleteBtns = screen.getAllByRole('button', { name: /delete measure/i })
    expect(deleteBtns).toHaveLength(2)
  })

  it('removes the correct measure when delete is clicked', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.click(screen.getByRole('button', { name: /add measure/i }))
    // Should now have Measure 1 and Measure 2
    expect(screen.getAllByText(/^Measure \d+$/)).toHaveLength(2)
    // Delete the first measure
    const [firstDeleteBtn] = screen.getAllByRole('button', { name: /delete measure/i })
    await user.click(firstDeleteBtn)
    expect(screen.getAllByText(/^Measure \d+$/)).toHaveLength(1)
  })

  it('hides delete button after deleting down to one measure', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.click(screen.getByRole('button', { name: /add measure/i }))
    const [firstDeleteBtn] = screen.getAllByRole('button', { name: /delete measure/i })
    await user.click(firstDeleteBtn)
    expect(screen.queryByRole('button', { name: /delete measure/i })).not.toBeInTheDocument()
  })
})

// ── 5. toTrackPieces conversion ────────────────────────────────────────────

describe('toTrackPieces', () => {
  it('maps a single measure to a TrackPiece with correct label and index', () => {
    const measures: MeasureConfig[] = [
      { id: 'abc', bpm: 120, numerator: 4, denominator: 4, subdivision: 'quarter', repeats: 1 },
    ]
    const pieces = toTrackPieces(measures)
    expect(pieces).toHaveLength(1)
    expect(pieces[0].label).toBe('Measure 1')
    expect(pieces[0].id).toBe('abc')
  })

  it('maps bpm, timeSignature, subdivision and repeats correctly', () => {
    const measures: MeasureConfig[] = [
      { id: 'm1', bpm: 80, numerator: 6, denominator: 8, subdivision: 'eighth', repeats: 3 },
    ]
    const [piece] = toTrackPieces(measures)
    expect(piece.bpm).toBe(80)
    expect(piece.timeSignature).toEqual({ numerator: 6, denominator: 8 })
    expect(piece.subdivision).toBe('eighth')
    expect(piece.repeats).toBe(3)
  })

  it('assigns groupId as null for all pieces', () => {
    const measures: MeasureConfig[] = [
      { id: 'x', bpm: 120, numerator: 4, denominator: 4, subdivision: 'quarter', repeats: 1 },
      { id: 'y', bpm: 90, numerator: 3, denominator: 4, subdivision: 'quarter', repeats: 2 },
    ]
    const pieces = toTrackPieces(measures)
    expect(pieces[0].groupId).toBeNull()
    expect(pieces[1].groupId).toBeNull()
  })

  it('assigns colors cycling through the COLORS array', () => {
    const measures: MeasureConfig[] = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      bpm: 120,
      numerator: 4,
      denominator: 4 as Denominator,
      subdivision: 'quarter' as SubdivisionLabel,
      repeats: 1,
    }))
    const pieces = toTrackPieces(measures)
    expect(pieces[0].color).toBe(COLORS[0])
    expect(pieces[7].color).toBe(COLORS[7])
    // Index 8 wraps back to COLORS[0]
    expect(pieces[8].color).toBe(COLORS[0])
    // Index 9 wraps to COLORS[1]
    expect(pieces[9].color).toBe(COLORS[1])
  })

  it('labels measures with 1-based indices', () => {
    const measures: MeasureConfig[] = [
      { id: 'a', bpm: 100, numerator: 4, denominator: 4, subdivision: 'quarter', repeats: 1 },
      { id: 'b', bpm: 110, numerator: 4, denominator: 4, subdivision: 'quarter', repeats: 1 },
      { id: 'c', bpm: 130, numerator: 4, denominator: 4, subdivision: 'quarter', repeats: 1 },
    ]
    const pieces = toTrackPieces(measures)
    expect(pieces.map((p) => p.label)).toEqual(['Measure 1', 'Measure 2', 'Measure 3'])
  })

  it('returns an empty array when given no measures', () => {
    expect(toTrackPieces([])).toEqual([])
  })
})

// ── 6. subTickToBeat helper ────────────────────────────────────────────────

describe('subTickToBeat', () => {
  // quarter subdivision: subsPerBeat = 1, so subTick === beat index
  describe('quarter subdivision (1 sub per beat)', () => {
    it('returns 0 for subTick 0', () => {
      expect(subTickToBeat(0, 'quarter', 4)).toBe(0)
    })
    it('returns 1 for subTick 1', () => {
      expect(subTickToBeat(1, 'quarter', 4)).toBe(1)
    })
    it('returns 3 for subTick 3 in 4/4', () => {
      expect(subTickToBeat(3, 'quarter', 4)).toBe(3)
    })
    it('clamps to numerator-1 when subTick exceeds measure', () => {
      expect(subTickToBeat(99, 'quarter', 4)).toBe(3)
    })
  })

  // eighth subdivision: subsPerBeat = 2
  describe('eighth subdivision (2 subs per beat)', () => {
    it('returns beat 0 for subTick 0', () => {
      expect(subTickToBeat(0, 'eighth', 4)).toBe(0)
    })
    it('returns beat 0 for subTick 1 (still in first beat)', () => {
      expect(subTickToBeat(1, 'eighth', 4)).toBe(0)
    })
    it('returns beat 1 for subTick 2', () => {
      expect(subTickToBeat(2, 'eighth', 4)).toBe(1)
    })
    it('returns beat 3 for subTick 6', () => {
      expect(subTickToBeat(6, 'eighth', 4)).toBe(3)
    })
    it('returns beat 3 for subTick 7 (last sub of measure)', () => {
      expect(subTickToBeat(7, 'eighth', 4)).toBe(3)
    })
  })

  // sixteenth subdivision: subsPerBeat = 4
  describe('sixteenth subdivision (4 subs per beat)', () => {
    it('returns beat 0 for subTick 0–3', () => {
      for (let i = 0; i <= 3; i++) {
        expect(subTickToBeat(i, 'sixteenth', 4)).toBe(0)
      }
    })
    it('returns beat 1 for subTick 4', () => {
      expect(subTickToBeat(4, 'sixteenth', 4)).toBe(1)
    })
    it('returns beat 2 for subTick 8', () => {
      expect(subTickToBeat(8, 'sixteenth', 4)).toBe(2)
    })
    it('returns beat 3 for subTick 15', () => {
      expect(subTickToBeat(15, 'sixteenth', 4)).toBe(3)
    })
  })

  // quarter-triplet subdivision: subsPerBeat = 3
  describe('quarter-triplet subdivision (3 subs per beat)', () => {
    it('returns beat 0 for subTick 0–2', () => {
      for (let i = 0; i <= 2; i++) {
        expect(subTickToBeat(i, 'quarter-triplet', 4)).toBe(0)
      }
    })
    it('returns beat 1 for subTick 3', () => {
      expect(subTickToBeat(3, 'quarter-triplet', 4)).toBe(1)
    })
  })

  // 6/8 time signature: numerator = 6
  describe('6-beat numerator with eighth subdivision', () => {
    it('returns beat 5 for subTick 10 (last beat pair in 6/8)', () => {
      expect(subTickToBeat(10, 'eighth', 6)).toBe(5)
    })
    it('clamps correctly to beat 5', () => {
      expect(subTickToBeat(99, 'eighth', 6)).toBe(5)
    })
  })

  // Edge: whole subdivision returns 1/numerator subs per beat,
  // which for 4 beats is 0.25 — subsPerBeat returns 0.25 (> 0),
  // so floor(0 / 0.25) = 0
  describe('whole subdivision', () => {
    it('returns beat 0 for subTick 0', () => {
      expect(subTickToBeat(0, 'whole', 4)).toBe(0)
    })
  })
})

// ── 7. BPM clamp stays within [40, 300] ───────────────────────────────────

describe('clampBpm', () => {
  it('returns the value unchanged when within range', () => {
    expect(clampBpm(120)).toBe(120)
    expect(clampBpm(40)).toBe(40)
    expect(clampBpm(300)).toBe(300)
  })

  it('clamps values below 40 to 40', () => {
    expect(clampBpm(0)).toBe(40)
    expect(clampBpm(-100)).toBe(40)
    expect(clampBpm(39)).toBe(40)
  })

  it('clamps values above 300 to 300', () => {
    expect(clampBpm(500)).toBe(300)
    expect(clampBpm(301)).toBe(300)
    expect(clampBpm(999)).toBe(300)
  })

  it('handles boundary values exactly', () => {
    expect(clampBpm(40)).toBe(40)
    expect(clampBpm(300)).toBe(300)
  })
})

// ── 8. Play/Stop integration (engine mock) ────────────────────────────────

describe('MetronomePage – play/stop using mocked ClickTrackEngine', () => {
  it('calls engine.start when Play button is clicked', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    expect(mockStart).toHaveBeenCalledOnce()
  })

  it('shows Stop button after clicking Play', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    expect(screen.getByRole('button', { name: /stop metronome/i })).toBeInTheDocument()
  })

  it('calls engine.stop when Stop button is clicked', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    // engine.stop is also called inside engine.start (the implementation calls this.stop() first)
    // so we clear and track from here
    mockStop.mockClear()
    await user.click(screen.getByRole('button', { name: /stop metronome/i }))
    expect(mockStop).toHaveBeenCalled()
  })

  it('shows Play button again after stopping', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    await user.click(screen.getByRole('button', { name: /stop metronome/i }))
    expect(screen.getByRole('button', { name: /start metronome/i })).toBeInTheDocument()
  })

  it('passes pieces array to engine.start when called in simple mode', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    const pieces = mockStart.mock.calls[0][0] as Array<{ bpm: number; label: string }>
    expect(Array.isArray(pieces)).toBe(true)
    expect(pieces).toHaveLength(1)
    expect(pieces[0].bpm).toBe(120)
    expect(pieces[0].label).toBe('Measure 1')
  })

  it('passes multiple pieces to engine.start when in advanced mode with 2 measures', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.click(screen.getByRole('button', { name: /add measure/i }))
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    const pieces = mockStart.mock.calls[0][0] as Array<{ label: string }>
    expect(pieces).toHaveLength(2)
    expect(pieces[1].label).toBe('Measure 2')
  })

  it('stops playback when switching mode while playing', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /start metronome/i }))
    mockStop.mockClear()
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    expect(mockStop).toHaveBeenCalled()
    // Play button should be back
    expect(screen.getByRole('button', { name: /start metronome/i })).toBeInTheDocument()
  })
})

// ── 9. Tap Tempo ──────────────────────────────────────────────────────────

describe('MetronomePage – Tap Tempo button', () => {
  it('renders the Tap Tempo button in simple mode', () => {
    render(<MetronomePage />)
    expect(screen.getByRole('button', { name: /tap tempo/i })).toBeInTheDocument()
  })

  it('does not crash when clicked once (not enough taps yet)', async () => {
    const user = userEvent.setup()
    render(<MetronomePage />)
    await user.click(screen.getByRole('button', { name: /tap tempo/i }))
    // BPM should remain 120 after a single tap (two needed to compute interval)
    const bpmDisplay = document.querySelector('.metronome-bpm-value')
    expect(bpmDisplay?.textContent).toBe('120')
  })

  it('updates BPM after two rapid taps at ~120 BPM interval', () => {
    // Use fake timers so Date.now() is fully controlled and nothing else
    // consumes the mocked return values.
    vi.useFakeTimers()
    render(<MetronomePage />)
    const tapBtn = screen.getByRole('button', { name: /tap tempo/i })

    vi.setSystemTime(1_000_000)
    fireEvent.click(tapBtn)
    vi.setSystemTime(1_000_500) // 500ms later → 120 BPM
    fireEvent.click(tapBtn)

    vi.useRealTimers()

    // 60000/500 = 120 BPM; the metronome-bpm-value span shows the BPM
    const bpmDisplay = document.querySelector('.metronome-bpm-value')
    expect(bpmDisplay?.textContent).toBe('120')
  })

  it('clamps tap-derived BPM to MAX_BPM when tapping very fast', () => {
    vi.useFakeTimers()
    render(<MetronomePage />)
    const tapBtn = screen.getByRole('button', { name: /tap tempo/i })

    // Tap twice 100ms apart → 60000/100 = 600 BPM, clamped to 300
    vi.setSystemTime(1_000_000)
    fireEvent.click(tapBtn)
    vi.setSystemTime(1_000_100)
    fireEvent.click(tapBtn)

    vi.useRealTimers()

    const bpmDisplay = document.querySelector('.metronome-bpm-value')
    expect(bpmDisplay?.textContent).toBe('300')
  })

  it('clamps tap-derived BPM to MIN_BPM when tapping very slowly', () => {
    vi.useFakeTimers()
    render(<MetronomePage />)
    const tapBtn = screen.getByRole('button', { name: /tap tempo/i })

    // Tap twice 3 seconds apart → 60000/3000 = 20 BPM, clamped to 40
    vi.setSystemTime(1_000_000)
    fireEvent.click(tapBtn)
    vi.setSystemTime(1_003_000)
    fireEvent.click(tapBtn)

    vi.useRealTimers()

    const bpmDisplay = document.querySelector('.metronome-bpm-value')
    expect(bpmDisplay?.textContent).toBe('40')
  })
})
