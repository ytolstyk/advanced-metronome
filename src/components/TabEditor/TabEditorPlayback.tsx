import { Play, Pause, Square, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TabEditorAction } from '../../tabEditorState'

type NotationMode = 'tab' | 'staff' | 'both'

interface TabEditorPlaybackProps {
  isPlaying: boolean
  onPlay: () => void
  onStop: () => void
  dispatch: React.Dispatch<TabEditorAction>
  menuOpen: boolean
  onToggleMenu: () => void
  showPreview: boolean
  onTogglePreview: () => void
  previewMode: NotationMode
  onPreviewModeChange: (mode: NotationMode) => void
}

export function TabEditorPlayback({
  isPlaying,
  onPlay,
  onStop,
  menuOpen,
  onToggleMenu,
  showPreview,
  onTogglePreview,
  previewMode,
  onPreviewModeChange,
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
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
        {showPreview && (
          <>
            {(['tab', 'staff', 'both'] as NotationMode[]).map((m) => (
              <Button
                key={m}
                variant="ghost"
                size="sm"
                className={previewMode === m ? 'alphatab-mode-active' : ''}
                onClick={() => onPreviewModeChange(m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Button>
            ))}
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onTogglePreview}
          title={showPreview ? 'Back to editor' : 'Preview with AlphaTab'}
          data-active={showPreview}
        >
          {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </div>
    </div>
  )
}
