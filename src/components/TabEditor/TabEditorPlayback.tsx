import type { TabEditorAction } from '../../tabEditorState'

interface TabEditorPlaybackProps {
  isPlaying: boolean
  bpm: number
  viewMode: 'tab' | 'staff'
  onPlay: () => void
  onStop: () => void
  dispatch: React.Dispatch<TabEditorAction>
}

export function TabEditorPlayback({
  isPlaying,
  bpm,
  viewMode,
  onPlay,
  onStop,
  dispatch,
}: TabEditorPlaybackProps) {
  return (
    <div className="tab-playback-bar">
      <button
        className="tab-tool-btn"
        style={{ width: 'auto', padding: '0 10px' }}
        onClick={onPlay}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        className="tab-tool-btn"
        style={{ width: 'auto', padding: '0 10px' }}
        onClick={onStop}
      >
        ⏹
      </button>
      <span className="tab-bpm-display">{bpm} BPM</span>
      <div className="tab-view-toggle">
        <button
          className={`tab-view-btn${viewMode === 'tab' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'tab' })}
        >
          Tab
        </button>
        <button
          className={`tab-view-btn${viewMode === 'staff' ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'staff' })}
        >
          Staff
        </button>
      </div>
    </div>
  )
}
