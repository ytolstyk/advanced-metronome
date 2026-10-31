import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { TrackPiece } from '@/audio/ClickTrackEngine'
import type { CloudClickTrack } from '@/api/clickTrackApi'

const auth = vi.hoisted(() => ({ status: 'unauthenticated' as 'authenticated' | 'unauthenticated' }))
const engineSpies = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
const cloud = vi.hoisted(() => ({ loadCloudClickTracks: vi.fn() }))

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: auth.status }),
  Authenticator: () => null,
}))

vi.mock('@/api/clickTrackApi', () => ({
  saveCloudClickTrack: vi.fn().mockResolvedValue(true),
  loadCloudClickTracks: cloud.loadCloudClickTracks,
  deleteCloudClickTrack: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/api/bandsApi', () => ({
  loadMyBands: vi.fn().mockResolvedValue({ entries: [], failedCount: 0, deadBandIds: [] }),
  loadBandView: vi.fn(),
}))

vi.mock('@/audio/exportClickTrack', () => ({ exportClickTrack: vi.fn() }))

vi.mock('@/audio/ClickTrackEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/audio/ClickTrackEngine')>()
  class ClickTrackEngine {
    start = engineSpies.start
    stop = engineSpies.stop
    pause = vi.fn()
    resume = vi.fn()
    destroy = vi.fn()
    updateSpeed = vi.fn()
  }
  return { ...actual, ClickTrackEngine }
})

import { ClickTrackPage } from './ClickTrackPage'
import { exportClickTrack } from '@/audio/exportClickTrack'

const STORAGE_KEY = 'click-track-state'

const piece = (i: number, extra: Partial<TrackPiece> = {}): TrackPiece => ({
  id: `p${i}`,
  label: `Old ${i}`,
  color: '#8b5cf6',
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 100 + i,
  repeats: 2,
  ...extra,
})

function seed(pieces: TrackPiece[], groups: unknown[] = [], expandView = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pieces, groups, speedPercent: 100, expandView, countdownEnabled: false }))
}

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { pieces: TrackPiece[]; groups: unknown[] }

const SONG = '\\tempo 120\n.\n\\ts 4 4\n:4 1.1*4 | 1.1*4 |\n\\ts 3 4 \\tempo 90 1.1*3'

function renderPage() {
  return render(<MemoryRouter><ClickTrackPage /></MemoryRouter>)
}

async function pickFile(content = SONG, name = 'song.alphatex') {
  await userEvent.upload(screen.getByLabelText('Guitar Pro or AlphaTex file'), new File([content], name))
  return screen.findByRole('dialog')
}

describe('ClickTrackPage: import tempo map explainer', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the explainer, not the file picker, when "Import tempo map" is clicked', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderPage()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Import tempo map/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Import tempo map' })
    expect(within(dialog).getByText('Files it accepts')).toBeInTheDocument()
    expect(inputClick).not.toHaveBeenCalled()
  })

  it('"Choose file…" closes the explainer and clicks the hidden file input', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Import tempo map/ }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.click(within(dialog).getByRole('button', { name: /Choose file/ }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(inputClick).toHaveBeenCalledTimes(1)
    expect(inputClick.mock.contexts[0]).toBe(screen.getByLabelText('Guitar Pro or AlphaTex file'))
  })

  it('Cancel closes the explainer without opening the file picker', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Import tempo map/ }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(inputClick).not.toHaveBeenCalled()
  })
})

