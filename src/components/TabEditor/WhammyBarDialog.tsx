import { useState, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { WhammyBarData } from '@/tabEditorTypes'
import './WhammyBarDialog.css'

// Y-axis: +3 to -5 whole steps = +12 to -20 quarter-tones
const MAX_VALUE = 12    // quarter-tones (+3 whole steps)
const MIN_VALUE = -20   // quarter-tones (-5 whole steps)
const VALUE_RANGE = MAX_VALUE - MIN_VALUE  // 32 qt
const WHOLE_STEPS_ABOVE = 3
const WHOLE_STEPS_BELOW = 5
const GRID_ROWS = WHOLE_STEPS_ABOVE + WHOLE_STEPS_BELOW  // 8 rows (one per whole step)
const GRID_COLS = 60
const CELL_W = 10
const CELL_H = 30  // px per whole-step row
const SVG_W = GRID_COLS * CELL_W  // 600
const SVG_H = GRID_ROWS * CELL_H  // 240
const PAD_LEFT = 36
const PAD_BOTTOM = 24
const PAD_TOP = 8
const PAD_RIGHT = 8
const TOTAL_W = PAD_LEFT + SVG_W + PAD_RIGHT
const TOTAL_H = PAD_TOP + SVG_H + PAD_BOTTOM

const SNAP_QT = 2  // snap to half-step increments (2 quarter-tones)

function offsetToX(offset: number): number {
  return PAD_LEFT + offset * CELL_W
}

function valueToY(value: number): number {
  return PAD_TOP + ((MAX_VALUE - value) / VALUE_RANGE) * SVG_H
}

function xToOffset(x: number): number {
  return Math.max(0, Math.min(GRID_COLS, Math.round((x - PAD_LEFT) / CELL_W)))
}

function yToValue(y: number): number {
  const raw = MAX_VALUE - ((y - PAD_TOP) / SVG_H) * VALUE_RANGE
  const snapped = Math.round(raw / SNAP_QT) * SNAP_QT
  return Math.max(MIN_VALUE, Math.min(MAX_VALUE, snapped))
}

function formatSteps(quarterTones: number): string {
  const steps = quarterTones / 4
  if (steps === 0) return '0'
  return steps > 0 ? `+${steps}` : `${steps}`
}

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_WHAMMY_DATA: WhammyBarData = {
  points: [
    { offset: 0, value: 0 },
    { offset: 30, value: -12 },
    { offset: 60, value: 0 },
  ],
}

interface WhammyBarDialogProps {
  open: boolean
  initialData: WhammyBarData
  onSave: (data: WhammyBarData) => void
  onRemove?: () => void
  onClose: () => void
}

export function WhammyBarDialog({ open, initialData, onSave, onRemove, onClose }: WhammyBarDialogProps) {
  const [points, setPoints] = useState<Array<{ offset: number; value: number }>>(initialData.points)
  const draggingIdxRef = useRef<number | null>(null)
  const wasDraggingRef = useRef(false)

  const handleDotMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.stopPropagation()
    e.preventDefault()
    draggingIdxRef.current = idx
    wasDraggingRef.current = false
  }, [])

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingIdxRef.current === null) return
    wasDraggingRef.current = true
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const newOffset = xToOffset(x)
    const newValue = yToValue(y)
    const idx = draggingIdxRef.current
    setPoints((prev) => {
      const updated = [...prev]
      updated[idx] = { offset: newOffset, value: newValue }
      return updated.sort((a, b) => a.offset - b.offset)
    })
  }, [])

  const handleSvgMouseUp = useCallback(() => {
    draggingIdxRef.current = null
  }, [])

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const clickOffset = xToOffset(x)
    const clickValue = yToValue(y)

    const HIT_RADIUS = 10
    for (let i = 0; i < points.length; i++) {
      const px = offsetToX(points[i]!.offset)
      const py = valueToY(points[i]!.value)
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      if (dist <= HIT_RADIUS) {
        if (points.length <= 2) return
        setPoints(points.filter((_, idx) => idx !== i))
        return
      }
    }

    const newPoint = { offset: clickOffset, value: clickValue }
    const insertIdx = points.findIndex((p) => p.offset > clickOffset)
    const idx = insertIdx === -1 ? points.length : insertIdx
    const newPoints = [...points]
    newPoints.splice(idx, 0, newPoint)
    setPoints(newPoints)
  }, [points])

  // Grid lines
  const gridLines: React.ReactNode[] = []
  for (let step = -WHOLE_STEPS_BELOW; step <= WHOLE_STEPS_ABOVE; step++) {
    const qt = step * 4
    const y = valueToY(qt)
    const isZero = step === 0
    const stroke = isZero ? '#888' : step % 1 === 0 ? '#4a4a4a' : '#383838'
    const strokeWidth = isZero ? 2 : 1.25
    gridLines.push(
      <line key={`h${step}`} x1={PAD_LEFT} y1={y} x2={PAD_LEFT + SVG_W} y2={y}
        stroke={stroke} strokeWidth={strokeWidth} />
    )
  }
  for (let col = 0; col <= GRID_COLS; col += 15) {
    const x = offsetToX(col)
    gridLines.push(
      <line key={`v${col}`} x1={x} y1={PAD_TOP} x2={x} y2={PAD_TOP + SVG_H}
        stroke="#4a4a4a" strokeWidth={1.25} />
    )
  }

  // Y-axis labels (whole steps)
  const yLabels: React.ReactNode[] = []
  for (let step = -WHOLE_STEPS_BELOW; step <= WHOLE_STEPS_ABOVE; step++) {
    const qt = step * 4
    const y = valueToY(qt)
    const label = step === 0 ? '0' : step > 0 ? `+${step}` : `${step}`
    yLabels.push(
      <text key={`yl${step}`} x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle"
        fontSize={11} fill={step === 0 ? '#ccc' : '#888'}>
        {label}
      </text>
    )
  }

  // Straight-line segments between consecutive points
  const segmentElements: React.ReactNode[] = []
  const pointsSorted = [...points].sort((a, b) => a.offset - b.offset)
  if (pointsSorted.length >= 2) {
    const polyPts = pointsSorted.map(p => `${offsetToX(p.offset)},${valueToY(p.value)}`).join(' ')
    segmentElements.push(
      <polyline key="whammy-line" points={polyPts} stroke="#ff9944" strokeWidth={2} fill="none" />
    )
  }

  // Value labels at non-zero points
  const labelElements: React.ReactNode[] = []
  for (const pt of pointsSorted) {
    if (pt.value === 0) continue
    const x = offsetToX(pt.offset)
    const y = valueToY(pt.value)
    const labelY = pt.value > 0 ? y - 10 : y + 14
    labelElements.push(
      <text key={`lbl-${pt.offset}-${pt.value}`}
        x={x} y={labelY}
        textAnchor="middle"
        fontSize={10}
        fill="#ff9944"
        style={{ pointerEvents: 'none' }}
      >
        {formatSteps(pt.value)}
      </text>
    )
  }

  // Dot elements (draggable)
  const dotElements: React.ReactNode[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const x = offsetToX(p.offset)
    const y = valueToY(p.value)
    const removable = points.length > 2
    dotElements.push(
      <g key={`dot${i}`} onMouseDown={(e) => handleDotMouseDown(e, i)} style={{ cursor: 'grab' }}>
        <circle cx={x} cy={y} r={6} fill="#ff9944" />
        {removable && <circle cx={x} cy={y} r={10} fill="transparent" />}
      </g>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="whammy-dialog-content" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Whammy Bar Editor</DialogTitle>
        </DialogHeader>
        <div className="whammy-instructions">
          Click graph to add/remove points · Drag dots to reposition · Y-axis: whole steps (+3 up / -5 down)
        </div>
        <div className="whammy-svg-wrapper">
          <svg
            width={TOTAL_W}
            height={TOTAL_H}
            className="whammy-svg"
            onClick={handleSvgClick}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
          >
            {gridLines}
            {yLabels}
            {segmentElements}
            {labelElements}
            {dotElements}
          </svg>
        </div>
        <div className="whammy-footer">
          {onRemove && (
            <button className="whammy-btn whammy-btn-remove" onClick={onRemove}>
              Remove
            </button>
          )}
          <button className="whammy-btn whammy-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="whammy-btn whammy-btn-save"
            onClick={() => onSave({ points: [...points].sort((a, b) => a.offset - b.offset) })}>
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
