import type { Measure, TabTrack } from '../../tabEditorTypes'
import {
  type BeatPosition,
  BARLINE_W,
  TAPPING_ZONE_Y,
  VIBRATO_ZONE_Y,
  PALM_MUTE_ZONE_Y,
  stringY,
} from './tabSvgConstants'

interface TechniqueOverlayProps {
  measure: Measure
  track: TabTrack
  beatPositions: BeatPosition[]
}

export function TechniqueOverlay({ measure, track, beatPositions }: TechniqueOverlayProps) {
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

    // Tapping: render one "T" per beat column if any string has tapping
    const hasTapping = beat.notes.some((n) => n.fret >= 0 && n.modifiers.tapping)
    if (hasTapping) {
      elements.push(
        <text
          key={`tap-${bi}`}
          x={cx}
          y={TAPPING_ZONE_Y}
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

    // Vibrato: render one sine-wave per beat column if any string has vibrato
    const hasVibrato = beat.notes.some((n) => n.fret >= 0 && n.modifiers.vibrato)
    if (hasVibrato) {
      const PAD = 4
      const prevHasVibrato = bi > 0 && measure.beats[bi - 1].notes.some((n) => n.fret >= 0 && n.modifiers.vibrato)
      const nextHasVibrato = bi < measure.beats.length - 1 && measure.beats[bi + 1].notes.some((n) => n.fret >= 0 && n.modifiers.vibrato)
      const x0 = cx - pos.w / 2 + (prevHasVibrato ? 0 : PAD)
      const x1 = cx + pos.w / 2 - (nextHasVibrato ? 0 : PAD)
      const totalW = x1 - x0
      const step = totalW / 4
      const vy = VIBRATO_ZONE_Y
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
          const dx = nextPos.cx - 4
          const dy = nextNote.fret > note.fret ? sy - 6 : nextNote.fret < note.fret ? sy + 6 : sy
          elements.push(
            <line
              key={`ls-${key}`}
              x1={cx + 4}
              y1={sy}
              x2={dx}
              y2={dy}
              stroke="#aaddff"
              strokeWidth={1.5}
            />,
          )
        }
      }

      // Shift slide (with arrowhead)
      if (note.modifiers.shiftSlide) {
        const nextPos = beatPositions[bi + 1]
        const nextNote = measure.beats[bi + 1]?.notes[si]
        if (nextPos && nextNote && nextNote.fret >= 0) {
          const dx = nextPos.cx - 4
          const ascending = nextNote.fret >= note.fret
          const dy = ascending ? sy - 6 : sy + 6
          elements.push(
            <g key={`ss-${key}`}>
              <line x1={cx + 4} y1={sy - 3} x2={dx} y2={dy} stroke="#ffcc88" strokeWidth={1.5} />
              <polygon
                points={`${dx - 6},${dy - 4} ${dx},${dy} ${dx - 6},${dy + 4}`}
                fill="#ffcc88"
              />
            </g>,
          )
        }
      }

      // Slide in from below
      if (note.modifiers.slideInBelow) {
        elements.push(
          <line
            key={`sib-${key}`}
            x1={cx - 10}
            y1={sy + 6}
            x2={cx - 2}
            y2={sy - 2}
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
            x1={cx - 10}
            y1={sy - 6}
            x2={cx - 2}
            y2={sy + 2}
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
            x1={cx + 4}
            y1={sy - 2}
            x2={cx + 12}
            y2={sy + 6}
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
            x1={cx + 4}
            y1={sy + 2}
            x2={cx + 12}
            y2={sy - 6}
            stroke="#aaddff"
            strokeWidth={1.5}
          />,
        )
      }

      // Bend — cubic bezier upward with arrowhead
      if (note.modifiers.bend) {
        const topY = sy - 30
        elements.push(
          <g key={`bend-${key}`}>
            <path
              d={`M ${cx},${sy - 4} C ${cx},${sy - 24} ${cx + 4},${sy - 28} ${cx},${topY}`}
              stroke="#ffaadd"
              strokeWidth={1.5}
              fill="none"
            />
            <polygon points={`${cx - 3},${topY + 4} ${cx},${topY} ${cx + 3},${topY + 4}`} fill="#ffaadd" />
          </g>,
        )
      }

      // Trill
      if (note.modifiers.trill) {
        elements.push(
          <text key={`tr-${key}`} x={cx} y={sy - 14} fontSize={9} textAnchor="middle" fill="#aaddff">
            tr~
          </text>,
        )
      }

      // Pick direction
      if (note.modifiers.pickDown) {
        elements.push(
          <text
            key={`pd-${key}`}
            x={cx}
            y={TAPPING_ZONE_Y}
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
            y={TAPPING_ZONE_Y}
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

  // Palm mute: collect consecutive beats with palmMute on any string, render dashed line at top
  renderPalmMuteRuns(measure, beatPositions, elements)

  return <g>{elements}</g>
}

function renderPalmMuteRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  elements: React.ReactNode[],
) {
  const topY = PALM_MUTE_ZONE_Y

  const PAD = 4
  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const x1 = startPos.x + PAD
    const x2 = endPos.x + endPos.w - PAD
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
        <text x={x1 + 2} y={topY - 2} fontSize={8} fill="#ffaa44" dominantBaseline="auto">
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
