import type { TabTrack } from '../tabEditorTypes'
import type { TrackPiece } from '../audio/ClickTrackEngine'

const PALETTE = [
  '#8b5cf6', '#38bdf8', '#34d399', '#fbbf24',
  '#fb7185', '#fb923c', '#2dd4bf', '#94a3b8',
]

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function tabTrackToClickTrackPieces(track: TabTrack): TrackPiece[] {
  const count = Math.min(track.masterBars.length, track.measures.length)
  if (count === 0) return []

  let effectiveBpm = track.masterBars[0]!.bpm ?? 120
  const perMeasure = track.masterBars.slice(0, count).map((mb) => {
    if (mb.bpm !== undefined) effectiveBpm = mb.bpm
    return {
      bpm: effectiveBpm,
      numerator: mb.timeSignature.numerator,
      denominator: mb.timeSignature.denominator,
    }
  })

  const pieces: TrackPiece[] = []
  let i = 0
  let colorIdx = 0

  while (i < perMeasure.length) {
    const base = perMeasure[i]!
    let groupCount = 1
    while (
      i + groupCount < perMeasure.length &&
      perMeasure[i + groupCount]!.bpm === base.bpm &&
      perMeasure[i + groupCount]!.numerator === base.numerator &&
      perMeasure[i + groupCount]!.denominator === base.denominator
    ) {
      groupCount++
    }
    pieces.push({
      id: uid(),
      label: `${base.numerator}/${base.denominator} ♩=${base.bpm}`,
      color: PALETTE[colorIdx % PALETTE.length]!,
      groupId: null,
      timeSignature: { numerator: base.numerator, denominator: base.denominator },
      subdivision: 'quarter',
      bpm: base.bpm,
      repeats: groupCount,
    })
    i += groupCount
    colorIdx++
  }

  return pieces
}
