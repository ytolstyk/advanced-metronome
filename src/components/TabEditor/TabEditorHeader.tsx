import { useState } from 'react'
import type { TabTrack } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FolderOpen, Cloud, Globe, Link } from 'lucide-react'

interface TabEditorHeaderProps {
  track: TabTrack
  dispatch: React.Dispatch<TabEditorAction>
  isDirty?: boolean
  onSave?: () => void
  onSaveCopy?: () => void
  onLoad?: () => void
  onPublish?: () => void
  onUpdatePublished?: () => void
  onUnpublish?: () => void
  publishedTabId?: string | null
}

export function TabEditorHeader({ track, dispatch, isDirty, onSave, onSaveCopy, onLoad, onPublish, onUpdatePublished, onUnpublish, publishedTabId }: TabEditorHeaderProps) {
  const [prevTrack, setPrevTrack] = useState(track)
  const [meta, setMeta] = useState({
    title: track.title,
    artist: track.artist ?? '',
    tabAuthor: track.tabAuthor ?? '',
    year: track.year ?? '',
  })

  // Sync from props when the track object changes externally (e.g. load).
  // This is the React-recommended "derived state during render" pattern.
  if (prevTrack !== track) {
    setPrevTrack(track)
    setMeta({
      title: track.title,
      artist: track.artist ?? '',
      tabAuthor: track.tabAuthor ?? '',
      year: track.year ?? '',
    })
  }

  function flush(fields: { title?: string; artist?: string; tabAuthor?: string; year?: string }) {
    dispatch({ type: 'SET_METADATA', patch: fields })
  }

  return (
    <div className="tab-editor-header">
      <div className="tab-metadata">
        <Input
          className="tab-metadata-title"
          value={meta.title}
          onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
          onBlur={(e) => flush({ title: e.target.value })}
          placeholder="Song title"
        />
        <div className="tab-metadata-row">
          <Input
            className="tab-metadata-field"
            value={meta.artist}
            onChange={(e) => setMeta((m) => ({ ...m, artist: e.target.value }))}
            onBlur={(e) => flush({ artist: e.target.value })}
            placeholder="Artist / band"
          />
          <Input
            className="tab-metadata-field"
            value={meta.tabAuthor}
            onChange={(e) => setMeta((m) => ({ ...m, tabAuthor: e.target.value }))}
            onBlur={(e) => flush({ tabAuthor: e.target.value })}
            placeholder="Tab author"
          />
          <Input
            className="tab-metadata-field tab-metadata-year"
            value={meta.year}
            onChange={(e) => setMeta((m) => ({ ...m, year: e.target.value }))}
            onBlur={(e) => flush({ year: e.target.value })}
            placeholder="Year"
          />
          {track.version != null && (
            <span className="tab-metadata-version">v{track.version}</span>
          )}
        </div>
      </div>
      {(onLoad || onSave || onPublish || onUpdatePublished) && (
        <div className="tab-header-cloud">
          {onLoad && (
            <Button variant="outline" size="sm" onClick={onLoad}>
              <FolderOpen size={13} /> Load
            </Button>
          )}
          {onSaveCopy && (
            <Button variant="outline" size="sm" onClick={onSaveCopy}>
              <Cloud size={13} /> Save Copy
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
          {publishedTabId ? (
            <>
              {onUpdatePublished && (
                <Button variant="outline" size="sm" onClick={onUpdatePublished}>
                  <Globe size={13} /> Update Published
                </Button>
              )}
              {onUnpublish && (
                <Button variant="outline" size="sm" onClick={onUnpublish} className="text-red-400 hover:text-red-300">
                  Unpublish
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                title="Copy share link"
                onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/tabs/${publishedTabId}`) }}
              >
                <Link size={13} />
              </Button>
            </>
          ) : (
            onPublish && (
              <Button variant="outline" size="sm" onClick={onPublish}>
                <Globe size={13} /> Publish
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}
