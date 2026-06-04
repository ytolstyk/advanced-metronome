import * as at from '@coderline/alphatab'
import type { Beat, BendData, DotModifier, DurationValue, MasterBar, Measure, NoteModifiers, TabNote, TabTrack } from '../tabEditorTypes'
import { Duration, HarmonicType } from '../tabEditorTypes'

const DYNAMIC_REVERSE: Record<number, Beat['dynamics']> = {
  [at.model.DynamicValue.PPP]: 'ppp',
  [at.model.DynamicValue.PP]:  'pp',
  [at.model.DynamicValue.P]:   'p',
  [at.model.DynamicValue.MP]:  'mp',
  [at.model.DynamicValue.MF]:  'mf',
  [at.model.DynamicValue.F]:   'f',
  [at.model.DynamicValue.FF]:  'ff',
  [at.model.DynamicValue.FFF]: 'fff',
}

const FADE_REVERSE: Record<number, Beat['fade']> = {
  [at.model.FadeType.FadeIn]:     'fadeIn',
  [at.model.FadeType.FadeOut]:    'fadeOut',
  [at.model.FadeType.VolumeSwell]: 'fadeInOut',
}

const VALID_DURATIONS: DurationValue[] = [
  Duration.Whole, Duration.Half, Duration.Quarter, Duration.Eighth,
  Duration.Sixteenth, Duration.ThirtySecond, Duration.SixtyFourth,
]

function toDurationValue(d: at.model.Duration): DurationValue {
  const n = d as unknown as number
  return (VALID_DURATIONS.includes(n as DurationValue) ? n : Duration.Quarter) as DurationValue
}

function toDotModifier(atBeat: at.model.Beat): DotModifier {
  const dots = atBeat.dots ?? 0
  const isTriplet = dots === 0 && atBeat.tupletNumerator === 3 && atBeat.tupletDenominator === 2
  return {
    dotted: dots === 1,
    doubleDotted: dots >= 2,
    triplet: isTriplet,
  }
}

function convertNote(atNote: at.model.Note): TabNote {
  const mods: NoteModifiers = {}

  if (atNote.isHammerPullOrigin) mods.hammerOn = true
  if (atNote.isHammerPullDestination) mods.pullOff = true
  if (atNote.vibrato === at.model.VibratoType.Slight) mods.vibrato = 1
  else if (atNote.vibrato === at.model.VibratoType.Wide) mods.vibrato = 2
  if (atNote.isPalmMute) mods.palmMute = true
  if (atNote.isLetRing) mods.letRing = true
  if (atNote.isDead) mods.dead = true
  if (atNote.isGhost) mods.ghost = true
  if (atNote.isStaccato) mods.staccato = true
  if (atNote.isLeftHandTapped) mods.tapping = true

  // Harmonics
  if (atNote.harmonicType !== at.model.HarmonicType.None) {
    const htMap: Record<number, number> = {
      [at.model.HarmonicType.Natural]:    HarmonicType.Natural,
      [at.model.HarmonicType.Artificial]: HarmonicType.Artificial,
      [at.model.HarmonicType.Pinch]:      HarmonicType.Pinch,
      [at.model.HarmonicType.Tap]:        HarmonicType.Tap,
      [at.model.HarmonicType.Semi]:       HarmonicType.Semi,
      [at.model.HarmonicType.Feedback]:   HarmonicType.Feedback,
    }
    const mapped = htMap[atNote.harmonicType as unknown as number]
    if (mapped !== undefined) mods.harmonicType = mapped as typeof HarmonicType[keyof typeof HarmonicType]
  }

  // Slides
  if (atNote.slideOutType === at.model.SlideOutType.Legato) mods.legatoSlide = true
  else if (atNote.slideOutType === at.model.SlideOutType.OutDown) mods.slideOutDown = true
  else if (atNote.slideOutType === at.model.SlideOutType.OutUp) mods.slideOutUp = true
  if (atNote.slideInType === at.model.SlideInType.IntoFromBelow) mods.slideInBelow = true
  else if (atNote.slideInType === at.model.SlideInType.IntoFromAbove) mods.slideInAbove = true

  // Trill
  const trillFret = atNote.trillFret  // computed getter: trillValue - openMidi[string-1]
  if (atNote.isTrill && trillFret > 0) {
    mods.trill = true
  }

  // Bend
  if (atNote.bendType !== at.model.BendType.None && atNote.bendPoints && atNote.bendPoints.length >= 2) {
    mods.bend = true
  }

  const note: TabNote = {
    string: atNote.string,
    fret: atNote.fret,
    modifiers: mods,
  }

  if (atNote.isTrill && trillFret > 0) {
    note.trillFret = trillFret
    note.trillSpeed = toDurationValue(atNote.trillSpeed)
  }

  if (mods.bend && atNote.bendPoints && atNote.bendPoints.length >= 2) {
    const bendData: BendData = {
      points: atNote.bendPoints.map(bp => ({ offset: bp.offset, value: bp.value })),
      segments: atNote.bendPoints.slice(1).map(() => 'up' as const),
    }
    note.bendData = bendData
  }

  if (mods.harmonicType === HarmonicType.Artificial && atNote.harmonicValue) {
    note.harmonicValue = atNote.harmonicValue
  }

  return note
}

