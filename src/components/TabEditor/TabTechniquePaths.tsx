import type { Beat, BendCurve, BendPointDef, Measure, TabTrack } from '../../tabEditorTypes'
import {
  type BeatPosition,
  BARLINE_W,
  MEASURE_END_PAD,
  MEASURE_NUMBER_H,
  TAPPING_ZONE_Y,
  VIBRATO_ZONE_Y,
  PALM_MUTE_ZONE_Y,
  PALM_MUTE_ELEVATED_Y,
  LET_RING_ZONE_Y,
  LET_RING_ELEVATED_Y,
  STACCATO_ZONE_Y,
  TAPPING_LABEL_FONT_SIZE,
  BEND_LABEL_FONT_SIZE,
  PICK_DIR_FONT_SIZE,
  TECHNIQUE_LABEL_FONT_SIZE,
  CHORD_LABEL_Y,
  CHORD_LABEL_FONT_SIZE,
  BEAT_TEXT_ZONE_Y,
  BEAT_TEXT_FONT_SIZE,
  stringY,
} from './tabSvgConstants'

// Fixed Y where bend curves peak (in technique zone, above all strings)
const BEND_TOP_Y = 26
// Y for technique-zone effects when a bend is present in the same beat
const BEND_ELEVATED_Y = MEASURE_NUMBER_H + 2

function formatBendAmount(amount: number): string {
  const whole = Math.floor(amount)
  const hasHalf = amount % 1 !== 0
  if (whole === 0) return '½'
  if (hasHalf) return `${whole}½`
  return `${whole}`
}

interface TechniqueOverlayProps {
  measure: Measure
  measureIndex: number
  track: TabTrack
  beatPositions: BeatPosition[]
  onBendAmountClick?: (measureIndex: number, beatIndex: number, stringIndex: number) => void
  onChordClick?: (measureIndex: number, beatIndex: number) => void
  onBeatTextClick?: (measureIndex: number, beatIndex: number) => void
  forPrint?: boolean
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat
}

