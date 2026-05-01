import { Play, Pause, Square, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TabEditorAction } from '../../tabEditorState'

interface TabEditorPlaybackProps {
  isPlaying: boolean
  onPlay: () => void
  onStop: () => void
  dispatch: React.Dispatch<TabEditorAction>
  menuOpen: boolean
  onToggleMenu: () => void
}

export function TabEditorPlayback({
  isPlaying,
  onPlay,
  onStop,
  menuOpen,
  onToggleMenu,
}: TabEditorPlaybackProps) {
  return (
    <div className="tab-playback-bar">
      <button className="tab-menu-toggle" onClick={onToggleMenu} title={menuOpen ? 'Hide menus' : 'Show menus'}>
        {menuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <Button variant="ghost" size="icon" onClick={onPlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button variant="ghost" size="icon" onClick={onStop} title="Stop">
        <Square size={16} />
      </Button>
    </div>
  )
}
