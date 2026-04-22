import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  ConnectionModifierKey,
  DotModifier,
  DurationValue,
  NoteModifierKey,
  TabEditorState,
} from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'

const CONNECTION_KEYS: ConnectionModifierKey[] = ['hammerOn', 'pullOff', 'legatoSlide']

const MODIFIER_LABELS: Record<string, string> = {
  ghost: 'Ghost',
  staccato: 'Staccato',
  letRing: 'Let ring',
  palmMute: 'Palm mute',
  dead: 'Dead',
  naturalHarmonic: 'Harmonic',
  hammerOn: 'Hammer-on',
  pullOff: 'Pull-off',
  legatoSlide: 'Legato slide',
  slideInBelow: 'Slide in↗',
  slideInAbove: 'Slide in↘',
  slideOutDown: 'Slide out↙',
  slideOutUp: 'Slide out↖',
  bend: 'Bend',
  vibrato: 'Vibrato',
  pickDown: 'Pick↓',
  pickUp: 'Pick↑',
}

const DURATIONS: { label: string; value: DurationValue }[] = [
  { label: '1/1', value: 'whole' },
  { label: '1/2', value: 'half' },
  { label: '1/4', value: 'quarter' },
  { label: '1/8', value: 'eighth' },
  { label: '1/16', value: 'sixteenth' },
  { label: '1/32', value: 'thirtysecond' },
  { label: '1/64', value: 'sixtyfourth' },
]

const MODIFIERS_BASE: { label: string; key: NoteModifierKey; title: string }[] = [
  { label: '( )', key: 'ghost', title: 'Ghost note' },
  { label: '·', key: 'staccato', title: 'Staccato' },
  { label: '∞', key: 'letRing', title: 'Let ring' },
  { label: 'PM', key: 'palmMute', title: 'Palm mute' },
  { label: 'X', key: 'dead', title: 'Dead note' },
  { label: '◇', key: 'naturalHarmonic', title: 'Natural harmonic' },
]

const CONNECTIONS_BASE: { label: string; key: NoteModifierKey; title: string }[] = [
  { label: 'h', key: 'hammerOn', title: 'Hammer-on' },
  { label: 'p', key: 'pullOff', title: 'Pull-off' },
  { label: '/', key: 'legatoSlide', title: 'Legato slide' },
  { label: '↗', key: 'slideInBelow', title: 'Slide in from below' },
  { label: '↘', key: 'slideInAbove', title: 'Slide in from above' },
  { label: '↙', key: 'slideOutDown', title: 'Slide out downward' },
  { label: '↖', key: 'slideOutUp', title: 'Slide out upward' },
  { label: '⌒', key: 'bend', title: 'Bend' },
  { label: '~', key: 'vibrato', title: 'Vibrato' },
  { label: 'T', key: 'tapping', title: 'Tapping' },
  { label: '⬇', key: 'pickDown', title: 'Pickstroke down' },
  { label: '⬆', key: 'pickUp', title: 'Pickstroke up' },
]

const PALM_MUTE_ENTRY = MODIFIERS_BASE.find((m) => m.key === 'palmMute')!

interface TabEditorToolbarProps {
  state: TabEditorState
  dispatch: React.Dispatch<TabEditorAction>
}

