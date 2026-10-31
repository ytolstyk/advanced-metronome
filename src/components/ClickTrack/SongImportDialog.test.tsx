import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SongImportDialog } from './SongImportDialog'
import type { ImportMeta, ImportWarning, PlayedBar } from '@/utils/scoreToClickTrack'

const importScoreFile = vi.fn()

// Only the file reading is mocked; the real barsToPieces builds the segments the dialog shows.
vi.mock('@/utils/scoreToClickTrack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/scoreToClickTrack')>()),
  importScoreFile: (...args: unknown[]) => importScoreFile(...args) as unknown,
}))

const bar = (numerator: number, denominator: number, bpm: number, extra: Partial<PlayedBar> = {}): PlayedBar =>
  ({ numerator, denominator, bpm, isPickup: false, ...extra })
const meta = (extra: Partial<ImportMeta> = {}): ImportMeta => ({ title: 'Song', artist: 'Band', writtenBars: 4, hasGradualTempo: false, ...extra })

function resolveWith(bars: PlayedBar[], opts: { meta?: ImportMeta; warnings?: ImportWarning[] } = {}) {
  importScoreFile.mockResolvedValue({ bars, meta: opts.meta ?? meta({ writtenBars: bars.length }), warnings: opts.warnings ?? [] })
}

const file = (name = 'song.gp') => new File(['x'], name)

function renderDialog(props: Partial<React.ComponentProps<typeof SongImportDialog>> = {}) {
  const onAccept = vi.fn()
  const onClose = vi.fn()
  const utils = render(<SongImportDialog file={file()} trackIsEmpty onAccept={onAccept} onClose={onClose} {...props} />)
  return { onAccept, onClose, ...utils }
}