function convertBeat(atBeat: at.model.Beat, unsupported: Set<string>): Beat {
  const notes: TabNote[] = []

  for (const atNote of atBeat.notes) {
    if (atNote.isTieDestination) continue  // ties handled by tiedFrom flag
    notes.push(convertNote(atNote))
  }

  // Check for tie destinations — mark as tiedFrom (cross-beat/measure ties)
  const hasTieDestination = atBeat.notes.some(n => n.isTieDestination)

  const beat: Beat = {
    id: crypto.randomUUID(),
    duration: toDurationValue(atBeat.duration),
    dot: toDotModifier(atBeat),
    notes,
  }

  if (hasTieDestination) beat.tiedFrom = true

  if (atBeat.dynamics !== at.model.DynamicValue.F) {
    const dyn = DYNAMIC_REVERSE[atBeat.dynamics as unknown as number]
    if (dyn) beat.dynamics = dyn
  }

  if (atBeat.pickStroke === at.model.PickStroke.Down) beat.pickStroke = 'down'
  else if (atBeat.pickStroke === at.model.PickStroke.Up) beat.pickStroke = 'up'

  if (atBeat.tremoloPicking) {
    beat.tremoloMarks = atBeat.tremoloPicking.marks
  }

  if (atBeat.fade !== at.model.FadeType.None) {
    const fade = FADE_REVERSE[atBeat.fade as unknown as number]
    if (fade) beat.fade = fade
  }

  if (atBeat.whammyBarType !== at.model.WhammyType.None && atBeat.whammyBarPoints?.length) {
    beat.whammyBar = {
      points: atBeat.whammyBarPoints.map(bp => ({ offset: bp.offset, value: bp.value })),
    }
  }

  if (atBeat.text) beat.text = atBeat.text

  // Chord label from staff.chords lookup
  if (atBeat.hasChord && atBeat.chord) {
    const ch = atBeat.chord
    // alphaTab chord.strings is high→low; our frets[] is low→high
    const frets = ch.strings ? [...ch.strings].reverse() : []
    beat.chord = { name: ch.name ?? '', frets }
  }

  // Tempo change from beat automations
  for (const auto of atBeat.automations) {
    if ((auto.type as unknown as number) === (at.model.AutomationType.Tempo as unknown as number)) {
      beat.tempoChange = auto.value
    }
  }

  // Unsupported: lyrics on beat
  if (atBeat.lyrics?.length) unsupported.add('Lyrics')

  // Unsupported: ottava
  if (atBeat.ottava !== at.model.Ottavia.Regular) unsupported.add('Ottava (8va / 8vb) markers')

  // Unsupported: grace notes
  if (atBeat.graceType !== at.model.GraceType.None) unsupported.add('Grace notes')

  // Unsupported: non-triplet tuplets
  if (atBeat.hasTuplet && !(atBeat.tupletNumerator === 3 && atBeat.tupletDenominator === 2)) {
    unsupported.add('Non-triplet tuplets')
  }

  // Unsupported: shift slide (we only support legato slide)
  for (const n of atBeat.notes) {
    if (n.slideOutType === at.model.SlideOutType.Shift) unsupported.add('Shift slides')
    if (n.slideOutType === at.model.SlideOutType.PickSlideDown || n.slideOutType === at.model.SlideOutType.PickSlideUp) {
      unsupported.add('Pick slides')
    }
    if (n.isFingering) unsupported.add('Fingering notation')
    if (n.isSlurOrigin || n.isSlurDestination) unsupported.add('Slurs')
  }

  return beat
}

