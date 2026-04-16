import type { DurationValue, Measure, TabCursor, TabTrack } from '../../tabEditorTypes'
import { BEAT_WIDTHS } from '../../tabEditorState'

// ── Staff notation constants ─────────────────────────────────────────────────

const CHROMATIC_TO_DIA = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const STEP = 5 // px per diatonic step
const E4Y = 110 // y position of E4 (bottom staff line reference)
const STAFF_TOP_Y = E4Y - 4 * 2 * STEP
const STAFF_BOT_Y = E4Y
const STAFF_LINES_Y = [E4Y, E4Y - 2 * STEP, E4Y - 4 * STEP, E4Y - 6 * STEP, E4Y - 8 * STEP]
const STEM_LEN = 30
const MEASURE_LABEL_W = 24
const CLEF_W = 30
const TIME_SIG_W = 20
const SVG_H = 200

type StemDir = 'up' | 'down'

interface NoteRender {
  x: number
  y: number
  midi: number
  dir: StemDir
  tipY: number
  beatIndex: number
  measureIndex: number
  stringIndex: number
  isBeamable: boolean
}

interface BeatRenderInfo {
  x: number
  width: number
  duration: DurationValue
  notes: NoteRender[]
  isRest: boolean
  isBeamable: boolean
  measureIndex: number
  beatIndex: number
}

// ── Staff helpers ─────────────────────────────────────────────────────────────

function midiToDia(midi: number): number {
  return Math.floor(midi / 12) * 7 + CHROMATIC_TO_DIA[midi % 12]
}

function midiToStaffY(midi: number): number {
  const display = midi + 12
  const dia = midiToDia(display)
  const e4Dia = midiToDia(64) // E4
  return E4Y - (dia - e4Dia) * STEP
}

function needsLedgerLines(y: number): number[] {
  const lines: number[] = []
  for (let ly = E4Y + 2 * STEP; ly <= y + 1; ly += 2 * STEP) lines.push(ly)
  for (let ly = STAFF_TOP_Y - 2 * STEP; ly >= y - 1; ly -= 2 * STEP) lines.push(ly)
  return lines
}

function getAccidental(midi: number): string {
  const pc = (midi + 12) % 12
  if ([1, 3, 6, 8, 10].includes(pc)) return '♯'
  return ''
}

function stemDir(noteY: number): StemDir {
  const midY = E4Y - 4 * STEP // B4 = middle line
  return noteY > midY ? 'up' : 'down'
}

function stemTipY(noteY: number, dir: StemDir): number {
  return dir === 'up' ? noteY - STEM_LEN : noteY + STEM_LEN
}

function isInBeamGroup(nr: NoteRender, groups: NoteRender[][]): boolean {
  return groups.some((g) => g.includes(nr))
}

// ── Rest symbols ─────────────────────────────────────────────────────────────

function RestSymbol({ x, duration }: { x: number; duration: DurationValue }) {
  const midY = E4Y - 4 * STEP // B4
  switch (duration) {
    case 'whole':
      return <rect x={x - 8} y={midY - 10} width={16} height={5} fill="#888" />
    case 'half':
      return <rect x={x - 8} y={midY - 5} width={16} height={5} fill="#888" />
    case 'quarter':
      return (
        <path
          d={`M ${x} ${midY - 14} L ${x + 5} ${midY - 8} L ${x - 3} ${midY - 4} L ${x + 4} ${midY + 2} L ${x} ${midY + 8}`}
          stroke="#888"
          strokeWidth={2}
          fill="none"
        />
      )
    case 'eighth':
      return (
        <g>
          <circle cx={x} cy={midY + 4} r={3} fill="#888" />
          <line x1={x + 3} y1={midY + 4} x2={x + 3} y2={midY - 8} stroke="#888" strokeWidth={1.5} />
          <path
            d={`M ${x + 3} ${midY - 8} Q ${x + 12} ${midY - 4} ${x + 8} ${midY + 2}`}
            stroke="#888"
            strokeWidth={1.5}
            fill="none"
          />
        </g>
      )
    default:
      return (
        <text x={x} y={midY} fontSize={12} fill="#888" textAnchor="middle">
          𝄾
        </text>
      )
  }
}

// ── StaffViewSvg ─────────────────────────────────────────────────────────────

export interface StaffViewSvgProps {
  rows: Measure[][]
  globalMeasureMap: Map<string, number>
  track: TabTrack
  cursor: TabCursor
  playheadMeasure: number
  playheadBeat: number
}

