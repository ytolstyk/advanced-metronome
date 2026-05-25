import type { TrackPiece } from '../audio/ClickTrackEngine'
import type { TabTrack, MasterBar, Measure } from '../tabEditorTypes'
import { buildOpenMidi } from '../tabEditorState'

export function clickTrackToTabTrack(pieces: TrackPiece[]): TabTrack {
  if (pieces.length === 0) {
    return {
      schemaVersion: 4,
      title: 'From Click Track',
      masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 }],
      stringCount: 6,
      tuningName: 'Standard',
      openMidi: buildOpenMidi('Standard', 6),
      measures: [{ id: crypto.randomUUID(), beats: [] }],
    }
  }

  const masterBars: MasterBar[] = []
  const measures: Measure[] = []
  let prevPieceBpm: number | undefined = undefined

  for (const piece of pieces) {
    for (let r = 0; r < Math.max(1, piece.repeats); r++) {
      const setBpm = r === 0 && (prevPieceBpm === undefined || piece.bpm !== prevPieceBpm)
      masterBars.push({
        timeSignature: {
          numerator: piece.timeSignature.numerator,
          denominator: piece.timeSignature.denominator,
        },
        ...(setBpm ? { bpm: piece.bpm } : {}),
      })
      measures.push({ id: crypto.randomUUID(), beats: [] })
    }
    prevPieceBpm = piece.bpm
  }

  return {
    schemaVersion: 4,
    title: 'From Click Track',
    masterBars,
    stringCount: 6,
    tuningName: 'Standard',
    openMidi: buildOpenMidi('Standard', 6),
    measures,
  }
}
