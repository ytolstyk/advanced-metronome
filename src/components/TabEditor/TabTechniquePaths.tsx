import type { Beat, Measure, TabTrack } from '../../tabEditorTypes'
import {
  type BeatPosition,
  BARLINE_W,
  MEASURE_NUMBER_H,
  TAPPING_ZONE_Y,
  VIBRATO_ZONE_Y,
  PALM_MUTE_ZONE_Y,
  PALM_MUTE_ELEVATED_Y,
  LET_RING_ZONE_Y,
  LET_RING_ELEVATED_Y,
  STACCATO_ZONE_Y,
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
}

export function TechniqueOverlay({ measure, measureIndex, track, beatPositions, onBendAmountClick }: TechniqueOverlayProps) {
  const { stringCount } = track
  const elements: React.ReactNode[] = []
  const measureContentW = beatPositions.length > 0
    ? beatPositions[beatPositions.length - 1].x + beatPositions[beatPositions.length - 1].w
    : 0
  const measureRightEdge = measureContentW + BARLINE_W

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const pos = beatPositions[bi]
    if (!pos) continue

    const { cx } = pos

    // Detect if any string in this beat has a bend (affects technique zone Y positions)
    const hasBend = beat.notes.some((n) => n.fret >= 0 && n.modifiers.bend)
    const techY = hasBend ? BEND_ELEVATED_Y : TAPPING_ZONE_Y

    // Tapping: render one "T" per beat column if any string has tapping
    const hasTapping = beat.notes.some((n) => n.fret >= 0 && n.modifiers.tapping)
    if (hasTapping) {
      elements.push(
        <text
          key={`tap-${bi}`}
          x={cx}
          y={techY}
          fontSize={10}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffdd88"
        >
          T
        </text>,
      )
    }

    // Staccato: one dot per beat column if any note has staccato
    const hasStaccato = beat.notes.some((n) => n.fret >= 0 && n.modifiers.staccato)
    if (hasStaccato) {
      elements.push(
        <circle
          key={`stac-${bi}`}
          cx={cx}
          cy={STACCATO_ZONE_Y}
          r={3}
          fill="#e8e8e8"
        />,
      )
    }

    // Vibrato rendered after main loop as runs (see renderVibratoRuns below)

    for (let si = 0; si < beat.notes.length; si++) {
      const note = beat.notes[si]
      if (!note || note.fret < 0) continue

      const sy = stringY(si, stringCount)
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
            stroke="#88ffaa"
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
            stroke="#88ffaa"
            strokeWidth={1.5}
            fill="none"
          />,
        )
      }

      // Legato slide
      if (note.modifiers.legatoSlide) {
        const nextPos = beatPositions[bi + 1]
        const nextNote = measure.beats[bi + 1]?.notes[si]
        if (nextPos && nextNote && nextNote.fret >= 0) {
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
              stroke="#aaddff"
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
            stroke="#aaddff"
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
            stroke="#aaddff"
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
            stroke="#aaddff"
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
            stroke="#aaddff"
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
        elements.push(
          <g key={`bend-${key}`}>
            <path
              d={`M ${startX},${sy - 6} Q ${endX},${sy - 6} ${endX},${BEND_TOP_Y}`}
              stroke="#ffaadd"
              strokeWidth={1.5}
              fill="none"
            />
            <polygon
              points={`${endX - 3},${BEND_TOP_Y + 5} ${endX},${BEND_TOP_Y} ${endX + 3},${BEND_TOP_Y + 5}`}
              fill="#ffaadd"
            />
            <text
              x={endX + 4}
              y={BEND_TOP_Y - 1}
              fontSize={9}
              fontWeight="bold"
              textAnchor="start"
              dominantBaseline="auto"
              fill="#ffaadd"
              style={{ cursor: 'pointer' }}
              onClick={onBendAmountClick ? () => onBendAmountClick(measureIndex, bi, si) : undefined}
            >
              {label}
            </text>
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
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#cccccc"
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
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#cccccc"
          >
            ⬆
          </text>,
        )
      }
    }
  }

  // Vibrato and palm mute: rendered as runs so the whole connected segment shares one Y level
  renderVibratoRuns(measure, beatPositions, elements)
  renderPalmMuteRuns(measure, beatPositions, elements)
  renderLetRingRuns(measure, beatPositions, elements)

  return <g>{elements}</g>
}

function computeNoteSlotW(beat: Beat): number {
  return beat.notes.reduce((max, n) => {
    if (!n || n.fret < 0) return max
    let label: string
    if (beat.tiedFrom) label = `(${n.fret})`
    else if (n.modifiers.dead) label = 'X'
    else if (n.modifiers.naturalHarmonic) label = `<${n.fret}>`
    else if (n.modifiers.ghost) label = `(${n.fret})`
    else label = String(n.fret)
    return Math.max(max, Math.max(label.length * 8 + 4, 18))
  }, 18)
}

function renderVibratoRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
) {
  const PAD = 4
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.fret >= 0 && n.modifiers.bend))
    const vy = hasBendInRun ? BEND_ELEVATED_Y : VIBRATO_ZONE_Y

    for (let bi = runStart; bi <= endBi; bi++) {
      const beat = measure.beats[bi]
      const pos = beatPositions[bi]
      if (!pos) continue
      const { cx } = pos
      const slotW = computeNoteSlotW(beat)
      const prevPos = beatPositions[bi - 1]
      const nextPos = beatPositions[bi + 1]
      const isFirst = bi === runStart
      const isLast = bi === endBi
      const x0 = !isFirst && prevPos ? (prevPos.cx + cx) / 2 : cx - slotW / 2 + PAD
      const x1 = !isLast && nextPos ? (cx + nextPos.cx) / 2 : cx + slotW / 2 + PAD
      const totalW = x1 - x0
      const step = totalW / 4
      elements.push(
        <path
          key={`vib-${bi}`}
          d={`M ${x0},${vy} Q ${x0 + step / 2},${vy - 5} ${x0 + step},${vy} Q ${x0 + step * 1.5},${vy + 5} ${x0 + step * 2},${vy} Q ${x0 + step * 2.5},${vy - 5} ${x0 + step * 3},${vy} Q ${x0 + step * 3.5},${vy + 5} ${x0 + step * 4},${vy}`}
          stroke="#ddaaff"
          strokeWidth={1.5}
          fill="none"
        />,
      )
    }
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const hasVibrato = beat.notes.some((n) => n.fret >= 0 && n.modifiers.vibrato)
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
    if (beat.notes.some((n) => n.fret >= 0 && (n.modifiers.tapping || n.modifiers.vibrato || n.modifiers.pickDown || n.modifiers.pickUp || n.modifiers.bend))) return true
  }
  return false
}

function renderPalmMuteRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
) {
  const PAD = 4
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.fret >= 0 && n.modifiers.bend))
    const baseTopY = runHasOverlap(measure, runStart, endBi) ? PALM_MUTE_ELEVATED_Y : PALM_MUTE_ZONE_Y
    const topY = hasBendInRun ? BEND_ELEVATED_Y - 4 : baseTopY
    const startSlotW = computeNoteSlotW(measure.beats[runStart])
    const endSlotW = computeNoteSlotW(measure.beats[endBi])
    const x1 = startPos.cx - startSlotW / 2 + PAD
    const x2 = endPos.cx + endSlotW / 2 - PAD
    elements.push(
      <g key={`pm-${runStart}-${endBi}`}>
        <line
          x1={x1}
          y1={topY}
          x2={x2}
          y2={topY}
          stroke="#ffaa44"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <text x={x1} y={topY - 2} fontSize={8} fill="#ffaa44" dominantBaseline="auto">
          P.M.
        </text>
      </g>,
    )
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const hasPM = beat.notes.some((n) => n.fret >= 0 && n.modifiers.palmMute)
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
) {
  const PAD = 4
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const hasBendInRun = measure.beats.slice(runStart, endBi + 1).some((b) => b.notes.some((n) => n.fret >= 0 && n.modifiers.bend))
    const baseTopY = runHasOverlap(measure, runStart, endBi) ? LET_RING_ELEVATED_Y : LET_RING_ZONE_Y
    const topY = hasBendInRun ? BEND_ELEVATED_Y - 4 : baseTopY
    const startSlotW = computeNoteSlotW(measure.beats[runStart])
    const endSlotW = computeNoteSlotW(measure.beats[endBi])
    const x1 = startPos.cx - startSlotW / 2 + PAD
    const x2 = endPos.cx + endSlotW / 2 - PAD
    elements.push(
      <g key={`lr-${runStart}-${endBi}`}>
        <line
          x1={x1}
          y1={topY}
          x2={x2}
          y2={topY}
          stroke="#88ddff"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <text x={x1} y={topY - 2} fontSize={8} fill="#88ddff" dominantBaseline="auto">
          ring
        </text>
      </g>,
    )
    runStart = null
  }

  for (let bi = 0; bi < measure.beats.length; bi++) {
    const beat = measure.beats[bi]
    const hasLR = beat.notes.some((n) => n.fret >= 0 && n.modifiers.letRing)
    if (hasLR) {
      if (runStart === null) runStart = bi
    } else {
      flushRun(bi - 1)
    }
  }
  flushRun(measure.beats.length - 1)
}
