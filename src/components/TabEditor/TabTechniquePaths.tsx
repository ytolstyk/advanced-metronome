import type { Beat, Measure, TabTrack } from '../../tabEditorTypes'
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
  forPrint?: boolean
  prevMeasureLastBeat?: import('../../tabEditorTypes').Beat
}

export function TechniqueOverlay({ measure, measureIndex, track, beatPositions, onBendAmountClick, forPrint = false, prevMeasureLastBeat }: TechniqueOverlayProps) {
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

    const { cx } = pos

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

      // Bend — quarter-circle quadratic bezier: horizontal tangent at note, vertical at top
      if (note.modifiers.bend) {
        const amount = note.bendAmount ?? 1
        const label = formatBendAmount(amount)
        const startX = cx + 6
        const endX = cx + 24
        const bendColor = forPrint ? '#000000' : '#ffaadd'
        elements.push(
          <g key={`bend-${key}`}>
            <path
              d={`M ${startX},${sy - 6} Q ${endX},${sy - 6} ${endX},${BEND_TOP_Y}`}
              stroke={bendColor}
              strokeWidth={1.5}
              fill="none"
            />
            <polygon
              points={`${endX - 3},${BEND_TOP_Y + 5} ${endX},${BEND_TOP_Y} ${endX + 3},${BEND_TOP_Y + 5}`}
              fill={bendColor}
            />
            <g
              className={!forPrint && onBendAmountClick ? 'tab-svg-interactive' : undefined}
              style={{ cursor: onBendAmountClick ? 'pointer' : 'default' }}
              onClick={onBendAmountClick ? () => onBendAmountClick(measureIndex, bi, note.string) : undefined}
            >
              {!forPrint && onBendAmountClick && (
                <rect className="tab-hover-bg" x={endX + 2} y={BEND_TOP_Y - 9} width={22} height={12} rx={2} />
              )}
              <text
                x={endX + 4}
                y={BEND_TOP_Y - 1}
                fontSize={BEND_LABEL_FONT_SIZE}
                fontWeight="bold"
                textAnchor="start"
                dominantBaseline="auto"
                fill={bendColor}
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
            </g>
          </g>,
        )
      }

      // Pick direction
      if (note.modifiers.pickDown) {
        elements.push(
          <text
            key={`pd-${key}`}
            x={cx}
            y={techY}
            fontSize={PICK_DIR_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={forPrint ? '#000000' : '#cccccc'}
          >
            ⬇
          </text>,
        )
      }
      if (note.modifiers.pickUp) {
        elements.push(
          <text
            key={`pu-${key}`}
            x={cx}
            y={techY}
            fontSize={PICK_DIR_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={forPrint ? '#000000' : '#cccccc'}
          >
            ⬆
          </text>,
        )
      }
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
    if (beat.notes.some((n) => n.modifiers.tapping || n.modifiers.vibrato || n.modifiers.pickDown || n.modifiers.pickUp || n.modifiers.bend || n.modifiers.trill)) return true
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
    if (beat.notes.some((n) => n.modifiers.tapping || n.modifiers.vibrato || n.modifiers.pickDown || n.modifiers.pickUp || n.modifiers.bend)) return true
  }
  return false
}