describe('ClickTrackPage: dropping a file on the explainer', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const dropOnExplainer = async (dropped: File) => {
    await userEvent.click(screen.getByRole('button', { name: /Import tempo map/ }))
    const explainer = await screen.findByRole('dialog', { name: 'Import tempo map' })
    fireEvent.dragOver(explainer, { dataTransfer: { types: ['Files'], files: [] } })
    fireEvent.drop(explainer, { dataTransfer: { types: ['Files'], files: [dropped] } })
  }

  it('closes the explainer and opens the import preview for the dropped file', async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderPage()

    await dropOnExplainer(new File([SONG], 'song.alphatex'))

    await waitFor(() => expect(screen.queryByText('Files it accepts')).not.toBeInTheDocument())
    const preview = await screen.findByRole('dialog')
    expect(await within(preview).findByRole('button', { name: 'Import' })).toBeInTheDocument()
    expect(within(preview).getByText(/3 bars, 2 segments/)).toBeInTheDocument()
    expect(inputClick).not.toHaveBeenCalled() // no file picker involved
  })

  it('imports the dropped song into the track', async () => {
    const { container } = renderPage()
    await dropOnExplainer(new File([SONG], 'song.alphatex'))

    const preview = await screen.findByRole('dialog')
    await userEvent.click(await within(preview).findByRole('button', { name: 'Import' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(container.querySelectorAll('.ct-piece-card')).toHaveLength(2)
    expect(stored().pieces.map((p) => [p.timeSignature.numerator, p.bpm, p.repeats])).toEqual([[4, 120, 2], [3, 90, 1]])
  })

  it('stops playback when a file is dropped', async () => {
    seed([piece(1)])
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Play/ }))
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
    engineSpies.stop.mockClear()

    await dropOnExplainer(new File([SONG], 'song.alphatex'))

    await screen.findByRole('button', { name: 'Replace track' })
    expect(engineSpies.stop).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument()
  })

  it('shows the parse error for a dropped file that is not a score and leaves the track alone', async () => {
    seed([piece(1)])
    renderPage()

    await dropOnExplainer(new File(['this is not a score'], 'notes.alphatex'))

    const preview = await screen.findByRole('dialog')
    expect(await within(preview).findByRole('alert')).toHaveTextContent('readable Guitar Pro')
    expect(stored().pieces).toHaveLength(1)
  })
})

describe('ClickTrackPage: import tempo map', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('imports a song into an empty track in one step', async () => {
    const { container } = renderPage()
    const dialog = await pickFile()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Import' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(container.querySelectorAll('.ct-piece-card')).toHaveLength(2)
    expect(stored().pieces.map((p) => [p.timeSignature.numerator, p.bpm, p.repeats])).toEqual([[4, 120, 2], [3, 90, 1]])
  })

  it('shows an error for a file that is not a score and leaves the track alone', async () => {
    seed([piece(1)])
    renderPage()
    const dialog = await pickFile('this is not a score', 'notes.alphatex')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('readable Guitar Pro')
    expect(stored().pieces).toHaveLength(1)
  })

  it('asks before replacing a non-empty track, and cancelling keeps both the track and the dialog', async () => {
    seed([piece(1)])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    const dialog = await pickFile()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Replace track' }))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(stored().pieces.map((p) => p.label)).toEqual(['Old 1'])

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Replace track' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stored().pieces).toHaveLength(2)
    expect(stored().pieces[0]!.label).toBe('4/4 ♩=120')
  })

  it('clears groups, the loop selection and any open edit when it replaces the track', async () => {
    seed([piece(1, { groupId: 'g1' })], [{ id: 'g1', name: 'Verse', color: '#ff0000' }], true) // expand view shows the loop selection
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = renderPage()

    await userEvent.click(container.querySelector('.ct-measure-cell')!)
    expect(screen.getByText(/Loop: measures 1–1/)).toBeInTheDocument()

    const dialog = await pickFile()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Replace track' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(stored().groups).toEqual([])
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
  })

  it('lets the same file be picked again after the dialog is closed', async () => {
    renderPage()
    const dialog = await pickFile()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await pickFile()).toBeInTheDocument()
  })
})

