import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DotModifier, DurationValue, NoteModifierKey, TabEditorState } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'

const DURATIONS: { label: string; value: DurationValue }[] = [
  { label: '1/1', value: 'whole' },
  { label: '1/2', value: 'half' },
  { label: '1/4', value: 'quarter' },
  { label: '1/8', value: 'eighth' },
  { label: '1/16', value: 'sixteenth' },
  { label: '1/32', value: 'thirtysecond' },
  { label: '1/64', value: 'sixtyfourth' },
]

const MODIFIERS: { label: string; key: NoteModifierKey; title: string }[] = [
  { label: '( )', key: 'ghost', title: 'Ghost note' },
  { label: '>', key: 'accent', title: 'Accent' },
  { label: '·', key: 'staccato', title: 'Staccato' },
  { label: '∞', key: 'letRing', title: 'Let ring' },
  { label: 'PM', key: 'palmMute', title: 'Palm mute' },
  { label: 'X', key: 'dead', title: 'Dead note' },
  { label: '◇', key: 'naturalHarmonic', title: 'Natural harmonic' },
]

const CONNECTIONS: { label: string; key: NoteModifierKey; title: string }[] = [
  { label: 'h', key: 'hammerOn', title: 'Hammer-on' },
  { label: 'p', key: 'pullOff', title: 'Pull-off' },
  { label: '/', key: 'legatoSlide', title: 'Legato slide' },
  { label: '⇗', key: 'shiftSlide', title: 'Shift slide' },
  { label: '↗', key: 'slideInBelow', title: 'Slide in from below' },
  { label: '↘', key: 'slideInAbove', title: 'Slide in from above' },
  { label: '↙', key: 'slideOutDown', title: 'Slide out downward' },
  { label: '↖', key: 'slideOutUp', title: 'Slide out upward' },
  { label: '⌒', key: 'bend', title: 'Bend' },
  { label: '~', key: 'vibrato', title: 'Vibrato' },
  { label: 'tr', key: 'trill', title: 'Trill' },
  { label: '⬇', key: 'pickDown', title: 'Pickstroke down' },
  { label: '⬆', key: 'pickUp', title: 'Pickstroke up' },
]

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
  activeEffect?: boolean
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
        activeEffect && 'active-effect',
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function TabEditorToolbar({ state, dispatch }: TabEditorToolbarProps) {
  const { activeDuration, activeDot, activeModifiers, cursor } = state
  const mi = cursor.measureIndex
  const bi = cursor.beatIndex

  function toggleDot(key: keyof DotModifier) {
    const next: DotModifier = { ...activeDot, [key]: !activeDot[key] }
    if (key === 'dotted' && next.dotted) next.doubleDotted = false
    if (key === 'doubleDotted' && next.doubleDotted) next.dotted = false
    dispatch({ type: 'SET_ACTIVE_DOT', dot: next })
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
            active={activeDuration === d.value}
            onClick={() => dispatch({ type: 'SET_ACTIVE_DURATION', duration: d.value })}
          >
            {d.label}
          </ToolBtn>
        ))}
        <ToolBtn title="Dotted" active={activeDot.dotted} onClick={() => toggleDot('dotted')}>·</ToolBtn>
        <ToolBtn title="Double dotted" active={activeDot.doubleDotted} onClick={() => toggleDot('doubleDotted')}>··</ToolBtn>
        <ToolBtn
          title="Triplet"
          active={activeDot.triplet}
          onClick={() => dispatch({ type: 'SET_ACTIVE_DOT', dot: { ...activeDot, triplet: !activeDot.triplet } })}
        >
          3
        </ToolBtn>
        <ToolBtn
          title="Apply duration to current beat"
          onClick={() => dispatch({ type: 'SET_BEAT_DURATION', measureIndex: mi, beatIndex: bi, duration: activeDuration })}
        >
          ✓dur
        </ToolBtn>
      </div>

      {/* Effects group */}
      <div className="tab-toolbar-group" data-group="effects">
        <span className="tab-tool-label">Effects</span>
        {MODIFIERS.map((mod) => (
          <ToolBtn
            key={mod.key}
            title={mod.title}
            activeEffect={!!activeModifiers[mod.key]}
            onClick={() => dispatch({ type: 'TOGGLE_MODIFIER', modifier: mod.key })}
          >
            {mod.label}
          </ToolBtn>
        ))}
      </div>

      {/* Connections group */}
      <div className="tab-toolbar-group" data-group="techniques">
        <span className="tab-tool-label">Techniques</span>
        {CONNECTIONS.map((c) => (
          <ToolBtn
            key={c.key}
            title={c.title}
            activeEffect={!!activeModifiers[c.key]}
            onClick={() => dispatch({ type: 'TOGGLE_MODIFIER', modifier: c.key })}
          >
            {c.label}
          </ToolBtn>
        ))}
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