function ToolBtn({
  title,
  active,
  activeEffect,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  activeEffect?: boolean | 'partial'
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
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

export function TabEditorToolbar({ state, dispatch }: TabEditorToolbarProps) {
  const { activeDuration, activeDot, activeModifiers, cursor, noteSelection } = state
  const mi = cursor.measureIndex
  const bi = cursor.beatIndex

  // Toolbar mirrors the beat under the cursor so changing duration acts on that beat.
  const currentBeat = state.track.measures[mi]?.beats[bi]
  const displayedDuration: DurationValue = currentBeat?.duration ?? activeDuration
  const displayedDot: DotModifier = currentBeat?.dot ?? activeDot

  const currentNote = currentBeat?.notes[cursor.stringIndex]
  const isOnNote = !!currentNote && currentNote.fret >= 0

  const activeSet = isOnNote ? currentNote.modifiers : activeModifiers
  const hasTapOrPick = !!(activeSet.tapping || activeSet.pickDown || activeSet.pickUp)

  function selectionEffectState(key: NoteModifierKey): true | 'partial' | false {
    if (noteSelection.length < 2) return false
    let count = 0
    for (const c of noteSelection) {
      const note = state.track.measures[c.measureIndex]?.beats[c.beatIndex]?.notes[c.stringIndex]
      if (note && note.fret >= 0 && note.modifiers[key]) count++
    }
    if (count === 0) return false
    if (count === noteSelection.length) return true
    return 'partial'
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

  function onConnectionClick(key: NoteModifierKey) {
    if (noteSelection.length >= 2) {
      if ((CONNECTION_KEYS as NoteModifierKey[]).includes(key)) {
        dispatch({ type: 'APPLY_CONNECTION_TO_SELECTION', modifier: key as ConnectionModifierKey })
      } else {
        dispatch({ type: 'APPLY_MODIFIER_TO_SELECTION', modifier: key })
      }
      return
    }
    if (isOnNote) {
      if (key === 'legatoSlide') return
      if (key === 'pullOff' || key === 'hammerOn') return
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
      </div>

      {/* Effects group */}
      <div className="tab-toolbar-group" data-group="effects">
        <span className="tab-tool-label">Effects</span>
        {MODIFIERS.map((mod) => (
          <ToolBtn
            key={mod.key}
            title={mod.title}
            activeEffect={noteSelection.length >= 2 ? selectionEffectState(mod.key) : isOnNote ? !!currentNote.modifiers[mod.key] : !!activeModifiers[mod.key]}
            onClick={() => {
              if (noteSelection.length >= 2) {
                dispatch({ type: 'APPLY_MODIFIER_TO_SELECTION', modifier: mod.key })
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
      </div>

      {/* Note info strip — shows applied effects on highlighted note */}
      {isOnNote && Object.keys(currentNote.modifiers).length > 0 && (
        <div className="tab-toolbar-group" data-group="note-info">
          <span className="tab-tool-label">Applied</span>
          <span className="tab-note-effects-strip">
            {(Object.keys(currentNote.modifiers) as (keyof typeof currentNote.modifiers)[])
              .filter((k) => currentNote.modifiers[k])
              .map((k) => MODIFIER_LABELS[k] ?? k)
              .join(' · ')}
          </span>
        </div>
      )}

      {/* Connections group */}
      <div className="tab-toolbar-group" data-group="techniques">
        <span className="tab-tool-label">
          Techniques{noteSelection.length >= 2 ? ` · ${noteSelection.length} selected` : ''}
        </span>
        {CONNECTIONS.map((c) => {
          const isConnectionKey = (CONNECTION_KEYS as NoteModifierKey[]).includes(c.key)
          const multi = noteSelection.length >= 2 && isConnectionKey
          const activeEffectVal = noteSelection.length >= 2
            ? selectionEffectState(c.key)
            : isOnNote
              ? !!currentNote.modifiers[c.key]
              : !!activeModifiers[c.key]
          return (
            <ToolBtn
              key={c.key}
              title={multi ? `Apply ${c.title} between selected notes` : c.title}
              activeEffect={activeEffectVal}
              onClick={() => onConnectionClick(c.key)}
            >
              {c.label}
            </ToolBtn>
          )
        })}
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
      </div>

      {/* Move group */}
      <div className="tab-toolbar-group" data-group="move">
        <span className="tab-tool-label">Move</span>
        <ToolBtn title="String up" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'up' })}>▲str</ToolBtn>
        <ToolBtn title="String down" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'down' })}>▼str</ToolBtn>
        <ToolBtn title="Beat left" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'left' })}>◀</ToolBtn>
        <ToolBtn title="Beat right" onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'right' })}>▶</ToolBtn>
      </div>
    </div>
  )
}
