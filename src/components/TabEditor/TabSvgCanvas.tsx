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

  const [measureMenu, setMeasureMenu] = useState<{ mi: number; x: number; y: number } | null>(null)

  const [timingChangeEdit, setTimingChangeEdit] = useState<{ mi: number; num: string; den: string } | null>(null)
  const timingChangeNumRef = useRef<HTMLInputElement>(null)
  const [timingChangeConfirm, setTimingChangeConfirm] = useState<{
    mi: number
    rangeEnd: number
    num: number
    den: number
    affectedCount: number
  } | null>(null)

  function openMeasureMenu(mi: number, e: React.MouseEvent) {
    setMeasureMenu({ mi, x: e.clientX, y: e.clientY })
  }

  function closeMeasureMenu() {
    setMeasureMenu(null)
  }

  useEffect(() => {
    if (timingChangeEdit !== null) {
      timingChangeNumRef.current?.focus()
      timingChangeNumRef.current?.select()
    }
  }, [timingChangeEdit])

  function openTimeSigEditor(mi: number) {
    const m = track.measures[mi]
    const sig = m.timeSignature ?? track.globalTimeSig
    setTimingChangeEdit({ mi, num: String(sig.numerator), den: String(sig.denominator) })
  }

  function findTimingRangeEnd(fromIndex: number): number {
    const next = track.measures.findIndex((m, i) => i > fromIndex && m.timeSignature !== undefined)
    return next === -1 ? track.measures.length : next
  }

  function submitTimingChange() {
    if (!timingChangeEdit) return
    const n = parseInt(timingChangeEdit.num, 10)
    const d = parseInt(timingChangeEdit.den, 10)
    if (!n || !d || n <= 0 || d <= 0) return

    const mi = timingChangeEdit.mi
    const rangeEnd = findTimingRangeEnd(mi)
    const affectedCount = rangeEnd - mi

    const hasNotesInFollowing = track.measures.slice(mi + 1, rangeEnd).some(m => m.beats.length > 0)

    setTimingChangeEdit(null)

    if (hasNotesInFollowing && affectedCount > 1) {
      setTimingChangeConfirm({ mi, rangeEnd, num: n, den: d, affectedCount })
    } else {
      dispatch({ type: 'SET_MEASURE_TIME_SIG_RANGE', fromIndex: mi, toIndex: rangeEnd - 1, numerator: n, denominator: d })
    }
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
                  onMeasureContextMenu={openMeasureMenu}
                  onBeatMouseDown={onBeatMouseDown}
                  onBeatMouseEnter={onBeatMouseEnter}
                />
              )
            })}
          </svg>
        )
      })}

      {/* Measure context menu */}
      {measureMenu !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
          onMouseDown={closeMeasureMenu}
        >
          <div
            style={{
              position: 'fixed',
              left: measureMenu.x,
              top: measureMenu.y,
              background: '#1e1e2e',
              border: '1px solid #333',
              borderRadius: 6,
              padding: '4px 0',
              minWidth: 160,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              zIndex: 201,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '2px 8px 6px', fontSize: '0.7rem', color: '#666', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Measure {measureMenu.mi + 1}
            </div>
            {[
              { label: 'Insert before', action: () => { dispatch({ type: 'INSERT_MEASURE_BEFORE', measureIndex: measureMenu.mi }); closeMeasureMenu() } },
              { label: 'Insert after', action: () => { dispatch({ type: 'INSERT_MEASURE_AFTER', measureIndex: measureMenu.mi }); closeMeasureMenu() } },
              {
                label: 'Change timing',
                action: () => {
                  const m = track.measures[measureMenu.mi]!
                  const sig = m.timeSignature ?? track.globalTimeSig
                  setTimingChangeEdit({ mi: measureMenu.mi, num: String(sig.numerator), den: String(sig.denominator) })
                  closeMeasureMenu()
                },
              },
              { label: 'Delete', action: () => { dispatch({ type: 'DELETE_MEASURE', measureIndex: measureMenu.mi }); closeMeasureMenu() }, danger: true },
            ].map((item) => (
              <button
                key={item.label}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: item.danger ? '#f87171' : '#e0e0e0',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = item.danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.07)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                onMouseDown={item.action}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Timing change edit dialog (from context menu) */}
      {timingChangeEdit !== null && (
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
          onMouseDown={(e) => { if (e.target === e.currentTarget) setTimingChangeEdit(null) }}
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
              minWidth: 220,
            }}
          >
            <span style={{ color: '#ccc', fontSize: '0.85rem', fontWeight: 600 }}>
              Change Timing — Measure {timingChangeEdit.mi + 1}
            </span>
            <div style={{ color: '#888', fontSize: '0.75rem' }}>
              Will apply to all measures until the next timing change.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={timingChangeNumRef}
                type="number"
                min={1}
                max={32}
                value={timingChangeEdit.num}
                onChange={(e) => setTimingChangeEdit(prev => prev ? { ...prev, num: e.target.value } : null)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTimingChange() } if (e.key === 'Escape') setTimingChangeEdit(null) }}
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
                value={timingChangeEdit.den}
                onChange={(e) => setTimingChangeEdit(prev => prev ? { ...prev, den: e.target.value } : null)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTimingChange() } if (e.key === 'Escape') setTimingChangeEdit(null) }}
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
                onClick={() => setTimingChangeEdit(null)}
                style={{ padding: '4px 12px', background: 'transparent', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submitTimingChange}
                style={{ padding: '4px 12px', background: '#1a3a5c', border: '1px solid #2a5a8c', borderRadius: 4, color: '#7ac0ff', cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timing change confirmation dialog */}
      {timingChangeConfirm !== null && (
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
          onMouseDown={(e) => { if (e.target === e.currentTarget) setTimingChangeConfirm(null) }}
        >
          <div
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              minWidth: 280,
              maxWidth: 360,
            }}
          >
            <span style={{ color: '#ccc', fontSize: '0.85rem', fontWeight: 600 }}>
              Change timing to {timingChangeConfirm.num}/{timingChangeConfirm.den}
            </span>
            <div style={{ color: '#aaa', fontSize: '0.8rem', lineHeight: 1.5 }}>
              The following {timingChangeConfirm.affectedCount - 1} measure{timingChangeConfirm.affectedCount - 1 === 1 ? '' : 's'} have notes.
              Apply timing change to just this measure, or all {timingChangeConfirm.affectedCount} measures until the next timing change?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => {
                  dispatch({ type: 'SET_MEASURE_TIME_SIG', measureIndex: timingChangeConfirm.mi, numerator: timingChangeConfirm.num, denominator: timingChangeConfirm.den })
                  setTimingChangeConfirm(null)
                }}
                style={{ padding: '7px 12px', background: 'transparent', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}
              >
                This measure only
              </button>
              <button
                onClick={() => {
                  dispatch({ type: 'SET_MEASURE_TIME_SIG_RANGE', fromIndex: timingChangeConfirm.mi, toIndex: timingChangeConfirm.rangeEnd - 1, numerator: timingChangeConfirm.num, denominator: timingChangeConfirm.den })
                  setTimingChangeConfirm(null)
                }}
                style={{ padding: '7px 12px', background: '#1a3a5c', border: '1px solid #2a5a8c', borderRadius: 4, color: '#7ac0ff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}
              >
                All {timingChangeConfirm.affectedCount} measures (until next timing change)
              </button>
              <button
                onClick={() => setTimingChangeConfirm(null)}
                style={{ padding: '7px 12px', background: 'transparent', border: 'none', borderRadius: 4, color: '#666', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}
              >
                Cancel
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
