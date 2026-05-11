import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  ConnectionModifierKey,
  DotModifier,
  DurationValue,
  HarmonicTypeValue,
  NoteModifierKey,
  TabEditorState,
} from '../../tabEditorTypes'
import { Duration } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'
import { normalizeSelection } from '../../tabEditorState'
import { VibratoDialog } from './VibratoDialog'
import type { VibratoType } from './VibratoDialog'
import { HarmonicsDialog, HARMONIC_LABELS, HARMONIC_SYMBOLS } from './HarmonicsDialog'
import { TrillDialog } from './TrillDialog'

const CONNECTION_KEYS: ConnectionModifierKey[] = ['hammerOn', 'pullOff', 'legatoSlide']

function SlideInBelowIcon() {
  return (
    <svg viewBox="0 0 20 14" width="28" height="20" fill="none">
      <line x1="1" y1="12" x2="8" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="10" y="3" width="4" height="8" fill="currentColor" rx="0.5" />
    </svg>
  )
}

function SlideInAboveIcon() {
  return (
    <svg viewBox="0 0 20 14" width="28" height="20" fill="none">
      <line x1="1" y1="2" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="10" y="3" width="4" height="8" fill="currentColor" rx="0.5" />
    </svg>
  )
}

function SlideOutDownIcon() {
  return (
    <svg viewBox="0 0 20 14" width="28" height="20" fill="none">
      <rect x="6" y="3" width="4" height="8" fill="currentColor" rx="0.5" />
      <line x1="11" y1="2" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SlideOutUpIcon() {
  return (
    <svg viewBox="0 0 20 14" width="28" height="20" fill="none">
      <rect x="6" y="3" width="4" height="8" fill="currentColor" rx="0.5" />
      <line x1="11" y1="12" x2="19" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const MODIFIER_LABELS: Record<string, string> = {
  ghost: 'Ghost',
  staccato: 'Staccato',
  letRing: 'Let ring',
  palmMute: 'Palm mute',
  dead: 'Dead',
  harmonicType: 'Harmonic',
  hammerOn: 'Hammer-on',
  pullOff: 'Pull-off',
  legatoSlide: 'Legato slide',
  slideInBelow: 'Slide in↗',
  slideInAbove: 'Slide in↘',
  slideOutDown: 'Slide out↙',
  slideOutUp: 'Slide out↖',
  bend: 'Bend',
  vibrato: 'Vibrato',
}

const DURATIONS: { label: string; value: DurationValue }[] = [
  { label: '1/1', value: Duration.Whole },
  { label: '1/2', value: Duration.Half },
  { label: '1/4', value: Duration.Quarter },
  { label: '1/8', value: Duration.Eighth },
  { label: '1/16', value: Duration.Sixteenth },
  { label: '1/32', value: Duration.ThirtySecond },
  { label: '1/64', value: Duration.SixtyFourth },
]

const MODIFIERS_BASE: { label: React.ReactNode; key: NoteModifierKey; title: string }[] = [
  { label: '( )', key: 'ghost', title: 'Ghost note' },
  { label: '·', key: 'staccato', title: 'Staccato' },
  { label: '∞', key: 'letRing', title: 'Let ring' },
  { label: 'PM', key: 'palmMute', title: 'Palm mute' },
  { label: 'X', key: 'dead', title: 'Dead note' },
]

const CONNECTIONS_BASE: { label: React.ReactNode; key: NoteModifierKey; title: string }[] = [
  { label: 'h', key: 'hammerOn', title: 'Hammer-on' },
  { label: 'p', key: 'pullOff', title: 'Pull-off' },
  { label: '/', key: 'legatoSlide', title: 'Legato slide' },
  { label: <SlideInBelowIcon />, key: 'slideInBelow', title: 'Slide in from below' },
  { label: <SlideInAboveIcon />, key: 'slideInAbove', title: 'Slide in from above' },
  { label: <SlideOutDownIcon />, key: 'slideOutDown', title: 'Slide out downward' },
  { label: <SlideOutUpIcon />, key: 'slideOutUp', title: 'Slide out upward' },
  { label: '⌒', key: 'bend', title: 'Bend' },
  { label: '~', key: 'vibrato', title: 'Vibrato' },
  { label: 'T', key: 'tapping', title: 'Tapping' },
]

const PALM_MUTE_ENTRY = MODIFIERS_BASE.find((m) => m.key === 'palmMute')!

const MODIFIER_SYMBOL: Record<string, React.ReactNode> = Object.fromEntries(
  [...MODIFIERS_BASE, ...CONNECTIONS_BASE].map((m) => [m.key, m.label]),
)

interface TabEditorToolbarProps {
  state: TabEditorState
  dispatch: React.Dispatch<TabEditorAction>
  isNavigating: boolean
}

function ToolBtn({
  title,
  active,
  activeEffect,
  disabled,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  activeEffect?: boolean | 'partial'
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      disabled={disabled}
      className={cn(
        'tab-tool-btn',
        active && 'active',
        activeEffect === true && 'active-effect',
        activeEffect === 'partial' && 'active-effect-partial',
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function TabEditorToolbar({ state, dispatch, isNavigating }: TabEditorToolbarProps) {
  const [vibratoDialogOpen, setVibratoDialogOpen] = useState(false)
  const [harmonicsDialogOpen, setHarmonicsDialogOpen] = useState(false)
  const [trillDialogOpen, setTrillDialogOpen] = useState(false)
  const { activeDuration, activeDot, activeModifiers, cursor, noteSelection } = state
  const mi = cursor.measureIndex
  const bi = cursor.beatIndex

  // Toolbar mirrors the beat under the cursor so changing duration acts on that beat.
  // While navigating, freeze the display to avoid flashing as cursor passes beats.
  const currentBeat = isNavigating ? undefined : state.track.measures[mi]?.beats[bi]
  const displayedDuration: DurationValue = currentBeat?.duration ?? activeDuration
  const displayedDot: DotModifier = currentBeat?.dot ?? activeDot

  const currentNote = isNavigating ? undefined : currentBeat?.notes.find((n) => n.string === cursor.stringIndex)
  const isOnNote = !!currentNote && currentNote.fret >= 0

  const activeSet = isOnNote ? currentNote.modifiers : activeModifiers
  const hasTapOrPick = !!(activeSet.tapping || currentBeat?.pickStroke || state.activePick)

  // Beat-range selection (shift+arrow) takes precedence over single-note mode
  const hasBeatSelection = !!state.selection && noteSelection.length < 2

  // Compute modifier counts for all selected notes once — O(selection) vs O(selection × modifiers)
  const selectionModCounts = useMemo(() => {
    const counts: Partial<Record<NoteModifierKey, number>> = {}
    if (noteSelection.length < 2) return counts
    for (const c of noteSelection) {
      const note = state.track.measures[c.measureIndex]?.beats[c.beatIndex]?.notes.find((n) => n.string === c.stringIndex)
      if (note && note.fret >= 0) {
        for (const k of Object.keys(note.modifiers) as NoteModifierKey[]) {
          if (note.modifiers[k]) counts[k] = (counts[k] ?? 0) + 1
        }
      }
    }
    return counts
  }, [noteSelection, state.track])

  function selectionEffectState(key: NoteModifierKey): true | 'partial' | false {
    if (noteSelection.length < 2) return false
    const count = selectionModCounts[key] ?? 0
    if (count === 0) return false
    if (count === noteSelection.length) return true
    return 'partial'
  }

  // Compute modifier totals for the beat-range selection once — O(selection) vs O(selection × modifiers)
  const beatSelectionStats = useMemo(() => {
    if (!state.selection) return null
    const norm = normalizeSelection(state.selection)
    let total = 0
    const withMod: Partial<Record<NoteModifierKey, number>> = {}
    for (let smi = norm.startMeasure; smi <= norm.endMeasure; smi++) {
      const m = state.track.measures[smi]
      if (!m) continue
      const bStart = smi === norm.startMeasure ? norm.startBeat : 0
      const bEnd = smi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
      for (let sbi = bStart; sbi <= bEnd; sbi++) {
        const beat = m.beats[sbi]
        if (!beat) continue
        for (const n of beat.notes) {
          if (n.fret < 0) continue
          total++
          for (const k of Object.keys(n.modifiers) as NoteModifierKey[]) {
            if (n.modifiers[k]) withMod[k] = (withMod[k] ?? 0) + 1
          }
        }
      }
    }
    return { total, withMod }
  }, [state.selection, state.track])

  function beatSelectionEffectState(key: NoteModifierKey): true | 'partial' | false {
    if (!beatSelectionStats) return false
    const { total, withMod } = beatSelectionStats
    if (total === 0) return false
    const count = withMod[key] ?? 0
    if (count === total) return true
    if (count === 0) return false
    return 'partial'
  }

  function countBeatSelectionBeats(): number {
    if (!state.selection) return 0
    const norm = normalizeSelection(state.selection)
    let count = 0
    for (let smi = norm.startMeasure; smi <= norm.endMeasure; smi++) {
      const m = state.track.measures[smi]
      if (!m) continue
      const bStart = smi === norm.startMeasure ? norm.startBeat : 0
      const bEnd = smi === norm.endMeasure ? norm.endBeat : m.beats.length - 1
      count += Math.max(0, bEnd - bStart + 1)
    }
    return count
  }

  const MODIFIERS = hasTapOrPick
    ? MODIFIERS_BASE.filter((m) => m.key !== 'palmMute')
    : MODIFIERS_BASE

  const CONNECTIONS = hasTapOrPick
    ? CONNECTIONS_BASE.flatMap((c) =>
        c.key === 'tapping' ? [PALM_MUTE_ENTRY, c] : [c],
      )
    : CONNECTIONS_BASE

  function pickDuration(duration: DurationValue) {
    dispatch({ type: 'SET_ACTIVE_DURATION', duration })
    if (currentBeat) {
      dispatch({ type: 'SET_BEAT_DURATION', measureIndex: mi, beatIndex: bi, duration })
    }
  }

  function toggleDot(key: keyof DotModifier) {
    const next: DotModifier = { ...displayedDot, [key]: !displayedDot[key] }
    if (key === 'dotted' && next.dotted) next.doubleDotted = false
    if (key === 'doubleDotted' && next.doubleDotted) next.dotted = false
    dispatch({ type: 'SET_ACTIVE_DOT', dot: next })
    if (currentBeat) {
      dispatch({ type: 'SET_BEAT_DOT', measureIndex: mi, beatIndex: bi, dot: next })
    }
  }

  const CONNECTION_KEYS_SET = new Set<NoteModifierKey>(CONNECTION_KEYS)

  function applyVibrato(vibratoType: VibratoType) {
    if (noteSelection.length >= 2) {
      dispatch({ type: 'APPLY_MODIFIER_TO_SELECTION', modifier: 'vibrato', value: vibratoType })
    } else if (hasBeatSelection) {
      dispatch({ type: 'APPLY_MODIFIER_TO_BEAT_SELECTION', modifier: 'vibrato', value: vibratoType })
    } else if (isOnNote) {
      dispatch({ type: 'APPLY_MODIFIER', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex, modifier: 'vibrato', value: vibratoType })
    } else {
      dispatch({ type: 'TOGGLE_MODIFIER', modifier: 'vibrato', value: vibratoType })
    }
    setVibratoDialogOpen(false)
  }

  function removeVibrato() {
    if (noteSelection.length >= 2) {
      dispatch({ type: 'APPLY_MODIFIER_TO_SELECTION', modifier: 'vibrato' })
    } else if (hasBeatSelection) {
      dispatch({ type: 'APPLY_MODIFIER_TO_BEAT_SELECTION', modifier: 'vibrato' })
    } else if (isOnNote) {
      dispatch({ type: 'APPLY_MODIFIER', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex, modifier: 'vibrato' })
    } else {
      dispatch({ type: 'TOGGLE_MODIFIER', modifier: 'vibrato' })
    }
    setVibratoDialogOpen(false)
  }

  function applyHarmonic(harmonicType: HarmonicTypeValue, harmonicValue?: number) {
    if (noteSelection.length >= 2) {
      dispatch({ type: 'APPLY_HARMONIC_TO_SELECTION', harmonicType, harmonicValue })
    } else if (hasBeatSelection) {
      dispatch({ type: 'APPLY_HARMONIC_TO_BEAT_SELECTION', harmonicType, harmonicValue })
    } else if (isOnNote) {
      dispatch({ type: 'APPLY_HARMONIC', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex, harmonicType, harmonicValue })
    } else {
      dispatch({ type: 'SET_ACTIVE_HARMONIC', harmonicType, harmonicValue })
    }
    setHarmonicsDialogOpen(false)
  }

  function removeHarmonic() {
    if (noteSelection.length >= 2) {
      dispatch({ type: 'APPLY_HARMONIC_TO_SELECTION' })
    } else if (hasBeatSelection) {
      dispatch({ type: 'APPLY_HARMONIC_TO_BEAT_SELECTION' })
    } else if (isOnNote) {
      dispatch({ type: 'APPLY_HARMONIC', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex })
    } else {
      dispatch({ type: 'SET_ACTIVE_HARMONIC' })
    }
    setHarmonicsDialogOpen(false)
  }

  function applyTrill(trillFret: number, trillSpeed: DurationValue) {
    if (noteSelection.length >= 2) {
      dispatch({ type: 'APPLY_TRILL_TO_SELECTION', trillFret, trillSpeed })
    } else if (hasBeatSelection) {
      dispatch({ type: 'APPLY_TRILL_TO_BEAT_SELECTION', trillFret, trillSpeed })
    } else if (isOnNote) {
      dispatch({ type: 'APPLY_TRILL', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex, trillFret, trillSpeed })
    }
    setTrillDialogOpen(false)
  }

  function removeTrill() {
    if (noteSelection.length >= 2) {
      dispatch({ type: 'APPLY_TRILL_TO_SELECTION' })
    } else if (hasBeatSelection) {
      dispatch({ type: 'APPLY_TRILL_TO_BEAT_SELECTION' })
    } else if (isOnNote) {
      dispatch({ type: 'APPLY_TRILL', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex })
    }
    setTrillDialogOpen(false)
  }

  function onConnectionClick(key: NoteModifierKey) {
    if (key === 'vibrato') {
      setVibratoDialogOpen(true)
      return
    }
    if (noteSelection.length >= 2) {
      if (CONNECTION_KEYS_SET.has(key)) {
        dispatch({ type: 'APPLY_CONNECTION_TO_SELECTION', modifier: key as ConnectionModifierKey })
      } else {
        dispatch({ type: 'APPLY_MODIFIER_TO_SELECTION', modifier: key })
      }
      return
    }
    if (hasBeatSelection) {
      if (!CONNECTION_KEYS_SET.has(key)) {
        dispatch({ type: 'APPLY_MODIFIER_TO_BEAT_SELECTION', modifier: key })
      }
      return
    }
    if (isOnNote) {
      dispatch({ type: 'APPLY_MODIFIER', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex, modifier: key })
      return
    }
    dispatch({ type: 'TOGGLE_MODIFIER', modifier: key })
  }

  return (
    <div className="tab-toolbar">
      {/* Duration group */}
      <div className="tab-toolbar-group" data-group="duration">
        <span className="tab-tool-label">Duration</span>
        {DURATIONS.map((d) => (
          <ToolBtn
            key={d.value}
            title={d.label}
            active={displayedDuration === d.value}
            onClick={() => pickDuration(d.value)}
          >
            {d.label}
          </ToolBtn>
        ))}
        <ToolBtn title="Dotted" active={displayedDot.dotted} onClick={() => toggleDot('dotted')}>·</ToolBtn>
        <ToolBtn title="Double dotted" active={displayedDot.doubleDotted} onClick={() => toggleDot('doubleDotted')}>··</ToolBtn>
        <ToolBtn
          title="Triplet"
          active={displayedDot.triplet}
          onClick={() => toggleDot('triplet')}
        >
          3
        </ToolBtn>
        <ToolBtn
          title="Insert rest of selected duration"
          onClick={() => dispatch({ type: 'INSERT_REST' })}
        >
          <svg viewBox="-4 -14 12 27" width="10" height="20" fill="currentColor">
            <path d="M 297 24 C 294.75 26.5 293.75 28.5 293.75 29.75 s 1.25 3 3.25 5.5 l -0.75 1 C 295.5 35.75 293.5 34.75 292.5 35.75 S 292 39 293.75 40.5 l -0.75 1 c -2.95 -2.03 -5.25 -5.25 -3.75 -7.5 s 4.25 -0.75 4.5 -0.5 l -4.5 -6.25 c 2 -1.75 3 -3.5 3 -5 s -0.5 -2.75 -2 -4.5 H 292 Z" transform="translate(-292, -30)" />
          </svg>
        </ToolBtn>
      </div>

      {/* Effects group */}
      <div className="tab-toolbar-group" data-group="effects">
        <span className="tab-tool-label">
          Effects{hasBeatSelection ? ` · ${countBeatSelectionBeats()} beats` : ''}
        </span>
        {MODIFIERS.map((mod) => (
          <ToolBtn
            key={mod.key}
            title={mod.title}
            activeEffect={
              noteSelection.length >= 2
                ? selectionEffectState(mod.key)
                : hasBeatSelection
                  ? beatSelectionEffectState(mod.key)
                  : isOnNote
                    ? !!currentNote.modifiers[mod.key]
                    : !!activeModifiers[mod.key]
            }
            onClick={() => {
              if (noteSelection.length >= 2) {
                dispatch({ type: 'APPLY_MODIFIER_TO_SELECTION', modifier: mod.key })
                return
              }
              if (hasBeatSelection) {
                dispatch({ type: 'APPLY_MODIFIER_TO_BEAT_SELECTION', modifier: mod.key })
                return
              }
              if (isOnNote) {
                dispatch({ type: 'APPLY_MODIFIER', measureIndex: mi, beatIndex: bi, stringIndex: cursor.stringIndex, modifier: mod.key })
              } else {
                dispatch({ type: 'TOGGLE_MODIFIER', modifier: mod.key })
              }
            }}
          >
            {mod.label}
          </ToolBtn>
        ))}
        <ToolBtn
          title="Harmonic"
          activeEffect={
            noteSelection.length >= 2
              ? selectionEffectState('harmonicType')
              : hasBeatSelection
                ? beatSelectionEffectState('harmonicType')
                : isOnNote
                  ? !!currentNote.modifiers.harmonicType
                  : !!activeModifiers.harmonicType
          }
          onClick={() => setHarmonicsDialogOpen(true)}
        >
          ◇
        </ToolBtn>
        <ToolBtn
          title="Trill"
          activeEffect={
            noteSelection.length >= 2
              ? selectionEffectState('trill')
              : hasBeatSelection
                ? beatSelectionEffectState('trill')
                : isOnNote
                  ? !!currentNote.modifiers.trill
                  : !!activeModifiers.trill
          }
          onClick={() => setTrillDialogOpen(true)}
        >
          <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}>tr</span>
        </ToolBtn>
      </div>

      {/* Connections group */}
      <div className="tab-toolbar-group" data-group="techniques">
        <span className="tab-tool-label">
          Techniques{noteSelection.length >= 2 ? ` · ${noteSelection.length} selected` : hasBeatSelection ? ` · ${countBeatSelectionBeats()} beats` : ''}
        </span>
        {CONNECTIONS.map((c) => {
          const isConnectionKey = CONNECTION_KEYS_SET.has(c.key)
          const multi = noteSelection.length >= 2 && isConnectionKey
          const disabledForBeatSel = hasBeatSelection && isConnectionKey
          const activeEffectVal = noteSelection.length >= 2
            ? selectionEffectState(c.key)
            : hasBeatSelection
              ? (isConnectionKey ? false : beatSelectionEffectState(c.key))
              : isOnNote
                ? !!currentNote.modifiers[c.key]
                : !!activeModifiers[c.key]
          return (
            <ToolBtn
              key={c.key}
              title={multi ? `Apply ${c.title} between selected notes` : c.title}
              activeEffect={activeEffectVal}
              disabled={disabledForBeatSel}
              onClick={() => onConnectionClick(c.key)}
            >
              {c.label}
            </ToolBtn>
          )
        })}

        {/* Pick stroke: beat-level, separate from per-note techniques */}
        <ToolBtn
          title="Pickstroke down"
          activeEffect={currentBeat ? currentBeat.pickStroke === 'down' : state.activePick === 'down'}
          onClick={() => dispatch({ type: 'TOGGLE_PICK_STROKE', direction: 'down' })}
        >
          ⬇
        </ToolBtn>
        <ToolBtn
          title="Pickstroke up"
          activeEffect={currentBeat ? currentBeat.pickStroke === 'up' : state.activePick === 'up'}
          onClick={() => dispatch({ type: 'TOGGLE_PICK_STROKE', direction: 'up' })}
        >
          ⬆
        </ToolBtn>
      </div>

      {/* Structure group */}
      <div className="tab-toolbar-group" data-group="structure">
        <span className="tab-tool-label">Structure</span>
        <ToolBtn title="Insert beat before" onClick={() => dispatch({ type: 'INSERT_BEAT_BEFORE', measureIndex: mi, beatIndex: bi })}>←+</ToolBtn>
        <ToolBtn title="Insert beat after" onClick={() => dispatch({ type: 'INSERT_BEAT_AFTER', measureIndex: mi, beatIndex: bi })}>+→</ToolBtn>
        <ToolBtn title="Delete beat" onClick={() => dispatch({ type: 'DELETE_BEAT', measureIndex: mi, beatIndex: bi })}>-♩</ToolBtn>
        <ToolBtn title="Insert measure before" onClick={() => dispatch({ type: 'INSERT_MEASURE_BEFORE', measureIndex: mi })}>←𝄀</ToolBtn>
        <ToolBtn title="Insert measure after" onClick={() => dispatch({ type: 'INSERT_MEASURE_AFTER', measureIndex: mi })}>𝄀→</ToolBtn>
        <ToolBtn title="Delete measure" onClick={() => dispatch({ type: 'DELETE_MEASURE', measureIndex: mi })}>-𝄀</ToolBtn>
      </div>

      {/* Edit group */}
      <div className="tab-toolbar-group" data-group="edit">
        <span className="tab-tool-label">Edit</span>
        <ToolBtn title="Undo (Cmd+Z)" onClick={() => dispatch({ type: 'UNDO' })}>↩</ToolBtn>
        <ToolBtn title="Redo (Cmd+Shift+Z)" onClick={() => dispatch({ type: 'REDO' })}>↪</ToolBtn>
        <ToolBtn title="Copy (Cmd+C)" onClick={() => dispatch({ type: 'COPY' })}>⧉</ToolBtn>
        <ToolBtn title="Cut (Cmd+X)" onClick={() => dispatch({ type: 'CUT' })}>✂</ToolBtn>
        <ToolBtn title="Paste (Cmd+V)" onClick={() => dispatch({ type: 'PASTE', measureIndex: mi, beatIndex: bi })}>⧫</ToolBtn>
        <ToolBtn title="Delete notes (replace with rests)" onClick={() => dispatch({ type: 'CLEAR_NOTES' })}>✕</ToolBtn>
      </div>

      {/* Move group */}
      <div className="tab-toolbar-group" data-group="move">
        <span className="tab-tool-label">Move</span>
        <ToolBtn title="String up" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'up' })}>▲str</ToolBtn>
        <ToolBtn title="String down" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'down' })}>▼str</ToolBtn>
        <ToolBtn title="Beat left" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'left' })}>◀</ToolBtn>
        <ToolBtn title="Beat right" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'right' })}>▶</ToolBtn>
      </div>


      {/* Line break before Applied */}
      <div className="tab-toolbar-break" />

      {/* Applied effects — interactive buttons for the highlighted note */}
      <div className="tab-toolbar-group" data-group="note-info">
        <span className="tab-tool-label">Applied</span>
        {isOnNote &&
          (Object.keys(currentNote.modifiers) as NoteModifierKey[])
            .filter((k) => currentNote.modifiers[k])
            .map((k) => (
              <ToolBtn
                key={k}
                title={
                  k === 'vibrato'
                    ? 'Change vibrato type'
                    : k === 'harmonicType'
                      ? `Change harmonic type (${HARMONIC_LABELS[currentNote.modifiers.harmonicType!]})`
                      : k === 'trill'
                        ? 'Edit trill'
                        : `Remove ${MODIFIER_LABELS[k] ?? k}`
                }
                activeEffect={true}
                onClick={() => {
                  if (k === 'vibrato') {
                    setVibratoDialogOpen(true)
                    return
                  }
                  if (k === 'harmonicType') {
                    setHarmonicsDialogOpen(true)
                    return
                  }
                  if (k === 'trill') {
                    setTrillDialogOpen(true)
                    return
                  }
                  dispatch({
                    type: 'APPLY_MODIFIER',
                    measureIndex: mi,
                    beatIndex: bi,
                    stringIndex: cursor.stringIndex,
                    modifier: k,
                  })
                }}
              >
                {k === 'harmonicType'
                  ? HARMONIC_SYMBOLS[currentNote.modifiers.harmonicType!]
                  : k === 'trill'
                    ? <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}>tr</span>
                    : (MODIFIER_SYMBOL[k] ?? k)}
              </ToolBtn>
            ))}
      </div>
      <VibratoDialog
        open={vibratoDialogOpen}
        current={isOnNote ? (currentNote.modifiers.vibrato as VibratoType | undefined) : (activeModifiers.vibrato as VibratoType | undefined)}
        onSelect={applyVibrato}
        onRemove={removeVibrato}
        onClose={() => setVibratoDialogOpen(false)}
      />
      <HarmonicsDialog
        open={harmonicsDialogOpen}
        current={isOnNote ? currentNote.modifiers.harmonicType : activeModifiers.harmonicType}
        harmonicValue={isOnNote ? currentNote.harmonicValue : state.activeHarmonicValue}
        onSelect={applyHarmonic}
        onRemove={removeHarmonic}
        onClose={() => setHarmonicsDialogOpen(false)}
      />
      <TrillDialog
        key={`trill-${mi}-${bi}-${cursor.stringIndex}`}
        open={trillDialogOpen}
        current={
          isOnNote && currentNote.modifiers.trill && currentNote.trillFret !== undefined
            ? { trillFret: currentNote.trillFret, trillSpeed: currentNote.trillSpeed ?? Duration.Sixteenth }
            : state.activeTrillFret !== undefined
              ? { trillFret: state.activeTrillFret, trillSpeed: state.activeTrillSpeed ?? Duration.Sixteenth }
              : undefined
        }
        baseFret={isOnNote ? currentNote.fret : undefined}
        openMidi={state.track.openMidi[cursor.stringIndex - 1]}
        onSelect={applyTrill}
        onRemove={removeTrill}
        onClose={() => setTrillDialogOpen(false)}
      />
    </div>
  )
}
