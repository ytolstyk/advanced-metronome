import { Play, Pause, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TabEditorAction } from '../../tabEditorState'

interface TabEditorPlaybackProps {
  isPlaying: boolean
  viewMode: 'tab' | 'staff'
  onPlay: () => void
  onStop: () => void
  dispatch: React.Dispatch<TabEditorAction>
}

export function TabEditorPlayback({
  isPlaying,
  viewMode,
  onPlay,
  onStop,
  dispatch,
}: TabEditorPlaybackProps) {
  return (
    <div className="tab-playback-bar">
      <Button variant="ghost" size="icon" onClick={onPlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button variant="ghost" size="icon" onClick={onStop} title="Stop">
        <Square size={16} />
      </Button>
      <div className="tab-view-toggle">
        <Button
          variant="ghost"
          size="sm"
          className={cn('tab-view-btn', viewMode === 'tab' && 'active')}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'tab' })}
        >
          Tab
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn('tab-view-btn', viewMode === 'staff' && 'active')}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'staff' })}
        >
          Staff
        </Button>
      </div>
    </div>
  )
}
