import type { TabTrack } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FolderOpen, Cloud } from 'lucide-react'

interface TabEditorHeaderProps {
  track: TabTrack
  dispatch: React.Dispatch<TabEditorAction>
  isDirty?: boolean
  onSave?: () => void
  onLoad?: () => void
}

export function TabEditorHeader({ track, dispatch, isDirty, onSave, onLoad }: TabEditorHeaderProps) {
  function patch(fields: { title?: string; artist?: string; tabAuthor?: string; year?: string }) {
    dispatch({ type: 'SET_METADATA', patch: fields })
  }

  return (
    <div className="tab-editor-header">
      <div className="tab-metadata">
        <Input
          className="tab-metadata-title"
          value={track.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Song title"
        />
        <div className="tab-metadata-row">
          <Input
            className="tab-metadata-field"
            value={track.artist ?? ''}
            onChange={(e) => patch({ artist: e.target.value })}
            placeholder="Artist / band"
          />
          <Input
            className="tab-metadata-field"
            value={track.tabAuthor ?? ''}
            onChange={(e) => patch({ tabAuthor: e.target.value })}
            placeholder="Tab author"
          />
          <Input
            className="tab-metadata-field tab-metadata-year"
            value={track.year ?? ''}
            onChange={(e) => patch({ year: e.target.value })}
            placeholder="Year"
          />
        </div>
      </div>
      {(onLoad || onSave) && (
        <div className="tab-header-cloud">
          {onLoad && (
            <Button variant="outline" size="sm" onClick={onLoad}>
              <FolderOpen size={13} /> Load
            </Button>
          )}
          {onSave && (
            <div className="tab-save-wrapper">
              {isDirty && <span className="tab-dirty-dot" aria-hidden />}
              <Button variant="outline" size="sm" onClick={onSave}>
                <Cloud size={13} /> Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
