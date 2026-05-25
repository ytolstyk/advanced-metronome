import type { TrackPiece } from '../audio/ClickTrackEngine'
import type { TabTrack, MasterBar, Measure, DurationValue } from '../tabEditorTypes'
import { buildOpenMidi } from '../tabEditorState'

function makeRestBeats(numerator: number, denominator: number): Measure['beats'] {
  const duration = denominator as DurationValue
  const dot = { dotted: false, doubleDotted: false, triplet: false }
  return Array.from({ length: numerator }, () => ({
    id: crypto.randomUUID(),
    duration,
    dot,
    notes: [],
  }))
}

export function clickTrackToTabTrack(pieces: TrackPiece[]): TabTrack {
  if (pieces.length === 0) {
    return {
      schemaVersion: 4,
      title: 'From Click Track',
      masterBars: [{ timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 }],
      stringCount: 6,
      tuningName: 'Standard',
      openMidi: buildOpenMidi('Standard', 6),
      measures: [{ id: crypto.randomUUID(), beats: makeRestBeats(4, 4) }],
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
      measures.push({
        id: crypto.randomUUID(),
        beats: makeRestBeats(piece.timeSignature.numerator, piece.timeSignature.denominator),
      })
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
