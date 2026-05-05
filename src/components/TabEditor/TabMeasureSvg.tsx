import { memo, useCallback, useState } from 'react'
import type { DotModifier, DurationValue, Measure, TabCursor, TabSelection, TabTrack } from '../../tabEditorTypes'
import { isInSelection, measureCapacityBeats, measureUsedBeats } from '../../tabEditorState'
import { TUNINGS } from '../../data/tunings'
import { TechniqueOverlay } from './TabTechniquePaths'
import {
  TOP_MARGIN,
  STRING_SPACING,
  STRING_LABEL_W,
  BARLINE_W,
  MEASURE_NUMBER_H,
  MEASURE_NUMBER_FONT_SIZE,
  NOTE_FONT_SIZE,
  TIME_SIG_W,
  BPM_LABEL_W,
  TIME_SIG_FONT_SIZE,
  BPM_DISPLAY_FONT_SIZE,
  STRING_LABEL_FONT_SIZE,
  MEASURE_OVERFLOW_FONT_SIZE,
  NOTE_CURSOR_W,
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
  showTimeSig?: boolean
  showStringLabels?: boolean
  timeSig?: { numerator: number; denominator: number }
  fillRests: DurationValue[]
  showBpm?: boolean
  bpm?: number
  beatWidthScale?: number
  onTimeSigClick?: (measureIndex: number) => void
  onBpmClick?: (measureIndex: number) => void
  onMeasureContextMenu?: (measureIndex: number, e: React.MouseEvent) => void
  onBeatMouseDown: (mi: number, bi: number, si: number, shiftKey: boolean) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
  onBendAmountClick?: (mi: number, bi: number, si: number) => void
  onMeasureErrorClick?: (measureIndex: number) => void
  onStringLabelClick?: () => void
  highlightBeatColumn?: number
}

interface RestSymbolProps {
  duration: DurationValue
  dot: DotModifier
  cx: number
  cy: number
  fill?: string
}

