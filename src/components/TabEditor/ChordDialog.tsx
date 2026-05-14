import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  CHORD_DATABASE,
  CHORD_TYPE_LABELS,
  ROOT_NOTES,
  CHORD_TYPES,
} from '../../data/chords'
import type { RootNote, ChordType, ChordVoicing } from '../../data/chords'

interface ChordDialogProps {
  open: boolean
  currentChord: { name: string; frets: number[] } | undefined
  stringCount: 6 | 7 | 8
  onClose: () => void
  onSave: (chord: { name: string; frets: number[] } | null, populateFrets: boolean) => void
}

function fretSummary(frets: number[], stringCount: number): string {
  const capped = Array.from({ length: stringCount }, (_, i) => frets[i] ?? -1)
  return capped.map((f) => (f < 0 ? 'x' : String(f))).join('-')
}

function chordDisplayName(root: RootNote, type: ChordType): string {
  if (type === 'major') return root
  if (type === 'minor') return `${root}m`
  return `${root}${type}`
}

export function ChordDialog({ open, currentChord, stringCount, onClose, onSave }: ChordDialogProps) {
  const [mode, setMode] = useState<'custom' | 'database'>('database')
  const [customName, setCustomName] = useState(currentChord?.name ?? '')
  const [selectedRoot, setSelectedRoot] = useState<RootNote>('A')
  const [selectedType, setSelectedType] = useState<ChordType>('minor')
  const [selectedVoicingIndex, setSelectedVoicingIndex] = useState<number>(0)
  const [populateFrets, setPopulateFrets] = useState(true)

  const matchingEntry = CHORD_DATABASE.find((e) => e.root === selectedRoot && e.type === selectedType)
  const voicings: ChordVoicing[] = matchingEntry?.voicings ?? []
  const selectedVoicing: ChordVoicing | undefined = voicings[selectedVoicingIndex]

  function buildChordFromDatabase(): { name: string; frets: number[] } | null {
    if (!selectedVoicing) return null
    const name = chordDisplayName(selectedRoot, selectedType)
    return { name, frets: selectedVoicing.frets }
  }

  function handleSave() {
    if (mode === 'custom') {
      const name = customName.trim()
      if (!name) return
      onSave({ name, frets: [] }, false)
    } else {
      const chord = buildChordFromDatabase()
      if (!chord) return
      onSave(chord, populateFrets)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Chord Label</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 border-b pb-2">
          <button
            className={cn('px-3 py-1.5 text-sm rounded-t transition-colors', mode === 'database' ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setMode('database')}
          >
            From Database
          </button>
          <button
            className={cn('px-3 py-1.5 text-sm rounded-t transition-colors', mode === 'custom' ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => setMode('custom')}
          >
            Custom
          </button>
        </div>

        {mode === 'custom' ? (
          <div className="flex flex-col gap-3 pt-1">
            <Label htmlFor="chord-custom-name" className="text-sm">Chord name</Label>
            <Input
              id="chord-custom-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSave() }
                if (e.key === 'Escape') { e.preventDefault(); onClose() }
              }}
              autoFocus
              placeholder="e.g. Am7, G/B, Cadd9…"
            />
            <p className="text-xs text-muted-foreground">Custom chords only add a label — fret population is not available.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            {/* Root selector */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Root</Label>
              <div className="flex flex-wrap gap-1">
                {ROOT_NOTES.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setSelectedRoot(r); setSelectedVoicingIndex(0) }}
                    className={cn(
                      'px-2 py-1 text-xs rounded border transition-colors hover:bg-accent',
                      selectedRoot === r && 'border-primary bg-accent font-semibold',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Type selector */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <div className="flex flex-wrap gap-1">
                {CHORD_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSelectedType(t); setSelectedVoicingIndex(0) }}
                    className={cn(
                      'px-2 py-1 text-xs rounded border transition-colors hover:bg-accent',
                      selectedType === t && 'border-primary bg-accent font-semibold',
                    )}
                  >
                    {CHORD_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Voicings */}
            {voicings.length > 0 ? (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Voicing</Label>
                <div className="flex flex-wrap gap-1">
                  {voicings.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedVoicingIndex(i)}
                      className={cn(
                        'px-2 py-1 text-xs rounded border font-mono transition-colors hover:bg-accent',
                        selectedVoicingIndex === i && 'border-primary bg-accent font-semibold',
                      )}
                    >
                      {fretSummary(v.frets, stringCount)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No voicings found for this chord.</p>
            )}

            {/* Fret preview */}
            {selectedVoicing && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Frets (low → high)</Label>
                <div className="flex gap-1 font-mono text-xs">
                  {Array.from({ length: stringCount }, (_, i) => {
                    const f = selectedVoicing.frets[i] ?? -1
                    return (
                      <span key={i} className={cn('px-2 py-1 rounded border text-center min-w-[28px]', f < 0 ? 'text-muted-foreground' : '')}>
                        {f < 0 ? 'x' : f}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Populate checkbox */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={populateFrets}
                onChange={(e) => setPopulateFrets(e.target.checked)}
                className="rounded"
              />
              Populate fret numbers on this beat
            </label>
          </div>
        )}

        <DialogFooter className="flex gap-2 pt-2">
          {currentChord && (
            <Button variant="destructive" size="sm" onClick={() => onSave(null, false)}>
              Clear Chord
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={mode === 'database' ? !buildChordFromDatabase() : !customName.trim()}
          >
            Set Chord
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
