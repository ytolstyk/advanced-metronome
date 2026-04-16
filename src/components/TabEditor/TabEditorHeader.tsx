import type { TabTrack } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'
import { buildOpenMidi } from '../../tabEditorState'
import { TUNINGS } from '../../data/tunings'
import type { StringCount } from '../../data/tunings'

interface TabEditorHeaderProps {
  track: TabTrack
  dispatch: React.Dispatch<TabEditorAction>
}

export function TabEditorHeader({ track, dispatch }: TabEditorHeaderProps) {
  return (
    <div className="tab-editor-header">
      <input
        className="tab-editor-title-input"
        value={track.title}
        onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
        placeholder="Track title"
      />
      <div className="tab-header-sep" />
      <TuningSelector track={track} dispatch={dispatch} />
      <div className="tab-header-sep" />
      <BpmControl bpm={track.globalBpm} dispatch={dispatch} />
    </div>
  )
}

function TuningSelector({
  track,
  dispatch,
}: {
  track: TabTrack
  dispatch: React.Dispatch<TabEditorAction>
}) {
  const counts: StringCount[] = [6, 7, 8]
  const selectStyle = {
    background: '#1a1a1a',
    color: '#e0e0e0',
    border: '1px solid #333',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: '0.8rem',
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        value={track.stringCount}
        style={selectStyle}
        onChange={(e) => {
          const sc = parseInt(e.target.value, 10) as StringCount
          const name = TUNINGS[sc][0].name
          const openMidi = buildOpenMidi(name, sc)
          dispatch({ type: 'SET_TUNING', tuningName: name, stringCount: sc, openMidi })
        }}
      >
        {counts.map((c) => (
          <option key={c} value={c}>
            {c} strings
          </option>
        ))}
      </select>
      <select
        value={track.tuningName}
        style={selectStyle}
        onChange={(e) => {
          const name = e.target.value
          const openMidi = buildOpenMidi(name, track.stringCount)
          dispatch({ type: 'SET_TUNING', tuningName: name, stringCount: track.stringCount, openMidi })
        }}
      >
        {TUNINGS[track.stringCount].map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function BpmControl({
  bpm,
  dispatch,
}: {
  bpm: number
  dispatch: React.Dispatch<TabEditorAction>
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: '0.8rem', color: '#888' }}>BPM</span>
      <input
        type="number"
        min={20}
        max={300}
        value={bpm}
        style={{
          width: 60,
          background: '#1a1a1a',
          color: '#e0e0e0',
          border: '1px solid #333',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: '0.8rem',
        }}
        onChange={(e) =>
          dispatch({ type: 'SET_BPM', bpm: parseInt(e.target.value, 10) || 120 })
        }
      />
    </div>
  )
}
