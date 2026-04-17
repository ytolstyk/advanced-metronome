import type { DurationValue, Measure, TabCursor, TabSelection, TabTrack } from '../../tabEditorTypes'
import { isInSelection } from '../../tabEditorState'
import { TUNINGS } from '../../data/tunings'
import { TechniqueOverlay } from './TabTechniquePaths'
import {
  TOP_MARGIN,
  BARLINE_W,
  DURATION_MARK_H,
  TECHNIQUE_ZONE_H,
  MEASURE_NUMBER_H,
  TIME_SIG_W,
  stringY,
  rowSvgHeight,
  measureWidth,
  computeBeatPositions,
} from './tabSvgConstants'

interface TabMeasureSvgProps {
  measure: Measure
  measureIndex: number
  xOffset: number
  track: TabTrack
  cursor: TabCursor
  selection: TabSelection | null
  playheadMeasure: number
  playheadBeat: number
  showTimeSig?: boolean
  timeSig?: { numerator: number; denominator: number }
  onTimeSigClick?: (measureIndex: number) => void
  onBeatMouseDown: (mi: number, bi: number, si: number) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
}

function durationSymbol(d: DurationValue): string {
  switch (d) {
    case 'whole': return '𝅝'
    case 'half': return '𝅗'
    case 'quarter': return '♩'
    case 'eighth': return '♪'
    case 'sixteenth': return '♬'
    case 'thirtysecond': return '⋮'
    default: return '⋱'
  }
}