describe('ClickTrackPage: guards', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an alert, not a crash, when the browser refuses to store the track, and clears it once saving works', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t save to this browser')

    setItem.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await waitFor(() => expect(screen.queryByText(/Couldn't save to this browser/)).not.toBeInTheDocument())
  })

  it('copies a share link for a small track', async () => {
    seed([piece(1)])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Share/ }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?t='))
    expect(screen.queryByText(/too large for a share link/)).not.toBeInTheDocument()
  })

  it('explains instead of copying a broken link when the track is too large to share, and hides the note after an edit', async () => {
    seed(Array.from({ length: 40 }, (_, i) => piece(i)))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Share/ }))
    const notice = await screen.findByText(/too large for a share link/)
    expect(writeText).not.toHaveBeenCalled()
    // signed out: the notice offers a way to sign in to use cloud saving instead
    expect(within(notice.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Sign In' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Reset/ }))
    await waitFor(() => expect(screen.queryByText(/too large for a share link/)).not.toBeInTheDocument())
  })
})

describe('ClickTrackPage: import while the track is in use', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stops playback when an imported song replaces the track', async () => {
    seed([piece(1)])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Play/ }))
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()

    const dialog = await pickFile() // picking the file already stops playback once
    const replace = await within(dialog).findByRole('button', { name: 'Replace track' })
    engineSpies.stop.mockClear()
    await userEvent.click(replace)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(engineSpies.stop).toHaveBeenCalled() // replacing the track stops it again, whatever happened before
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument()
  })

  it('does not ask for confirmation when the track is empty', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    renderPage()
    const dialog = await pickFile()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Import' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirm).not.toHaveBeenCalled()
  })

  it('opens no dialog when the file picker is dismissed without a file', async () => {
    renderPage()
    const input = screen.getByLabelText('Guitar Pro or AlphaTex file')
    await userEvent.upload(input, [])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the old track, and the confirmation, untouched when the import file is unreadable', async () => {
    seed([piece(1), piece(2)])
    const confirm = vi.spyOn(window, 'confirm')
    renderPage()
    const dialog = await pickFile('garbage', 'bad.alphatex')
    await within(dialog).findByRole('alert')
    expect(within(dialog).queryByRole('button', { name: /Import|Replace/ })).not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(stored().pieces).toHaveLength(2)
  })

  it('switches the action label to "Replace track" once the track has segments', async () => {
    seed([piece(1)])
    renderPage()
    const dialog = await pickFile()
    expect(await within(dialog).findByRole('button', { name: 'Replace track' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
  })

  it('removes a share-too-large note once the track is replaced by an import', async () => {
    seed(Array.from({ length: 40 }, (_, i) => piece(i)))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Share/ }))
    await screen.findByText(/too large for a share link/)

    const dialog = await pickFile()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Replace track' }))
    await waitFor(() => expect(screen.queryByText(/too large for a share link/)).not.toBeInTheDocument())
  })
})

