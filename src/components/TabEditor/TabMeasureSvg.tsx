import type { DurationValue, Measure, TabCursor, TabSelection, TabTrack } from '../../tabEditorTypes'
import { isInSelection, measureCapacityBeats, measureUsedBeats } from '../../tabEditorState'
import { TUNINGS } from '../../data/tunings'
import { TechniqueOverlay } from './TabTechniquePaths'
import {
  TOP_MARGIN,
  BARLINE_W,
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
  noteSelection: TabCursor[]
  isPlaying: boolean
  playheadMeasure: number
  playheadBeat: number
  showTimeSig?: boolean
  showStringLabels?: boolean
  timeSig?: { numerator: number; denominator: number }
  activeDuration: DurationValue
  onTimeSigClick?: (measureIndex: number) => void
  onMeasureContextMenu?: (measureIndex: number, e: React.MouseEvent) => void
  onBeatMouseDown: (mi: number, bi: number, si: number, shiftKey: boolean) => void
  onBeatMouseEnter: (mi: number, bi: number) => void
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

export function TabMeasureSvg({
  measure,
  measureIndex,
  xOffset,
  track,
  cursor,
  selection,
  noteSelection,
  isPlaying,
  playheadMeasure,
  playheadBeat,
  showTimeSig = false,
  showStringLabels = false,
  timeSig,
  activeDuration,
  onTimeSigClick,
  onMeasureContextMenu,
  onBeatMouseDown,
  onBeatMouseEnter,
}: TabMeasureSvgProps) {
  const { stringCount } = track
  const svgH = rowSvgHeight(stringCount)

  const sig = timeSig ?? track.globalTimeSig
  const capacity = measureCapacityBeats(sig)
  const used = measureUsedBeats(measure.beats)
  const hasVirtualSlot = used < capacity - 1e-9
  const virtualSlots = hasVirtualSlot ? 1 : 0

  const mw = measureWidth(measure, showTimeSig, virtualSlots)
  const beatPositions = computeBeatPositions(measure, showTimeSig, virtualSlots)

  const topStringY = stringY(stringCount - 1, stringCount)
  const bottomStringY = stringY(0, stringCount)
  const strAreaMid = (topStringY + bottomStringY) / 2

  const tuning = TUNINGS[track.stringCount]
  const preset = tuning.find((p) => p.name === track.tuningName) ?? tuning[0]

  const isCursorOnThisMeasure = cursor.measureIndex === measureIndex
  const isVirtualCursor = isCursorOnThisMeasure && cursor.beatIndex === measure.beats.length

  return (
    <g transform={`translate(${xOffset}, 0)`}>
      {/* Measure number — right-click for context menu */}
      <text
        x={BARLINE_W + (showTimeSig ? TIME_SIG_W : 0) + 2}
        y={topStringY - 4}
        fontSize={12}
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

      {/* Left barline */}
      <line
        x1={0}
        y1={topStringY}
        x2={0}
        y2={bottomStringY}
        stroke="#777"
        strokeWidth={BARLINE_W}
      />

      {/* Real beat columns */}
      {measure.beats.map((beat, bi) => {
        const pos = beatPositions[bi]
        if (!pos) return null
        const { x: beatX, cx: beatCX, w: beatW } = pos

        const isCursorCol = isCursorOnThisMeasure && cursor.beatIndex === bi
        const isSelected = isInSelection(selection, measureIndex, bi)
        const isPlayhead = isPlaying && playheadMeasure === measureIndex && playheadBeat === bi

        let overlayFill = 'none'
        if (isPlayhead) overlayFill = 'rgba(30,100,50,0.3)'
        else if (isCursorCol) overlayFill = 'rgba(42,90,140,0.25)'
        else if (isSelected) overlayFill = 'rgba(90,60,20,0.35)'

        const isTied = beat.tiedFrom === true

        const colW = beat.notes.reduce((max, n) => {
          let label = ''
          if (n && n.fret >= 0) {
            if (isTied) label = `(${n.fret})`
            else if (n.modifiers.dead) label = 'X'
            else if (n.modifiers.naturalHarmonic) label = `<${n.fret}>`
            else if (n.modifiers.ghost) label = `(${n.fret})`
            else label = String(n.fret)
          }
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
              onMouseEnter={() => onBeatMouseEnter(measureIndex, bi)}
            />

            {/* Per-string fret numbers */}
            {Array.from({ length: stringCount }, (_, rawSi) => {
              const si = stringCount - 1 - rawSi
              const note = beat.notes[si]
              const sy = stringY(si, stringCount)
              const isCursorNote = isCursorCol && cursor.stringIndex === si
              const isNoteSelected =
                noteSelection.some(
                  (s) => s.measureIndex === measureIndex && s.beatIndex === bi && s.stringIndex === si,
                ) || (isCursorNote && !!note && note.fret >= 0)

              let fretLabel = ''
              let fretFill = '#e8e8e8'
              let fontStyle: 'normal' | 'italic' = 'normal'

              if (note && note.fret >= 0) {
                if (isTied) {
                  fretLabel = `(${note.fret})`
                  fretFill = '#666'
                } else if (note.modifiers.dead) {
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
                  {isCursorNote && (
                    <rect
                      x={beatCX - labelW / 2}
                      y={sy - 11}
                      width={labelW}
                      height={22}
                      fill="rgba(99,102,241,0.45)"
                      rx={2}
                    />
                  )}

                  {isNoteSelected && (
                    <rect
                      x={beatCX - labelW / 2 - 2}
                      y={sy - 12}
                      width={labelW + 4}
                      height={24}
                      fill="none"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      rx={3}
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

                  {note?.fret >= 0 && note.modifiers.accent && !isTied && (
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
                      onBeatMouseDown(measureIndex, bi, si, e.shiftKey)
                    }}
                  />
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Virtual pending slot — shown when measure has remaining capacity */}
      {hasVirtualSlot && (() => {
        const vPos = beatPositions[measure.beats.length]
        if (!vPos) return null
        const { x: vX, cx: vCX, w: vW } = vPos
        const overlayFill = isVirtualCursor ? 'rgba(42,90,140,0.25)' : 'none'

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
            {isVirtualCursor && (() => {
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

            {/* Click target for virtual slot */}
            <rect
              x={vX}
              y={TOP_MARGIN}
              width={vW}
              height={svgH - TOP_MARGIN}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                onBeatMouseDown(measureIndex, measure.beats.length, cursor.stringIndex, e.shiftKey)
              }}
              onMouseEnter={() => onBeatMouseEnter(measureIndex, measure.beats.length)}
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
      <TechniqueOverlay measure={measure} track={track} beatPositions={beatPositions} />

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
}