function RestSymbol({ duration, dot, cx, cy, fill = '#bbb' }: RestSymbolProps) {
  const isDotted = dot.dotted
  const isDoubleDotted = dot.doubleDotted

  // Whole/half rests are anchored to specific string lines regardless of the passed-in cy
  const effectiveCy =
    duration === 'whole' ? TOP_MARGIN + 2 * STRING_SPACING + 3 :
    duration === 'half'  ? TOP_MARGIN + 3 * STRING_SPACING - 3 :
    cy

  let dotX = 8
  let dotY = -5
  let symbol: React.ReactNode

  switch (duration) {
    case 'whole':
      dotX = 8; dotY = -5
      symbol = (
        <path
          d="M 247.5 24.5 H 235.5 v 6 h 12 v -6 Z"
          fill={fill}
          transform="translate(-241.5, -27.5)"
        />
      )
      break
    case 'half':
      dotX = 8; dotY = -5
      symbol = (
        <path
          d="M 247.5 24.5 H 235.5 v 6 h 12 v -6 Z"
          fill={fill}
          transform="translate(-241.5, -27.5)"
        />
      )
      break
    case 'quarter':
      dotX = 8; dotY = -14
      symbol = (
        <path
          d="M 297 24 C 294.75 26.5 293.75 28.5 293.75 29.75 s 1.25 3 3.25 5.5 l -0.75 1 C 295.5 35.75 293.5 34.75 292.5 35.75 S 292 39 293.75 40.5 l -0.75 1 c -2.95 -2.03 -5.25 -5.25 -3.75 -7.5 s 4.25 -0.75 4.5 -0.5 l -4.5 -6.25 c 2 -1.75 3 -3.5 3 -5 s -0.5 -2.75 -2 -4.5 H 292 Z"
          fill={fill}
          transform="translate(-292, -30)"
        />
      )
      break
    case 'eighth':
      dotX = 7; dotY = -10
      symbol = (
        <path
          d="M 292 36.5 h -1.5 l 3 -10.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 1.25 -0.25 2.75 -2.25 3 -2.75 h 1 Z"
          fill={fill}
          transform="translate(-292, -31)"
        />
      )
      break
    case 'sixteenth':
      dotX = 7; dotY = -13
      symbol = (
        <path
          d="M 292 36.5 h -1.5 l 3 -10.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 1.25 -0.25 2.75 -2.25 3 -2.75 h 1 Z"
          fill={fill}
          transform="translate(-292, -29)"
        />
      )
      break
    case 'thirtysecond':
      dotX = 7; dotY = -15
      symbol = (
        <path
          d="M 292 36.5 h -1.5 l 3 -10.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 1.25 -0.25 2.75 -2.25 3 -2.75 h 1 Z"
          fill={fill}
          transform="translate(-292, -26)"
        />
      )
      break
    default:
      // sixtyfourth
      dotX = 7; dotY = -18
      symbol = (
        <path
          d="M 292 36.5 h -1.5 l 3 -10.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 1.25 -0.25 2.75 -2.25 3 -2.75 h 1 Z"
          fill={fill}
          transform="translate(-292, -23)"
        />
      )
  }

  return (
    <g transform={`translate(${cx}, ${effectiveCy}) scale(1.5)`} style={{ pointerEvents: 'none' }}>
      {symbol}
      {(isDotted || isDoubleDotted) && <circle cx={dotX} cy={dotY} r={2} fill={fill} />}
      {isDoubleDotted && <circle cx={dotX + 6} cy={dotY} r={2} fill={fill} />}
    </g>
  )
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
  showTimeSig = false,
  showStringLabels = false,
  timeSig,
  fillRests,
  showBpm = false,
  bpm,
  beatWidthScale = 1.0,
  onTimeSigClick,
  onBpmClick,
  onMeasureContextMenu,
  onBeatMouseDown,
  onBeatMouseEnter,
  onBendAmountClick,
  onMeasureErrorClick,
  onStringLabelClick,
  highlightBeatColumn,
}: TabMeasureSvgProps) {
  const [labelHovered, setLabelHovered] = useState(false)
  const { stringCount } = track
  const svgH = rowSvgHeight(stringCount)

  const sig = timeSig ?? track.globalTimeSig
  const capacity = measureCapacityBeats(sig)
  const used = measureUsedBeats(measure.beats)

  const mw = measureWidth(measure, showTimeSig, fillRests, showBpm, beatWidthScale)
  const beatPositions = computeBeatPositions(measure, showTimeSig, fillRests, showBpm, beatWidthScale)

  const topStringY = stringY(stringCount - 1, stringCount)
  const bottomStringY = stringY(0, stringCount)
  const strAreaMid = (topStringY + bottomStringY) / 2

  const tuning = TUNINGS[track.stringCount]
  const preset = tuning.find((p) => p.name === track.tuningName) ?? tuning[0]

  const isCursorOnThisMeasure = cursor.measureIndex === measureIndex


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
        if (delta < 1e-9) return null  // hide when at-capacity or underfull (fill rests cover the gap)
        const abs = delta
        const label = `⚠ +${abs % 1 === 0 ? abs : abs.toFixed(2)}b`
        return (
          <text
            x={mw - BARLINE_W - 2}
            y={topStringY - 4}
            fontSize={MEASURE_OVERFLOW_FONT_SIZE}
            textAnchor="end"
            dominantBaseline="auto"
            fill="#ff5555"
            style={{ cursor: onMeasureErrorClick ? 'pointer' : 'default' }}
            onClick={onMeasureErrorClick ? (e) => { e.stopPropagation(); onMeasureErrorClick(measureIndex) } : undefined}
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
            fontSize={TIME_SIG_FONT_SIZE}
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
            fontSize={TIME_SIG_FONT_SIZE}
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
          fontSize={BPM_DISPLAY_FONT_SIZE}
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

      {/* Beat-column start highlight (read-only view) */}
      {highlightBeatColumn != null && (() => {
        const pos = beatPositions[highlightBeatColumn]
        if (!pos) return null
        return (
          <rect
            x={pos.cx - NOTE_CURSOR_W / 2}
            y={MEASURE_NUMBER_H}
            width={NOTE_CURSOR_W}
            height={svgH - MEASURE_NUMBER_H}
            fill="rgba(59,130,246,0.22)"
            rx={2}
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
        const overlayFill = isCursorCol && !isPlaying ? 'rgba(60,120,240,0.45)' : 'none'

        const isTied = beat.tiedFrom === true

        return (
          <g key={beat.id}>
            {overlayFill !== 'none' && (
              <rect x={beatCX - NOTE_CURSOR_W / 2} y={MEASURE_NUMBER_H} width={NOTE_CURSOR_W} height={svgH - MEASURE_NUMBER_H} fill={overlayFill} />
            )}


            {/* Rest glyph — only when every string is empty */}
            {beat.notes.every((n) => n.fret < 0) && (
              <RestSymbol
                duration={beat.duration}
                dot={beat.dot}
                cx={beatCX}
                cy={strAreaMid}
                fill="#bbb"
              />
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
                          fill="rgba(110,120,255,0.75)"
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

      {/* Fill rest slots — computed from remaining measure capacity, largest first */}
      {fillRests.map((restDuration, fillIdx) => {
        const pos = beatPositions[measure.beats.length + fillIdx]
        if (!pos) return null
        const { x: vX, cx: vCX, w: vW } = pos
        const slotBi = measure.beats.length + fillIdx
        const showCursor = isCursorOnThisMeasure && cursor.beatIndex === slotBi && !isPlaying

        return (
          <g key={`fill-${fillIdx}`}>
            {showCursor && (
              <rect x={vCX - NOTE_CURSOR_W / 2} y={MEASURE_NUMBER_H} width={NOTE_CURSOR_W} height={svgH - MEASURE_NUMBER_H} fill="rgba(60,120,240,0.45)" />
            )}

            <RestSymbol
              duration={restDuration}
              dot={{ dotted: false, doubleDotted: false, triplet: false }}
              cx={vCX}
              cy={strAreaMid}
              fill="#999"
            />

            {showCursor && (() => {
              const sy = stringY(cursor.stringIndex, stringCount)
              return (
                <rect
                  x={vCX - NOTE_CURSOR_W / 2}
                  y={sy - 11}
                  width={NOTE_CURSOR_W}
                  height={22}
                  fill="rgba(110,120,255,0.75)"
                  rx={2}
                />
              )
            })()}

            <rect
              x={vX}
              y={TOP_MARGIN}
              width={vW}
              height={svgH - TOP_MARGIN}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              data-bi={slotBi}
              data-si={cursor.stringIndex}
              onMouseDown={handleStringMouseDown}
              onMouseEnter={handleBeatMouseEnter}
            />
          </g>
        )
      })}

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
      {showStringLabels && (
        <g
          style={{ cursor: onStringLabelClick ? 'pointer' : 'default' }}
          onMouseEnter={() => { if (onStringLabelClick) setLabelHovered(true) }}
          onMouseLeave={() => setLabelHovered(false)}
          onClick={onStringLabelClick}
        >
          {labelHovered && (
            <rect
              x={-(STRING_LABEL_W - 2)}
              y={TOP_MARGIN - 8}
              width={STRING_LABEL_W - 2}
              height={(stringCount - 1) * STRING_SPACING + 16}
              rx={4}
              fill="rgba(255,255,255,0.07)"
            />
          )}
          {Array.from({ length: stringCount }, (_, rawSi) => {
            const si = stringCount - 1 - rawSi
            const sy = stringY(si, stringCount)
            const label = preset.strings[si]?.note ?? ''
            return (
              <text
                key={si}
                x={-4}
                y={sy}
                fontSize={STRING_LABEL_FONT_SIZE}
                fontWeight={600}
                textAnchor="end"
                dominantBaseline="middle"
                fill={labelHovered ? '#ffffff' : '#c8c8de'}
              >
                {label}
              </text>
            )
          })}
        </g>
      )}
    </g>
  )
})
