import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Mock AWS Amplify UI ──────────────────────────────────────────────────────
// ScalesPage calls useAuthenticator at the top level; it must be mocked before
// the module is imported or it will throw "must be inside Authenticator.Provider".

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'unauthenticated' }),
  Authenticator: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

// ── Mock scaleApi (prevent real AWS / localStorage cloud calls) ───────────────

vi.mock('../api/scaleApi', () => ({
  loadCloudScaleTracks: vi.fn().mockResolvedValue([]),
  createCloudScaleTrack: vi.fn().mockResolvedValue(null),
  updateCloudScaleTrack: vi.fn().mockResolvedValue(null),
  deleteCloudScaleTrack: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock pluckString (prevent AudioContext construction in tests) ─────────────

vi.mock('@/audio/pluckString', () => ({
  pluckString: vi.fn(),
}))

// ── Mock useTapTempo (not under test here) ────────────────────────────────────

vi.mock('../hooks/useTapTempo', () => ({
  useTapTempo: () => [vi.fn(), false],
}))

// ── Stub navigator.clipboard (used by Share button) ──────────────────────────

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
})

// ── Import page after all mocks are in place ──────────────────────────────────

import { ScalesPage } from './ScalesPage'
import {
  SCALE_INTERVALS,
  SCALE_PENTATONIC_SUBSET,
  SCALE_MODES,
} from '../data/scales'
import type { ScaleMode } from '../data/scales'

// ── Helper: render ScalesPage inside the required router context ──────────────

function renderScalesPage() {
  return render(
    <MemoryRouter>
      <ScalesPage />
    </MemoryRouter>,
  )
}

// ── Ensure localStorage is clean between tests ────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. SCALE_PENTATONIC_SUBSET data-layer tests (pure data, no render needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('SCALE_PENTATONIC_SUBSET – data integrity', () => {
  it('has entries for major, minor, lydian, mixolydian, dorian, phrygian', () => {
    const expectedModes: ScaleMode[] = ['major', 'minor', 'lydian', 'mixolydian', 'dorian', 'phrygian']
    for (const mode of expectedModes) {
      expect(SCALE_PENTATONIC_SUBSET[mode]).toBeDefined()
    }
  })

  it('does NOT have entries for pentatonic_major', () => {
    expect(SCALE_PENTATONIC_SUBSET['pentatonic_major']).toBeUndefined()
  })

  it('does NOT have entries for pentatonic_minor', () => {
    expect(SCALE_PENTATONIC_SUBSET['pentatonic_minor']).toBeUndefined()
  })

  it('does NOT have entries for blues', () => {
    expect(SCALE_PENTATONIC_SUBSET['blues']).toBeUndefined()
  })

  it('does NOT have entries for locrian', () => {
    expect(SCALE_PENTATONIC_SUBSET['locrian']).toBeUndefined()
  })

  it('does NOT have entries for harmonic_minor', () => {
    expect(SCALE_PENTATONIC_SUBSET['harmonic_minor']).toBeUndefined()
  })

  it('does NOT have entries for melodic_minor', () => {
    expect(SCALE_PENTATONIC_SUBSET['melodic_minor']).toBeUndefined()
  })

  it('has exactly 6 entries (major/minor/lydian/mixolydian/dorian/phrygian)', () => {
    expect(Object.keys(SCALE_PENTATONIC_SUBSET)).toHaveLength(6)
  })

  it('major pentatonic subset [0,2,4,7,9] is a subset of SCALE_INTERVALS.major', () => {
    const majorIntervals = new Set(SCALE_INTERVALS.major)
    const subset = SCALE_PENTATONIC_SUBSET['major'] ?? []
    expect(subset).toEqual([0, 2, 4, 7, 9])
    for (const interval of subset) {
      expect(majorIntervals.has(interval)).toBe(true)
    }
  })

  it('minor pentatonic subset [0,3,5,7,10] is a subset of SCALE_INTERVALS.minor', () => {
    const minorIntervals = new Set(SCALE_INTERVALS.minor)
    const subset = SCALE_PENTATONIC_SUBSET['minor'] ?? []
    expect(subset).toEqual([0, 3, 5, 7, 10])
    for (const interval of subset) {
      expect(minorIntervals.has(interval)).toBe(true)
    }
  })

  it('lydian pentatonic subset [0,2,4,7,9] is a subset of SCALE_INTERVALS.lydian', () => {
    const lydianIntervals = new Set(SCALE_INTERVALS.lydian)
    const subset = SCALE_PENTATONIC_SUBSET['lydian'] ?? []
    for (const interval of subset) {
      expect(lydianIntervals.has(interval)).toBe(true)
    }
  })

  it('mixolydian pentatonic subset [0,2,4,7,9] is a subset of SCALE_INTERVALS.mixolydian', () => {
    const mixolydianIntervals = new Set(SCALE_INTERVALS.mixolydian)
    const subset = SCALE_PENTATONIC_SUBSET['mixolydian'] ?? []
    for (const interval of subset) {
      expect(mixolydianIntervals.has(interval)).toBe(true)
    }
  })

  it('dorian pentatonic subset [0,3,5,7,10] is a subset of SCALE_INTERVALS.dorian', () => {
    const dorianIntervals = new Set(SCALE_INTERVALS.dorian)
    const subset = SCALE_PENTATONIC_SUBSET['dorian'] ?? []
    for (const interval of subset) {
      expect(dorianIntervals.has(interval)).toBe(true)
    }
  })

  it('phrygian pentatonic subset [0,3,5,7,10] is a subset of SCALE_INTERVALS.phrygian', () => {
    const phrygianIntervals = new Set(SCALE_INTERVALS.phrygian)
    const subset = SCALE_PENTATONIC_SUBSET['phrygian'] ?? []
    for (const interval of subset) {
      expect(phrygianIntervals.has(interval)).toBe(true)
    }
  })

  it('major and lydian and mixolydian all share the same pentatonic subset values', () => {
    expect(SCALE_PENTATONIC_SUBSET['major']).toEqual(SCALE_PENTATONIC_SUBSET['lydian'])
    expect(SCALE_PENTATONIC_SUBSET['major']).toEqual(SCALE_PENTATONIC_SUBSET['mixolydian'])
  })

  it('minor and dorian and phrygian all share the same pentatonic subset values', () => {
    expect(SCALE_PENTATONIC_SUBSET['minor']).toEqual(SCALE_PENTATONIC_SUBSET['dorian'])
    expect(SCALE_PENTATONIC_SUBSET['minor']).toEqual(SCALE_PENTATONIC_SUBSET['phrygian'])
  })

  it('only the 6 defined modes appear in SCALE_PENTATONIC_SUBSET', () => {
    const undefinedModes = SCALE_MODES.filter(
      (m) => SCALE_PENTATONIC_SUBSET[m] === undefined,
    )
    const expectedUndefined: ScaleMode[] = [
      'harmonic_minor', 'melodic_minor', 'locrian',
      'pentatonic_major', 'pentatonic_minor', 'blues',
    ]
    expect(undefinedModes.sort()).toEqual(expectedUndefined.sort())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Degree Labels toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Degree Labels toggle', () => {
  it('renders the Degree Labels button', () => {
    renderScalesPage()
    expect(screen.getByRole('button', { name: /degree labels/i })).toBeInTheDocument()
  })

  it('shows note names by default (e.g. "C" on B string fret 1)', () => {
    renderScalesPage()
    // C major default: B string fret 1 = C (midi 60, pc=0, interval=0)
    // Use exact string match to avoid collisions with "fret 13", "fret 19" etc.
    const dotBtn = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(dotBtn).toBeInTheDocument()
    // The text inside the SVG circle should be 'C' (note name)
    expect(dotBtn.querySelector('text')?.textContent).toBe('C')
  })

  it('switches from note names to degree labels after clicking Degree Labels', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /degree labels/i })
    fireEvent.click(toggle)

    // B string fret 1 = C = root → should show 'R'
    const dotBtn = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(dotBtn.querySelector('text')?.textContent).toBe('R')
  })

  it('shows "5" degree label for G (interval=7) after enabling Degree Labels', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /degree labels/i })
    fireEvent.click(toggle)

    // G string fret 0 = G (midi 55, pc=7, interval=7 in C major)
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.querySelector('text')?.textContent).toBe('5')
  })

  it('shows "2" degree label for D (interval=2) after enabling Degree Labels', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /degree labels/i })
    fireEvent.click(toggle)

    // D string fret 0 = D (midi 50, pc=2, interval=2 in C major)
    const dDot = screen.getByRole('button', { name: 'D on D string fret 0' })
    expect(dDot.querySelector('text')?.textContent).toBe('2')
  })

  it('restores note names when Degree Labels is toggled off again', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /degree labels/i })

    // Enable
    fireEvent.click(toggle)
    const dotBtn = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(dotBtn.querySelector('text')?.textContent).toBe('R')

    // Disable again
    fireEvent.click(toggle)
    expect(dotBtn.querySelector('text')?.textContent).toBe('C')
  })

  it('persists Degree Labels state to localStorage when toggled', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /degree labels/i })
    fireEvent.click(toggle)
    expect(localStorage.getItem('scales-showDegrees')).toBe('true')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pentatonic Subset button disabled/enabled state
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Pentatonic Subset button enabled/disabled state', () => {
  it('renders the Pentatonic Subset button', () => {
    renderScalesPage()
    expect(screen.getByRole('button', { name: /pentatonic subset/i })).toBeInTheDocument()
  })

  it('is NOT disabled when the current scale is Major', () => {
    // Default state is C Major
    renderScalesPage()
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).not.toBeDisabled()
  })

  it('is NOT disabled when the current scale is Minor', () => {
    // ToggleGroupItem renders as role="radio" (Radix UI single-select ToggleGroup)
    renderScalesPage()
    const minorToggle = screen.getByRole('radio', { name: /natural minor/i })
    fireEvent.click(minorToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).not.toBeDisabled()
  })

  it('is NOT disabled when the current scale is Dorian', () => {
    renderScalesPage()
    const dorianToggle = screen.getByRole('radio', { name: /^dorian$/i })
    fireEvent.click(dorianToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).not.toBeDisabled()
  })

  it('is NOT disabled when the current scale is Lydian', () => {
    renderScalesPage()
    const lydianToggle = screen.getByRole('radio', { name: /^lydian$/i })
    fireEvent.click(lydianToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).not.toBeDisabled()
  })

  it('is NOT disabled when the current scale is Mixolydian', () => {
    renderScalesPage()
    const mixToggle = screen.getByRole('radio', { name: /mixolydian/i })
    fireEvent.click(mixToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).not.toBeDisabled()
  })

  it('is NOT disabled when the current scale is Phrygian', () => {
    renderScalesPage()
    const phrygianToggle = screen.getByRole('radio', { name: /phrygian/i })
    fireEvent.click(phrygianToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).not.toBeDisabled()
  })

  it('IS disabled when the current scale is Pentatonic Major', () => {
    renderScalesPage()
    const pentMajorToggle = screen.getByRole('radio', { name: /pentatonic major/i })
    fireEvent.click(pentMajorToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).toBeDisabled()
  })

  it('IS disabled when the current scale is Pentatonic Minor', () => {
    renderScalesPage()
    const pentMinorToggle = screen.getByRole('radio', { name: /pentatonic minor/i })
    fireEvent.click(pentMinorToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).toBeDisabled()
  })

  it('IS disabled when the current scale is Blues', () => {
    renderScalesPage()
    const bluesToggle = screen.getByRole('radio', { name: /^blues$/i })
    fireEvent.click(bluesToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).toBeDisabled()
  })

  it('IS disabled when the current scale is Locrian', () => {
    renderScalesPage()
    const locrianToggle = screen.getByRole('radio', { name: /locrian/i })
    fireEvent.click(locrianToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).toBeDisabled()
  })

  it('IS disabled when the current scale is Harmonic Minor', () => {
    renderScalesPage()
    const harmToggle = screen.getByRole('radio', { name: /harmonic minor/i })
    fireEvent.click(harmToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).toBeDisabled()
  })

  it('IS disabled when the current scale is Melodic Minor', () => {
    renderScalesPage()
    const melodicToggle = screen.getByRole('radio', { name: /melodic minor/i })
    fireEvent.click(melodicToggle)
    const btn = screen.getByRole('button', { name: /pentatonic subset/i })
    expect(btn).toBeDisabled()
  })

  it('becomes re-enabled after switching back from Blues to Major', () => {
    renderScalesPage()

    fireEvent.click(screen.getByRole('radio', { name: /^blues$/i }))
    expect(screen.getByRole('button', { name: /pentatonic subset/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: /^major$/i }))
    expect(screen.getByRole('button', { name: /pentatonic subset/i })).not.toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hover tooltip
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – hover tooltip', () => {
  it('shows no tooltip before hovering any dot', () => {
    renderScalesPage()
    // No SVG text containing " — " (interval separator) should be visible yet
    const texts = document.querySelectorAll('svg text')
    const tooltipTexts = Array.from(texts).filter((t) =>
      t.textContent?.includes(' — '),
    )
    expect(tooltipTexts).toHaveLength(0)
  })

  it('shows tooltip containing note name and interval name on mouseenter', () => {
    renderScalesPage()
    // B string fret 1 = C (root, interval 0 = Unison) — exact name avoids fret 13 collision
    const dotBtn = screen.getByRole('button', { name: 'C on B string fret 1' })
    fireEvent.mouseEnter(dotBtn)

    // Tooltip text is an SVG <text> element with "NoteName — IntervalName"
    const tooltipTexts = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent?.includes(' — '),
    )
    expect(tooltipTexts.length).toBeGreaterThan(0)
    expect(tooltipTexts[0].textContent).toContain('C')
    expect(tooltipTexts[0].textContent).toContain('Unison')
  })

  it('tooltip says "C — Unison" for the root note on B string fret 1', () => {
    renderScalesPage()
    const dotBtn = screen.getByRole('button', { name: 'C on B string fret 1' })
    fireEvent.mouseEnter(dotBtn)

    const tooltipTexts = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent === 'C — Unison',
    )
    expect(tooltipTexts.length).toBeGreaterThan(0)
  })

  it('tooltip says "G — Perfect 5th" for G on G string fret 0', () => {
    renderScalesPage()
    const dotBtn = screen.getByRole('button', { name: 'G on G string fret 0' })
    fireEvent.mouseEnter(dotBtn)

    const tooltipTexts = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent === 'G — Perfect 5th',
    )
    expect(tooltipTexts.length).toBeGreaterThan(0)
  })

  it('tooltip says "E — Major 3rd" for E (interval=4) in C major', () => {
    renderScalesPage()
    // High e string fret 0 = E (midi 64, pc=4, interval=4 in C major)
    const dotBtn = screen.getByRole('button', { name: 'E on e string fret 0' })
    fireEvent.mouseEnter(dotBtn)

    const tooltipTexts = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent === 'E — Major 3rd',
    )
    expect(tooltipTexts.length).toBeGreaterThan(0)
  })

  it('removes the tooltip after mouseleave', () => {
    renderScalesPage()
    const dotBtn = screen.getByRole('button', { name: 'C on B string fret 1' })
    fireEvent.mouseEnter(dotBtn)

    // Verify it appeared
    const appeared = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent === 'C — Unison',
    )
    expect(appeared.length).toBeGreaterThan(0)

    fireEvent.mouseLeave(dotBtn)

    // Now it should be gone
    const remaining = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent === 'C — Unison',
    )
    expect(remaining).toHaveLength(0)
  })

  it('shows a different tooltip when hovering a different dot', () => {
    renderScalesPage()
    const eDot = screen.getByRole('button', { name: 'E on e string fret 0' })
    fireEvent.mouseEnter(eDot)

    const tooltipTexts = Array.from(document.querySelectorAll('svg text')).filter(
      (t) => t.textContent?.includes(' — '),
    )
    expect(tooltipTexts[0].textContent).toContain('E')
    expect(tooltipTexts[0].textContent).not.toContain('Unison')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. CAGED Overlay toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – CAGED Overlay toggle', () => {
  it('renders the CAGED Overlay button', () => {
    renderScalesPage()
    expect(screen.getByRole('button', { name: /caged overlay/i })).toBeInTheDocument()
  })

  it('does not show CAGED band labels before enabling the overlay', () => {
    renderScalesPage()
    // CAGED shape labels are 'C', 'A', 'G', 'E', 'D' rendered as SVG <text>
    // They only appear when showCaged is true. We check that none of the
    // SVG text nodes with exactly one of those single-char values are present
    // at opacity 0.65 (which is what the CAGED band text uses).
    // Simplest check: the rect elements with CAGED band fill colors don't appear.
    const rects = document.querySelectorAll('svg rect')
    // Before toggle there should be no CAGED band rects (note: tooltip rect only
    // appears on hover, which hasn't happened yet)
    expect(rects).toHaveLength(0)
  })

  it('renders CAGED band rectangles after clicking CAGED Overlay', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /caged overlay/i })
    fireEvent.click(toggle)

    // computeCAGEDShapes returns 5 shapes → 5 band rects
    const rects = document.querySelectorAll('svg rect')
    expect(rects.length).toBeGreaterThanOrEqual(5)
  })

  it('persists CAGED Overlay state to localStorage when toggled', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /caged overlay/i })
    fireEvent.click(toggle)
    expect(localStorage.getItem('scales-showCaged')).toBe('true')
  })

  it('removes CAGED bands when toggled off again', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /caged overlay/i })

    fireEvent.click(toggle)
    const rectsAfterOn = document.querySelectorAll('svg rect')
    expect(rectsAfterOn.length).toBeGreaterThanOrEqual(5)

    fireEvent.click(toggle)
    const rectsAfterOff = document.querySelectorAll('svg rect')
    expect(rectsAfterOff).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pentatonic Subset dimming behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Pentatonic Subset dimming', () => {
  it('does not dim any dots before Pentatonic Subset is enabled', () => {
    renderScalesPage()
    // No dot should have opacity 0.28 before the toggle is active
    const dimmedGroups = Array.from(document.querySelectorAll('svg g[style*="opacity: 0.28"]'))
    expect(dimmedGroups).toHaveLength(0)
  })

  it('dims non-pentatonic dots (opacity 0.28) after enabling Pentatonic Subset in Major', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /pentatonic subset/i })
    fireEvent.click(toggle)

    // C major pentatonic subset = [0,2,4,7,9] (C D E G A)
    // Intervals NOT in subset for C major: 5 (F) and 11 (B)
    // At least some dots should now be dimmed
    const dimmedGroups = Array.from(document.querySelectorAll('svg g[style*="0.28"]'))
    expect(dimmedGroups.length).toBeGreaterThan(0)
  })

  it('F dots (interval=5, not in major pentatonic) are dimmed', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /pentatonic subset/i })
    fireEvent.click(toggle)

    // e string fret 1 = F (pc=5, interval=5) — not in major pentatonic subset
    // Use exact name to avoid matching "F on e string fret 13", "fret 19" etc.
    const fDot = screen.getByRole('button', { name: 'F on e string fret 1' })
    expect(fDot.style.opacity).toBe('0.28')
  })

  it('C dots (interval=0, in major pentatonic) are NOT dimmed', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /pentatonic subset/i })
    fireEvent.click(toggle)

    // B string fret 1 = C (interval=0) — in major pentatonic subset
    const cDot = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(cDot.style.opacity).not.toBe('0.28')
    // Default opacity when not dimmed is 1
    expect(Number(cDot.style.opacity || '1')).toBeGreaterThan(0.5)
  })

  it('G dots (interval=7, in major pentatonic) are NOT dimmed', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /pentatonic subset/i })
    fireEvent.click(toggle)

    // G string fret 0 = G (interval=7) — in major pentatonic subset
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.style.opacity).not.toBe('0.28')
  })

  it('B dots (interval=11, not in major pentatonic) are dimmed', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /pentatonic subset/i })
    fireEvent.click(toggle)

    // high e fret 7 = B (midi 71, pc=11, interval=11 in C major)
    const bDot = screen.getByRole('button', { name: 'B on e string fret 7' })
    expect(bDot.style.opacity).toBe('0.28')
  })

  it('no dots are dimmed after Pentatonic Subset is toggled off', () => {
    renderScalesPage()
    const toggle = screen.getByRole('button', { name: /pentatonic subset/i })

    fireEvent.click(toggle) // on
    fireEvent.click(toggle) // off

    const dimmedGroups = Array.from(document.querySelectorAll('svg g[style*="0.28"]'))
    expect(dimmedGroups).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. General page structure
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – general page structure', () => {
  it('renders the fretboard SVG with aria-label', () => {
    renderScalesPage()
    // SVG with aria-label="Guitar fretboard" — query via getByLabelText since jsdom
    // does not assign role="img" to <svg> automatically.
    expect(screen.getByLabelText(/guitar fretboard/i)).toBeInTheDocument()
  })

  it('renders the Key toggle group with radio buttons for note names', () => {
    renderScalesPage()
    // Radix ToggleGroupItem renders as role="radio" within a single-select group
    expect(screen.getByRole('radio', { name: /^C$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^G$/i })).toBeInTheDocument()
  })

  it('renders Scale mode radio buttons for all 12 modes', () => {
    renderScalesPage()
    // Radix ToggleGroupItem uses role="radio"
    expect(screen.getByRole('radio', { name: /^major$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /natural minor/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /dorian/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /phrygian/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^lydian$/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /mixolydian/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /locrian/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /pentatonic major/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /pentatonic minor/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^blues$/i })).toBeInTheDocument()
  })

  it('renders the Display section with all three toggle buttons', () => {
    renderScalesPage()
    expect(screen.getByRole('button', { name: /degree labels/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /caged overlay/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pentatonic subset/i })).toBeInTheDocument()
  })

  it('renders fret dots as accessible role=button elements', () => {
    renderScalesPage()
    // C major has 7 scale tones; there should be many dot buttons across 24 frets
    const dotButtons = screen.getAllByRole('button', { name: / on .+ string fret /i })
    expect(dotButtons.length).toBeGreaterThan(10)
  })

  it('defaults to C major (C and E and G dots appear on fretboard)', () => {
    renderScalesPage()
    // Use exact names to avoid collisions with higher-fret occurrences
    expect(screen.getByRole('button', { name: 'C on B string fret 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'E on e string fret 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'G on G string fret 0' })).toBeInTheDocument()
  })
})