export function TabMeasureSvg({
  measure,
  measureIndex,
  xOffset,
  track,
  cursor,
  selection,
  playheadMeasure,
  playheadBeat,
  showTimeSig = false,
  timeSig,
  onTimeSigClick,
  onBeatMouseDown,
  onBeatMouseEnter,
}: TabMeasureSvgProps) {
  const { stringCount } = track
  const svgH = rowSvgHeight(stringCount)
  const mw = measureWidth(measure, showTimeSig)
  const contentW = mw - BARLINE_W * 2
  const beatPositions = computeBeatPositions(measure, showTimeSig)

  // String line y range: from topmost string to bottommost
  const topStringY = stringY(stringCount - 1, stringCount)
  const bottomStringY = stringY(0, stringCount)

  // Center of the string area (for time sig vertical centering)
  const strAreaMid = (topStringY + bottomStringY) / 2

  // Determine string label names for this tuning
  const tuning = TUNINGS[track.stringCount]
  const preset = tuning.find((p) => p.name === track.tuningName) ?? tuning[0]

  return (
    <g transform={`translate(${xOffset}, 0)`}>
      {/* Measure number */}
      <text
        x={BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + 2}
        y={DURATION_MARK_H + TECHNIQUE_ZONE_H + MEASURE_NUMBER_H / 2}
        fontSize={11}
        fill="#888"
        dominantBaseline="middle"
      >
        {measureIndex + 1}
      </text>

      {/* Stacked time signature */}
      {showTimeSig && timeSig && (
        <g
          style={{ cursor: onTimeSigClick ? 'pointer' : 'default' }}
          onClick={onTimeSigClick ? () => onTimeSigClick(measureIndex) : undefined}
        >
          {/* Clickable hit area */}
          <rect
            x={BARLINE_W}
            y={topStringY - 4}
            width={TIME_SIG_W}
            height={bottomStringY - topStringY + 8}
            fill="transparent"
          />
          {/* Numerator (top) */}
          <text
            x={BARLINE_W + TIME_SIG_W / 2}
            y={strAreaMid - 2}
            fontSize={26}
            fontWeight="bold"
            fontFamily="serif"
            textAnchor="middle"
            dominantBaseline="auto"
            fill="#ddd"
          >
            {timeSig.numerator}
          </text>
          {/* Denominator (bottom) */}
          <text
            x={BARLINE_W + TIME_SIG_W / 2}
            y={strAreaMid + 2}
            fontSize={26}
            fontWeight="bold"
            fontFamily="serif"
            textAnchor="middle"
            dominantBaseline="hanging"
            fill="#ddd"
          >
            {timeSig.denominator}
          </text>
        </g>
      )}

      {/* String lines spanning full measure content */}
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

      {/* Left barline */}
      <line
        x1={0}
        y1={topStringY}
        x2={0}
        y2={bottomStringY}
        stroke="#777"
        strokeWidth={BARLINE_W}
      />

      {/* Beat columns */}
      {measure.beats.map((beat, bi) => {
        const pos = beatPositions[bi]
        if (!pos) return null
        const { x: beatX, cx: beatCX, w: beatW } = pos

        const isCursorCol = cursor.measureIndex === measureIndex && cursor.beatIndex === bi
        const isSelected = isInSelection(selection, measureIndex, bi)
        const isPlayhead = playheadMeasure === measureIndex && playheadBeat === bi

        // Background overlay for cursor / selection / playhead
        let overlayFill = 'none'
        if (isPlayhead) overlayFill = 'rgba(30,100,50,0.3)'
        else if (isCursorCol) overlayFill = 'rgba(42,90,140,0.25)'
        else if (isSelected) overlayFill = 'rgba(90,60,20,0.35)'

        const dotSuffix = beat.dot.dotted ? '·' : beat.dot.doubleDotted ? '··' : beat.dot.triplet ? '³' : ''

        return (
          <g key={beat.id}>
            {/* Column overlay */}
            {overlayFill !== 'none' && (
              <rect
                x={beatX}
                y={0}
                width={beatW}
                height={svgH}
                fill={overlayFill}
              />
            )}

            {/* Duration mark */}
            <text
              x={beatCX}
              y={DURATION_MARK_H / 2}
              fontSize={11}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#aaa"
            >
              {durationSymbol(beat.duration)}{dotSuffix}
            </text>

            {/* Beat-level hit target (for drag selection) */}
            <rect
              x={beatX}
              y={TOP_MARGIN}
              width={beatW}
              height={contentW > 0 ? svgH - TOP_MARGIN : 0}
              fill="transparent"
              onMouseEnter={() => onBeatMouseEnter(measureIndex, bi)}
            />

            {/* Per-string fret numbers + hit targets */}
            {Array.from({ length: stringCount }, (_, rawSi) => {
              // Display high→low: rawSi=0 is highest string (stringCount-1 in data)
              const si = stringCount - 1 - rawSi
              const note = beat.notes[si]
              const sy = stringY(si, stringCount)
              const isCursorNote = isCursorCol && cursor.stringIndex === si

              // Fret label and color
              let fretLabel = ''
              let fretFill = '#e8e8e8'
              let fontStyle: 'normal' | 'italic' = 'normal'

              if (note && note.fret >= 0) {
                if (note.modifiers.dead) {
                  fretLabel = 'X'
                  fretFill = '#cc4444'
                } else if (note.modifiers.naturalHarmonic) {
                  fretLabel = `<${note.fret}>`
                  fretFill = '#88ccff'
                  fontStyle = 'italic'
                } else if (note.modifiers.ghost) {
                  fretLabel = `(${note.fret})`
                  fretFill = '#888888'
                } else {
                  fretLabel = String(note.fret)
                }
              }

              const hasNote = fretLabel !== ''
              const labelW = Math.max(fretLabel.length * 8 + 4, 18)

              return (
                <g key={si}>
                  {/* Cursor note background */}
                  {isCursorNote && (
                    <rect
                      x={beatCX - labelW / 2 - 1}
                      y={sy - 11}
                      width={labelW + 2}
                      height={22}
                      fill="rgba(42,90,180,0.5)"
                      rx={2}
                    />
                  )}

                  {/* Fret number background rect */}
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

                  {/* Fret number text */}
                  {hasNote && (
                    <text
                      x={beatCX}
                      y={sy}
                      fontSize={13}
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

                  {/* Accent mark */}
                  {note?.fret >= 0 && note.modifiers.accent && (
                    <text
                      x={beatCX + labelW / 2 + 1}
                      y={sy - 6}
                      fontSize={8}
                      fill="#ffdd88"
                    >
                      &gt;
                    </text>
                  )}

                  {/* Per-string hit target */}
                  <rect
                    x={beatX}
                    y={sy - 10}
                    width={beatW}
                    height={20}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      onBeatMouseDown(measureIndex, bi, si)
                    }}
                  />
                </g>
              )
            })}
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

      {/* Technique overlays (post-pass) */}
      <TechniqueOverlay measure={measure} track={track} beatPositions={beatPositions} />

      {/* String labels (in left gutter, one per string) */}
      {Array.from({ length: stringCount }, (_, rawSi) => {
        const si = stringCount - 1 - rawSi
        const sy = stringY(si, stringCount)
        const label = preset.strings[si]?.note ?? ''
        return (
          <text
            key={si}
            x={-4}
            y={sy}
            fontSize={11}
            textAnchor="end"
            dominantBaseline="middle"
            fill="#aaa"
          >
            {label}
          </text>
        )
      })}
    </g>
  )
}
