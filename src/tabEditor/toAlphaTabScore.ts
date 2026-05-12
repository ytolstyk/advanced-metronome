import * as at from '@coderline/alphatab'
import type { TabTrack, Beat } from '../tabEditorTypes'

const DYNAMIC_MAP: Record<string, at.model.DynamicValue> = {
  ppp: at.model.DynamicValue.PPP,
  pp:  at.model.DynamicValue.PP,
  p:   at.model.DynamicValue.P,
  mp:  at.model.DynamicValue.MP,
  mf:  at.model.DynamicValue.MF,
  f:   at.model.DynamicValue.F,
  ff:  at.model.DynamicValue.FF,
  fff: at.model.DynamicValue.FFF,
}

export function toAlphaTabScore(track: TabTrack): at.model.Score {
  const score = new at.model.Score()
  score.title = track.title
  score.artist = track.artist ?? ''

  // MasterBars — one per measure; use addMasterBar to set up internal linkages
  for (let mi = 0; mi < track.masterBars.length; mi++) {
    const mb = track.masterBars[mi]!
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
    // Repeat markers live on Beat in our model; map to MasterBar
    const measure = track.measures[mi]
    if (measure) {
      if (measure.beats[0]?.repeatStart) masterBar.isRepeatStart = true
      const lastBeat = measure.beats[measure.beats.length - 1]
      if (lastBeat?.repeatEnd) masterBar.repeatCount = 2
    }
    score.addMasterBar(masterBar)
  }

  // Track + Staff + Bars; use addTrack / addStaff to wire cross-references
  const atTrack = new at.model.Track()
  atTrack.name = track.title

  const staff = new at.model.Staff()
  // openMidi is low→high; AlphaTab's Tuning expects high→low (index 0 = highest string)
  staff.stringTuning = new at.model.Tuning(track.tuningName, track.openMidi.slice().reverse(), false)
  atTrack.addStaff(staff)

  // Collect all beats flat across all measures for tie/pulloff linking
  type BeatRef = { beat: at.model.Beat; srcBeat: Beat }
  const allBeatRefs: BeatRef[] = []

  for (const measure of track.measures) {
    const bar = new at.model.Bar()
    const voice = new at.model.Voice()
    bar.addVoice(voice)

    for (const beat of measure.beats) {
      const atBeat = new at.model.Beat()
      atBeat.duration = beat.duration as at.model.Duration

      // Dot modifiers
      if (beat.dot.doubleDotted) atBeat.dots = 2
      else if (beat.dot.dotted) atBeat.dots = 1

      // Triplet (3:2 tuplet)
      if (beat.dot.triplet) {
        atBeat.tupletNumerator = 3
        atBeat.tupletDenominator = 2
      }

      // Dynamics
      if (beat.dynamics) {
        const dyn = DYNAMIC_MAP[beat.dynamics]
        if (dyn !== undefined) atBeat.dynamics = dyn
      }

      // Beat-level tempo change
      if (beat.tempoChange !== undefined) {
        const tempo = new at.model.Automation()
        tempo.type = at.model.AutomationType.Tempo
        tempo.value = beat.tempoChange
        tempo.isLinear = false
        atBeat.automations.push(tempo)
      }

      // Pick stroke is beat-level
      if (beat.pickStroke === 'down') atBeat.pickStroke = at.model.PickStroke.Down
      else if (beat.pickStroke === 'up') atBeat.pickStroke = at.model.PickStroke.Up

      // Tremolo picking is beat-level.
      // AlphaTab interprets marks as: each tremolo note = beat.duration × 2^marks.
      // To get an absolute tremolo interval, marks must be relative to the beat duration:
      //   marks = log2(tremoloSpeed / beat.duration)
      if (beat.tremoloSpeed !== undefined) {
        const tremoloEffect = new at.model.TremoloPickingEffect()
        tremoloEffect.style = at.model.TremoloPickingStyle.Default
        tremoloEffect.marks = Math.max(1, Math.round(Math.log2(beat.tremoloSpeed / beat.duration)))
        atBeat.tremoloPicking = tremoloEffect
      }

      for (const note of beat.notes) {
        const atNote = new at.model.Note()
        atNote.string = note.string
        atNote.fret = note.fret

        if (note.modifiers.hammerOn) atNote.isHammerPullOrigin = true
        if (note.modifiers.vibrato === 1 || note.modifiers.vibrato === 2) atNote.vibrato = note.modifiers.vibrato
        if (note.modifiers.palmMute) atNote.isPalmMute = true
        if (note.modifiers.letRing) atNote.isLetRing = true
        if (note.modifiers.dead) atNote.isDead = true
        if (note.modifiers.harmonicType) {
          const htMap: Record<number, at.model.HarmonicType> = {
            1: at.model.HarmonicType.Natural,
            2: at.model.HarmonicType.Artificial,
            3: at.model.HarmonicType.Pinch,
            4: at.model.HarmonicType.Tap,
            5: at.model.HarmonicType.Semi,
            6: at.model.HarmonicType.Feedback,
          }
          atNote.harmonicType = htMap[note.modifiers.harmonicType] ?? at.model.HarmonicType.Natural
          if (note.modifiers.harmonicType === 2 && note.harmonicValue !== undefined) {
            atNote.harmonicValue = note.harmonicValue
          }
        }
        if (note.modifiers.ghost) atNote.isGhost = true
        if (note.modifiers.staccato) atNote.isStaccato = true
        if (note.modifiers.tapping) atNote.isLeftHandTapped = true

        // Slides
        if (note.modifiers.legatoSlide) atNote.slideOutType = at.model.SlideOutType.Legato
        if (note.modifiers.slideOutDown) atNote.slideOutType = at.model.SlideOutType.OutDown
        if (note.modifiers.slideOutUp) atNote.slideOutType = at.model.SlideOutType.OutUp
        if (note.modifiers.slideInBelow) atNote.slideInType = at.model.SlideInType.IntoFromBelow
        if (note.modifiers.slideInAbove) atNote.slideInType = at.model.SlideInType.IntoFromAbove

        // Trill: trillValue is the MIDI value of the auxiliary note
        if (note.modifiers.trill && note.trillFret !== undefined) {
          const stringOpenMidi = track.openMidi[note.string - 1]
          if (stringOpenMidi !== undefined) {
            atNote.trillValue = stringOpenMidi + note.trillFret
            atNote.trillSpeed = (note.trillSpeed ?? 16) as at.model.Duration
          }
        }

        // Bend: bendAmount is in semitones; AlphaTab value is quarter-tones (×4)
        if (note.modifiers.bend) {
          const semitones = note.bendAmount ?? 1
          const atValue = Math.round(semitones * 4)
          atNote.bendType = at.model.BendType.Bend
          atNote.addBendPoint(new at.model.BendPoint(0, 0))
          atNote.addBendPoint(new at.model.BendPoint(6, atValue))
          atNote.addBendPoint(new at.model.BendPoint(12, atValue))
        }

        atBeat.addNote(atNote)
      }

      allBeatRefs.push({ beat: atBeat, srcBeat: beat })
      voice.addBeat(atBeat)
    }

    staff.addBar(bar)
  }

  // Second pass: link pull-off destinations and tied notes.
  // Walk backwards past fill rests (beats with no notes) to find the real preceding note,
  // so cross-measure ties aren't broken by normalization fill rests.
  function findPrecedingNote(fromIndex: number, string: number): at.model.Note | undefined {
    for (let j = fromIndex - 1; j >= 0; j--) {
      const candidate = allBeatRefs[j]!.beat.notes.find(n => n.string === string)
      if (candidate) return candidate
      // Stop once we've passed a real (non-empty) beat — don't skip across multiple real beats
      if (allBeatRefs[j]!.srcBeat.notes.length > 0) break
    }
    return undefined
  }

  for (let i = 1; i < allBeatRefs.length; i++) {
    const { beat: atBeat, srcBeat } = allBeatRefs[i]!

    for (const atNote of atBeat.notes) {
      const srcNote = srcBeat.notes.find(n => n.string === atNote.string)
      if (!srcNote) continue

      // Pull-off: find origin on same string in nearest preceding real beat
      if (srcNote.modifiers.pullOff) {
        const originNote = findPrecedingNote(i, atNote.string)
        if (originNote) {
          originNote.isHammerPullOrigin = true
          atNote.hammerPullOrigin = originNote
        }
      }

      // Tied note: link to same-string note in nearest preceding real beat
      if (srcBeat.tiedFrom) {
        const originNote = findPrecedingNote(i, atNote.string)
        if (originNote) {
          originNote.tieDestination = atNote
          atNote.tieOrigin = originNote
          atNote.isTieDestination = true
        }
      }
    }
  }

  score.addTrack(atTrack)
  score.finish(new at.Settings())
  return score
}
