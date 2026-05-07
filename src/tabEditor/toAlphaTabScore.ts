import * as at from '@coderline/alphatab'
import type { TabTrack } from '../tabEditorTypes'

export function toAlphaTabScore(track: TabTrack): at.model.Score {
  const score = new at.model.Score()
  score.title = track.title
  score.artist = track.artist ?? ''

  // MasterBars — one per measure
  for (const mb of track.masterBars) {
    const masterBar = new at.model.MasterBar()
    masterBar.timeSignatureNumerator = mb.timeSignature.numerator
    masterBar.timeSignatureDenominator = mb.timeSignature.denominator
    if (mb.bpm !== undefined) {
      const tempo = new at.model.Automation()
      tempo.type = at.model.AutomationType.Tempo
      tempo.value = mb.bpm
      tempo.isLinear = false
      masterBar.tempoAutomations.push(tempo)
    }
    score.masterBars.push(masterBar)
  }

  // Track + Staff + Bars
  const atTrack = new at.model.Track()
  atTrack.name = track.title

  const staff = atTrack.staves[0]!
  // openMidi is high→low, same order as alphaTab's stringTuning (top string first)
  staff.stringTuning = new at.model.Tuning(track.tuningName, track.openMidi.slice(), false)

  for (const measure of track.measures) {
    const bar = new at.model.Bar()
    const voice = new at.model.Voice()

    for (const beat of measure.beats) {
      const atBeat = new at.model.Beat()
      atBeat.duration = beat.duration as at.model.Duration

      for (const note of beat.notes) {
        const atNote = new at.model.Note()
        atNote.string = note.string
        atNote.fret = note.fret
        if (note.modifiers.hammerOn) atNote.isHammerPullOrigin = true
        if (note.modifiers.vibrato) atNote.vibrato = at.model.VibratoType.Slight
        if (note.modifiers.palmMute) atNote.isPalmMute = true
        if (note.modifiers.letRing) atNote.isLetRing = true
        if (note.modifiers.dead) atNote.isDead = true
        if (note.modifiers.naturalHarmonic) atNote.harmonicType = at.model.HarmonicType.Natural
        if (note.modifiers.ghost) atNote.isGhost = true
        atBeat.notes.push(atNote)
      }
      voice.beats.push(atBeat)
    }

    bar.voices.push(voice)
    staff.bars.push(bar)
  }

  score.tracks.push(atTrack)
  return score
}