describe('ClickTrackPage: score view', () => {
  // Two 2-bar segments, so bars 0-1 belong to the first and bars 2-3 to the second.
  const FOUR_BARS = () => seed([piece(1), piece(2)], [], true)
  const cells = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.ct-measure-cell'))

  beforeEach(() => {
    localStorage.clear()
    auth.status = 'unauthenticated'
    engineSpies.start.mockClear()
    engineSpies.stop.mockClear()
    cloud.loadCloudClickTracks.mockReset().mockResolvedValue([])
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one cell per repeat, labelled only on the first bar of a segment', () => {
    FOUR_BARS()
    const { container } = renderPage()
    expect(cells(container)).toHaveLength(4)
    expect(Array.from(container.querySelectorAll('.ct-measure-label')).map((el) => el.textContent)).toEqual(['Old 1', 'Old 2'])
    expect(cells(container).map((c) => c.querySelector('.ct-measure-count')!.textContent)).toEqual(['1', '2', '3', '4'])
    expect(cells(container).map((c) => c.querySelector('.ct-measure-info')!.textContent)).toEqual([
      '4/4·101 bpm', '4/4·101 bpm', '4/4·102 bpm', '4/4·102 bpm',
    ])
  })

  it('selects a bar on click, shows the loop bar, and deselects it on a second click', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[1]!)
    expect(cells(container)[1]).toHaveClass('is-selected')
    expect(cells(container)[0]).not.toHaveClass('is-selected')
    expect(screen.getByText(/Loop: measures 2–2 \(1 selected\)/)).toBeInTheDocument()

    await userEvent.click(cells(container)[1]!)
    expect(cells(container)[1]).not.toHaveClass('is-selected')
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
  })

  it('adds separate clicks to the selection', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    await userEvent.click(cells(container)[3]!)
    expect(screen.getByText(/Loop: measures 1–4 \(2 selected\)/)).toBeInTheDocument()
    expect(cells(container).map((c) => c.classList.contains('is-selected'))).toEqual([true, false, false, true])
  })

  it('selects the whole range between the last clicked bar and a shift-clicked one', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    fireEvent.click(cells(container)[2]!, { shiftKey: true })
    expect(screen.getByText(/Loop: measures 1–3 \(3 selected\)/)).toBeInTheDocument()
    expect(cells(container).map((c) => c.classList.contains('is-selected'))).toEqual([true, true, true, false])
  })

  it('treats a shift-click with no earlier click as a plain toggle', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    fireEvent.click(cells(container)[2]!, { shiftKey: true })
    expect(screen.getByText(/Loop: measures 3–3 \(1 selected\)/)).toBeInTheDocument()
  })

  it('stops playback when a bar is selected during playback', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    expect(engineSpies.start).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()

    await userEvent.click(cells(container)[1]!)
    expect(engineSpies.stop).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument()
    expect(cells(container)[1]).toHaveClass('is-selected')
  })

  it('starts playback from the chosen bar of the right segment and repeat', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    const playButtons = within(container).getAllByRole('button', { name: /Play from here/ })
    expect(playButtons).toHaveLength(4)

    await userEvent.click(playButtons[3]!) // bar 4 = second repeat of the second segment
    expect(engineSpies.start).toHaveBeenCalledTimes(1)
    const args = engineSpies.start.mock.calls[0]!
    expect((args[0] as TrackPiece[]).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(args[1]).toBe(1) // piece index
    expect(args[8]).toBe(1) // repetition within the piece
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })

  it('does not select the bar whose play-from-here button was pressed', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(within(container).getAllByRole('button', { name: /Play from here/ })[0]!)
    expect(container.querySelector('.is-selected')).not.toBeInTheDocument()
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
  })

  it('clears the loop selection when playback starts from a bar', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    expect(screen.getByText(/Loop: measures/)).toBeInTheDocument()
    await userEvent.click(within(container).getAllByRole('button', { name: /Play from here/ })[2]!)
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
  })

  it('disables every play-from-here button while playing', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    for (const button of within(container).getAllByRole('button', { name: /Play from here/ })) {
      expect(button).toBeDisabled()
    }
  })

  it('loops the selected range when Play is pressed with bars selected', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[1]!)
    fireEvent.click(cells(container)[2]!, { shiftKey: true })
    await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    const args = engineSpies.start.mock.calls[0]!
    expect(args.slice(1, 2)).toEqual([0]) // start piece
    expect(args[8]).toBe(1) // start repetition
    expect(args[9]).toBe(true) // loop
    expect(args[10]).toBe(1) // end piece
    expect(args[11]).toBe(0) // end repetition
  })

  it('clears the Clear button selection', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
  })

  it('clears the loop selection when the track is reset', async () => {
    FOUR_BARS()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    expect(screen.getByText(/Loop: measures/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
    expect(stored().pieces).toEqual([])
    expect(engineSpies.stop).toHaveBeenCalled()
  })

  it('keeps the selection and the track when reset is declined', async () => {
    FOUR_BARS()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    await userEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(screen.getByText(/Loop: measures/)).toBeInTheDocument()
    expect(stored().pieces).toHaveLength(2)
  })

  it('clears the loop selection and stops playback when a saved track is loaded', async () => {
    auth.status = 'authenticated'
    const saved: CloudClickTrack = { id: 'c1', name: 'Saved song', pieces: [piece(7, { repeats: 1 })], groups: [] }
    cloud.loadCloudClickTracks.mockResolvedValue([saved])
    FOUR_BARS()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    expect(screen.getByText(/Loop: measures/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Load$/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Saved song/ }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
    expect(cells(container)).toHaveLength(1)
    expect(stored().pieces.map((p) => p.id)).toEqual(['p7'])
    expect(engineSpies.stop).toHaveBeenCalled()
  })

  it('leaves the selection alone when replacing the track with a saved one is declined', async () => {
    auth.status = 'authenticated'
    cloud.loadCloudClickTracks.mockResolvedValue([{ id: 'c1', name: 'Saved song', pieces: [piece(7)], groups: [] }])
    FOUR_BARS()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)

    await userEvent.click(screen.getByRole('button', { name: /^Load$/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Saved song/ }))

    expect(screen.getByText(/Loop: measures/)).toBeInTheDocument()
    expect(stored().pieces.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('stops playback as soon as an import file is picked, before the dialog finishes parsing', async () => {
    seed([piece(1)])
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
    engineSpies.stop.mockClear()

    await pickFile()
    expect(engineSpies.stop).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument()
  })

  it('does not stop playback when the file picker is dismissed without a file', async () => {
    seed([piece(1)])
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    engineSpies.stop.mockClear()
    await userEvent.upload(screen.getByLabelText('Guitar Pro or AlphaTex file'), [])
    expect(engineSpies.stop).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })

  it('keeps cell handlers working after the track changes (they always call the latest closure)', async () => {
    FOUR_BARS()
    const { container } = renderPage()
    await userEvent.click(cells(container)[0]!)
    // Add a segment: the page re-renders with a new startFrom closure over the longer track.
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }))
    await userEvent.click(within(container).getAllByRole('button', { name: /Play from here/ })[0]!)
    const startedWith = engineSpies.start.mock.calls.at(-1)![0] as TrackPiece[]
    expect(startedWith).toHaveLength(3)
  })
})