export function TechniqueOverlay({ measure, measureIndex, track, beatPositions, onBendAmountClick, onChordClick, onBeatTextClick, forPrint = false, prevMeasureLastBeat }: TechniqueOverlayProps) {
  const elements: React.ReactNode[] = []
  const measureContentW = beatPositions.length > 0
    ? beatPositions[beatPositions.length - 1].x + beatPositions[beatPositions.length - 1].w
    : 0
  const measureRightEdge = measureContentW + BARLINE_W
  // Full measure width including end padding — used to extend runs to the barline for cross-measure ties
  const measureTotalW = measureContentW + MEASURE_END_PAD + BARLINE_W

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const pos = beatPositions[bi]
    if (!pos) continue

    const { cx, w: posW } = pos

    // Detect if any string in this beat has a bend (affects technique zone Y positions)
    const hasBend = beat.notes.some((n) => n.modifiers.bend)
    const techY = hasBend ? BEND_ELEVATED_Y : TAPPING_ZONE_Y

    // Tapping: render one "T" per beat column if any string has tapping
    const isTiedBeat = bi === 0 && beat.tiedFrom === true
    const hasTapping = beat.notes.some((n) => n.modifiers.tapping)
      || (isTiedBeat && prevMeasureLastBeat?.notes.some((n) => n.modifiers.tapping) === true)
    if (hasTapping) {
      elements.push(
        <text
          key={`tap-${bi}`}
          x={cx}
          y={techY}
          fontSize={TAPPING_LABEL_FONT_SIZE}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={forPrint ? '#000000' : '#ffdd88'}
        >
          T
        </text>,
      )
    }

    // Staccato: one dot per beat column if any note has staccato
    const hasStaccato = beat.notes.some((n) => n.modifiers.staccato)
    if (hasStaccato) {
      elements.push(
        <circle
          key={`stac-${bi}`}
          cx={cx}
          cy={STACCATO_ZONE_Y}
          r={3}
          fill={forPrint ? '#000000' : '#e8e8e8'}
        />,
      )
    }

    // Vibrato rendered after main loop as runs (see renderVibratoRuns below)

    for (const note of beat.notes) {
      const si = note.string  // 1-based
      const sy = stringY(si, track.stringCount)
      const key = `${bi}-${si}`

      // Hammer-on arc (no label)
      if (note.modifiers.hammerOn) {
        const nextPos = beatPositions[bi + 1]
        const dx = nextPos ? nextPos.cx : measureRightEdge + 4
        const mx = (cx + dx) / 2
        elements.push(
          <path
            key={`h-${key}`}
            d={`M ${cx},${sy - 10} Q ${mx},${sy - 24} ${dx},${sy - 10}`}
            stroke={forPrint ? '#000000' : '#88ffaa'}
            strokeWidth={1.5}
            fill="none"
          />,
        )
      }

      // Pull-off arc (no label)
      if (note.modifiers.pullOff) {
        const nextPos = beatPositions[bi + 1]
        const dx = nextPos ? nextPos.cx : measureRightEdge + 4
        const mx = (cx + dx) / 2
        elements.push(
          <path
            key={`p-${key}`}
            d={`M ${cx},${sy - 10} Q ${mx},${sy - 24} ${dx},${sy - 10}`}
            stroke={forPrint ? '#000000' : '#88ffaa'}
            strokeWidth={1.5}
            fill="none"
          />,
        )
      }

      // Legato slide
      if (note.modifiers.legatoSlide) {
        const nextPos = beatPositions[bi + 1]
        const nextNote = measure.beats[bi + 1]?.notes.find(n => n.string === note.string)
        if (nextPos && nextNote) {
          const dx = nextPos.cx - 6
          const dy = nextNote.fret > note.fret ? sy - 4 : nextNote.fret < note.fret ? sy + 2 : sy
          const newSy = nextNote.fret > note.fret ? sy + 2 : sy - 4;
          elements.push(
            <line
              key={`ls-${key}`}
              x1={cx + 6}
              y1={newSy}
              x2={dx}
              y2={dy}
              stroke={forPrint ? '#000000' : '#aaddff'}
              strokeWidth={1.5}
            />,
          )
        }
      }

      // Slide in from below
      if (note.modifiers.slideInBelow) {
        elements.push(
          <line
            key={`sib-${key}`}
            x1={cx - 18}
            y1={sy + 4}
            x2={cx - 6}
            y2={sy - 4}
            stroke={forPrint ? '#000000' : '#aaddff'}
            strokeWidth={1.5}
          />,
        )
      }

      // Slide in from above
      if (note.modifiers.slideInAbove) {
        elements.push(
          <line
            key={`sia-${key}`}
            x1={cx - 18}
            y1={sy - 4}
            x2={cx - 6}
            y2={sy + 4}
            stroke={forPrint ? '#000000' : '#aaddff'}
            strokeWidth={1.5}
          />,
        )
      }

      // Slide out downward
      if (note.modifiers.slideOutDown) {
        elements.push(
          <line
            key={`sod-${key}`}
            x1={cx + 6}
            y1={sy - 4}
            x2={cx + 18}
            y2={sy + 4}
            stroke={forPrint ? '#000000' : '#aaddff'}
            strokeWidth={1.5}
          />,
        )
      }

      // Slide out upward
      if (note.modifiers.slideOutUp) {
        elements.push(
          <line
            key={`sou-${key}`}
            x1={cx + 6}
            y1={sy + 4}
            x2={cx + 18}
            y2={sy - 4}
            stroke={forPrint ? '#000000' : '#aaddff'}
            strokeWidth={1.5}
          />,
        )
      }

      // Bend — multi-segment quadratic bezier curves from BendData
      if (note.modifiers.bend && note.bendData) {
        const { points, segments } = note.bendData
        const bendColor = forPrint ? '#000000' : '#ffaadd'
        const svgStartX = cx + 6
        // Use actual allocated slot width so curve never overflows into the next beat
        const slotRightFromCx = posW - 12  // posW - BEAT_LEFT_PAD
        const svgEndX = cx + slotRightFromCx - 8
        const bottomY = sy - 6
        const topY = BEND_TOP_Y

        function offToX(offset: number): number {
          return svgStartX + (offset / 60) * (svgEndX - svgStartX)
        }
        function valToY(value: number): number {
          return bottomY + (value / 24) * (topY - bottomY)
        }

        const bendChildren: React.ReactNode[] = []
        for (let si = 0; si < segments.length; si++) {
          const p1 = points[si] as BendPointDef
          const p2 = points[si + 1] as BendPointDef
          const curve = segments[si] as BendCurve
          const x1 = offToX(p1.offset)
          const y1 = valToY(p1.value)
          const x2 = offToX(p2.offset)
          const y2 = valToY(p2.value)
          const d = curve === 'up'
            ? `M ${x1},${y1} Q ${x2},${y1} ${x2},${y2}`
            : `M ${x1},${y1} Q ${x1},${y2} ${x2},${y2}`
          bendChildren.push(
            <path key={`bseg${si}`} d={d} stroke={bendColor} strokeWidth={1.5} fill="none" />
          )

          const valueDelta = p2.value - p1.value
          const dy = y2 - y1  // negative = going up on screen
          if (Math.abs(valueDelta) > 0) {
            // Arrow tip offset beyond curve endpoint in the direction of travel:
            // 'up' curve ends vertically → offset y; 'down' ends horizontally → offset x
            const ARROW_OFFSET = 2
            const ax = x2 + (curve === 'down' ? ARROW_OFFSET : 0)
            const ay = y2 + (curve === 'up' ? (dy < 0 ? -ARROW_OFFSET : ARROW_OFFSET) : 0)
            // dy < 0 means curve goes up → upward arrow (▲): base below tip, dir = +1
            // dy > 0 means curve goes down → downward arrow (▼): base above tip, dir = -1
            const dir = dy < 0 ? 1 : -1
            const ARROW_H = 6
            bendChildren.push(
              <polygon key={`barr${si}`}
                points={`${ax - 3},${ay + dir * ARROW_H} ${ax},${ay} ${ax + 3},${ay + dir * ARROW_H}`}
                fill={bendColor}
              />
            )

            // Label shows absolute position from base note (p2.value/4 semitones); skip if back to 0
            if (p2.value === 0) continue
            const semitones = p2.value / 4
            const segLabel = formatBendAmount(semitones)
            // "Above" always means smaller y (higher on screen), offset from the tip
            const labelY = ay - 10
            bendChildren.push(
              <text key={`blbl${si}`}
                x={ax + 5}
                y={labelY}
                fontSize={BEND_LABEL_FONT_SIZE}
                fontWeight="bold"
                textAnchor="start"
                dominantBaseline="auto"
                fill={bendColor}
                style={{ pointerEvents: 'none' }}
              >
                {segLabel}
              </text>
            )
          }
        }

        elements.push(
          <g
            key={`bend-${key}`}
            className={!forPrint && onBendAmountClick ? 'tab-svg-interactive' : undefined}
            style={{ cursor: onBendAmountClick ? 'pointer' : 'default' }}
            onClick={onBendAmountClick ? () => onBendAmountClick(measureIndex, bi, note.string) : undefined}
          >
            {bendChildren}
          </g>,
        )
      }

    }

    // Pick stroke: one arrow per beat column (beat-level, not per-string)
    if (beat.pickStroke) {
      elements.push(
        <text
          key={`pick-${bi}`}
          x={cx}
          y={techY}
          fontSize={PICK_DIR_FONT_SIZE}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={forPrint ? '#000000' : '#cccccc'}
        >
          {beat.pickStroke === 'down' ? '⬇' : '⬆'}
        </text>,
      )
    }

    // Tremolo picking: groups of diagonal slash marks tiled across the full beat slot
    if (beat.tremoloMarks) {
      const markCount = beat.tremoloMarks
      const slashH = 7
      const slashW = 4
      const innerGap = 2
      const groupGap = 5
      const groupW = markCount * (slashW + innerGap) - innerGap
      const groupStep = groupW + groupGap
      const areaStart = pos.cx
      const areaEnd = pos.x + pos.w - 2
      const slashY = techY - 4
      const slashColor = forPrint ? '#000000' : '#ffaa44'
      const slashLines: React.ReactNode[] = []
      for (let gx = areaStart; gx + groupW <= areaEnd; gx += groupStep) {
        for (let m = 0; m < markCount; m++) {
          const sx = gx + m * (slashW + innerGap)
          slashLines.push(
            <line
              key={`${gx}-${m}`}
              x1={sx}
              y1={slashY + slashH / 2}
              x2={sx + slashW}
              y2={slashY - slashH / 2}
              stroke={slashColor}
              strokeWidth={1.5}
              strokeLinecap="round"
            />,
          )
        }
      }
      elements.push(<g key={`tremolo-${bi}`}>{slashLines}</g>)
    }

    // Chord label — italic, pink, top of technique zone
    if (beat.chord?.name) {
      const chordClickable = !forPrint && !!onChordClick
      elements.push(
        <g
          key={`chord-${bi}`}
          className={chordClickable ? 'tab-svg-interactive' : undefined}
          style={{ cursor: chordClickable ? 'pointer' : 'default' }}
          onClick={chordClickable ? () => onChordClick!(measureIndex, bi) : undefined}
        >
          {chordClickable && (
            <rect
              className="tab-hover-bg"
              x={cx - 22}
              y={CHORD_LABEL_Y - 7}
              width={44}
              height={14}
              rx={3}
            />
          )}
          <text
            x={cx}
            y={CHORD_LABEL_Y}
            fontSize={CHORD_LABEL_FONT_SIZE}
            fontStyle="italic"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={forPrint ? '#000000' : '#ffaacc'}
            style={{ pointerEvents: 'none' }}
          >
            {beat.chord.name}
          </text>
        </g>,
      )
    }

    // Beat text — regular, dim gray, mid technique zone
    if (beat.text) {
      const textClickable = !forPrint && !!onBeatTextClick
      elements.push(
        <g
          key={`btxt-${bi}`}
          className={textClickable ? 'tab-svg-interactive' : undefined}
          style={{ cursor: textClickable ? 'pointer' : 'default' }}
          onClick={textClickable ? () => onBeatTextClick!(measureIndex, bi) : undefined}
        >
          {textClickable && (
            <rect
              className="tab-hover-bg"
              x={cx - 24}
              y={BEAT_TEXT_ZONE_Y - 6}
              width={48}
              height={12}
              rx={3}
            />
          )}
          <text
            x={cx}
            y={BEAT_TEXT_ZONE_Y}
            fontSize={BEAT_TEXT_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={forPrint ? '#000000' : '#cccccc'}
            style={{ pointerEvents: 'none' }}
          >
            {beat.text}
          </text>
        </g>,
      )
    }
  }

  // Vibrato and palm mute: rendered as runs so the whole connected segment shares one Y level
  renderVibratoRuns(measure, beatPositions, elements, forPrint, prevMeasureLastBeat, measureTotalW)
  renderPalmMuteRuns(measure, beatPositions, elements, forPrint, prevMeasureLastBeat, measureTotalW)
  renderLetRingRuns(measure, beatPositions, elements, forPrint, prevMeasureLastBeat, measureTotalW)
  renderTrillRuns(measure, beatPositions, elements, forPrint, prevMeasureLastBeat, measureTotalW)

  return <g>{elements}</g>
}

