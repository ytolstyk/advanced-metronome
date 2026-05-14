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
    // Section marker: text on this bar; isDoubleBar goes on the PREVIOUS bar so the
    // double barline appears before the first note of the section (right edge of mi-1),
    // matching the tab editor which draws it at the left edge of bar mi.
    if (mb.marker) {
      const section = new at.model.Section()
      section.text = mb.marker
      masterBar.section = section
    }
    // Repeat markers live on Beat in our model; map to MasterBar
    const measure = track.measures[mi]
    if (measure) {
      if (measure.beats[0]?.repeatStart) masterBar.isRepeatStart = true
      const lastBeat = measure.beats[measure.beats.length - 1]
      if (lastBeat?.repeatEnd) masterBar.repeatCount = 2
    }
    score.addMasterBar(masterBar)
    // Apply double barline to the bar just added's predecessor so it renders at the correct boundary
    if (mb.marker && mi > 0) {
      score.masterBars[mi - 1]!.isDoubleBar = true
    }
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

      // Tremolo picking: marks stored directly from our model — no transformation needed.
      if (beat.tremoloMarks !== undefined) {
        const tremoloEffect = new at.model.TremoloPickingEffect()
        tremoloEffect.style = at.model.TremoloPickingStyle.Default
        tremoloEffect.marks = beat.tremoloMarks
        atBeat.tremoloPicking = tremoloEffect
      }

      // Beat text annotation (mirrors alphaTab Beat.text)
      if (beat.text) atBeat.text = beat.text

      // Chord label (mirrors alphaTab Beat.chordId + Staff.chords map)
      if (beat.chord) {
        const chord = new at.model.Chord()
        chord.name = beat.chord.name
        chord.showName = true
        chord.showDiagram = false
        // strings is high→low in alphaTab; our frets[] is low→high, so reverse
        chord.strings = beat.chord.frets.length > 0 ? beat.chord.frets.slice().reverse() : []
        const chordId = `chord-${beat.chord.name}-${beat.chord.frets.join(',')}`
        atBeat.chordId = chordId
        staff.addChord(chordId, chord)
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

        // Bend: use Custom type with all BendData points (offset 0–60, value quarter-tones)
        if (note.modifiers.bend && note.bendData) {
          atNote.bendType = at.model.BendType.Custom
          for (const pt of note.bendData.points) {
            atNote.addBendPoint(new at.model.BendPoint(pt.offset, pt.value))
          }
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
    const prevSrcBeat = allBeatRefs[i - 1]?.srcBeat

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

      // Overflow tie (tiedFrom): link to same-string note in nearest preceding real beat
      if (srcBeat.tiedFrom) {
        const originNote = findPrecedingNote(i, atNote.string)
        if (originNote) {
          originNote.tieDestination = atNote
          atNote.tieOrigin = originNote
          atNote.isTieDestination = true
        }
      }

      // User tie (tiedToNext on previous beat): same-string note in previous beat ties to this note
      if (prevSrcBeat?.tiedToNext) {
        const prevAtBeat = allBeatRefs[i - 1]!.beat
        const originNote = prevAtBeat.notes.find(n => n.string === atNote.string)
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
