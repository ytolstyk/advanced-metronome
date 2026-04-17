import type { TabTrack } from '../../tabEditorTypes'
import type { TabEditorAction } from '../../tabEditorState'
import { buildOpenMidi } from '../../tabEditorState'
import { TUNINGS } from '../../data/tunings'
import type { StringCount } from '../../data/tunings'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface TabEditorHeaderProps {
  track: TabTrack
  dispatch: React.Dispatch<TabEditorAction>
}

export function TabEditorHeader({ track, dispatch }: TabEditorHeaderProps) {
  return (
    <div className="tab-editor-header">
      <Input
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
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Select
        value={String(track.stringCount)}
        onValueChange={(val) => {
          const sc = parseInt(val, 10) as StringCount
          const name = TUNINGS[sc][0].name
          const openMidi = buildOpenMidi(name, sc)
          dispatch({ type: 'SET_TUNING', tuningName: name, stringCount: sc, openMidi })
        }}
      >
        <SelectTrigger className="tab-header-select h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {counts.map((c) => (
            <SelectItem key={c} value={String(c)}>{c} strings</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={track.tuningName}
        onValueChange={(name) => {
          const openMidi = buildOpenMidi(name, track.stringCount)
          dispatch({ type: 'SET_TUNING', tuningName: name, stringCount: track.stringCount, openMidi })
        }}
      >
        <SelectTrigger className="tab-header-select h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TUNINGS[track.stringCount].map((p) => (
            <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      <Label style={{ fontSize: '0.8rem', color: '#888' }}>BPM</Label>
      <Input
        type="number"
        min={20}
        max={300}
        value={bpm}
        className="h-8 w-16 text-xs text-center"
        onChange={(e) =>
          dispatch({ type: 'SET_BPM', bpm: parseInt(e.target.value, 10) || 120 })
        }
      />
    </div>
  )
}
