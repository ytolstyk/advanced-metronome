import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { TrackPiece } from '@/audio/ClickTrackEngine'

// Counts how often the page re-renders: the page renders the import dialog on every render.
import type { ValidSong } from '@/bandTypes'

const renders = vi.hoisted(() => ({ page: 0 }))
const engine = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
const copyApi = vi.hoisted(() => ({
  save: vi.fn(),
  props: null as null | { saveCopy?: (song: ValidSong) => Promise<boolean> },
}))

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'unauthenticated' }),
  Authenticator: () => null,
}))
vi.mock('@/api/clickTrackApi', () => ({
  saveCloudClickTrack: vi.fn(),
  loadCloudClickTracks: vi.fn().mockResolvedValue([]),
  deleteCloudClickTrack: vi.fn(),
  saveCloudCopyForSong: copyApi.save,
}))
vi.mock('@/components/ClickTrack/SaveToBandDialog', () => ({
  SaveToBandDialog: (props: { saveCopy?: (song: ValidSong) => Promise<boolean> }) => {
    copyApi.props = props
    return null
  },
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

describe('ClickTrackPage: repetition badge', () => {
  beforeEach(() => {
    localStorage.clear()
    engine.start.mockClear()
  })

  it('shows nothing before playback starts', () => {
    seed(false)
    render(<MemoryRouter><ClickTrackPage /></MemoryRouter>)
    expect(screen.queryByLabelText(/^Repetition \d+ of \d+$/)).not.toBeInTheDocument()
  })

  it('shows one large badge on the active card with the current and total repetition', async () => {
    seed(false)
    await startAndGetOnBeat()
    const badge = screen.getByRole('img', { name: 'Repetition 1 of 2' })
    expect(badge).toHaveClass('ct-rep-badge')
    expect(badge.querySelector('.ct-rep-current')).toHaveTextContent('1')
    expect(badge.querySelector('.ct-rep-total')).toHaveTextContent('/2')
    expect(screen.getAllByLabelText(/^Repetition \d+ of \d+$/)).toHaveLength(1)
  })

  it('follows the engine to the next repetition and the next card', async () => {
    seed(false)
    await startAndGetOnBeat()
    const onProgress = engine.start.mock.calls[0]![4] as (pieceIndex: number, rep: number) => void
    act(() => onProgress(0, 1))
    expect(screen.getByLabelText('Repetition 2 of 2')).toBeInTheDocument()
    expect(screen.queryByLabelText('Repetition 1 of 2')).not.toBeInTheDocument()
    act(() => onProgress(2, 0))
    expect(screen.getByLabelText('Repetition 1 of 2')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/^Repetition \d+ of \d+$/)).toHaveLength(1)
  })

  it('no longer renders the old small "Rep n/N" text', async () => {
    seed(false)
    await startAndGetOnBeat()
    expect(screen.queryByText(/^Rep \d+\/\d+$/)).not.toBeInTheDocument()
  })
})

describe('ClickTrackPage: a row per segment in the score view', () => {
  const groups = [
    { id: 'g1', name: 'Verse', color: '#ff0000' },
  ]
  const seg = (i: number, groupId: string | null = null): TrackPiece => ({ ...piece(i), groupId })

  function seedSegments(opts: { pieces: TrackPiece[]; groups?: typeof groups; expandView?: boolean; groupRows?: boolean }) {
    const state: Record<string, unknown> = {
      pieces: opts.pieces, groups: opts.groups ?? [], speedPercent: 100, expandView: opts.expandView ?? true, countdownEnabled: false,
    }
    if (opts.groupRows !== undefined) state.groupRows = opts.groupRows
    localStorage.setItem('click-track-state', JSON.stringify(state))
  }
  const persisted = () => JSON.parse(localStorage.getItem('click-track-state') ?? '{}') as { groupRows?: boolean }
  const renderPage = () => render(<MemoryRouter><ClickTrackPage /></MemoryRouter>)
  const toggle = () => screen.getByRole('button', { name: 'Toggle row per segment' })
  const breaks = () => screen.queryAllByTestId('segment-row-break')

  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to on and starts every segment on a new row, even with no groups', () => {
    seedSegments({ pieces: [seg(1), seg(2), seg(3)] })
    renderPage()
    expect(toggle()).toHaveClass('on')
    // between pieces only: none before the first one
    expect(breaks()).toHaveLength(2)
  })

  it('also breaks between segments of the same group', () => {
    seedSegments({ pieces: [seg(1, 'g1'), seg(2, 'g1')], groups })
    renderPage()
    expect(breaks()).toHaveLength(1)
  })

  it('places the break before the first bar of the next segment', () => {
    seedSegments({ pieces: [seg(1), seg(2)] })
    renderPage()
    const brk = screen.getByTestId('segment-row-break')
    const children = Array.from(brk.parentElement!.children)
    // piece 1 has 2 bars, then the break, then piece 2's bars
    expect(children.indexOf(brk)).toBe(2)
    expect(children).toHaveLength(5)
  })

  it('adds no break for a single segment and hides the toggle', () => {
    seedSegments({ pieces: [seg(1)] })
    renderPage()
    expect(breaks()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Toggle row per segment' })).not.toBeInTheDocument()
  })

  it('removes the breaks and persists false when toggled off, and brings them back when toggled on', async () => {
    seedSegments({ pieces: [seg(1), seg(2)] })
    renderPage()
    await userEvent.click(toggle())
    expect(toggle()).not.toHaveClass('on')
    expect(breaks()).toHaveLength(0)
    expect(persisted().groupRows).toBe(false)

    await userEvent.click(toggle())
    expect(toggle()).toHaveClass('on')
    expect(breaks()).toHaveLength(1)
    expect(persisted().groupRows).toBe(true)
  })

  it('restores a saved off state', () => {
    seedSegments({ pieces: [seg(1), seg(2)], groupRows: false })
    renderPage()
    expect(toggle()).not.toHaveClass('on')
    expect(breaks()).toHaveLength(0)
  })

  it('treats a saved groupRows of true as on', () => {
    seedSegments({ pieces: [seg(1), seg(2)], groupRows: true })
    renderPage()
    expect(toggle()).toHaveClass('on')
  })

  it('shows the toggle only in the expanded view', async () => {
    seedSegments({ pieces: [seg(1), seg(2)], expandView: false })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Toggle row per segment' })).not.toBeInTheDocument()
    expect(breaks()).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Toggle expand view' }))
    expect(toggle()).toBeInTheDocument()
    expect(breaks()).toHaveLength(1)
  })
})

describe('ClickTrackPage: copy to saved tracks after Save to Band', () => {
  beforeEach(() => {
    localStorage.clear()
    copyApi.save.mockReset()
    copyApi.props = null
  })

  it('hands the dialog a saveCopy that stores the track under the song id and "Title - Artist"', async () => {
    seed(false)
    copyApi.save.mockResolvedValue(true)
    render(<MemoryRouter><ClickTrackPage /></MemoryRouter>)
    expect(copyApi.props?.saveCopy).toBeTypeOf('function')

    const ok = await copyApi.props!.saveCopy!({ id: 'song-9', title: 'Kashmir', artist: 'Led Zeppelin' } as ValidSong)
    expect(ok).toBe(true)
    expect(copyApi.save).toHaveBeenCalledTimes(1)
    const [songId, name, pieces, groups] = copyApi.save.mock.calls[0]!
    expect(songId).toBe('song-9')
    expect(name).toBe('Kashmir - Led Zeppelin')
    expect((pieces as TrackPiece[]).map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(groups).toEqual([])
  })

  it('names the copy after just the title when the song has no artist', async () => {
    seed(false)
    copyApi.save.mockResolvedValue(false)
    render(<MemoryRouter><ClickTrackPage /></MemoryRouter>)
    expect(await copyApi.props!.saveCopy!({ id: 's', title: 'Kashmir', artist: null } as ValidSong)).toBe(false)
    expect(copyApi.save.mock.calls[0]![1]).toBe('Kashmir')
  })
})
