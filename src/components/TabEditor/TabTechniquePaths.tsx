import type { Measure, TabTrack } from '../../tabEditorTypes'
import { type BeatPosition, BARLINE_W, stringY, TECHNIQUE_ZONE_H } from './tabSvgConstants'

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

    // Palm mute runs — collected per string, rendered below last string
    // (handled separately below)

    for (let si = 0; si < beat.notes.length; si++) {
      const note = beat.notes[si]
      if (!note || note.fret < 0) continue

      const sy = stringY(si, stringCount)
      const cx = pos.cx
      const key = `${bi}-${si}`

      // Hammer-on arc
      if (note.modifiers.hammerOn) {
        const nextPos = beatPositions[bi + 1]
        const dx = nextPos ? nextPos.cx : measureRightEdge + 4
        const mx = (cx + dx) / 2
        elements.push(
          <g key={`h-${key}`}>
            <path
              d={`M ${cx},${sy - 4} Q ${mx},${sy - 16} ${dx},${sy - 4}`}
              stroke="#88ffaa"
              strokeWidth={1.5}
              fill="none"
            />
            <text x={mx} y={sy - 18} fontSize={9} textAnchor="middle" fill="#88ffaa">
              h
            </text>
          </g>,
        )
      }

      // Pull-off arc
      if (note.modifiers.pullOff) {
        const nextPos = beatPositions[bi + 1]
        const dx = nextPos ? nextPos.cx : measureRightEdge + 4
        const mx = (cx + dx) / 2
        elements.push(
          <g key={`p-${key}`}>
            <path
              d={`M ${cx},${sy - 4} Q ${mx},${sy - 16} ${dx},${sy - 4}`}
              stroke="#88ffaa"
              strokeWidth={1.5}
              fill="none"
            />
            <text x={mx} y={sy - 18} fontSize={9} textAnchor="middle" fill="#88ffaa">
              p
            </text>
          </g>,
        )
      }

      // Legato slide
      if (note.modifiers.legatoSlide) {
        const nextPos = beatPositions[bi + 1]
        const dx = nextPos ? nextPos.cx - 4 : measureRightEdge + 4
        const nextNote = nextPos ? measure.beats[bi + 1]?.notes[si] : null
        const dy =
          nextNote && nextNote.fret >= 0 && nextNote.fret !== note.fret
            ? stringY(si, stringCount) + (nextNote.fret > note.fret ? 3 : -3)
            : sy
        elements.push(
          <line
            key={`ls-${key}`}
            x1={cx + 4}
            y1={sy - 3}
            x2={dx}
            y2={dy - 3}
            stroke="#aaddff"
            strokeWidth={1.5}
          />,
        )
      }

      // Shift slide (with arrowhead)
      if (note.modifiers.shiftSlide) {
        const nextPos = beatPositions[bi + 1]
        const dx = nextPos ? nextPos.cx - 4 : measureRightEdge + 4
        const nextNote = nextPos ? measure.beats[bi + 1]?.notes[si] : null
        const ascending = nextNote ? nextNote.fret >= note.fret : true
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

      // Vibrato — sine wave above the note
      if (note.modifiers.vibrato) {
        const vibratoY = sy - 16
        const w = pos.w
        const step = w / 4
        const x0 = cx - w / 2
        elements.push(
          <path
            key={`vib-${key}`}
            d={`M ${x0},${vibratoY} Q ${x0 + step / 2},${vibratoY - 5} ${x0 + step},${vibratoY} Q ${x0 + step * 1.5},${vibratoY + 5} ${x0 + step * 2},${vibratoY} Q ${x0 + step * 2.5},${vibratoY - 5} ${x0 + step * 3},${vibratoY} Q ${x0 + step * 3.5},${vibratoY + 5} ${x0 + step * 4},${vibratoY}`}
            stroke="#ddaaff"
            strokeWidth={1.5}
            fill="none"
          />,
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
            y={TECHNIQUE_ZONE_H / 2}
            fontSize={9}
            textAnchor="middle"
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
            y={TECHNIQUE_ZONE_H / 2}
            fontSize={9}
            textAnchor="middle"
            fill="#cccccc"
          >
            ⬆
          </text>,
        )
      }
    }
  }

  // Palm mute: collect consecutive beats with palmMute on any string, render dashed line
  renderPalmMuteRuns(measure, beatPositions, stringCount, elements)

  return <g>{elements}</g>
}

function renderPalmMuteRuns(
  measure: Measure,
  beatPositions: BeatPosition[],
  stringCount: number,
  elements: React.ReactNode[],
) {
  // Find the y position below the last (lowest) string
  const bottomY = stringY(0, stringCount) + 10

  let runStart: number | null = null

  function flushRun(endBi: number) {
    if (runStart === null) return
    const startPos = beatPositions[runStart]
    const endPos = beatPositions[endBi]
    if (!startPos || !endPos) { runStart = null; return }
    const x1 = startPos.x
    const x2 = endPos.x + endPos.w
    elements.push(
      <g key={`pm-${runStart}-${endBi}`}>
        <line
          x1={x1}
          y1={bottomY}
          x2={x2}
          y2={bottomY}
          stroke="#ffaa44"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        <text x={x1 + 2} y={bottomY + 10} fontSize={8} fill="#ffaa44">
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