describe('SongImportDialog', () => {
  beforeEach(() => {
    importScoreFile.mockReset()
  })

  it('renders nothing while there is no file', () => {
    renderDialog({ file: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a reading state, then the preview', async () => {
    resolveWith([bar(4, 4, 120), bar(4, 4, 120), bar(3, 4, 90)])
    renderDialog()
    expect(screen.getByRole('status')).toHaveTextContent('Reading song.gp')
    expect(await screen.findByText('Song – Band')).toBeInTheDocument()
    expect(screen.getByText(/3 bars, 2 segments/)).toBeInTheDocument()
    expect(screen.getByText(/♩ 90–120, 4\/4 3\/4, 0:06 at 100% speed/)).toBeInTheDocument()
    const segments = screen.getByRole('list', { name: 'First segments' })
    expect(segments).toHaveTextContent('4/4 ♩=120 × 2')
    expect(segments).toHaveTextContent('3/4 ♩=90 × 1')
  })

  it('mentions written bars when repeats were expanded', async () => {
    resolveWith([bar(4, 4, 120), bar(4, 4, 120)], {
      meta: meta({ writtenBars: 1 }),
      warnings: [{ code: 'repeats-expanded', count: 2, firstBar: 1, message: 'Repeats and jumps expanded: 1 written bars play as 2.' }],
    })
    renderDialog()
    expect(await screen.findByText(/2 bars \(1 written\)/)).toBeInTheDocument()
  })

  it('shows a file error and only offers Close', async () => {
    importScoreFile.mockResolvedValue({ error: 'That doesn\'t look like a readable Guitar Pro or AlphaTex file.' })
    const { onClose } = renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('readable Guitar Pro')
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an import error (for example repeats that are too large)', async () => {
    importScoreFile.mockResolvedValue({ error: 'The repeat structure of this song is too large to import.' })
    renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('too large')
  })

  it('lists import warnings and the gradual-tempo note', async () => {
    resolveWith([bar(4, 4, 120)], {
      meta: meta({ hasGradualTempo: true }),
      warnings: [{ code: 'fermata', count: 2, firstBar: 7, message: '2 bars have a fermata; the click does not pause (first: bar 7).' }],
    })
    renderDialog()
    const notes = await screen.findByRole('list', { name: 'Import notes' })
    expect(notes).toHaveTextContent('2 bars have a fermata')
    expect(notes).toHaveTextContent('Gradual tempo changes')
  })

  it('warns about fast clicks and many segments from the built segments', async () => {
    resolveWith([bar(12, 8, 207), ...Array.from({ length: 70 }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109))])
    renderDialog()
    const notes = await screen.findByRole('list', { name: 'Import notes' })
    expect(notes).toHaveTextContent('414 clicks per minute')
    expect(notes).toHaveTextContent('71 segments')
  })

  it('refuses a song with too many segments and offers only Close', async () => {
    resolveWith(Array.from({ length: 401 }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109)))
    renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('401 segments')
    expect(screen.queryByRole('button', { name: /Import|Replace/ })).not.toBeInTheDocument()
  })

  it('labels the action by whether the track is empty and passes the segments on', async () => {
    resolveWith([bar(4, 4, 120)])
    const { onAccept, rerender } = renderDialog({ trackIsEmpty: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }))
    expect(onAccept).toHaveBeenCalledWith([expect.objectContaining({ bpm: 120, repeats: 1 })])

    rerender(<SongImportDialog file={file()} trackIsEmpty={false} onAccept={onAccept} onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Replace track' })).toBeInTheDocument()
  })

  it('offers to skip a pickup bar and rebuilds the segments without it', async () => {
    resolveWith([bar(1, 4, 100, { isPickup: true }), bar(4, 4, 100), bar(4, 4, 100)])
    const { onAccept } = renderDialog()
    const skip = await screen.findByRole('checkbox', { name: /Skip the 1\/4 pickup bar/ })
    expect(skip).not.toBeChecked()
    expect(screen.getByRole('list', { name: 'First segments' })).toHaveTextContent('1/4 ♩=100')

    await userEvent.click(skip)
    expect(screen.getByRole('list', { name: 'First segments' })).not.toHaveTextContent('1/4 ♩=100')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(onAccept).toHaveBeenCalledWith([expect.objectContaining({ timeSignature: { numerator: 4, denominator: 4 }, repeats: 2 })])
  })

  it('does not show the pickup option when the song has no pickup', async () => {
    resolveWith([bar(4, 4, 100)])
    renderDialog()
    await screen.findByRole('list', { name: 'First segments' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('ignores a slow result for a file that has since been replaced', async () => {
    let releaseFirst!: (value: unknown) => void
    importScoreFile
      .mockReturnValueOnce(new Promise((resolve) => { releaseFirst = resolve }))
      .mockResolvedValueOnce({ bars: [bar(3, 4, 60)], meta: meta({ title: 'Second', writtenBars: 1 }), warnings: [] })
    const { rerender, onAccept, onClose } = renderDialog({ file: file('first.gp') })
    await waitFor(() => expect(importScoreFile).toHaveBeenCalledTimes(1)) // the first read is now genuinely in flight
    rerender(<SongImportDialog file={file('second.gp')} trackIsEmpty onAccept={onAccept} onClose={onClose} />)
    expect(await screen.findByText(/Second/)).toBeInTheDocument()
    await act(async () => {
      releaseFirst({ bars: [bar(4, 4, 200)], meta: meta({ title: 'First', writtenBars: 1 }), warnings: [] })
    }) // the late result has now been delivered and must have been ignored
    expect(screen.queryByText(/First/)).not.toBeInTheDocument()
    expect(screen.getByText(/Second/)).toBeInTheDocument()
  })

  it('closes from Cancel', async () => {
    resolveWith([bar(4, 4, 120)])
    const { onClose } = renderDialog()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('SongImportDialog details', () => {
  beforeEach(() => {
    importScoreFile.mockReset()
  })

  it('shows the artist alone, or no heading at all, when the title is missing', async () => {
    resolveWith([bar(4, 4, 120)], { meta: meta({ title: '', artist: 'Only Artist' }) })
    const first = renderDialog()
    expect(await screen.findByText('Only Artist')).toBeInTheDocument()
    first.unmount()

    resolveWith([bar(4, 4, 120)], { meta: meta({ title: '', artist: '' }) })
    renderDialog()
    await screen.findByRole('list', { name: 'First segments' })
    expect(screen.queryByText('–')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Song/)).not.toBeInTheDocument()
  })

  it('uses singular wording for a one-bar, one-segment song and a single tempo', async () => {
    resolveWith([bar(4, 4, 120)], { meta: meta({ writtenBars: 1 }) })
    renderDialog()
    expect(await screen.findByText(/1 bar, 1 segment, ♩ 120, 4\/4, 0:02 at 100% speed/)).toBeInTheDocument()
  })

  it('formats a long song as minutes and zero-padded seconds', async () => {
    // 31 bars of 4/4 at 120 = 62 seconds
    resolveWith(Array.from({ length: 31 }, () => bar(4, 4, 120)))
    renderDialog()
    expect(await screen.findByText(/1:02 at 100% speed/)).toBeInTheDocument()
  })

  it('previews only the first 8 segments and counts the rest', async () => {
    resolveWith(Array.from({ length: 12 }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109)))
    renderDialog()
    const list = await screen.findByRole('list', { name: 'First segments' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(9) // 8 segments + the "and N more" line
    expect(list).toHaveTextContent('…and 4 more')
  })

  it('does not show the "and N more" line when everything fits', async () => {
    resolveWith(Array.from({ length: 8 }, (_, i) => bar(i % 2 ? 7 : 5, 8, 109)))
    renderDialog()
    const list = await screen.findByRole('list', { name: 'First segments' })
    expect(list).not.toHaveTextContent('more')
  })

  it('explains per-eighth clicking only for /8 or finer signatures', async () => {
    resolveWith([bar(6, 8, 100)])
    const eighth = renderDialog()
    expect(await screen.findByText(/a 6\/8 bar clicks six times/)).toBeInTheDocument()
    eighth.unmount()

    resolveWith([bar(4, 4, 100)])
    renderDialog()
    await screen.findByRole('list', { name: 'First segments' })
    expect(screen.queryByText(/a 6\/8 bar clicks six times/)).not.toBeInTheDocument()
  })

  it('mentions the count-in and pickup numbering only when there is a pickup', async () => {
    resolveWith([bar(1, 4, 100, { isPickup: true }), bar(4, 4, 100)])
    const withPickup = renderDialog()
    expect(await screen.findByText(/count-in is separate from a pickup bar/)).toBeInTheDocument()
    expect(screen.getByText(/including the pickup/)).toBeInTheDocument()
    withPickup.unmount()

    resolveWith([bar(4, 4, 100)])
    renderDialog()
    await screen.findByRole('list', { name: 'First segments' })
    expect(screen.queryByText(/count-in is separate/)).not.toBeInTheDocument()
    expect(screen.queryByText(/including the pickup/)).not.toBeInTheDocument()
  })

  it('always reminds that the drum machine keeps only 8 measures', async () => {
    resolveWith([bar(4, 4, 100)])
    renderDialog()
    expect(await screen.findByText(/keeps only its first 8 measures/)).toBeInTheDocument()
  })

  it('shows the rounding hint scaled to the slowest tempo', async () => {
    resolveWith([bar(4, 4, 100), bar(4, 4, 200)])
    renderDialog()
    expect(await screen.findByText(/up to about 0\.5%/)).toBeInTheDocument()
  })

  it('shows no notes list when there are no warnings and no gradual tempo', async () => {
    resolveWith([bar(4, 4, 100)])
    renderDialog()
    await screen.findByRole('list', { name: 'First segments' })
    expect(screen.queryByRole('list', { name: 'Import notes' })).not.toBeInTheDocument()
  })

  it('keeps the skip-pickup option when skipping leaves nothing, so the choice can be undone', async () => {
    resolveWith([bar(1, 4, 100, { isPickup: true })])
    renderDialog()
    const skip = await screen.findByRole('checkbox', { name: /Skip the 1\/4 pickup bar/ })
    await userEvent.click(skip)
    expect(await screen.findByRole('alert')).toHaveTextContent('no bars left')
    expect(screen.queryByRole('button', { name: /Import|Replace/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: /Skip the 1\/4 pickup bar/ }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('resets the skip-pickup choice when a different file is loaded', async () => {
    resolveWith([bar(1, 4, 100, { isPickup: true }), bar(4, 4, 100)])
    const { rerender, onAccept, onClose } = renderDialog({ file: file('a.gp') })
    await userEvent.click(await screen.findByRole('checkbox', { name: /Skip the 1\/4 pickup bar/ }))

    rerender(<SongImportDialog file={file('b.gp')} trackIsEmpty onAccept={onAccept} onClose={onClose} />)
    expect(await screen.findByRole('checkbox', { name: /Skip the 1\/4 pickup bar/ })).not.toBeChecked()
  })

  it('shows the reading state again, not the old preview, while a new file loads', async () => {
    resolveWith([bar(4, 4, 120)])
    const { rerender, onAccept, onClose } = renderDialog({ file: file('a.gp') })
    await screen.findByRole('list', { name: 'First segments' })

    importScoreFile.mockReturnValue(new Promise(() => {}))
    rerender(<SongImportDialog file={file('b.gp')} trackIsEmpty onAccept={onAccept} onClose={onClose} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading b.gp')
    expect(screen.queryByRole('list', { name: 'First segments' })).not.toBeInTheDocument()
  })

  it('closes when the dialog is dismissed with Escape', async () => {
    resolveWith([bar(4, 4, 120)])
    const { onClose } = renderDialog()
    await screen.findByRole('list', { name: 'First segments' })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onAccept for an error result', async () => {
    importScoreFile.mockResolvedValue({ error: 'nope' })
    const { onAccept } = renderDialog()
    await screen.findByRole('alert')
    expect(onAccept).not.toHaveBeenCalled()
  })
})