describe('ClickTrackPage: every way of replacing the track drops the old selection', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  async function selectFirstBar(container: HTMLElement) {
    await userEvent.click(container.querySelector('.ct-measure-cell')!)
    expect(screen.getByText(/Loop: measures 1–1/)).toBeInTheDocument()
  }

  it('after loading a tab-editor track from the banner', async () => {
    seed([piece(1)], [], true)
    sessionStorage.setItem('tab-to-click-import', JSON.stringify([piece(9)]))
    const { container } = renderPage()
    await selectFirstBar(container)

    await userEvent.click(screen.getByRole('button', { name: 'Load' }))

    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
    expect(stored().pieces.map((p) => p.label)).toEqual(['Old 9'])
  })

  it('after loading a shared track from the banner, which also replaces the groups', async () => {
    seed([piece(1, { groupId: 'g1' })], [{ id: 'g1', name: 'Verse', color: '#ff0000' }], true)
    const shared = btoa(encodeURIComponent(JSON.stringify({ pieces: [piece(7)], groups: [] })))
    window.history.replaceState({}, '', `/?t=${shared}`)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = renderPage()
    await selectFirstBar(container)

    await userEvent.click(await screen.findByRole('button', { name: 'Load' }))

    expect(screen.queryByText(/Loop: measures/)).not.toBeInTheDocument()
    expect(stored().pieces.map((p) => p.label)).toEqual(['Old 7'])
    expect(stored().groups).toEqual([])
  })
})

