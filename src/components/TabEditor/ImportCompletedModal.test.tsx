import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportCompletedModal } from './ImportCompletedModal'
import type { ImportedTrackInfo } from '../../tabEditorTypes'

// ─── helpers ─────────────────────────────────────────────────────────────────

const defaultSingleTrackInfos: ImportedTrackInfo[] = [
  { index: 0, name: 'Guitar', stringCount: 6 },
]

const defaultMultiTrackInfos: ImportedTrackInfo[] = [
  { index: 0, name: 'Guitar', stringCount: 6 },
  { index: 1, name: 'Bass', stringCount: 4 },
  { index: 2, name: 'Drums', stringCount: 6 },
]

// ─── ImportCompletedModal: basic rendering ───────────────────────────────────

describe('ImportCompletedModal', () => {
  it('renders the dialog title when open', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Import complete')).toBeInTheDocument()
  })

  it('does not render dialog content when open=false', () => {
    render(
      <ImportCompletedModal
        open={false}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText('Import complete')).not.toBeInTheDocument()
  })

  it('shows "Open tab" and "Cancel" action buttons', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /open tab/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })
})

// ─── Single-track: no track list shown ───────────────────────────────────────

describe('ImportCompletedModal single-track', () => {
  it('does not show the track selection section for a single track', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/tracks\./i)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows "all features supported" message when unsupportedFeatures is empty', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/all features in this file are supported/i)).toBeInTheDocument()
  })

  it('calls onConfirm with index 0 when "Open tab" is clicked on a single track', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /open tab/i }))
    expect(onConfirm).toHaveBeenCalledWith(0)
  })

  it('calls onCancel when "Cancel" is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})

// ─── Multi-track: shows radio buttons ────────────────────────────────────────

describe('ImportCompletedModal multi-track', () => {
  it('shows a track selection section for multi-track files', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/3 tracks/i)).toBeInTheDocument()
  })

  it('renders a radio button for each track', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
  })

  it('renders track names as labels', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Guitar/)).toBeInTheDocument()
    expect(screen.getByText(/Bass/)).toBeInTheDocument()
    expect(screen.getByText(/Drums/)).toBeInTheDocument()
  })

  it('shows string count next to track name', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/4-string/)).toBeInTheDocument()
  })

  it('first radio button is selected by default', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios[0]?.checked).toBe(true)
    expect(radios[1]?.checked).toBe(false)
  })

  it('selecting a radio updates the checked state', async () => {
    const user = userEvent.setup()
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    await user.click(radios[1]!)
    expect(radios[1]?.checked).toBe(true)
    expect(radios[0]?.checked).toBe(false)
  })

  it('calls onConfirm with the selected track index when "Open tab" is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultMultiTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    await user.click(radios[2]!)
    await user.click(screen.getByRole('button', { name: /open tab/i }))
    expect(onConfirm).toHaveBeenCalledWith(2)
  })

  it('shows fallback track name "Track N" when track name is empty', () => {
    const infos: ImportedTrackInfo[] = [
      { index: 0, name: '', stringCount: 6 },
      { index: 1, name: '', stringCount: 6 },
    ]
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={infos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Track 1/)).toBeInTheDocument()
    expect(screen.getByText(/Track 2/)).toBeInTheDocument()
  })
})

// ─── Unsupported features section ────────────────────────────────────────────

describe('ImportCompletedModal unsupported features', () => {
  it('shows a toggle button with the count of unsupported features', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={['Grace notes', 'Lyrics', 'Ottava (8va / 8vb) markers']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/3 features/i)).toBeInTheDocument()
  })

  it('shows singular "feature" for exactly one unsupported feature', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={['Grace notes']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 feature /i)).toBeInTheDocument()
  })

  it('does not show the list initially (collapsed)', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={['Grace notes', 'Lyrics']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText('Grace notes')).not.toBeInTheDocument()
  })

  it('expands the list when the toggle button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={['Grace notes', 'Lyrics']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByText(/2 features/i))
    expect(screen.getByText('Grace notes')).toBeInTheDocument()
    expect(screen.getByText('Lyrics')).toBeInTheDocument()
  })

  it('collapses the list when the toggle button is clicked twice', async () => {
    const user = userEvent.setup()
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={['Grace notes']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const toggleBtn = screen.getByText(/1 feature /i)
    await user.click(toggleBtn)
    expect(screen.getByText('Grace notes')).toBeInTheDocument()
    await user.click(toggleBtn)
    expect(screen.queryByText('Grace notes')).not.toBeInTheDocument()
  })

  it('does not show the unsupported section when features list is empty', () => {
    render(
      <ImportCompletedModal
        open={true}
        trackInfos={defaultSingleTrackInfos}
        unsupportedFeatures={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/not editable/i)).not.toBeInTheDocument()
  })
})
