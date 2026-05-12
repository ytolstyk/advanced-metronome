import { useState, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { playTabNote } from '@/audio/tabGuitarSynths'
import type { BendCurve, BendData, BendPointDef } from '@/tabEditorTypes'
import './BendGraphDialog.css'

const GRID_COLS = 60
const GRID_ROWS = 24
const CELL_W = 10
const CELL_H = 12
const SVG_W = GRID_COLS * CELL_W   // 600
const SVG_H = GRID_ROWS * CELL_H   // 288
const PAD_LEFT = 36
const PAD_BOTTOM = 24
const PAD_TOP = 8
const PAD_RIGHT = 8
const TOTAL_W = PAD_LEFT + SVG_W + PAD_RIGHT
const TOTAL_H = PAD_TOP + SVG_H + PAD_BOTTOM

function offsetToX(offset: number): number {
  return PAD_LEFT + offset * CELL_W
}

function valueToY(value: number): number {
  return PAD_TOP + (GRID_ROWS - value) * CELL_H
}

function xToOffset(x: number): number {
  return Math.max(0, Math.min(GRID_COLS, Math.round((x - PAD_LEFT) / CELL_W)))
}

function yToValue(y: number): number {
  return Math.max(0, Math.min(GRID_ROWS, Math.round(GRID_ROWS - (y - PAD_TOP) / CELL_H)))
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function fretToFreq(openMidi: number, fret: number): number {
  return midiToFreq(openMidi) * Math.pow(2, fret / 12)
}

function segmentMidpoint(p1: BendPointDef, p2: BendPointDef, curve: BendCurve): { x: number; y: number } {
  const x1 = offsetToX(p1.offset)
  const y1 = valueToY(p1.value)
  const x2 = offsetToX(p2.offset)
  const y2 = valueToY(p2.value)
  if (curve === 'up') {
    // Q x2,y1 → midpoint = (x1 + 3x2)/4, (3y1 + y2)/4
    return { x: (x1 + 3 * x2) / 4, y: (3 * y1 + y2) / 4 }
  } else {
    // Q x1,y2 → midpoint = (3x1 + x2)/4, (y1 + 3y2)/4
    return { x: (3 * x1 + x2) / 4, y: (y1 + 3 * y2) / 4 }
  }
}

interface BendGraphDialogProps {
  open: boolean
  initialData: BendData
  noteFreq: number
  openMidi: number
  onSave: (data: BendData) => void
  onRemove?: () => void
  onClose: () => void
}

export function BendGraphDialog({ open, initialData, noteFreq, openMidi, onSave, onRemove, onClose }: BendGraphDialogProps) {
  const [points, setPoints] = useState<BendPointDef[]>(initialData.points)
  const [segments, setSegments] = useState<BendCurve[]>(initialData.segments)
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
    setPoints((prev) => {
      const updated = [...prev]
      updated[draggingIdxRef.current!] = { offset: newOffset, value: newValue }
      return updated
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

    // Check if near an existing point
    const HIT_RADIUS = 10
    for (let i = 0; i < points.length; i++) {
      const px = offsetToX(points[i]!.offset)
      const py = valueToY(points[i]!.value)
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      if (dist <= HIT_RADIUS) {
        if (points.length <= 2) return  // keep minimum 2 points
        const newPoints = points.filter((_, idx) => idx !== i)
        const newSegs = [...segments]
        newSegs.splice(i === 0 ? 0 : i - 1, 1)
        setPoints(newPoints)
        setSegments(newSegs)
        return
      }
    }

    // Insert new point sorted by offset
    const newPoint: BendPointDef = { offset: clickOffset, value: clickValue }
    const insertIdx = points.findIndex((p) => p.offset > clickOffset)
    const idx = insertIdx === -1 ? points.length : insertIdx
    const newPoints = [...points]
    newPoints.splice(idx, 0, newPoint)
    const newSegs = [...segments]
    const insertAt = Math.max(0, idx - 1)
    const inheritCurve = segments[insertAt] ?? segments[insertAt - 1] ?? ('up' as BendCurve)
    newSegs.splice(insertAt, 0, inheritCurve)
    setPoints(newPoints)
    setSegments(newSegs)
  }, [points, segments])

  const toggleSegment = useCallback((i: number) => {
    setSegments((prev) => prev.map((c, idx) => idx === i ? (c === 'up' ? 'down' : 'up') : c))
  }, [])

  const handlePreview = useCallback(() => {
    const ctx = new AudioContext()
    const freq = fretToFreq(openMidi, 0) // use open string; actual freq is noteFreq
    const env = playTabNote({
      ctx,
      freq: noteFreq,
      fret: 0,
      openMidi,
      modifiers: { bend: true },
      bendData: { points, segments },
      startTime: ctx.currentTime + 0.05,
      beatDuration: 1.5,
      nextFreq: null,
      vol: 0.65,
    })
    env.connect(ctx.destination)
    // Close context after sound finishes
    setTimeout(() => ctx.close(), 3000)
    void freq
  }, [noteFreq, openMidi, points, segments])

  // Render grid lines
  const gridLines: React.ReactNode[] = []

  // Horizontal lines
  for (let row = 0; row <= GRID_ROWS; row++) {
    const y = valueToY(row)
    let stroke = '#2a2a2a'
    let strokeWidth = 0.5
    if (row % 8 === 0) { stroke = '#555'; strokeWidth = 1 }
    else if (row % 4 === 0) { stroke = '#3d3d3d'; strokeWidth = 0.75 }
    gridLines.push(
      <line key={`h${row}`} x1={PAD_LEFT} y1={y} x2={PAD_LEFT + SVG_W} y2={y}
        stroke={stroke} strokeWidth={strokeWidth} />
    )
  }

  // Vertical lines at quarter intervals
  for (let col = 0; col <= GRID_COLS; col += 15) {
    const x = offsetToX(col)
    gridLines.push(
      <line key={`v${col}`} x1={x} y1={PAD_TOP} x2={x} y2={PAD_TOP + SVG_H}
        stroke="#3d3d3d" strokeWidth={0.75} />
    )
  }

  // Y-axis labels (whole steps)
  const yLabels: React.ReactNode[] = []
  for (let step = 0; step <= 3; step++) {
    const qtValue = step * 8
    const y = valueToY(qtValue)
    const label = step === 0 ? '0' : `${step}`
    yLabels.push(
      <text key={`yl${step}`} x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle"
        fontSize={9} fill="#777">
        {label}
      </text>
    )
  }

  // X-axis labels
  const xLabels: React.ReactNode[] = []
  const xLabelMap: Record<number, string> = { 0: '0', 15: '¼', 30: '½', 45: '¾', 60: '1' }
  for (const [col, label] of Object.entries(xLabelMap)) {
    const x = offsetToX(Number(col))
    xLabels.push(
      <text key={`xl${col}`} x={x} y={PAD_TOP + SVG_H + 14} textAnchor="middle"
        fontSize={9} fill="#777">
        {label}
      </text>
    )
  }

  // Segment paths and toggle hit areas
  const segmentElements: React.ReactNode[] = []
  for (let si = 0; si < segments.length; si++) {
    const p1 = points[si]!
    const p2 = points[si + 1]!
    const curve = segments[si]!
    const x1 = offsetToX(p1.offset)
    const y1 = valueToY(p1.value)
    const x2 = offsetToX(p2.offset)
    const y2 = valueToY(p2.value)
    const d = curve === 'up'
      ? `M ${x1},${y1} Q ${x2},${y1} ${x2},${y2}`
      : `M ${x1},${y1} Q ${x1},${y2} ${x2},${y2}`

    segmentElements.push(
      <path key={`seg${si}`} d={d} stroke="#ffaadd" strokeWidth={2} fill="none" />
    )

    // Arrow at endpoint
    const dy = y2 - y1
    if (Math.abs(dy) > 2) {
      const arrowY = y2
      const dir = dy < 0 ? -1 : 1  // -1 = value going up (y decreasing), 1 = going down
      segmentElements.push(
        <polygon key={`arr${si}`}
          points={`${x2 - 3},${arrowY + dir * 6} ${x2},${arrowY} ${x2 + 3},${arrowY + dir * 6}`}
          fill="#ffaadd"
        />
      )
    }

    // Midpoint toggle hit circle
    const mid = segmentMidpoint(p1, p2, curve)
    segmentElements.push(
      <g key={`tog${si}`} onClick={(e) => { e.stopPropagation(); toggleSegment(si) }}
        style={{ cursor: 'pointer' }}>
        <circle cx={mid.x} cy={mid.y} r={10} fill="transparent" />
        <circle cx={mid.x} cy={mid.y} r={4} fill="transparent" stroke="#ffaadd66" strokeWidth={1}
          className="bend-toggle-indicator" />
      </g>
    )
  }

  // Dot elements
  const dotElements: React.ReactNode[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const x = offsetToX(p.offset)
    const y = valueToY(p.value)
    const removable = points.length > 2
    dotElements.push(
      <g key={`dot${i}`} onMouseDown={(e) => handleDotMouseDown(e, i)} style={{ cursor: 'grab' }}>
        <circle cx={x} cy={y} r={6} fill="#ffaadd" />
        {removable && (
          <circle cx={x} cy={y} r={10} fill="transparent" />
        )}
      </g>
    )
  }

  // Step labels on Y-axis
  const stepUnitLabel = (
    <text x={PAD_LEFT - 6} y={PAD_TOP - 4} textAnchor="end" fontSize={8} fill="#555">steps</text>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bend-graph-dialog-content" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Bend Editor</DialogTitle>
        </DialogHeader>
        <div className="bend-graph-instructions">
          Click graph to add/remove points · Click curve midpoint to toggle up/down
        </div>
        <div className="bend-graph-svg-wrapper">
          <svg
            width={TOTAL_W}
            height={TOTAL_H}
            className="bend-graph-svg"
            onClick={handleSvgClick}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
          >
            {gridLines}
            {yLabels}
            {stepUnitLabel}
            {xLabels}
            {segmentElements}
            {dotElements}
          </svg>
        </div>
        <div className="bend-graph-footer">
          <button className="bend-graph-btn bend-graph-btn-preview" onClick={handlePreview}>
            ▶ Preview
          </button>
          <div className="bend-graph-footer-right">
            {onRemove && (
              <button className="bend-graph-btn bend-graph-btn-remove" onClick={onRemove}>
                Remove
              </button>
            )}
            <button className="bend-graph-btn bend-graph-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="bend-graph-btn bend-graph-btn-save"
              onClick={() => onSave({ points, segments })}>
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