export interface ImportResult {
  track: TabTrack
  unsupportedFeatures: string[]
}

export function fromAlphaTabScore(score: at.model.Score, trackIndex: number): ImportResult {
  const unsupported = new Set<string>()

  if (score.tracks.length > 1) {
    unsupported.add(`Multiple tracks (${score.tracks.length} tracks found; only one can be edited at a time)`)
  }

  const atTrack = score.tracks[trackIndex] ?? score.tracks[0]!
  const staff = atTrack.staves[0]

  // Tuning: alphaTab high→low; we store low→high
  const atTunings = staff?.stringTuning?.tunings ?? []
  const openMidi = atTunings.length > 0 ? [...atTunings].reverse() : [40, 45, 50, 55, 59, 64]
  const importedStringCount = openMidi.length
  const stringCount: 6 | 7 | 8 = importedStringCount >= 8 ? 8 : importedStringCount >= 7 ? 7 : 6
  const tuningName = staff?.stringTuning?.name ?? 'Standard'

  const masterBars: MasterBar[] = []
  const measures: Measure[] = []

  for (let mi = 0; mi < score.masterBars.length; mi++) {
    const atMb = score.masterBars[mi]!
    const atBar = staff?.bars[mi]

    // MasterBar
    const mb: MasterBar = {
      timeSignature: {
        numerator: atMb.timeSignatureNumerator,
        denominator: atMb.timeSignatureDenominator,
      },
    }

    const tempoAuto = atMb.tempoAutomations[0]
    if (tempoAuto) mb.bpm = tempoAuto.value

    if (atMb.section?.text) mb.marker = atMb.section.text

    masterBars.push(mb)

    // Measure
    const beats: Beat[] = []

    if (atBar) {
      const voice0 = atBar.voices[0]
      if (voice0) {
        for (const atBeat of voice0.beats) {
          // Skip grace notes (they show as ornamentation in alphaTab but don't fit our model)
          if (atBeat.graceType !== at.model.GraceType.None) {
            unsupported.add('Grace notes')
            continue
          }
          beats.push(convertBeat(atBeat, unsupported))
        }
        // A bar whose only content was grace notes would produce an empty beat list,
        // which is invalid in our model — insert a whole-note rest placeholder.
        if (beats.length === 0) {
          beats.push({
            id: crypto.randomUUID(),
            duration: Duration.Whole,
            dot: { dotted: false, doubleDotted: false, triplet: false },
            notes: [],
          })
        }
      }

      // Detect multiple voices
      for (let vi = 1; vi < atBar.voices.length; vi++) {
        const voice = atBar.voices[vi]
        if (voice && voice.beats.some(b => !b.isRest)) {
          unsupported.add('Multiple voices per measure')
          break
        }
      }
    }

    const measure: Measure = { id: crypto.randomUUID(), beats }
    if (atMb.isRepeatStart) measure.repeatOpen = true
    if (atMb.repeatCount > 0) measure.repeatClose = atMb.repeatCount

    measures.push(measure)
  }

  // Ensure at least one measure with one beat
  if (measures.length === 0) {
    masterBars.push({ timeSignature: { numerator: 4, denominator: 4 }, bpm: 120 })
    measures.push({ id: crypto.randomUUID(), beats: [] })
  }

  // masterBars[0] must have a bpm
  if (masterBars[0] && masterBars[0].bpm === undefined) {
    masterBars[0] = { ...masterBars[0], bpm: 120 }
  }

  const track: TabTrack = {
    schemaVersion: 4,
    title: score.title || atTrack.name || 'Imported Tab',
    artist: score.artist || undefined,
    masterBars,
    stringCount,
    tuningName,
    openMidi,
    measures,
  }

  return { track, unsupportedFeatures: Array.from(unsupported) }
}
