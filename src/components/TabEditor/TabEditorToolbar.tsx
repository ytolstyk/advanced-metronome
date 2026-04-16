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
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Duration</span>
        {DURATIONS.map((d) => (
          <button
            key={d.value}
            title={d.label}
            className={`tab-tool-btn${activeDuration === d.value ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_DURATION', duration: d.value })}
          >
            {d.label}
          </button>
        ))}
        <button
          title="Dotted"
          className={`tab-tool-btn${activeDot.dotted ? ' active' : ''}`}
          onClick={() => toggleDot('dotted')}
        >
          ·
        </button>
        <button
          title="Double dotted"
          className={`tab-tool-btn${activeDot.doubleDotted ? ' active' : ''}`}
          onClick={() => toggleDot('doubleDotted')}
        >
          ··
        </button>
        <button
          title="Triplet"
          className={`tab-tool-btn${activeDot.triplet ? ' active' : ''}`}
          onClick={() =>
            dispatch({ type: 'SET_ACTIVE_DOT', dot: { ...activeDot, triplet: !activeDot.triplet } })
          }
        >
          3
        </button>
        <button
          title="Apply duration to current beat"
          className="tab-tool-btn"
          style={{ fontSize: '0.6rem' }}
          onClick={() =>
            dispatch({
              type: 'SET_BEAT_DURATION',
              measureIndex: mi,
              beatIndex: bi,
              duration: activeDuration,
            })
          }
        >
          ✓dur
        </button>
      </div>

      {/* Effects group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Effects</span>
        {MODIFIERS.map((mod) => (
          <button
            key={mod.key}
            title={mod.title}
            className={`tab-tool-btn${activeModifiers[mod.key] ? ' active-effect' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_MODIFIER', modifier: mod.key })}
          >
            {mod.label}
          </button>
        ))}
      </div>

      {/* Connections group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Techniques</span>
        {CONNECTIONS.map((c) => (
          <button
            key={c.key}
            title={c.title}
            className={`tab-tool-btn${activeModifiers[c.key] ? ' active-effect' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_MODIFIER', modifier: c.key })}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Structure group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Structure</span>
        <button
          title="Insert beat before"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'INSERT_BEAT_BEFORE', measureIndex: mi, beatIndex: bi })}
        >
          ←+
        </button>
        <button
          title="Insert beat after"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'INSERT_BEAT_AFTER', measureIndex: mi, beatIndex: bi })}
        >
          +→
        </button>
        <button
          title="Delete beat"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'DELETE_BEAT', measureIndex: mi, beatIndex: bi })}
        >
          -♩
        </button>
        <button
          title="Insert measure before"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'INSERT_MEASURE_BEFORE', measureIndex: mi })}
        >
          ←𝄀
        </button>
        <button
          title="Insert measure after"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'INSERT_MEASURE_AFTER', measureIndex: mi })}
        >
          𝄀→
        </button>
        <button
          title="Delete measure"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'DELETE_MEASURE', measureIndex: mi })}
        >
          -𝄀
        </button>
      </div>

      {/* Edit group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Edit</span>
        <button title="Undo (Cmd+Z)" className="tab-tool-btn" onClick={() => dispatch({ type: 'UNDO' })}>
          ↩
        </button>
        <button
          title="Redo (Cmd+Shift+Z)"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'REDO' })}
        >
          ↪
        </button>
        <button title="Copy (Cmd+C)" className="tab-tool-btn" onClick={() => dispatch({ type: 'COPY' })}>
          ⧉
        </button>
        <button title="Cut (Cmd+X)" className="tab-tool-btn" onClick={() => dispatch({ type: 'CUT' })}>
          ✂
        </button>
        <button
          title="Paste (Cmd+V)"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'PASTE', measureIndex: mi, beatIndex: bi })}
        >
          ⧫
        </button>
      </div>

      {/* Move group */}
      <div className="tab-toolbar-group">
        <span className="tab-tool-label">Move</span>
        <button
          title="String up"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'up' })}
        >
          ▲str
        </button>
        <button
          title="String down"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'down' })}
        >
          ▼str
        </button>
        <button
          title="Beat left"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'left' })}
        >
          ◀
        </button>
        <button
          title="Beat right"
          className="tab-tool-btn"
          onClick={() => dispatch({ type: 'MOVE_CURSOR', direction: 'right' })}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