function computeNoteSlotW(beat: Beat): number {
  return beat.notes.reduce((max, n) => {
    let label: string
    if (beat.tiedFrom) label = `(${n.fret})`
    else if (n.modifiers.dead) label = 'X'
    else if (n.modifiers.harmonicType) label = `<${n.fret}>`
    else if (n.modifiers.ghost) label = `(${n.fret})`
    else label = String(n.fret)
    return Math.max(max, Math.max(label.length * 8 + 4, 18))
  }, 18)
}

function renderVibratoRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
  forPrint = false,
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat,
  measureTotalW = 0,
) {
  const PAD = 4
  const TARGET_HALF_PERIOD = 8  // px per half-wave cycle; wave count adjusts to fill space
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.modifiers.bend))
    const vy = hasBendInRun ? BEND_ELEVATED_Y : VIBRATO_ZONE_Y

    // Determine amplitude from the highest vibrato type in the run
    const maxVibratoType = measure.beats.slice(runStart, endBi + 1)
      .flatMap((b) => b.notes)
      .reduce((max, n) => Math.max(max, n.modifiers.vibrato ?? 0), 0)
    const amplitude = maxVibratoType >= 2 ? 6 : 3  // wide = 6px, slight = 3px

    const startSlotW = computeNoteSlotW(measure.beats[runStart])
    const tiedFromStart = runStart === 0 && measure.beats[0]?.tiedFrom === true && prevMeasureLastBeat !== undefined
    const tiedToEnd = endBi === measure.beats.length - 1 && measure.beats[endBi]?.tiedTo === true
    const x0 = tiedFromStart ? 0 : startPos.cx - startSlotW / 2 + PAD
    const x1 = tiedToEnd ? measureTotalW : endPos.x + endPos.w - PAD
    const totalW = x1 - x0

    // Round to nearest integer number of half-cycles so wave fills the span uniformly
    const numHalfCycles = Math.max(2, Math.round(totalW / TARGET_HALF_PERIOD))
    const halfPeriod = totalW / numHalfCycles

    let d = `M ${x0},${vy}`
    for (let i = 0; i < numHalfCycles; i++) {
      const cpX = x0 + (i + 0.5) * halfPeriod
      const cpY = i % 2 === 0 ? vy - amplitude : vy + amplitude
      const endX = x0 + (i + 1) * halfPeriod
      d += ` Q ${cpX},${cpY} ${endX},${vy}`
    }

    elements.push(
      <path
        key={`vib-${runStart}-${endBi}`}
        d={d}
        stroke={forPrint ? '#000000' : '#ddaaff'}
        strokeWidth={1.5}
        fill="none"
      />,
    )
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const isTiedBeat = bi === 0 && beat.tiedFrom === true
    const hasVibrato = beat.notes.some((n) => n.modifiers.vibrato)
      || (isTiedBeat && prevMeasureLastBeat?.notes.some((n) => n.modifiers.vibrato) === true)
    if (hasVibrato) {
      if (runStart === null) runStart = bi
    } else {
      flushRun(bi - 1)
    }
  }
  flushRun(measure.beats.length - 1)
}