describe('ClickTrackPage: Open from a band set list', () => {
  const KEY = 'band-to-click-import'
  const handoff = (pieces: TrackPiece[], over: Record<string, unknown> = {}) =>
    sessionStorage.setItem(KEY, JSON.stringify({ pieces, groups: [], title: 'Black Dog', at: Date.now(), ...over }))

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    auth.status = 'unauthenticated'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('loads the band track straight into an empty editor, persists it, and forgets the hand-off', async () => {
    handoff([piece(1, { label: 'Riff' })])
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('.ct-piece-card')).toHaveLength(1))
    expect(screen.queryByText(/load it\?/)).not.toBeInTheDocument()
    expect(stored().pieces.map((p) => p.label)).toEqual(['Riff'])
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('only offers the track when the editor already has work, and replaces nothing until asked', async () => {
    seed([piece(9)])
    handoff([piece(1, { label: 'Riff' })])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    expect(await screen.findByText('“Black Dog” click track from your band — load it?')).toBeInTheDocument()
    expect(stored().pieces.map((p) => p.label)).toEqual(['Old 9'])
    expect(sessionStorage.getItem(KEY)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(confirm).toHaveBeenCalledWith('Replace current track with the band’s click track?')
    expect(stored().pieces.map((p) => p.label)).toEqual(['Riff'])
    expect(screen.queryByText(/load it\?/)).not.toBeInTheDocument()
  })

  it('keeps the current track when the replacement is declined, and Dismiss drops the offer', async () => {
    seed([piece(9)])
    handoff([piece(1)])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Load' }))
    expect(stored().pieces.map((p) => p.label)).toEqual(['Old 9'])
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/load it\?/)).not.toBeInTheDocument()
  })

  it('ignores a stale, damaged or foreign hand-off, but still clears it', async () => {
    for (const raw of [
      JSON.stringify({ pieces: [piece(1)], groups: [], title: 't', at: Date.now() - 10 * 60_000 }),
      JSON.stringify({ pieces: [{ id: 'x' }], groups: [], title: 't', at: Date.now() }),
      'not json',
    ]) {
      sessionStorage.setItem(KEY, raw)
      const { container, unmount } = renderPage()
      expect(container.querySelectorAll('.ct-piece-card')).toHaveLength(0)
      expect(screen.queryByText(/load it\?/)).not.toBeInTheDocument()
      expect(sessionStorage.getItem(KEY)).toBeNull()
      unmount()
      localStorage.clear()
    }
  })

  it('does not offer the track a second time on the next visit', async () => {
    seed([piece(9)])
    handoff([piece(1)])
    const first = renderPage()
    await screen.findByText(/load it\?/)
    first.unmount()
    renderPage()
    expect(screen.queryByText(/load it\?/)).not.toBeInTheDocument()
  })
})

describe('ClickTrackPage: Save to Band', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('is not offered to a signed-out visitor', () => {
    auth.status = 'unauthenticated'
    seed([piece(1)])
    renderPage()
    expect(screen.queryByRole('button', { name: /Save to Band/ })).not.toBeInTheDocument()
  })

  it('is disabled until the track has a segment, and opens the band picker once it does', async () => {
    auth.status = 'authenticated'
    const empty = renderPage()
    expect(screen.getByRole('button', { name: /Save to Band/ })).toBeDisabled()
    empty.unmount()

    seed([piece(1)])
    renderPage()
    const button = screen.getByRole('button', { name: /Save to Band/ })
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(await screen.findByRole('dialog', { name: 'Save to a band' })).toBeInTheDocument()
  })
})

