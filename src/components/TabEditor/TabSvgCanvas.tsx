import type { RefObject } from 'react'
import type { Measure, TabEditorState } from '../../tabEditorTypes'
import { BEAT_WIDTHS } from '../../tabEditorState'
import { TabMeasureSvg } from './TabMeasureSvg'
import { StaffViewSvg } from './StaffViewSvg'
import { STRING_LABEL_W, measureWidth, rowSvgHeight } from './tabSvgConstants'

interface TabSvgCanvasProps {
  state: TabEditorState
  containerWidth: number
  canvasRef: RefObject<HTMLDivElement | null>
  onBeatMouseDown: (mi: number, bi: number, si: number) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
}

function computeRows(measures: Measure[], containerWidth: number): Measure[][] {
  const usable = containerWidth - STRING_LABEL_W - 32
  const rows: Measure[][] = []
  let row: Measure[] = []
  let rowW = 0
  for (const m of measures) {
    const mw = measureWidth(m)
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

function rowSvgWidth(rowMeasures: Measure[]): number {
  return STRING_LABEL_W + rowMeasures.reduce((s, m) => s + measureWidth(m), 0)
}

export function TabSvgCanvas({
  state,
  containerWidth,
  canvasRef,
  onBeatMouseDown,
  onBeatMouseEnter,
}: TabSvgCanvasProps) {
  const { track, cursor, selection, playheadMeasure, playheadBeat, viewMode } = state

  const rows = computeRows(track.measures, containerWidth)

  const globalMeasureMap = new Map<string, number>()
  track.measures.forEach((m, i) => globalMeasureMap.set(m.id, i))

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

  return (
    <div className="tab-canvas" ref={canvasRef} tabIndex={0}>
      {rows.map((rowMeasures, rowIdx) => {
        const svgW = rowSvgWidth(rowMeasures)

        // Compute xOffset for each measure within this row
        const measureOffsets: number[] = []
        let xAcc = STRING_LABEL_W
        for (const m of rowMeasures) {
          measureOffsets.push(xAcc)
          xAcc += measureWidth(m)
        }

        return (
          <svg
            key={rowIdx}
            className="tab-svg-row"
            width={svgW}
            height={svgH}
            style={{ marginBottom: 24 }}
          >
            {/* Row background string lines extend across all measures - each measure draws its own */}

            {/* Time signature at row start (first measure of row only) */}
            {rowIdx === 0 && (
              <text
                x={STRING_LABEL_W + 2}
                y={svgH / 2}
                fontSize={11}
                fill="#555"
                dominantBaseline="middle"
              >
                {track.globalTimeSig.numerator}/{track.globalTimeSig.denominator}
              </text>
            )}

            {/* Measures */}
            {rowMeasures.map((measure, mIdx) => {
              const mi = globalMeasureMap.get(measure.id) ?? 0
              return (
                <TabMeasureSvg
                  key={measure.id}
                  measure={measure}
                  measureIndex={mi}
                  xOffset={measureOffsets[mIdx] ?? STRING_LABEL_W}
                  track={track}
                  cursor={cursor}
                  selection={selection}
                  playheadMeasure={playheadMeasure}
                  playheadBeat={playheadBeat}
                  onBeatMouseDown={onBeatMouseDown}
                  onBeatMouseEnter={onBeatMouseEnter}
                />
              )
            })}
          </svg>
        )
      })}
    </div>
  )
}

// Re-export for use in TabEditorPage
export { BEAT_WIDTHS }
