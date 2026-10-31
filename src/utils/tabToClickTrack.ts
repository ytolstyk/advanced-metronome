import type { TabTrack } from '../tabEditorTypes'
import type { TrackPiece } from '../audio/ClickTrackEngine'
import { CLICK_RUN_PALETTE, groupBarRuns, newPieceId } from './barRuns'

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

  return groupBarRuns(perMeasure).map((run, i) => ({
    id: newPieceId(),
    label: `${run.first.numerator}/${run.first.denominator} ♩=${run.first.bpm}`,
    color: CLICK_RUN_PALETTE[i % CLICK_RUN_PALETTE.length]!,
    groupId: null,
    timeSignature: { numerator: run.first.numerator, denominator: run.first.denominator },
    subdivision: 'quarter' as const,
    bpm: run.first.bpm,
    repeats: run.repeats,
  }))
}