describe('ClickTrackPage: downloads', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(exportClickTrack).mockReset()
    vi.mocked(exportClickTrack).mockResolvedValue(undefined)
  })

  // While exporting, both buttons read "Exporting…", so find them by position (WAV first, MP3 second).
  const downloadButtons = () => screen.getAllByRole('button', { name: /^(Download WAV|Download MP3|Exporting…)$/ })
  const wavButton = () => downloadButtons()[0]!
  const mp3Button = () => downloadButtons()[1]!

  it('offers both downloads, disabled while the track is empty', () => {
    renderPage()
    expect(wavButton()).toBeDisabled()
    expect(mp3Button()).toBeDisabled()
  })

  it('Download WAV renders the track as a WAV with the default file name', async () => {
    const pieces = [piece(1)]
    seed(pieces)
    renderPage()
    await userEvent.click(wavButton())
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(1))
    expect(exportClickTrack).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'p1' })]), 100, undefined, 'wav', expect.any(AbortSignal))
  })

  it('Download MP3 renders the track as an MP3 with the default file name', async () => {
    seed([piece(1)])
    renderPage()
    await userEvent.click(mp3Button())
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(1))
    expect(exportClickTrack).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'p1' })]), 100, undefined, 'mp3', expect.any(AbortSignal))
  })

  it('passes the chosen speed to the exporter', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pieces: [piece(1)], groups: [], speedPercent: 50, expandView: false, countdownEnabled: false }))
    renderPage()
    await userEvent.click(mp3Button())
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(1))
    expect(vi.mocked(exportClickTrack).mock.calls[0]![1]).toBe(50)
  })

  it('disables both downloads while an export is running, and re-enables them afterwards', async () => {
    let finish!: () => void
    vi.mocked(exportClickTrack).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    seed([piece(1)])
    renderPage()
    await userEvent.click(mp3Button())
    await waitFor(() => expect(mp3Button()).toBeDisabled())
    expect(wavButton()).toBeDisabled()
    expect(wavButton()).toHaveTextContent('Exporting')
    expect(mp3Button()).toHaveTextContent('Exporting')

    // a second click while busy does nothing
    fireEvent.click(mp3Button())
    expect(exportClickTrack).toHaveBeenCalledTimes(1)

    finish()
    await waitFor(() => expect(mp3Button()).toBeEnabled())
    expect(wavButton()).toBeEnabled()
    expect(wavButton()).toHaveTextContent('Download WAV')
    expect(mp3Button()).toHaveTextContent('Download MP3')
  })

  it('shows the audio-file error when an MP3 export fails (e.g. the encoder cannot load), and clears it on the next attempt', async () => {
    vi.mocked(exportClickTrack).mockRejectedValueOnce(new Error('encoder failed to load'))
    seed([piece(1)])
    renderPage()
    await userEvent.click(mp3Button())
    const alert = await screen.findByText(/Couldn't create the audio file/)
    expect(alert).toHaveTextContent(/MP3 encoder couldn't load; try WAV/)

    await userEvent.click(wavButton())
    await waitFor(() => expect(screen.queryByText(/Couldn't create the audio file/)).not.toBeInTheDocument())
    expect(exportClickTrack).toHaveBeenCalledTimes(2)
  })

  it('hints on the MP3 button that it adds a short delay, so the WAV is the one to line up with other audio', () => {
    seed([piece(1)])
    renderPage()
    expect(mp3Button()).toHaveAttribute('title', expect.stringMatching(/smaller file.*MP3 adds a short delay.*WAV/))
  })

  it('aborts a running export when the page is left, without a failure banner or a state-update warning', async () => {
    let fail!: (err: unknown) => void
    vi.mocked(exportClickTrack).mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    seed([piece(1)])
    const view = renderPage()
    await userEvent.click(mp3Button())
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(1))
    const signal = vi.mocked(exportClickTrack).mock.calls[0]![4]!
    expect(signal.aborted).toBe(false)

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    view.unmount()
    expect(signal.aborted).toBe(true)
    fail(signal.reason)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('shares one signal across exports while the page stays open', async () => {
    seed([piece(1)])
    renderPage()
    await userEvent.click(wavButton())
    await waitFor(() => expect(wavButton()).toBeEnabled())
    await userEvent.click(mp3Button())
    await waitFor(() => expect(exportClickTrack).toHaveBeenCalledTimes(2))
    const [first, second] = vi.mocked(exportClickTrack).mock.calls.map((c) => c[4]!)
    expect(first).toBe(second)
    expect(first!.aborted).toBe(false)
  })

  it('disables both downloads while the track is playing', async () => {
    seed([piece(1)])
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^Play$/ }))
    await waitFor(() => expect(mp3Button()).toBeDisabled())
    expect(wavButton()).toBeDisabled()
  })
})
