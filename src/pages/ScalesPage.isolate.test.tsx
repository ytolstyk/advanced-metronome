/**
 * Tests for the "Isolate Mode" feature added to ScalesPage.
 *
 * Isolate Mode lets a user click (or drag-select) note dots on the
 * fretboard to build a highlighted set, without triggering audio playback.
 * It is mutually exclusive with Practice Mode. State persists to
 * localStorage under `scales-isolateMode` / `scales-isolatedKeys`.
 *
 * Mock setup mirrors ScalesPage.display.test.tsx for consistency.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Mock AWS Amplify UI ──────────────────────────────────────────────────────
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

// ── Mock pluckString (prevent AudioContext construction from actually
//    synthesizing anything; also lets us assert it was/wasn't invoked) ────────
const mockPluckString = vi.fn()
vi.mock('@/audio/pluckString', () => ({
  pluckString: (...args: unknown[]) => mockPluckString(...args),
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

// ── Fake AudioContext (only needed for the one test that exercises Practice
//    Mode playback; isolate-mode note clicks never reach getOrCreateAudioCtx) ─
class FakeGainNode {
  gain = { value: 1 }
  connect = vi.fn()
}

class FakeAudioContext {
  currentTime = 0
  state: 'running' | 'suspended' | 'closed' = 'running'
  destination = {}
  createGain() {
    return new FakeGainNode() as unknown as GainNode
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

// ── Import page after all mocks are in place ──────────────────────────────────
import { ScalesPage } from './ScalesPage'

function renderScalesPage() {
  return render(
    <MemoryRouter>
      <ScalesPage />
    </MemoryRouter>,
  )
}

// Fretboard SVG layout constants replicated from ScalesPage.tsx so pointer
// coordinates map onto known dot positions. jsdom performs no SVG layout, so
// the svg's real getBoundingClientRect() would report a zero-size rect; we
// stub it to report the SVG's own viewBox dimensions (scale factor 1:1),
// which is enough for the pointer-based drag/click-threshold tests below.
const LEFT_PAD = 8
const NUT_X = 40
const FRET_W = 64
const RIGHT_PAD = 24
const NUM_FRETS = 24
const TOP_PAD = 40
const STRING_H = 40
const NUM_STRINGS = 6
const BOTTOM_PAD = 40
const SVG_W = LEFT_PAD + NUT_X + NUM_FRETS * FRET_W + RIGHT_PAD
const SVG_H = TOP_PAD + (NUM_STRINGS - 1) * STRING_H + BOTTOM_PAD

function dotCx(fret: number): number {
  return fret === 0 ? LEFT_PAD + NUT_X / 2 : LEFT_PAD + NUT_X + fret * FRET_W - FRET_W / 2
}
function dotCy(svgStringIdx: number): number {
  return TOP_PAD + svgStringIdx * STRING_H
}

// Note dots only respond to onClick when isolateMode is off — in isolate
// mode the dot's own onClick is set to `undefined` (pointer capture would
// retarget a real browser click away from it), so clicks must instead be
// simulated as the SVG-level pointerdown/pointerup hit-test path does it:
// a pointerdown followed by a pointerup a few px away (comfortably under
// DRAG_THRESHOLD=4) at the dot's known center coordinates.
function isolateClickDot(
  svgStringIdx: number,
  fret: number,
  opts?: { ctrlKey?: boolean; metaKey?: boolean },
) {
  const svg = screen.getByLabelText(/guitar fretboard/i)
  const x = dotCx(fret)
  const y = dotCy(svgStringIdx)
  const modifiers = { ctrlKey: opts?.ctrlKey ?? false, metaKey: opts?.metaKey ?? false }
  fireEvent.pointerDown(svg, { clientX: x, clientY: y, ...modifiers })
  fireEvent.pointerUp(svg, { clientX: x + 1, clientY: y + 1, ...modifiers })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  // jsdom does not implement pointer capture; stub it so handlePointerDown
  // doesn't throw when the fretboard svg calls setPointerCapture().
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: SVG_W, bottom: SVG_H,
    width: SVG_W, height: SVG_H, toJSON: () => ({}),
  } as DOMRect)
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Toggling Isolate Mode on/off + mutual exclusion with Practice Mode
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Isolate Mode toggle', () => {
  it('renders the Isolate Mode button, initially inactive', () => {
    renderScalesPage()
    const btn = screen.getByRole('button', { name: 'Isolate Mode' })
    expect(btn).toBeInTheDocument()
  })

  it('activates Isolate Mode and shows the highlighted-notes panel', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    expect(screen.getByRole('button', { name: '✦ Isolate Mode' })).toBeInTheDocument()
    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
  })

  it('deactivates Isolate Mode when clicked again', () => {
    renderScalesPage()
    const btn = screen.getByRole('button', { name: 'Isolate Mode' })
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: '✦ Isolate Mode' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '✦ Isolate Mode' }))
    expect(screen.getByRole('button', { name: 'Isolate Mode' })).toBeInTheDocument()
    expect(
      screen.queryByText(/click notes, or drag a box over a group/i),
    ).not.toBeInTheDocument()
  })

  it('turning on Isolate Mode turns off an active Practice Mode', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Practice Mode' }))
    expect(screen.getByRole('button', { name: '✦ Practice Mode' })).toBeInTheDocument()
    expect(screen.getByText(/click notes on the fretboard to build a sequence/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    expect(screen.getByRole('button', { name: '✦ Isolate Mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Practice Mode' })).toBeInTheDocument()
    expect(
      screen.queryByText(/click notes on the fretboard to build a sequence/i),
    ).not.toBeInTheDocument()
  })

  it('turning on Practice Mode turns off an active Isolate Mode', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    expect(screen.getByRole('button', { name: '✦ Isolate Mode' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Practice Mode' }))

    expect(screen.getByRole('button', { name: '✦ Practice Mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Isolate Mode' })).toBeInTheDocument()
    expect(
      screen.queryByText(/click notes, or drag a box over a group/i),
    ).not.toBeInTheDocument()
  })

  it('stops active playback when Isolate Mode interrupts Practice Mode', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Practice Mode' }))

    // Add a note to the sequence so Play becomes enabled (non-isolate click
    // path — requires the FakeAudioContext stubbed above).
    fireEvent.click(screen.getByRole('button', { name: 'C on B string fret 1' }))
    expect(mockPluckString).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '▶ Play' }))
    expect(screen.getByRole('button', { name: '■ Stop' })).toBeInTheDocument()

    // Switch to Isolate Mode — this must stop the transport.
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    // Switch back to Practice Mode and confirm playback did not survive.
    fireEvent.click(screen.getByRole('button', { name: 'Practice Mode' }))
    expect(screen.getByRole('button', { name: '▶ Play' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '■ Stop' })).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Clicking a note dot in Isolate Mode toggles highlight, no audio
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Isolate Mode click-to-highlight', () => {
  it('toggles a note into the highlighted set without playing audio', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const dot = screen.getByRole('button', { name: 'C on B string fret 1' })
    isolateClickDot(1, 1) // B string fret 1

    expect(mockPluckString).not.toHaveBeenCalled()
    expect(screen.getByText('1 note highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()

    // Root note dot picks up the isolated fill/stroke and a thicker ring.
    const circle = dot.querySelector('circle')
    expect(circle).toHaveAttribute('fill', '#b35c00')
    expect(circle).toHaveAttribute('stroke', '#ffb347')
    expect(circle).toHaveAttribute('stroke-width', '3')
  })

  it('toggles the same note back out of the highlighted set on a second click', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const dot = screen.getByRole('button', { name: 'C on B string fret 1' })
    isolateClickDot(1, 1) // B string fret 1
    expect(screen.getByText(/1 note highlighted/)).toBeInTheDocument()

    isolateClickDot(1, 1)
    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
    expect(mockPluckString).not.toHaveBeenCalled()

    const circle = dot.querySelector('circle')
    expect(circle).toHaveAttribute('fill', '#5b7fff') // back to root-note default color
  })

  it('accumulates multiple highlighted notes and pluralizes the panel text', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(1, 1) // C on B string fret 1
    isolateClickDot(2, 0) // G on G string fret 0

    expect(screen.getByText('2 notes highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    expect(mockPluckString).not.toHaveBeenCalled()
  })

  it('dims non-highlighted notes once at least one note is highlighted', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(1, 1) // C on B string fret 1

    // G on G string fret 0 is a scale note, not isolated -> dimmed to 0.15.
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.style.opacity).toBe('0.15')
  })

  it('does not dim any notes while the highlighted set is empty', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.style.opacity).not.toBe('0.15')
  })

  it('a plain click below the drag threshold (via pointer events) toggles exactly one note and does not trigger a box-drag', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    // B string (svgStr=1) fret 1 = C, root note — see dotCx/dotCy helpers above.
    const x = dotCx(1)
    const y = dotCy(1)
    fireEvent.pointerDown(svg, { clientX: x, clientY: y })
    fireEvent.pointerUp(svg, { clientX: x + 2, clientY: y + 2 }) // well under DRAG_THRESHOLD (4)

    expect(screen.getByText('1 note highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    // Only the single hit dot should be isolated — G (uninvolved) stays dimmed-off.
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.style.opacity).toBe('0.15')
  })

  it('dragging a box across two dots highlights both via onIsolateDrag', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    // G string (svgStr=2): fret 0 = G, fret 2 = A — both are C-major scale
    // notes and sit inside a small box around y=dotCy(2).
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15 })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })

    expect(screen.getByText('2 notes highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    const aDot = screen.getByRole('button', { name: 'A on G string fret 2' })
    expect(gDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
    expect(aDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
    expect(mockPluckString).not.toHaveBeenCalled()
  })

  // Drag-box selector for the in-progress marquee rect — it has no aria-label
  // (pointerEvents: 'none', purely visual), so we key off its stable dash
  // pattern rather than adding a test-only attribute to production markup.
  function dragBoxRect(): Element | null {
    return document.querySelector('svg rect[stroke-dasharray="4 3"]')
  }

  it('clears the drag box when the gesture is cancelled mid-drag (pointercancel)', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15 })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    expect(dragBoxRect()).toBeInTheDocument()

    fireEvent.pointerCancel(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })

    expect(dragBoxRect()).not.toBeInTheDocument()
    // The cancelled gesture must not resolve into a selection either.
    expect(screen.queryByText(/notes? highlighted/)).not.toBeInTheDocument()
  })

  it('does not resurrect the drag box on a stray hover pointermove after a cancel (buttons=0)', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15 })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    fireEvent.pointerCancel(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    expect(dragBoxRect()).not.toBeInTheDocument()

    // A hover-only pointermove (no mouse button held) at a completely
    // different spot must not resurrect a stale drag box left over from the
    // cancelled gesture. (dragStartRef is already null post-cancel, so this
    // alone is guarded by the `!dragStartRef.current` check too — see the
    // next test for a case that isolates the `buttons === 0` guard itself.)
    fireEvent.pointerMove(svg, { clientX: dotCx(5), clientY: dotCy(0), buttons: 0 })

    expect(dragBoxRect()).not.toBeInTheDocument()
  })

  it('ignores a stray hover-only pointermove (buttons=0) during an otherwise-active drag, leaving the box unchanged', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15 })
    // Establishes the box normally (fireEvent.pointerMove defaults to a
    // pressed button, matching the passing drag test above).
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    const boxAfterRealMove = dragBoxRect()
    expect(boxAfterRealMove).toBeInTheDocument()
    const snapshotBefore = {
      x: boxAfterRealMove?.getAttribute('x'),
      y: boxAfterRealMove?.getAttribute('y'),
      width: boxAfterRealMove?.getAttribute('width'),
      height: boxAfterRealMove?.getAttribute('height'),
    }

    // A hover-only pointermove (buttons=0 — the mouse button has already
    // been released, e.g. a stray event from lifted pointer capture) fires
    // while dragStartRef is still set, at a wildly different location. It
    // must be ignored — the box must not jump to follow it.
    fireEvent.pointerMove(svg, { clientX: dotCx(20), clientY: dotCy(5), buttons: 0 })

    const boxAfterStrayMove = dragBoxRect()
    expect(boxAfterStrayMove).toBeInTheDocument()
    expect({
      x: boxAfterStrayMove?.getAttribute('x'),
      y: boxAfterStrayMove?.getAttribute('y'),
      width: boxAfterStrayMove?.getAttribute('width'),
      height: boxAfterStrayMove?.getAttribute('height'),
    }).toEqual(snapshotBefore)

    // Finalizing the drag from its real (non-stray) end point still selects
    // exactly the originally-intended dots.
    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    expect(screen.getByText('2 notes highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
  })

  it('ignores a second pointerdown while a drag is already in progress (multi-touch does not clobber the anchor)', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)

    // Pointer 1 starts the drag, anchored the same as the passing
    // "dragging a box across two dots" test (G string, around fret 0).
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: dotCx(0) - 10, clientY: y - 15 })

    // Pointer 2 touches down far away mid-drag — must be ignored entirely
    // (no re-anchoring, no separate drag box), since a drag is already active.
    fireEvent.pointerDown(svg, { pointerId: 2, clientX: dotCx(20), clientY: dotCy(5) })

    // Pointer 1 continues and completes the drag exactly as it would have
    // without the interloper.
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: dotCx(2) + 10, clientY: y + 15 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: dotCx(2) + 10, clientY: y + 15 })

    // Selection matches the first pointer's original box — G and A only —
    // proving the second pointerdown's location never became the anchor.
    expect(screen.getByText('2 notes highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    const aDot = screen.getByRole('button', { name: 'A on G string fret 2' })
    expect(gDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
    expect(aDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
    expect(mockPluckString).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Ctrl/Cmd-held drag subtracts from (rather than toggles) the highlighted set
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Isolate Mode Ctrl/Cmd subtract-drag', () => {
  // Drag-box selector for the in-progress marquee rect — see the identical
  // helper in the click-to-highlight describe block above (function-scoped
  // there, so it's redeclared here rather than shared).
  function dragBoxRect(): Element | null {
    return document.querySelector('svg rect[stroke-dasharray="4 3"]')
  }

  it('a ctrl-held drag over a mix of highlighted and never-highlighted notes removes only the highlighted ones (true subtraction, not toggle-all/add-missing)', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    // Pre-highlight C (outside the upcoming drag box, to prove it's left
    // untouched) and G (inside the drag box, already highlighted).
    isolateClickDot(1, 1) // C on B string fret 1
    isolateClickDot(2, 0) // G on G string fret 0
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]')).toEqual(['1-1', '2-0'])

    const svg = screen.getByLabelText(/guitar fretboard/i)
    // Same box as the plain-drag test above: covers G (fret 0) and A (fret 2)
    // on the G string, but not C (a different string/row entirely).
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15, ctrlKey: true })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15, ctrlKey: true })
    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15, ctrlKey: true })

    // G (previously highlighted, in the box) is removed. A (never
    // highlighted, in the box) must NOT appear — proving subtraction, not
    // the old toggle logic (which would have added A since not all of the
    // dragged dots were already on). C (previously highlighted, outside the
    // box) is untouched.
    expect(screen.getByText('1 note highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]') as string[]
    expect(stored).toEqual(['1-1'])

    const cDot = screen.getByRole('button', { name: 'C on B string fret 1' })
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    const aDot = screen.getByRole('button', { name: 'A on G string fret 2' })
    expect(cDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00') // still isolated
    expect(gDot.querySelector('circle')).not.toHaveAttribute('fill', '#b35c00') // subtracted
    expect(aDot.querySelector('circle')).not.toHaveAttribute('fill', '#b35c00') // never added
    expect(mockPluckString).not.toHaveBeenCalled()
  })

  it('a cmd (metaKey)-held drag also subtracts, same as ctrl', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(2, 0) // G on G string fret 0 — pre-highlighted
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]')).toEqual(['2-0'])

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15, metaKey: true })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15, metaKey: true })
    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15, metaKey: true })

    // G removed, A (never highlighted) never added -> nothing highlighted.
    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '["x"]')).toEqual([])
    expect(mockPluckString).not.toHaveBeenCalled()
  })

  it('a plain (no modifier) drag over the same mixed set still uses the old toggle/add-missing behavior', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(2, 0) // G on G string fret 0 — pre-highlighted
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]')).toEqual(['2-0'])

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    // No ctrlKey/metaKey — plain drag.
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15 })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })

    // Not all dragged dots were already on (A wasn't) -> merge: both end up on.
    expect(screen.getByText('2 notes highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]') as string[]
    expect(stored).toEqual(['2-0', '2-2'])
    const aDot = screen.getByRole('button', { name: 'A on G string fret 2' })
    expect(aDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
  })

  it('shows the drag-box in ISOLATE_SUBTRACT_STROKE color while ctrl is held mid-drag', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15, ctrlKey: true })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15, ctrlKey: true })

    const rect = dragBoxRect()
    expect(rect).toBeInTheDocument()
    expect(rect).toHaveAttribute('stroke', '#dd4444')

    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15, ctrlKey: true })
    expect(dragBoxRect()).not.toBeInTheDocument()
  })

  it('shows the drag-box in the default isolate color (not ISOLATE_SUBTRACT_STROKE) for a plain drag', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    const svg = screen.getByLabelText(/guitar fretboard/i)
    const y = dotCy(2)
    fireEvent.pointerDown(svg, { clientX: dotCx(0) - 10, clientY: y - 15 })
    fireEvent.pointerMove(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })

    const rect = dragBoxRect()
    expect(rect).toBeInTheDocument()
    expect(rect).toHaveAttribute('stroke', '#b35c00')
    expect(rect).not.toHaveAttribute('stroke', '#dd4444')

    fireEvent.pointerUp(svg, { clientX: dotCx(2) + 10, clientY: y + 15 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Ctrl/Cmd single-click subtract (same rule as the drag, applied to a
//    lone click via the shared applyIsolateSelection helper)
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Isolate Mode Ctrl/Cmd single-click subtract', () => {
  it('ctrl+click on an already-highlighted note removes it', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(1, 1) // C on B string fret 1 — plain click, highlights it
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]')).toEqual(['1-1'])

    isolateClickDot(1, 1, { ctrlKey: true })

    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '["x"]')).toEqual([])
    const cDot = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(cDot.querySelector('circle')).not.toHaveAttribute('fill', '#b35c00')
    expect(mockPluckString).not.toHaveBeenCalled()
  })

  it('ctrl+click on a note that was never highlighted is a no-op (does not add it)', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    // G on G string fret 0 has never been clicked/highlighted.
    isolateClickDot(2, 0, { ctrlKey: true })

    // Unlike a plain click on a not-yet-highlighted note, this must NOT add it.
    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '["x"]')).toEqual([])
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.querySelector('circle')).not.toHaveAttribute('fill', '#b35c00')
    expect(mockPluckString).not.toHaveBeenCalled()
  })

  it('cmd (metaKey)+click on a never-highlighted note is also a no-op, same as ctrl', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(2, 0, { metaKey: true }) // G on G string fret 0

    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '["x"]')).toEqual([])
  })

  it('a plain click (no modifier) on a not-yet-highlighted note still adds it, unaffected by the subtract path', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    isolateClickDot(2, 0) // G on G string fret 0 — no ctrlKey/metaKey

    expect(screen.getByText('1 note highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]')).toEqual(['2-0'])
    const gDot = screen.getByRole('button', { name: 'G on G string fret 0' })
    expect(gDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Clear Highlights button
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Clear Highlights button', () => {
  it('is disabled while nothing is highlighted', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))

    expect(screen.getByRole('button', { name: 'Clear Highlights' })).toBeDisabled()
  })

  it('becomes enabled once a note is highlighted', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    isolateClickDot(1, 1) // C on B string fret 1

    expect(screen.getByRole('button', { name: 'Clear Highlights' })).not.toBeDisabled()
  })

  it('clears the whole highlighted set and re-disables itself', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    isolateClickDot(1, 1) // C on B string fret 1
    isolateClickDot(2, 0) // G on G string fret 0
    expect(screen.getByText(/2 notes highlighted/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Highlights' }))

    expect(
      screen.getByText(/click notes, or drag a box over a group, to highlight them/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Highlights' })).toBeDisabled()

    // Dots no longer show isolated styling.
    const cDot = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(cDot.querySelector('circle')).toHaveAttribute('fill', '#5b7fff')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

describe('ScalesPage – Isolate Mode localStorage persistence', () => {
  it('does not persist isolateMode=true before it has ever been toggled on', () => {
    renderScalesPage()
    expect(localStorage.getItem('scales-isolateMode')).toBe('false')
  })

  it('persists scales-isolateMode="true" after toggling Isolate Mode on', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    expect(localStorage.getItem('scales-isolateMode')).toBe('true')
  })

  it('persists scales-isolateMode="false" after toggling it back off', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    fireEvent.click(screen.getByRole('button', { name: '✦ Isolate Mode' }))
    expect(localStorage.getItem('scales-isolateMode')).toBe('false')
  })

  it('persists highlighted dot keys to scales-isolatedKeys as a JSON array', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    isolateClickDot(1, 1) // C on B string fret 1

    const stored = JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]') as string[]
    expect(stored).toHaveLength(1)
    expect(stored[0]).toBe('1-1') // svgStr=1 (B string), fret=1
  })

  it('removes a key from scales-isolatedKeys when toggled back off', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    isolateClickDot(1, 1) // C on B string fret 1

    // Guard against a false-positive: confirm the first click actually
    // isolated the note before relying on the second click to remove it.
    const afterFirstClick = JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]') as string[]
    expect(afterFirstClick).toEqual(['1-1'])

    isolateClickDot(1, 1)

    const stored = JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '[]') as string[]
    expect(stored).toHaveLength(0)
  })

  it('clears scales-isolatedKeys via the Clear Highlights button', () => {
    renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    isolateClickDot(1, 1) // C on B string fret 1
    fireEvent.click(screen.getByRole('button', { name: 'Clear Highlights' }))

    expect(JSON.parse(localStorage.getItem('scales-isolatedKeys') ?? '["x"]')).toEqual([])
  })

  it('a fresh mount reads back a persisted isolateMode=true and isolatedKeys', () => {
    localStorage.setItem('scales-isolateMode', 'true')
    localStorage.setItem('scales-isolatedKeys', JSON.stringify(['1-1']))

    renderScalesPage()

    expect(screen.getByRole('button', { name: '✦ Isolate Mode' })).toBeInTheDocument()
    expect(screen.getByText('1 note highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
    const cDot = screen.getByRole('button', { name: 'C on B string fret 1' })
    expect(cDot.querySelector('circle')).toHaveAttribute('fill', '#b35c00')
  })

  it('a fresh mount with no persisted isolate state defaults to inactive/empty', () => {
    renderScalesPage()
    expect(screen.getByRole('button', { name: 'Isolate Mode' })).toBeInTheDocument()
    expect(screen.queryByText(/notes? highlighted/)).not.toBeInTheDocument()
  })

  it('round-trips through an unmount/remount cycle (simulating a page refresh)', () => {
    const { unmount } = renderScalesPage()
    fireEvent.click(screen.getByRole('button', { name: 'Isolate Mode' }))
    isolateClickDot(1, 1) // C on B string fret 1
    isolateClickDot(2, 0) // G on G string fret 0
    unmount()
    cleanup()

    renderScalesPage()

    expect(screen.getByRole('button', { name: '✦ Isolate Mode' })).toBeInTheDocument()
    expect(screen.getByText('2 notes highlighted. Click, or drag a box, to toggle.')).toBeInTheDocument()
  })
})
