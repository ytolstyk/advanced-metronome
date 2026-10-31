import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MeasureCell } from './MeasureCell'
import type { MeasureCellProps } from './MeasureCell'

const DOTS: MeasureCellProps['dots'] = ['accent', 'beat', 'beat', 'beat']

function props(extra: Partial<MeasureCellProps> = {}): MeasureCellProps {
  return {
    pieceIndex: 2,
    rep: 3,
    flatIdx: 6,
    color: '#38bdf8',
    label: 'Verse',
    numerator: 4,
    denominator: 4,
    bpm: 120,
    dots: DOTS,
    isActive: false,
    isSelected: false,
    activeDot: -1,
    playDisabled: false,
    onSelect: vi.fn(),
    onPlayFrom: vi.fn(),
    ...extra,
  }
}

function cellOf(container: HTMLElement): HTMLElement {
  return container.querySelector('.ct-measure-cell') as HTMLElement
}

describe('MeasureCell', () => {
  it('shows the 1-based bar number, time signature and tempo', () => {
    const { container } = render(<MeasureCell {...props()} />)
    expect(container.querySelector('.ct-measure-count')).toHaveTextContent('7')
    expect(screen.getByText('4/4')).toBeInTheDocument()
    expect(screen.getByText('120 bpm')).toBeInTheDocument()
  })

  it('renders one dot per entry with its type class and exposes the segment colour as a CSS variable', () => {
    const { container } = render(<MeasureCell {...props()} />)
    const dots = container.querySelectorAll('.ct-dot')
    expect(dots).toHaveLength(4)
    expect(dots[0]).toHaveClass('ct-dot--accent')
    expect(dots[1]).toHaveClass('ct-dot--beat')
    expect(cellOf(container).style.getPropertyValue('--piece-color')).toBe('#38bdf8')
  })

  it('shows the segment label only when one is given', () => {
    const { container, rerender } = render(<MeasureCell {...props({ label: 'Chorus' })} />)
    expect(container.querySelector('.ct-measure-label')).toHaveTextContent('Chorus')
    rerender(<MeasureCell {...props({ label: '' })} />)
    expect(container.querySelector('.ct-measure-label')).not.toBeInTheDocument()
  })

  it('marks the active and selected states with classes', () => {
    const { container, rerender } = render(<MeasureCell {...props()} />)
    expect(cellOf(container)).not.toHaveClass('is-active-rep')
    expect(cellOf(container)).not.toHaveClass('is-selected')

    rerender(<MeasureCell {...props({ isActive: true })} />)
    expect(cellOf(container)).toHaveClass('is-active-rep')
    expect(cellOf(container)).not.toHaveClass('is-selected')

    rerender(<MeasureCell {...props({ isSelected: true })} />)
    expect(cellOf(container)).toHaveClass('is-selected')
    expect(cellOf(container)).not.toHaveClass('is-active-rep')
  })

  it('highlights only the dot that is clicking right now', () => {
    const { container } = render(<MeasureCell {...props({ isActive: true, activeDot: 2 })} />)
    const clicking = container.querySelectorAll('.ct-dot--clicking')
    expect(clicking).toHaveLength(1)
    expect(container.querySelectorAll('.ct-dot')[2]).toBe(clicking[0])
  })

  it('highlights no dot when activeDot is -1', () => {
    const { container } = render(<MeasureCell {...props()} />)
    expect(container.querySelector('.ct-dot--clicking')).not.toBeInTheDocument()
  })

  it('reports its flat index and shift state when clicked', async () => {
    const onSelect = vi.fn()
    const { container } = render(<MeasureCell {...props({ onSelect })} />)
    await userEvent.click(cellOf(container))
    expect(onSelect).toHaveBeenLastCalledWith(6, false)

    fireEvent.click(cellOf(container), { shiftKey: true })
    expect(onSelect).toHaveBeenLastCalledWith(6, true)
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('plays from this bar without also selecting it', async () => {
    const onSelect = vi.fn()
    const onPlayFrom = vi.fn()
    render(<MeasureCell {...props({ onSelect, onPlayFrom })} />)
    await userEvent.click(screen.getByRole('button', { name: /Play from here/ }))
    expect(onPlayFrom).toHaveBeenCalledTimes(1)
    expect(onPlayFrom).toHaveBeenCalledWith(2, 3)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('disables the play button while playing', async () => {
    const onPlayFrom = vi.fn()
    render(<MeasureCell {...props({ playDisabled: true, onPlayFrom })} />)
    const button = screen.getByRole('button', { name: /Play from here/ })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onPlayFrom).not.toHaveBeenCalled()
  })

  it('hands the active ref to the cell element', () => {
    const activeRef = vi.fn()
    const { container } = render(<MeasureCell {...props({ isActive: true, activeRef })} />)
    expect(activeRef).toHaveBeenCalledWith(cellOf(container))
  })

  describe('memoization', () => {
    // MeasureCell calls dots.map while rendering, so a spy on it counts renders.
    function renderCounted() {
      const dots = [...DOTS]
      const renders = vi.spyOn(dots, 'map')
      const base = props({ dots })
      const view = render(<MeasureCell {...base} />)
      return { base, renders, rerender: (next: MeasureCellProps) => view.rerender(<MeasureCell {...next} />) }
    }

    it('skips re-rendering when the parent re-renders with equal props', () => {
      const { base, renders, rerender } = renderCounted()
      expect(renders).toHaveBeenCalledTimes(1)
      rerender({ ...base }) // new props object, same field values (and the same dots/callback references)
      expect(renders).toHaveBeenCalledTimes(1)
    })

    it('re-renders when a prop that shows changes', () => {
      const { base, renders, rerender } = renderCounted()
      rerender({ ...base, isSelected: true })
      expect(renders).toHaveBeenCalledTimes(2)
    })

    it('re-renders when only the active dot moves', () => {
      const { base, renders, rerender } = renderCounted()
      rerender({ ...base, isActive: true, activeDot: 1 })
      expect(renders).toHaveBeenCalledTimes(2)
    })
  })
})
