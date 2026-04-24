import { memo, useCallback } from 'react'
import type { DurationValue, Measure, TabCursor, TabSelection, TabTrack } from '../../tabEditorTypes'
import { isInSelection, measureCapacityBeats, measureUsedBeats } from '../../tabEditorState'
import { TUNINGS } from '../../data/tunings'
import { TechniqueOverlay } from './TabTechniquePaths'
import {
  TOP_MARGIN,
  BARLINE_W,
  MEASURE_NUMBER_H,
  MEASURE_NUMBER_FONT_SIZE,
  NOTE_FONT_SIZE,
  TIME_SIG_W,
  BPM_LABEL_W,
  stringY,
  rowSvgHeight,
  measureWidth,
  computeBeatPositions,
  formatFretLabel,
} from './tabSvgConstants'

interface TabMeasureSvgProps {
  measure: Measure
  measureIndex: number
  xOffset: number
  track: TabTrack
  cursor: TabCursor
  selection: TabSelection | null
  noteSelectionSet: Set<string>
  isPlaying: boolean
  playheadMeasure: number
  playheadBeat: number
  showTimeSig?: boolean
  showStringLabels?: boolean
  timeSig?: { numerator: number; denominator: number }
  activeDuration: DurationValue
  showBpm?: boolean
  bpm?: number
  beatWidthScale?: number
  onTimeSigClick?: (measureIndex: number) => void
  onBpmClick?: (measureIndex: number) => void
  onMeasureContextMenu?: (measureIndex: number, e: React.MouseEvent) => void
  onBeatMouseDown: (mi: number, bi: number, si: number, shiftKey: boolean) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
  onBendAmountClick?: (mi: number, bi: number, si: number) => void
}

function restSymbol(d: DurationValue): string {
  switch (d) {
    case 'whole': return '𝄻'
    case 'half': return '𝄼'
    case 'quarter': return '𝄽'
    case 'eighth': return '𝄾'
    case 'sixteenth': return '𝄿'
    case 'thirtysecond': return '𝅀'
    default: return '𝅁'
  }
}

