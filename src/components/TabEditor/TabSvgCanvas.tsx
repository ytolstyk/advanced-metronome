import { useState, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { Measure, TabEditorState } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'
import { BEAT_WIDTHS, measureCapacityBeats, measureUsedBeats } from '../../tabEditorState'
import { TabMeasureSvg } from './TabMeasureSvg'
import { StaffViewSvg } from './StaffViewSvg'
import { STRING_LABEL_W, measureWidth, rowSvgHeight } from './tabSvgConstants'

interface TabSvgCanvasProps {
  state: TabEditorState
  containerWidth: number
  canvasRef: RefObject<HTMLDivElement | null>
  dispatch: React.Dispatch<TabEditorAction>
  onBeatMouseDown: (mi: number, bi: number, si: number, shiftKey: boolean) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
}

function getVirtualSlots(
  measure: Measure,
  timeSig: { numerator: number; denominator: number },
): number {
  const capacity = measureCapacityBeats(timeSig)
  const used = measureUsedBeats(measure.beats)
  return used < capacity - 1e-9 ? 1 : 0
}

function computeRows(
  measures: Measure[],
  showTimeSigMap: boolean[],
  timeSigs: Array<{ numerator: number; denominator: number }>,
  containerWidth: number,
): Measure[][] {
  const usable = containerWidth - STRING_LABEL_W - 32
  const rows: Measure[][] = []
  let row: Measure[] = []
  let rowW = 0
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i]
    const showTs = showTimeSigMap[i] ?? false
    const vSlots = getVirtualSlots(m, timeSigs[i]!)
    const mw = measureWidth(m, showTs, vSlots)
    if (rowW + mw > usable && row.length > 0) {
      rows.push(row)
      row = []
      rowW = 0
    }
    row.push(m)
    rowW += mw
  }
  if (row.length > 0) rows.push(row)
  return rows
}

function rowSvgWidth(
  rowMeasures: Measure[],
  rowStart: number,
  showTimeSigMap: boolean[],
  timeSigs: Array<{ numerator: number; denominator: number }>,
): number {
  return (
    STRING_LABEL_W +
    rowMeasures.reduce((s, m, i) => {
      const globalI = rowStart + i
      const vSlots = getVirtualSlots(m, timeSigs[globalI]!)
      return s + measureWidth(m, showTimeSigMap[globalI] ?? false, vSlots)
    }, 0)
  )
}