export function StaffViewSvg({
  rows,
  globalMeasureMap,
  track,
  cursor,
  playheadMeasure,
  playheadBeat,
}: StaffViewSvgProps) {
  return (
    <div className="tab-staff-view">
      {rows.map((rowMeasures, rowIdx) => {
        const totalBeatsW = rowMeasures.reduce(
          (s, m) => s + m.beats.reduce((sb, b) => sb + BEAT_WIDTHS[b.duration], 0),
          0,
        )
        const svgW =
          CLEF_W + TIME_SIG_W + totalBeatsW + rowMeasures.length * MEASURE_LABEL_W + 16

        const beatInfos: BeatRenderInfo[] = []
        let xCursor = CLEF_W + TIME_SIG_W

        for (const measure of rowMeasures) {
          const mi = globalMeasureMap.get(measure.id) ?? 0
          xCursor += MEASURE_LABEL_W

          for (let bi = 0; bi < measure.beats.length; bi++) {
            const beat = measure.beats[bi]
            const bw = BEAT_WIDTHS[beat.duration]
            const xMid = xCursor + bw / 2
            const isBeamable = ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'].includes(
              beat.duration,
            )

            const noteRenders: NoteRender[] = []
            for (let si = 0; si < beat.notes.length; si++) {
              const note = beat.notes[si]
              if (note.fret < 0) continue
              const openMidi = track.openMidi[si]
              if (openMidi === undefined) continue
              const midi = openMidi + note.fret
              const y = midiToStaffY(midi)
              const dir = stemDir(y)
              noteRenders.push({
                x: xMid,
                y,
                midi,
                dir,
                tipY: stemTipY(y, dir),
                beatIndex: bi,
                measureIndex: mi,
                stringIndex: si,
                isBeamable,
              })
            }

            beatInfos.push({
              x: xMid,
              width: bw,
              duration: beat.duration,
              notes: noteRenders,
              isRest: noteRenders.length === 0,
              isBeamable,
              measureIndex: mi,
              beatIndex: bi,
            })

            xCursor += bw
          }
        }

        // Compute beam groups
        const beamGroups: NoteRender[][] = []
        let curGroup: NoteRender[] = []
        for (const bi of beatInfos) {
          if (bi.isBeamable && bi.notes.length > 0) {
            curGroup.push(...bi.notes)
          } else {
            if (curGroup.length >= 2) beamGroups.push(curGroup)
            curGroup = []
          }
        }
        if (curGroup.length >= 2) beamGroups.push(curGroup)

        return (
          <svg
            key={rowIdx}
            className="tab-staff-row-svg"
            width={svgW}
            height={SVG_H}
            viewBox={`0 0 ${svgW} ${SVG_H}`}
            style={{ marginBottom: 24, display: 'block' }}
          >
            {/* Staff lines */}
            {STAFF_LINES_Y.map((ly, i) => (
              <line key={i} x1={0} y1={ly} x2={svgW} y2={ly} stroke="#3a3a3a" strokeWidth={1} />
            ))}

            {/* Treble clef */}
            <text
              x={4}
              y={E4Y + 10}
              fontSize={60}
              fill="#555"
              fontFamily="serif"
              dominantBaseline="auto"
            >
              𝄞
            </text>

            {/* Time signature */}
            <text
              x={CLEF_W + 2}
              y={E4Y - 8 * STEP + 4}
              fontSize={14}
              fill="#888"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {track.globalTimeSig.numerator}
            </text>
            <text
              x={CLEF_W + 2}
              y={E4Y - 4 * STEP + 4}
              fontSize={14}
              fill="#888"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {track.globalTimeSig.denominator}
            </text>

            {/* Measure barlines */}
            {(() => {
              let xBar = CLEF_W + TIME_SIG_W
              return rowMeasures.map((m, i) => {
                const mi = globalMeasureMap.get(m.id) ?? 0
                xBar += MEASURE_LABEL_W
                const xMeasureStart = xBar
                const mw = m.beats.reduce((s, b) => s + BEAT_WIDTHS[b.duration], 0)
                xBar += mw
                return (
                  <g key={i}>
                    <text
                      x={xMeasureStart - MEASURE_LABEL_W / 2}
                      y={STAFF_TOP_Y - 6}
                      fontSize={10}
                      fill="#555"
                      textAnchor="middle"
                    >
                      {mi + 1}
                    </text>
                    <line
                      x1={xBar}
                      y1={STAFF_TOP_Y}
                      x2={xBar}
                      y2={STAFF_BOT_Y}
                      stroke="#555"
                      strokeWidth={1}
                    />
                  </g>
                )
              })
            })()}

            {/* Notes */}
            {beatInfos.map((bi, bIdx) => {
              const isCursor =
                cursor.measureIndex === bi.measureIndex && cursor.beatIndex === bi.beatIndex
              const isPlayhead =
                playheadMeasure === bi.measureIndex && playheadBeat === bi.beatIndex

              if (bi.isRest) {
                return <RestSymbol key={bIdx} x={bi.x} duration={bi.duration} />
              }

              return (
                <g key={bIdx}>
                  {(isCursor || isPlayhead) && (
                    <rect
                      x={bi.x - bi.width / 2}
                      y={STAFF_TOP_Y - 4}
                      width={bi.width}
                      height={STAFF_BOT_Y - STAFF_TOP_Y + 8}
                      fill={isPlayhead ? 'rgba(30,100,50,0.25)' : 'rgba(42,90,180,0.2)'}
                      rx={2}
                    />
                  )}
                  {bi.notes.map((nr, ni) => {
                    const ledgers = needsLedgerLines(nr.y)
                    const acc = getAccidental(nr.midi)
                    const isWhole = bi.duration === 'whole'
                    const isHalf = bi.duration === 'half'
                    return (
                      <g key={ni}>
                        {ledgers.map((ly, li) => (
                          <line
                            key={li}
                            x1={nr.x - 10}
                            y1={ly}
                            x2={nr.x + 10}
                            y2={ly}
                            stroke="#444"
                            strokeWidth={1}
                          />
                        ))}
                        {acc && (
                          <text x={nr.x - 10} y={nr.y + 4} fontSize={11} fill="#aaa" textAnchor="end">
                            {acc}
                          </text>
                        )}
                        {isWhole ? (
                          <ellipse
                            cx={nr.x}
                            cy={nr.y}
                            rx={6}
                            ry={4.5}
                            stroke="#e0e0e0"
                            strokeWidth={1.5}
                            fill="none"
                          />
                        ) : isHalf ? (
                          <ellipse
                            cx={nr.x}
                            cy={nr.y}
                            rx={5.5}
                            ry={4}
                            stroke="#e0e0e0"
                            strokeWidth={1.5}
                            fill="none"
                            transform={`rotate(-15,${nr.x},${nr.y})`}
                          />
                        ) : (
                          <ellipse
                            cx={nr.x}
                            cy={nr.y}
                            rx={5.5}
                            ry={4}
                            fill="#e0e0e0"
                            transform={`rotate(-15,${nr.x},${nr.y})`}
                          />
                        )}
                        {!isWhole && (
                          <line
                            x1={nr.dir === 'up' ? nr.x + 5 : nr.x - 5}
                            y1={nr.y}
                            x2={nr.dir === 'up' ? nr.x + 5 : nr.x - 5}
                            y2={nr.tipY}
                            stroke="#e0e0e0"
                            strokeWidth={1.5}
                          />
                        )}
                        {bi.duration === 'eighth' && !isInBeamGroup(nr, beamGroups) && (
                          <path
                            d={
                              nr.dir === 'up'
                                ? `M ${nr.x + 5} ${nr.tipY} Q ${nr.x + 18} ${nr.tipY + 10} ${nr.x + 12} ${nr.tipY + 20}`
                                : `M ${nr.x - 5} ${nr.tipY} Q ${nr.x - 18} ${nr.tipY - 10} ${nr.x - 12} ${nr.tipY - 20}`
                            }
                            stroke="#e0e0e0"
                            strokeWidth={1.5}
                            fill="none"
                          />
                        )}
                        {bi.duration === 'sixteenth' && !isInBeamGroup(nr, beamGroups) && (
                          <>
                            <path
                              d={
                                nr.dir === 'up'
                                  ? `M ${nr.x + 5} ${nr.tipY} Q ${nr.x + 18} ${nr.tipY + 10} ${nr.x + 12} ${nr.tipY + 20}`
                                  : `M ${nr.x - 5} ${nr.tipY} Q ${nr.x - 18} ${nr.tipY - 10} ${nr.x - 12} ${nr.tipY - 20}`
                              }
                              stroke="#e0e0e0"
                              strokeWidth={1.5}
                              fill="none"
                            />
                            <path
                              d={
                                nr.dir === 'up'
                                  ? `M ${nr.x + 5} ${nr.tipY + 8} Q ${nr.x + 18} ${nr.tipY + 18} ${nr.x + 12} ${nr.tipY + 28}`
                                  : `M ${nr.x - 5} ${nr.tipY - 8} Q ${nr.x - 18} ${nr.tipY - 18} ${nr.x - 12} ${nr.tipY - 28}`
                              }
                              stroke="#e0e0e0"
                              strokeWidth={1.5}
                              fill="none"
                            />
                          </>
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* Beams */}
            {beamGroups.map((group, gi) => {
              const first = group[0]
              const last = group[group.length - 1]
              if (!first || !last) return null
              const dir = first.dir
              const stemX = (nr: NoteRender) => (nr.dir === 'up' ? nr.x + 5 : nr.x - 5)
              return (
                <g key={gi}>
                  <line
                    x1={stemX(first)}
                    y1={first.tipY}
                    x2={stemX(last)}
                    y2={last.tipY}
                    stroke="#e0e0e0"
                    strokeWidth={4}
                  />
                  {group.some((nr) =>
                    beatInfos.find(
                      (bi) =>
                        bi.notes.includes(nr) &&
                        ['sixteenth', 'thirtysecond', 'sixtyfourth'].includes(bi.duration),
                    ),
                  ) && (
                    <line
                      x1={stemX(first)}
                      y1={first.tipY + (dir === 'up' ? 6 : -6)}
                      x2={stemX(last)}
                      y2={last.tipY + (dir === 'up' ? 6 : -6)}
                      stroke="#e0e0e0"
                      strokeWidth={4}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        )
      })}
    </div>
  )
}