export const TabMeasureSvg = memo(function TabMeasureSvg({
  measure,
  measureIndex,
  xOffset,
  track,
  cursor,
  selection,
  noteSelectionSet,
  isPlaying,
  playheadMeasure,
  playheadBeat,
  showTimeSig = false,
  showStringLabels = false,
  timeSig,
  activeDuration,
  showBpm = false,
  bpm,
  beatWidthScale = 1.0,
  onTimeSigClick,
  onBpmClick,
  onMeasureContextMenu,
  onBeatMouseDown,
  onBeatMouseEnter,
  onBendAmountClick,
}: TabMeasureSvgProps) {
  const { stringCount } = track
  const svgH = rowSvgHeight(stringCount)

  const sig = timeSig ?? track.globalTimeSig
  const capacity = measureCapacityBeats(sig)
  const used = measureUsedBeats(measure.beats)
  const hasVirtualSlot = used < capacity - 1e-9
  const virtualSlots = hasVirtualSlot ? 1 : 0

  const mw = measureWidth(measure, showTimeSig, virtualSlots, showBpm, beatWidthScale)
  const beatPositions = computeBeatPositions(measure, showTimeSig, virtualSlots, showBpm, beatWidthScale)

  const topStringY = stringY(stringCount - 1, stringCount)
  const bottomStringY = stringY(0, stringCount)
  const strAreaMid = (topStringY + bottomStringY) / 2

  const tuning = TUNINGS[track.stringCount]
  const preset = tuning.find((p) => p.name === track.tuningName) ?? tuning[0]

  const isCursorOnThisMeasure = cursor.measureIndex === measureIndex
  const isVirtualCursor = isCursorOnThisMeasure && cursor.beatIndex === measure.beats.length

  // Stable event handlers — one closure per measure, not per string × beat
  const handleStringMouseDown = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation()
      const bi = parseInt(e.currentTarget.dataset.bi ?? '0', 10)
      const si = parseInt(e.currentTarget.dataset.si ?? '0', 10)
      onBeatMouseDown(measureIndex, bi, si, e.shiftKey)
    },
    [onBeatMouseDown, measureIndex],
  )

  const handleBeatMouseEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const bi = parseInt(e.currentTarget.dataset.bi ?? '0', 10)
      onBeatMouseEnter(measureIndex, bi)
    },
    [onBeatMouseEnter, measureIndex],
  )

  return (
    <g transform={`translate(${xOffset}, 0)`}>
      {/* Measure number — right-click for context menu */}
      <text
        x={BARLINE_W + 2}
        y={topStringY - 4}
        fontSize={MEASURE_NUMBER_FONT_SIZE}
        fontWeight={600}
        fill="#a0a0b8"
        dominantBaseline="auto"
        style={{ cursor: onMeasureContextMenu ? 'pointer' : 'default' }}
        onContextMenu={onMeasureContextMenu ? (e) => { e.preventDefault(); onMeasureContextMenu(measureIndex, e) } : undefined}
        onClick={onMeasureContextMenu ? (e) => { e.preventDefault(); onMeasureContextMenu(measureIndex, e) } : undefined}
      >
        {measureIndex + 1}
      </text>

      {/* Measure fill warning — shown when cursor is not on this measure */}
      {!isCursorOnThisMeasure && measure.beats.length > 0 && (() => {
        const delta = used - capacity
        if (Math.abs(delta) < 1e-9) return null
        const sign = delta > 0 ? '+' : '−'
        const abs = Math.abs(delta)
        const label = `⚠ ${sign}${abs % 1 === 0 ? abs : abs.toFixed(2)}b`
        const fill = delta > 0 ? '#ff5555' : '#ffaa44'
        return (
          <text
            x={mw - BARLINE_W - 2}
            y={topStringY - 4}
            fontSize={9}
            textAnchor="end"
            dominantBaseline="auto"
            fill={fill}
            style={{ pointerEvents: 'none' }}
          >
            {label}
          </text>
        )
      })()}


      {/* String lines */}
      {Array.from({ length: stringCount }, (_, si) => (
        <line
          key={si}
          x1={0}
          y1={stringY(si, stringCount)}
          x2={mw}
          y2={stringY(si, stringCount)}
          stroke="#555"
          strokeWidth={1}
        />
      ))}

      {/* Stacked time signature — rendered after strings so it sits on top */}
      {showTimeSig && timeSig && (
        <g
          style={{ cursor: onTimeSigClick ? 'pointer' : 'default' }}
          onClick={onTimeSigClick ? () => onTimeSigClick(measureIndex) : undefined}
        >
          <rect
            x={BARLINE_W}
            y={topStringY - 4}
            width={TIME_SIG_W}
            height={bottomStringY - topStringY + 8}
            fill="transparent"
          />
          <text
            x={BARLINE_W + TIME_SIG_W / 2}
            y={strAreaMid - 8}
            fontSize={30}
            fontWeight="bold"
            fontFamily="sans-serif"
            textAnchor="middle"
            dominantBaseline="auto"
            fill="#ddd"
          >
            {timeSig.numerator}
          </text>
          <text
            x={BARLINE_W + TIME_SIG_W / 2}
            y={strAreaMid + 8}
            fontSize={30}
            fontWeight="bold"
            fontFamily="sans-serif"
            textAnchor="middle"
            dominantBaseline="hanging"
            fill="#ddd"
          >
            {timeSig.denominator}
          </text>
        </g>
      )}

      {/* BPM label — shown at start of each BPM segment */}
      {showBpm && bpm !== undefined && (
        <text
          x={BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + BPM_LABEL_W / 2}
          y={MEASURE_NUMBER_H + 14}
          fontSize={13}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#aac4e8"
          fontFamily="sans-serif"
          style={{ cursor: onBpmClick ? 'pointer' : 'default' }}
          onClick={onBpmClick ? () => onBpmClick(measureIndex) : undefined}
        >
          {`\u2669=${bpm}`}
        </text>
      )}

      {/* Left barline */}
      <line
        x1={0}
        y1={topStringY}
        x2={0}
        y2={bottomStringY}
        stroke="#777"
        strokeWidth={BARLINE_W}
      />

      {/* Continuous selection highlight — one rect spanning first→last selected beat */}
      {(() => {
        const selBeats = measure.beats.map((_, bi) => bi).filter((bi) => isInSelection(selection, measureIndex, bi))
        if (selBeats.length === 0) return null
        const firstPos = beatPositions[selBeats[0]!]
        const lastPos = beatPositions[selBeats[selBeats.length - 1]!]
        if (!firstPos || !lastPos) return null
        return (
          <rect
            x={firstPos.x}
            y={MEASURE_NUMBER_H}
            width={lastPos.x + lastPos.w - firstPos.x}
            height={svgH - MEASURE_NUMBER_H}
            fill="rgba(90,60,20,0.35)"
            style={{ pointerEvents: 'none' }}
          />
        )
      })()}

      {/* Real beat columns */}
      {measure.beats.map((beat, bi) => {
        const pos = beatPositions[bi]
        if (!pos) return null
        const { x: beatX, cx: beatCX, w: beatW } = pos

        const isCursorCol = isCursorOnThisMeasure && cursor.beatIndex === bi
        const isPlayhead = isPlaying && playheadMeasure === measureIndex && playheadBeat === bi

        let overlayFill = 'none'
        if (isPlayhead) overlayFill = 'rgba(30,100,50,0.3)'
        else if (isCursorCol && !isPlaying) overlayFill = 'rgba(42,90,140,0.25)'

        const isTied = beat.tiedFrom === true

        // Use formatFretLabel to compute colW — same logic as per-string rendering below
        const colW = beat.notes.reduce((max, n) => {
          const { label } = formatFretLabel(n, isTied)
          return Math.max(max, Math.max(label.length * 8 + 4, 18))
        }, 18)

        return (
          <g key={beat.id}>
            {overlayFill !== 'none' && (
              <rect x={beatCX - colW / 2} y={MEASURE_NUMBER_H} width={colW} height={svgH - MEASURE_NUMBER_H} fill={overlayFill} />
            )}

            {/* Tie arc entering from left barline for tied-from beats */}
            {isTied && (
              <path
                d={`M 0,${strAreaMid} Q ${beatCX},${strAreaMid + 14} ${beatCX},${strAreaMid}`}
                fill="none"
                stroke="#888"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            )}

            {/* Rest glyph — only when every string is empty */}
            {beat.notes.every((n) => n.fret < 0) && (
              <text
                x={beatCX}
                y={strAreaMid}
                fontSize={22}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#666"
                style={{ pointerEvents: 'none' }}
              >
                {restSymbol(beat.duration)}
              </text>
            )}

            {/* Beat-level drag hit target */}
            <rect
              x={beatX}
              y={TOP_MARGIN}
              width={beatW}
              height={svgH - TOP_MARGIN}
              fill="transparent"
              data-bi={bi}
              onMouseEnter={handleBeatMouseEnter}
            />

            {/* Per-string fret numbers — two passes so selection outlines always paint on top */}
            {(() => {
              type StringData = {
                si: number
                sy: number
                isCursorNote: boolean
                isNoteSelected: boolean
                hasNote: boolean
                fretLabel: string
                fretFill: string
                fontStyle: 'normal' | 'italic'
                labelW: number
              }
              const strings: StringData[] = Array.from({ length: stringCount }, (_, rawSi) => {
                const si = stringCount - 1 - rawSi
                const note = beat.notes[si]
                const sy = stringY(si, stringCount)
                const isCursorNote = isCursorCol && cursor.stringIndex === si
                const isNoteSelected =
                  noteSelectionSet.has(`${measureIndex}:${bi}:${si}`) ||
                  (isCursorNote && !!note && note.fret >= 0)

                const { label: fretLabel, fill: fretFill, fontStyle } = note
                  ? formatFretLabel(note, isTied)
                  : { label: '', fill: '#e8e8e8', fontStyle: 'normal' as const }

                const hasNote = fretLabel !== ''
                const labelW = Math.max(fretLabel.length * 8 + 4, 18)
                return { si, sy, isCursorNote, isNoteSelected, hasNote, fretLabel, fretFill, fontStyle, labelW }
              })

              return (
                <>
                  {/* Pass 1: cursor highlights, note backgrounds, texts, hit targets */}
                  {strings.map(({ si, sy, isCursorNote, hasNote, fretLabel, fretFill, fontStyle, labelW }) => (
                    <g key={si}>
                      {isCursorNote && !isPlaying && (
                        <rect
                          x={beatCX - labelW / 2}
                          y={sy - 11}
                          width={labelW}
                          height={22}
                          fill="rgba(99,102,241,0.45)"
                          rx={2}
                        />
                      )}

                      {hasNote && (
                        <rect
                          x={beatCX - labelW / 2}
                          y={sy - 10}
                          width={labelW}
                          height={20}
                          fill="#111"
                          rx={2}
                        />
                      )}

                      {hasNote && (
                        <text
                          x={beatCX}
                          y={sy}
                          fontSize={NOTE_FONT_SIZE}
                          fontWeight="600"
                          fontStyle={fontStyle}
                          fontFamily="'Courier New', monospace"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={fretFill}
                        >
                          {fretLabel}
                        </text>
                      )}

                      {/* Per-string hit target — data attributes carry bi/si so one stable handler serves all */}
                      <rect
                        x={beatX}
                        y={sy - 10}
                        width={beatW}
                        height={20}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        data-bi={bi}
                        data-si={si}
                        onMouseDown={handleStringMouseDown}
                      />
                    </g>
                  ))}

                  {/* Pass 2: selection outlines on top of all note backgrounds */}
                  {strings.map(({ si, sy, isNoteSelected, labelW }) =>
                    isNoteSelected ? (
                      <rect
                        key={`sel-${si}`}
                        x={beatCX - labelW / 2 - 2}
                        y={sy - 12}
                        width={labelW + 4}
                        height={24}
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        rx={3}
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : null
                  )}
                </>
              )
            })()}
          </g>
        )
      })}

      {/* Virtual pending slot — shown when measure has remaining capacity */}
      {hasVirtualSlot && (() => {
        const vPos = beatPositions[measure.beats.length]
        if (!vPos) return null
        const { x: vX, cx: vCX, w: vW } = vPos
        const overlayFill = isVirtualCursor && !isPlaying ? 'rgba(42,90,140,0.25)' : 'none'

        return (
          <g>
            {overlayFill !== 'none' && (
              <rect x={vCX - 9} y={MEASURE_NUMBER_H} width={18} height={svgH - MEASURE_NUMBER_H} fill={overlayFill} />
            )}

            {/* Rest glyph */}
            <text
              x={vCX}
              y={strAreaMid}
              fontSize={22}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#333"
              style={{ pointerEvents: 'none' }}
            >
              {restSymbol(activeDuration)}
            </text>

            {/* Cursor highlight for active string in virtual slot */}
            {isVirtualCursor && !isPlaying && (() => {
              const sy = stringY(cursor.stringIndex, stringCount)
              return (
                <rect
                  x={vCX - 10}
                  y={sy - 11}
                  width={20}
                  height={22}
                  fill="rgba(99,102,241,0.45)"
                  rx={2}
                />
              )
            })()}

            {/* Click/hover target for virtual slot */}
            <rect
              x={vX}
              y={TOP_MARGIN}
              width={vW}
              height={svgH - TOP_MARGIN}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              data-bi={measure.beats.length}
              data-si={cursor.stringIndex}
              onMouseDown={handleStringMouseDown}
              onMouseEnter={handleBeatMouseEnter}
            />
          </g>
        )
      })()}

      {/* Right barline */}
      <line
        x1={mw}
        y1={topStringY}
        x2={mw}
        y2={bottomStringY}
        stroke="#777"
        strokeWidth={BARLINE_W}
      />

      {/* Technique overlays */}
      <TechniqueOverlay
        measure={measure}
        measureIndex={measureIndex}
        track={track}
        beatPositions={beatPositions}
        onBendAmountClick={onBendAmountClick}
      />

      {/* String labels */}
      {showStringLabels &&
        Array.from({ length: stringCount }, (_, rawSi) => {
          const si = stringCount - 1 - rawSi
          const sy = stringY(si, stringCount)
          const label = preset.strings[si]?.note ?? ''
          return (
            <text
              key={si}
              x={-4}
              y={sy}
              fontSize={11}
              fontWeight={600}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#a0a0b8"
            >
              {label}
            </text>
          )
        })}
    </g>
  )
})
