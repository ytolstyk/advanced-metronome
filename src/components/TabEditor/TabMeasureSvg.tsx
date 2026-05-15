import { memo, useCallback, useState } from 'react'
import type { DotModifier, DurationValue, Measure, TabCursor, TabSelection, TabTrack } from '../../tabEditorTypes'
import { Duration } from '../../tabEditorTypes'
import { isInSelection, measureCapacityTicks, measureUsedTicks } from '../../tabEditorState'
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
  MARKER_TEXT_Y,
  MARKER_FONT_SIZE,
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
  onChordClick?: (mi: number, bi: number) => void
  onBeatTextClick?: (mi: number, bi: number) => void
  onMarkerClick?: (mi: number) => void
  onRepeatCloseClick?: (measureIndex: number) => void
  onRepeatErrorClick?: (measureIndex: number) => void
  highlightBeatColumn?: number
  forPrint?: boolean
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat
  nextMeasureFirstBeat?: import('../../tabEditorTypes').Beat
  hasMarker?: boolean
  marker?: string
  repeatStatus?: 'open-orphan' | 'close-orphan' | 'valid' | null
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
    duration === Duration.Whole ? TOP_MARGIN + 2 * STRING_SPACING + 3 :
    duration === Duration.Half  ? TOP_MARGIN + 3 * STRING_SPACING - 3 :
    cy

  let dotX = 8
  let dotY = -5
  let symbol: React.ReactNode

  switch (duration) {
    case Duration.Whole:
      dotX = 8; dotY = -5
      symbol = (
        <path
          d="M 247.5 24.5 H 235.5 v 6 h 12 v -6 Z"
          fill={fill}
          transform="translate(-241.5, -27.5)"
        />
      )
      break
    case Duration.Half:
      dotX = 8; dotY = -5
      symbol = (
        <path
          d="M 247.5 24.5 H 235.5 v 6 h 12 v -6 Z"
          fill={fill}
          transform="translate(-241.5, -27.5)"
        />
      )
      break
    case Duration.Quarter:
      dotX = 8; dotY = -14
      symbol = (
        <path
          d="M 297 24 C 294.75 26.5 293.75 28.5 293.75 29.75 s 1.25 3 3.25 5.5 l -0.75 1 C 295.5 35.75 293.5 34.75 292.5 35.75 S 292 39 293.75 40.5 l -0.75 1 c -2.95 -2.03 -5.25 -5.25 -3.75 -7.5 s 4.25 -0.75 4.5 -0.5 l -4.5 -6.25 c 2 -1.75 3 -3.5 3 -5 s -0.5 -2.75 -2 -4.5 H 292 Z"
          fill={fill}
          transform="translate(-292, -30)"
        />
      )
      break
    case Duration.Eighth:
      dotX = 7; dotY = -10
      symbol = (
        <path
          d="M 292 36.5 h -1.5 l 3 -10.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 1.25 -0.25 2.75 -2.25 3 -2.75 h 1 Z"
          fill={fill}
          transform="translate(-292, -31)"
        />
      )
      break
    case Duration.Sixteenth:
      dotX = 7; dotY = -13
      symbol = (
        <path
          d="M 292 36.5 h -1.5 l 3 -10.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 0.7 -0.25 1.25 -0.5 2 -1.5 l 1.5 -5.25 c -2 0.75 -4 1.5 -5.77 -0.6 a 2.38 2.38 0 1 1 4 -0.4 a 0.25 0.25 0 0 0 0.25 0.25 c 1.25 -0.25 2.75 -2.25 3 -2.75 h 1 Z"
          fill={fill}
          transform="translate(-292, -29)"
        />
      )
      break
    case Duration.ThirtySecond:
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
      // SixtyFourth
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
  onChordClick,
  onBeatTextClick,
  onMarkerClick,
  onRepeatCloseClick,
  onRepeatErrorClick,
  highlightBeatColumn,
  forPrint = false,
  prevMeasureLastBeat,
  nextMeasureFirstBeat,
  hasMarker = false,
  marker,
  repeatStatus,
}: TabMeasureSvgProps) {
  const [labelHovered, setLabelHovered] = useState(false)
  const { stringCount } = track
  const svgH = rowSvgHeight(stringCount)

  const sig = timeSig ?? track.masterBars[measureIndex]?.timeSignature ?? track.masterBars[0]!.timeSignature
  const capacity = measureCapacityTicks(sig)
  const used = measureUsedTicks(measure.beats)

  const mw = measureWidth(measure, showTimeSig, fillRests, showBpm, beatWidthScale)
  const beatPositions = computeBeatPositions(measure, showTimeSig, fillRests, showBpm, beatWidthScale)

  const topStringY = stringY(stringCount, stringCount)
  const bottomStringY = stringY(1, stringCount)
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
      <g
        className={!forPrint && onMeasureContextMenu ? 'tab-svg-interactive' : undefined}
        style={{ cursor: onMeasureContextMenu ? 'pointer' : 'default' }}
        onContextMenu={onMeasureContextMenu ? (e) => { e.preventDefault(); onMeasureContextMenu(measureIndex, e) } : undefined}
        onClick={onMeasureContextMenu ? (e) => { e.preventDefault(); onMeasureContextMenu(measureIndex, e) } : undefined}
      >
        {!forPrint && onMeasureContextMenu && (
          <rect className="tab-hover-bg" x={BARLINE_W} y={topStringY - 15} width={28} height={14} rx={3} />
        )}
        <text
          x={BARLINE_W + 2}
          y={topStringY - 4}
          fontSize={MEASURE_NUMBER_FONT_SIZE}
          fontWeight={600}
          fill={forPrint ? '#777777' : '#a0a0b8'}
          dominantBaseline="auto"
        >
          {measureIndex + 1}
        </text>
      </g>

      {/* Measure fill warning — shown when cursor is not on this measure */}
      {!isCursorOnThisMeasure && measure.beats.length > 0 && (() => {
        const delta = used - capacity
        if (delta < 1) return null  // hide when at-capacity or underfull
        const beats = delta / 240  // ticks → quarter beats for display
        const label = `⚠ +${beats % 1 === 0 ? beats : beats.toFixed(2)}b`
        return (
          <g
            className={!forPrint && onMeasureErrorClick ? 'tab-svg-interactive' : undefined}
            style={{ cursor: onMeasureErrorClick ? 'pointer' : 'default' }}
            onClick={onMeasureErrorClick ? (e) => { e.stopPropagation(); onMeasureErrorClick(measureIndex) } : undefined}
          >
            {!forPrint && onMeasureErrorClick && (
              <rect className="tab-hover-bg" x={mw - BARLINE_W - 62} y={topStringY - 15} width={60} height={14} rx={3} />
            )}
            <text
              x={mw - BARLINE_W - 2}
              y={topStringY - 4}
              fontSize={MEASURE_OVERFLOW_FONT_SIZE}
              textAnchor="end"
              dominantBaseline="auto"
              fill={forPrint ? '#cc0000' : '#ff5555'}
              style={{ pointerEvents: 'none' }}
            >
              {label}
            </text>
          </g>
        )
      })()}


      {/* String lines — si is 1-based, 1=bottom (lowest pitch), stringCount=top */}
      {Array.from({ length: stringCount }, (_, rawSi) => {
        const si = rawSi + 1
        return (
          <line
            key={si}
            x1={0}
            y1={stringY(si, stringCount)}
            x2={mw}
            y2={stringY(si, stringCount)}
            stroke={forPrint ? '#000000' : '#555'}
            strokeWidth={1}
          />
        )
      })}

      {/* Stacked time signature — rendered after strings so it sits on top */}
      {showTimeSig && timeSig && (
        <g
          className={!forPrint && onTimeSigClick ? 'tab-svg-interactive' : undefined}
          style={{ cursor: onTimeSigClick ? 'pointer' : 'default' }}
          onClick={onTimeSigClick ? () => onTimeSigClick(measureIndex) : undefined}
        >
          <rect
            className="tab-hover-bg"
            x={BARLINE_W}
            y={topStringY - 4}
            width={TIME_SIG_W}
            height={bottomStringY - topStringY + 8}
            fill="transparent"
            rx={3}
          />
          <text
            x={BARLINE_W + TIME_SIG_W / 2}
            y={strAreaMid - 8}
            fontSize={TIME_SIG_FONT_SIZE}
            fontWeight="bold"
            fontFamily="sans-serif"
            textAnchor="middle"
            dominantBaseline="auto"
            fill={forPrint ? '#000000' : '#ddd'}
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
            fill={forPrint ? '#000000' : '#ddd'}
          >
            {timeSig.denominator}
          </text>
        </g>
      )}

      {/* BPM label — shown at start of each BPM segment */}
      {showBpm && bpm !== undefined && (
        <g
          className={!forPrint && onBpmClick ? 'tab-svg-interactive' : undefined}
          style={{ cursor: onBpmClick ? 'pointer' : 'default' }}
          onClick={onBpmClick ? () => onBpmClick(measureIndex) : undefined}
        >
          {!forPrint && onBpmClick && (
            <rect
              className="tab-hover-bg"
              x={BARLINE_W + (showTimeSig ? TIME_SIG_W : 0)}
              y={2}
              width={BPM_LABEL_W}
              height={12}
              rx={3}
            />
          )}
          <text
            x={BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + BPM_LABEL_W / 2}
            y={MEASURE_NUMBER_H / 2}
            fontSize={BPM_DISPLAY_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={forPrint ? '#333333' : '#aac4e8'}
            fontFamily="sans-serif"
            style={{ pointerEvents: 'none' }}
          >
            {`\u2669=${bpm}`}
          </text>
        </g>
      )}

      {/* Left barline — double when measure has a marker or open repeat */}
      {(hasMarker || measure.repeatOpen) ? (
        <>
          <line x1={0} y1={topStringY} x2={0} y2={bottomStringY} stroke={forPrint ? '#000000' : '#aaa'} strokeWidth={1} />
          <line x1={5} y1={topStringY} x2={5} y2={bottomStringY} stroke={forPrint ? '#000000' : '#aaa'} strokeWidth={3.5} />
        </>
      ) : (
        <line x1={0} y1={topStringY} x2={0} y2={bottomStringY} stroke={forPrint ? '#000000' : '#777'} strokeWidth={BARLINE_W} />
      )}
      {/* Open repeat dots */}
      {measure.repeatOpen && (() => {
        const dotX = 12
        const dotYTop = topStringY + (bottomStringY - topStringY) * 0.33
        const dotYBot = topStringY + (bottomStringY - topStringY) * 0.67
        const dotColor = forPrint ? '#000000' : '#aaa'
        const isOrphan = repeatStatus === 'open-orphan'
        return (
          <>
            <circle cx={dotX} cy={dotYTop} r={2.5} fill={dotColor} style={{ pointerEvents: 'none' }} />
            <circle cx={dotX} cy={dotYBot} r={2.5} fill={dotColor} style={{ pointerEvents: 'none' }} />
            {isOrphan && !forPrint && (
              <text
                x={dotX}
                y={topStringY - 6}
                textAnchor="middle"
                fontSize={13}
                fontWeight="bold"
                fill="#ff4444"
                style={{ cursor: onRepeatErrorClick ? 'pointer' : 'default' }}
                onClick={onRepeatErrorClick ? (e) => { e.stopPropagation(); onRepeatErrorClick(measureIndex) } : undefined}
              >
                !
              </text>
            )}
          </>
        )
      })()}
      {/* Marker text — bold gold, top of technique zone */}
      {marker && (() => {
        const clickable = !forPrint && !!onMarkerClick
        return (
          <g
            className={clickable ? 'tab-svg-interactive' : undefined}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
            onClick={clickable ? () => onMarkerClick!(measureIndex) : undefined}
          >
            {clickable && (
              <rect
                className="tab-hover-bg"
                x={BARLINE_W + 4}
                y={MARKER_TEXT_Y - 7}
                width={64}
                height={14}
                rx={3}
              />
            )}
            <text
              x={BARLINE_W + 6}
              y={MARKER_TEXT_Y}
              fontSize={MARKER_FONT_SIZE}
              fontWeight="bold"
              fill={forPrint ? '#000000' : '#f0c060'}
              dominantBaseline="middle"
              style={{ pointerEvents: 'none' }}
            >
              {marker}
            </text>
          </g>
        )
      })()}

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
        // Strings tied in from a user-initiated tiedToNext on the previous beat
        const prevBeat = bi > 0 ? measure.beats[bi - 1] : prevMeasureLastBeat
        const tiedDestStrings = prevBeat?.tiedToNext
          ? new Set(prevBeat.notes.map((n) => n.string))
          : null

        return (
          <g key={beat.id}>
            {overlayFill !== 'none' && (
              <rect x={beatCX - NOTE_CURSOR_W / 2} y={MEASURE_NUMBER_H} width={NOTE_CURSOR_W} height={svgH - MEASURE_NUMBER_H} fill={overlayFill} />
            )}


            {/* Rest glyph — only when no notes present */}
            {beat.notes.length === 0 && (
              <RestSymbol
                duration={beat.duration}
                dot={beat.dot}
                cx={beatCX}
                cy={strAreaMid}
                fill={forPrint ? '#333333' : '#bbb'}
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
                noteFontSize: number
                labelW: number
                trillAuxFret: number | undefined
                trillAuxRightPad: number
              }
              // si is 1-based; stringCount=top (highest pitch), 1=bottom (lowest pitch)
              const strings: StringData[] = Array.from({ length: stringCount }, (_, rawSi) => {
                const si = rawSi + 1
                const note = beat.notes.find(n => n.string === si)
                const sy = stringY(si, stringCount)
                const isCursorNote = isCursorCol && cursor.stringIndex === si
                const isNoteSelected =
                  noteSelectionSet.has(`${measureIndex}:${bi}:${si}`) ||
                  (isCursorNote && !!note)

                const isTiedDest = !isTied && (tiedDestStrings?.has(si) ?? false)
                const { label: fretLabel, fill: fretFill, fontStyle } = note
                  ? isTiedDest
                    ? { label: String(note.fret < 0 ? '' : note.fret), fill: forPrint ? '#999999' : '#666666', fontStyle: 'normal' as const }
                    : formatFretLabel(note, isTied, forPrint)
                  : { label: '', fill: forPrint ? '#000000' : '#e8e8e8', fontStyle: 'normal' as const }
                const noteFontSize = isTiedDest ? NOTE_FONT_SIZE * 0.8 : NOTE_FONT_SIZE

                const hasNote = fretLabel !== ''
                const labelW = Math.max(fretLabel.length * 8 + 4, 18)
                const trillAuxFret = (hasNote && note?.modifiers.trill && note.trillFret !== undefined)
                  ? note.trillFret
                  : undefined
                // Ensure the note background extends far enough right to show the aux fret label.
                // Aux text starts at labelW/2 + 3 from center; each char is ~7.2px at 12px monospace.
                const auxNeeded = trillAuxFret !== undefined
                  ? labelW / 2 + 3 + `(${trillAuxFret})`.length * 7.2
                  : 0
                const trillAuxRightPad = Math.max(0, auxNeeded - labelW / 2)
                return { si, sy, isCursorNote, isNoteSelected, hasNote, fretLabel, fretFill, fontStyle, noteFontSize, labelW, trillAuxFret, trillAuxRightPad }
              })

              const TRILL_AUX_FONT_SIZE = 12

              return (
                <>
                  {/* Pass 1: cursor highlights, note backgrounds, texts, hit targets */}
                  {strings.map(({ si, sy, isCursorNote, hasNote, fretLabel, fretFill, fontStyle, noteFontSize, labelW, trillAuxFret, trillAuxRightPad }) => (
                    <g key={si}>
                      {isCursorNote && !isPlaying && (
                        <rect
                          x={beatCX - labelW / 2}
                          y={sy - 11}
                          width={labelW + trillAuxRightPad}
                          height={22}
                          fill="rgba(110,120,255,0.75)"
                          rx={2}
                        />
                      )}

                      {hasNote && (
                        <rect
                          x={beatCX - labelW / 2}
                          y={sy - 10}
                          width={labelW + trillAuxRightPad}
                          height={20}
                          fill={forPrint ? 'white' : '#111'}
                          rx={2}
                        />
                      )}

                      {hasNote && (
                        <text
                          x={beatCX}
                          y={sy}
                          fontSize={noteFontSize}
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

                      {/* Trill auxiliary fret — small, parenthesized, just right of the fret label */}
                      {trillAuxFret !== undefined && (
                        <text
                          x={beatCX + labelW / 2 + 3}
                          y={sy}
                          fontSize={TRILL_AUX_FONT_SIZE}
                          fontFamily="'Courier New', monospace"
                          textAnchor="start"
                          dominantBaseline="middle"
                          fill={forPrint ? '#444444' : '#b3e5b3'}
                          style={{ pointerEvents: 'none' }}
                        >
                          {`(${trillAuxFret})`}
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
                  {strings.map(({ si, sy, isNoteSelected, labelW, trillAuxRightPad }) =>
                    isNoteSelected ? (
                      <rect
                        key={`sel-${si}`}
                        x={beatCX - labelW / 2 - 2}
                        y={sy - 12}
                        width={labelW + trillAuxRightPad + 4}
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
              fill={forPrint ? '#333333' : '#999'}
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

      {/* Right barline — double with dots when close repeat */}
      {measure.repeatClose !== undefined ? (() => {
        const dotX = mw - 10
        const dotYTop = topStringY + (bottomStringY - topStringY) * 0.33
        const dotYBot = topStringY + (bottomStringY - topStringY) * 0.67
        const barColor = forPrint ? '#000000' : '#aaa'
        const isOrphan = repeatStatus === 'close-orphan'
        const countLabel = measure.repeatClose > 2 ? `×${measure.repeatClose}` : undefined
        const clickable = !forPrint && !!onRepeatCloseClick
        return (
          <>
            <circle cx={dotX} cy={dotYTop} r={2.5} fill={barColor} style={{ pointerEvents: 'none' }} />
            <circle cx={dotX} cy={dotYBot} r={2.5} fill={barColor} style={{ pointerEvents: 'none' }} />
            <line x1={mw - 5} y1={topStringY} x2={mw - 5} y2={bottomStringY} stroke={barColor} strokeWidth={3.5} />
            <line x1={mw} y1={topStringY} x2={mw} y2={bottomStringY} stroke={barColor} strokeWidth={1} />
            {/* Clickable overlay for the close bar */}
            {clickable && (
              <rect
                x={mw - 14}
                y={topStringY}
                width={16}
                height={bottomStringY - topStringY}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onRepeatCloseClick!(measureIndex) }}
              />
            )}
            {/* Repeat count label (above) */}
            {countLabel && (
              <text
                x={mw - 5}
                y={topStringY - 5}
                textAnchor="middle"
                fontSize={10}
                fill={forPrint ? '#000000' : '#aaa'}
                style={{ pointerEvents: 'none' }}
              >
                {countLabel}
              </text>
            )}
            {/* Orphan indicator */}
            {isOrphan && !forPrint && (
              <text
                x={mw - 5}
                y={topStringY - 6}
                textAnchor="middle"
                fontSize={13}
                fontWeight="bold"
                fill="#ff4444"
                style={{ cursor: onRepeatErrorClick ? 'pointer' : 'default' }}
                onClick={onRepeatErrorClick ? (e) => { e.stopPropagation(); onRepeatErrorClick(measureIndex) } : undefined}
              >
                !
              </text>
            )}
          </>
        )
      })() : (
        <line
          x1={mw}
          y1={topStringY}
          x2={mw}
          y2={bottomStringY}
          stroke={forPrint ? '#000000' : '#777'}
          strokeWidth={BARLINE_W}
        />
      )}

      {/* Technique overlays */}
      <TechniqueOverlay
        measure={measure}
        measureIndex={measureIndex}
        track={track}
        beatPositions={beatPositions}
        onBendAmountClick={onBendAmountClick}
        onChordClick={onChordClick}
        onBeatTextClick={onBeatTextClick}
        forPrint={forPrint}
        prevMeasureLastBeat={prevMeasureLastBeat}
        nextMeasureFirstBeat={nextMeasureFirstBeat}
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
              fill="rgba(255,255,255,0.22)"
            />
          )}
          {Array.from({ length: stringCount }, (_, rawSi) => {
            const si = rawSi + 1  // 1-based, 1=bottom (lowest pitch), stringCount=top (highest)
            const sy = stringY(si, stringCount)
            // preset.strings is low→high; si=1=lowest → index 0, si=N=highest → index N-1
            const label = preset!.strings[si - 1]?.note ?? ''
            return (
              <text
                key={si}
                x={-4}
                y={sy}
                fontSize={STRING_LABEL_FONT_SIZE}
                fontWeight={600}
                textAnchor="end"
                dominantBaseline="middle"
                fill={forPrint ? '#333333' : labelHovered ? '#ffffff' : '#c8c8de'}
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
