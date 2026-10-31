import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportTempoMapIntroDialog } from './ImportTempoMapIntroDialog'

function setup(open = true) {
  const calls: string[] = []
  const onOpenChange = vi.fn((value: boolean) => {
    calls.push(`open:${value}`)
  })
  const onChooseFile = vi.fn(() => {
    calls.push('choose')
  })
  const onFileDropped = vi.fn((file: File) => {
    calls.push(`dropped:${file.name}`)
  })
  render(
    <ImportTempoMapIntroDialog
      open={open}
      onOpenChange={onOpenChange}
      onChooseFile={onChooseFile}
      onFileDropped={onFileDropped}
    />,
  )
  return { calls, onOpenChange, onChooseFile, onFileDropped }
}

const file = (name: string) => new File(['x'], name)
const fileDrag = (files: File[] = []) => ({ dataTransfer: { types: ['Files'], files } })
const IDLE_TEXT = 'Drag a .gp or .alphatex file here'
const ACTIVE_TEXT = 'Drop to import'

describe('ImportTempoMapIntroDialog', () => {
  it('renders nothing when closed', () => {
    setup(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title and description when open', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Import tempo map' })
    expect(within(dialog).getByText(/tempo and time signature changes into a click track/)).toBeInTheDocument()
  })

  it('lists the accepted file types .gp and .alphatex', () => {
    setup()
    const accepted = screen.getByRole('region', { name: 'Accepted files' })
    const items = within(accepted).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('.gp')
    expect(items[0]).toHaveTextContent('Guitar Pro 7 or 8')
    expect(items[1]).toHaveTextContent('.alphatex')
  })

  it('says .gpx files are not supported and how to convert them', () => {
    setup()
    const accepted = screen.getByRole('region', { name: 'Accepted files' })
    expect(within(accepted).getByText(/\.gpx\) aren't supported/)).toBeInTheDocument()
    expect(within(accepted).getByText(/Save As and pick \.gp/)).toBeInTheDocument()
  })

  it('shows the 3 MB limit and the privacy note', () => {
    setup()
    expect(screen.getByText(/up to 3 MB/)).toBeInTheDocument()
    expect(screen.getByText(/isn't uploaded anywhere/)).toBeInTheDocument()
  })

  it('shows an example preview labelled as illustrative', () => {
    setup()
    const example = screen.getByRole('list', { name: 'Example result' })
    const rows = within(example).getAllByRole('listitem')
    // four example segments plus the "Example only" caption
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('4/4 ♩ 96 × 8')
    expect(rows[2]).toHaveTextContent('7/8 ♩ 120 × 4')
    expect(within(example).getByText(/Example only/)).toBeInTheDocument()
  })

  it('"Choose file…" closes the dialog first and then calls onChooseFile', async () => {
    const { calls, onOpenChange, onChooseFile } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Choose file/ }))

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onChooseFile).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['open:false', 'choose'])
  })

  it('Cancel only closes the dialog and does not open the picker', async () => {
    const { onOpenChange, onChooseFile } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onChooseFile).not.toHaveBeenCalled()
  })

  it('Escape closes the dialog without opening the picker', async () => {
    const { onOpenChange, onChooseFile } = setup()
    await userEvent.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onChooseFile).not.toHaveBeenCalled()
  })

  describe('drag and drop', () => {
    it('shows an idle drop zone', () => {
      setup()
      const zone = screen.getByText(IDLE_TEXT)
      expect(zone).toHaveAttribute('data-dragging', 'false')
    })

    it('closes first and then reports the dropped file', () => {
      const { calls, onOpenChange, onFileDropped } = setup()
      const dropped = file('song.gp')
      fireEvent.drop(screen.getByRole('dialog'), fileDrag([dropped]))

      expect(onOpenChange).toHaveBeenCalledTimes(1)
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(onFileDropped).toHaveBeenCalledTimes(1)
      expect(onFileDropped).toHaveBeenCalledWith(dropped)
      expect(calls).toEqual(['open:false', 'dropped:song.gp'])
    })

    it('uses only the first file when several are dropped', () => {
      const { onFileDropped } = setup()
      const first = file('a.gp')
      fireEvent.drop(screen.getByRole('dialog'), fileDrag([first, file('b.gp'), file('c.alphatex')]))

      expect(onFileDropped).toHaveBeenCalledTimes(1)
      expect(onFileDropped).toHaveBeenCalledWith(first)
    })

    it('accepts a drop on the drop zone itself (bubbles to the dialog)', () => {
      const { onFileDropped } = setup()
      const dropped = file('song.alphatex')
      fireEvent.drop(screen.getByText(IDLE_TEXT), fileDrag([dropped]))

      expect(onFileDropped).toHaveBeenCalledWith(dropped)
    })

    it('does nothing for a drop that carries no files', () => {
      const { onOpenChange, onFileDropped } = setup()
      fireEvent.drop(screen.getByRole('dialog'), fileDrag([]))

      expect(onOpenChange).not.toHaveBeenCalled()
      expect(onFileDropped).not.toHaveBeenCalled()
    })

    it('ignores a drop of something that is not a file (text, links)', () => {
      const { onOpenChange, onFileDropped } = setup()
      const notPrevented = fireEvent.drop(screen.getByRole('dialog'), {
        dataTransfer: { types: ['text/plain'], files: [file('sneaky.gp')] },
      })

      expect(onOpenChange).not.toHaveBeenCalled()
      expect(onFileDropped).not.toHaveBeenCalled()
      expect(notPrevented).toBe(true) // left alone: the dialog did not claim it
    })

    it('does not highlight for a non-file drag', () => {
      setup()
      const notPrevented = fireEvent.dragOver(screen.getByRole('dialog'), { dataTransfer: { types: ['text/plain'] } })

      expect(notPrevented).toBe(true)
      expect(screen.getByText(IDLE_TEXT)).toHaveAttribute('data-dragging', 'false')
    })

    it('highlights the zone while files are dragged over the dialog', () => {
      setup()
      fireEvent.dragOver(screen.getByRole('dialog'), fileDrag())

      const zone = screen.getByText(ACTIVE_TEXT)
      expect(zone).toHaveAttribute('data-dragging', 'true')
      expect(screen.queryByText(IDLE_TEXT)).not.toBeInTheDocument()
    })

    it('clears the highlight when the drag leaves the dialog', () => {
      setup()
      const dialog = screen.getByRole('dialog')
      fireEvent.dragOver(dialog, fileDrag())
      fireEvent(dialog, new MouseEvent('dragleave', { bubbles: true, relatedTarget: document.body }))

      expect(screen.getByText(IDLE_TEXT)).toHaveAttribute('data-dragging', 'false')
    })

    it('keeps the highlight when the drag only moves onto a child of the dialog', () => {
      setup()
      const dialog = screen.getByRole('dialog')
      fireEvent.dragOver(dialog, fileDrag())
      fireEvent(dialog, new MouseEvent('dragleave', { bubbles: true, relatedTarget: screen.getByText('Files it accepts') }))

      expect(screen.getByText(ACTIVE_TEXT)).toHaveAttribute('data-dragging', 'true')
    })

    it('clears the highlight when the dialog is closed mid-drag', async () => {
      setup()
      fireEvent.dragOver(screen.getByRole('dialog'), fileDrag())
      expect(screen.getByText(ACTIVE_TEXT)).toBeInTheDocument()

      await userEvent.keyboard('{Escape}')

      expect(screen.getByText(IDLE_TEXT)).toHaveAttribute('data-dragging', 'false')
    })

    it('clears the highlight after a drop, even one with no files', () => {
      setup()
      const dialog = screen.getByRole('dialog')
      fireEvent.dragOver(dialog, fileDrag())
      fireEvent.drop(dialog, fileDrag([]))

      expect(screen.getByText(IDLE_TEXT)).toHaveAttribute('data-dragging', 'false')
    })

    it('prevents the default action so the browser does not navigate to the file', () => {
      setup()
      const dialog = screen.getByRole('dialog')
      // fireEvent returns false when preventDefault was called on a cancelable event
      expect(fireEvent.dragOver(dialog, fileDrag())).toBe(false)
      expect(fireEvent.drop(dialog, fileDrag([file('song.gp')]))).toBe(false)
    })

    it('prevents the default action for a file drop with no files too', () => {
      setup()
      expect(fireEvent.drop(screen.getByRole('dialog'), fileDrag([]))).toBe(false)
    })
  })
})