function runHasOverlap(measure: Measure, startBi: number, endBi: number): boolean {
  for (let bi = startBi; bi <= endBi; bi++) {
    const beat = measure.beats[bi]
    if (beat.notes.some((n) => n.modifiers.tapping || n.modifiers.vibrato || n.modifiers.bend || n.modifiers.trill) || beat.pickStroke || beat.tremoloMarks) return true
  }
  return false
}

function renderPalmMuteRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
  forPrint = false,
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat,
  measureTotalW = 0,
) {
  const PAD = 4
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.modifiers.bend))
    const baseTopY = runHasOverlap(measure, runStart, endBi) ? PALM_MUTE_ELEVATED_Y : PALM_MUTE_ZONE_Y
    const topY = hasBendInRun ? BEND_ELEVATED_Y - 4 : baseTopY
    const startSlotW = computeNoteSlotW(measure.beats[runStart])
    const tiedFromStart = runStart === 0 && measure.beats[0]?.tiedFrom === true && prevMeasureLastBeat !== undefined
    const tiedToEnd = endBi === measure.beats.length - 1 && measure.beats[endBi]?.tiedTo === true
    const x1 = tiedFromStart ? 0 : startPos.cx - startSlotW / 2 + PAD
    const x2 = tiedToEnd ? measureTotalW : endPos.x + endPos.w - PAD
    elements.push(
      <g key={`pm-${runStart}-${endBi}`}>
        <line
          x1={x1}
          y1={topY}
          x2={x2}
          y2={topY}
          stroke={forPrint ? '#000000' : '#ffaa44'}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <text x={x1} y={topY - 2} fontSize={TECHNIQUE_LABEL_FONT_SIZE} fill={forPrint ? '#000000' : '#ffaa44'} dominantBaseline="auto">
          P.M.
        </text>
      </g>,
    )
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const isTiedBeat = bi === 0 && beat.tiedFrom === true
    const hasPM = beat.notes.some((n) => n.modifiers.palmMute)
      || (isTiedBeat && prevMeasureLastBeat?.notes.some((n) => n.modifiers.palmMute) === true)
    if (hasPM) {
      if (runStart === null) runStart = bi
    } else {
      flushRun(bi - 1)
    }
  }
  flushRun(measure.beats.length - 1)
}

function renderLetRingRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
  forPrint = false,
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat,
  measureTotalW = 0,
) {
  const PAD = 4
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.modifiers.bend))
    const baseTopY = runHasOverlap(measure, runStart, endBi) ? LET_RING_ELEVATED_Y : LET_RING_ZONE_Y
    const topY = hasBendInRun ? BEND_ELEVATED_Y - 4 : baseTopY
    const startSlotW = computeNoteSlotW(measure.beats[runStart])
    const tiedFromStart = runStart === 0 && measure.beats[0]?.tiedFrom === true && prevMeasureLastBeat !== undefined
    const tiedToEnd = endBi === measure.beats.length - 1 && measure.beats[endBi]?.tiedTo === true
    const x1 = tiedFromStart ? 0 : startPos.cx - startSlotW / 2 + PAD
    const x2 = tiedToEnd ? measureTotalW : endPos.x + endPos.w - PAD
    elements.push(
      <g key={`lr-${runStart}-${endBi}`}>
        <line
          x1={x1}
          y1={topY}
          x2={x2}
          y2={topY}
          stroke={forPrint ? '#000000' : '#88ddff'}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <text x={x1} y={topY - 2} fontSize={TECHNIQUE_LABEL_FONT_SIZE} fill={forPrint ? '#000000' : '#88ddff'} dominantBaseline="auto">
          ring
        </text>
      </g>,
    )
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const isTiedBeat = bi === 0 && beat.tiedFrom === true
    const hasLR = beat.notes.some((n) => n.modifiers.letRing)
      || (isTiedBeat && prevMeasureLastBeat?.notes.some((n) => n.modifiers.letRing) === true)
    if (hasLR) {
      if (runStart === null) runStart = bi
    } else {
      flushRun(bi - 1)
    }
  }
  flushRun(measure.beats.length - 1)
}

function renderTrillRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
  forPrint = false,
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat,
  measureTotalW = 0,
) {
  const PAD = 4
  const TR_LABEL_W = 13  // approximate pixel width of "tr" italic text
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }

    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.modifiers.bend))
    const baseTopY = runHasOverlapWithoutTrill(measure, runStart, endBi) ? LET_RING_ELEVATED_Y : LET_RING_ZONE_Y
    const topY = hasBendInRun ? BEND_ELEVATED_Y - 4 : baseTopY

    const startSlotW = computeNoteSlotW(measure.beats[runStart])
    const tiedFromStart = runStart === 0 && measure.beats[0]?.tiedFrom === true && prevMeasureLastBeat !== undefined
    const tiedToEnd = endBi === measure.beats.length - 1 && measure.beats[endBi]?.tiedTo === true
    const x1 = tiedFromStart ? 0 : startPos.cx - startSlotW / 2 + PAD
    // Extend right edge to cover the full beat slot (including trill aux fret space)
    const x2 = tiedToEnd ? measureTotalW : endPos.x + endPos.w - PAD
    const dashX1 = x1 + TR_LABEL_W + 2
    const trillColor = forPrint ? '#000000' : '#aaffcc'

    elements.push(
      <g key={`trill-${runStart}-${endBi}`}>
        <text
          x={x1}
          y={topY - 2}
          fontSize={TECHNIQUE_LABEL_FONT_SIZE}
          fontStyle="italic"
          fontWeight="bold"
          fill={trillColor}
          dominantBaseline="auto"
        >
          tr
        </text>
        {x2 > dashX1 + 2 && (
          <line
            x1={dashX1}
            y1={topY - 6}
            x2={x2}
            y2={topY - 6}
            stroke={trillColor}
            strokeWidth={1.5}
            strokeDasharray="3 1"
          />
        )}
      </g>,
    )
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const isTiedBeat = bi === 0 && beat.tiedFrom === true
    const hasTrill = beat.notes.some((n) => n.modifiers.trill)
      || (isTiedBeat && prevMeasureLastBeat?.notes.some((n) => n.modifiers.trill) === true)
    if (hasTrill) {
      if (runStart === null) runStart = bi
    } else {
      flushRun(bi - 1)
    }
  }
  flushRun(measure.beats.length - 1)
}

// Like runHasOverlap but excludes trill itself (used to decide if trill needs elevation)
function runHasOverlapWithoutTrill(measure: Measure, startBi: number, endBi: number): boolean {
  for (let bi = startBi; bi <= endBi; bi++) {
    const beat = measure.beats[bi]
    if (beat.notes.some((n) => n.modifiers.tapping || n.modifiers.vibrato || n.modifiers.bend) || beat.pickStroke || beat.tremoloMarks) return true
  }
  return false
}