export function TabSvgCanvas({
  state,
  containerWidth,
  canvasRef,
  dispatch,
  onBeatMouseDown,
  onBeatMouseEnter,
}: TabSvgCanvasProps) {
  const { track, cursor, selection, noteSelection, playheadMeasure, playheadBeat, viewMode, activeDuration } = state

  const showTimeSigMap: boolean[] = track.measures.map((m, i) => {
    if (i === 0) return true
    const prev = track.measures[i - 1]
    const prevSig = prev.timeSignature ?? track.globalTimeSig
    const curSig = m.timeSignature ?? track.globalTimeSig
    return prevSig.numerator !== curSig.numerator || prevSig.denominator !== curSig.denominator
  })

  const timeSigs = track.measures.map((m) => m.timeSignature ?? track.globalTimeSig)

  const rows = computeRows(track.measures, showTimeSigMap, timeSigs, containerWidth)

  const globalMeasureMap = new Map<string, number>()
  track.measures.forEach((m, i) => globalMeasureMap.set(m.id, i))

  const [editingTimeSig, setEditingTimeSig] = useState<number | null>(null)
  const [editNum, setEditNum] = useState('')
  const [editDen, setEditDen] = useState('')
  const numInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTimeSig !== null) {
      numInputRef.current?.focus()
      numInputRef.current?.select()
    }
  }, [editingTimeSig])

  function openTimeSigEditor(mi: number) {
    const m = track.measures[mi]
    const sig = m.timeSignature ?? track.globalTimeSig
    setEditNum(String(sig.numerator))
    setEditDen(String(sig.denominator))
    setEditingTimeSig(mi)
  }

  function commitTimeSig() {
    if (editingTimeSig === null) return
    const n = parseInt(editNum, 10)
    const d = parseInt(editDen, 10)
    if (n > 0 && d > 0) {
      if (editingTimeSig === 0 && !track.measures[0].timeSignature) {
        dispatch({ type: 'SET_GLOBAL_TIME_SIG', numerator: n, denominator: d })
      } else {
        dispatch({ type: 'SET_MEASURE_TIME_SIG', measureIndex: editingTimeSig, numerator: n, denominator: d })
      }
    }
    setEditingTimeSig(null)
  }

  if (viewMode === 'staff') {
    return (
      <div className="tab-canvas" ref={canvasRef} tabIndex={0}>
        <StaffViewSvg
          rows={rows}
          globalMeasureMap={globalMeasureMap}
          track={track}
          cursor={cursor}
          playheadMeasure={playheadMeasure}
          playheadBeat={playheadBeat}
        />
      </div>
    )
  }

  const svgH = rowSvgHeight(track.stringCount)

  const rowStartIndices: number[] = []
  let acc = 0
  for (const rowMeasures of rows) {
    rowStartIndices.push(acc)
    acc += rowMeasures.length
  }

  return (
    <div className="tab-canvas" ref={canvasRef} tabIndex={0}>
      {rows.map((rowMeasures, rowIdx) => {
        const currentRowStart = rowStartIndices[rowIdx] ?? 0
        const svgW = rowSvgWidth(rowMeasures, currentRowStart, showTimeSigMap, timeSigs)

        const measureOffsets: number[] = []
        let xAcc = STRING_LABEL_W
        for (let mIdx = 0; mIdx < rowMeasures.length; mIdx++) {
          measureOffsets.push(xAcc)
          const globalMi = currentRowStart + mIdx
          const vSlots = getVirtualSlots(rowMeasures[mIdx]!, timeSigs[globalMi]!)
          xAcc += measureWidth(rowMeasures[mIdx]!, showTimeSigMap[globalMi] ?? false, vSlots)
        }

        return (
          <svg
            key={rowIdx}
            className="tab-svg-row"
            width={svgW}
            height={svgH}
            style={{ marginBottom: 24 }}
          >
            {rowMeasures.map((measure, mIdx) => {
              const mi = globalMeasureMap.get(measure.id) ?? 0
              const showTs = showTimeSigMap[mi] ?? false
              const sig = measure.timeSignature ?? track.globalTimeSig
              return (
                <TabMeasureSvg
                  key={measure.id}
                  measure={measure}
                  measureIndex={mi}
                  xOffset={measureOffsets[mIdx] ?? STRING_LABEL_W}
                  track={track}
                  cursor={cursor}
                  selection={selection}
                  noteSelection={noteSelection}
                  playheadMeasure={playheadMeasure}
                  playheadBeat={playheadBeat}
                  showTimeSig={showTs}
                  showStringLabels={mIdx === 0}
                  timeSig={sig}
                  activeDuration={activeDuration}
                  onTimeSigClick={openTimeSigEditor}
                  onBeatMouseDown={onBeatMouseDown}
                  onBeatMouseEnter={onBeatMouseEnter}
                />
              )
            })}
          </svg>
        )
      })}

      {/* Time signature editor overlay */}
      {editingTimeSig !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingTimeSig(null) }}
        >
          <div
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 200,
            }}
          >
            <span style={{ color: '#ccc', fontSize: '0.85rem', fontWeight: 600 }}>
              Time Signature — Measure {editingTimeSig + 1}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={numInputRef}
                type="number"
                min={1}
                max={32}
                value={editNum}
                onChange={(e) => setEditNum(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTimeSig() } if (e.key === 'Escape') setEditingTimeSig(null) }}
                style={{
                  width: 60,
                  background: '#111',
                  color: '#e0e0e0',
                  border: '1px solid #444',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                }}
              />
              <span style={{ color: '#888', fontSize: '1.4rem' }}>/</span>
              <input
                type="number"
                min={1}
                max={32}
                value={editDen}
                onChange={(e) => setEditDen(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitTimeSig() } if (e.key === 'Escape') setEditingTimeSig(null) }}
                style={{
                  width: 60,
                  background: '#111',
                  color: '#e0e0e0',
                  border: '1px solid #444',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingTimeSig(null)}
                style={{ padding: '4px 12px', background: 'transparent', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={commitTimeSig}
                style={{ padding: '4px 12px', background: '#1a3a5c', border: '1px solid #2a5a8c', borderRadius: 4, color: '#7ac0ff', cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Re-export for use in TabEditorPage
export { BEAT_WIDTHS }
