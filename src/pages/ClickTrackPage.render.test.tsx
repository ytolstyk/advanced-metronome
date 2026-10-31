import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { TrackPiece } from '@/audio/ClickTrackEngine'

// Counts how often the page re-renders: the page renders the import dialog on every render.
const renders = vi.hoisted(() => ({ page: 0 }))
const engine = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'unauthenticated' }),
  Authenticator: () => null,
}))
vi.mock('@/api/clickTrackApi', () => ({
  saveCloudClickTrack: vi.fn(),
  loadCloudClickTracks: vi.fn().mockResolvedValue([]),
  deleteCloudClickTrack: vi.fn(),
}))
vi.mock('@/audio/exportClickTrack', () => ({ exportClickTrack: vi.fn() }))
vi.mock('@/components/ClickTrack/SongImportDialog', () => ({
  SongImportDialog: () => {
    renders.page++
    return null
  },
}))
vi.mock('@/audio/ClickTrackEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/audio/ClickTrackEngine')>()
  class ClickTrackEngine {
    start = engine.start
    stop = engine.stop
    updateSpeed = vi.fn()
  }
  return { ...actual, ClickTrackEngine }
})

import { ClickTrackPage } from './ClickTrackPage'

const piece = (i: number): TrackPiece => ({
  id: `p${i}`, label: `Seg ${i}`, color: '#8b5cf6', groupId: null,
  timeSignature: { numerator: 4, denominator: 4 }, subdivision: 'quarter', bpm: 100, repeats: 2,
})

function seed(expandView: boolean) {
  localStorage.setItem('click-track-state', JSON.stringify({
    pieces: [piece(1), piece(2), piece(3)], groups: [], speedPercent: 100, expandView, countdownEnabled: false,
  }))
}

/** The `onBeat` callback the page handed the engine when playback started (start(..., onBeat, startRep)). */
async function startAndGetOnBeat() {
  render(<MemoryRouter><ClickTrackPage /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
  expect(engine.start).toHaveBeenCalledTimes(1)
  return engine.start.mock.calls[0]![7] as (pieceIndex: number, rep: number, subTick: number) => void
}

describe('ClickTrackPage: re-renders while playing', () => {
  beforeEach(() => {
    localStorage.clear()
    engine.start.mockClear()
    renders.page = 0
  })

  it('does not re-render the page on every sub-beat in the card list, which never shows the clicking dot', async () => {
    seed(false)
    const onBeat = await startAndGetOnBeat()
    const before = renders.page
    for (let i = 0; i < 8; i++) act(() => onBeat(0, 0, i))
    expect(renders.page).toBe(before)
  })

  it('does re-render per sub-beat in the score view, which highlights the clicking dot', async () => {
    seed(true)
    const onBeat = await startAndGetOnBeat()
    const before = renders.page
    for (let i = 0; i < 8; i++) act(() => onBeat(0, 0, i))
    expect(renders.page).toBeGreaterThan(before)
  })
})
