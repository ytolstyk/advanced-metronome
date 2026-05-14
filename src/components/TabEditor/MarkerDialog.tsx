import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface MarkerDialogProps {
  open: boolean
  currentMarker: string | undefined
  onClose: () => void
  onSave: (marker: string | null) => void
}

export function MarkerDialog({ open, currentMarker, onClose, onSave }: MarkerDialogProps) {
  const [marker, setMarker] = useState(currentMarker ?? '')

  function handleSave() {
    const trimmed = marker.trim()
    onSave(trimmed || null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Section Marker</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          <Label htmlFor="marker-input" className="text-sm">Marker label for this measure</Label>
          <Input
            id="marker-input"
            value={marker}
            onChange={(e) => setMarker(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSave() }
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
            autoFocus
            placeholder="e.g. Intro, Verse, Chorus…"
          />
          <p className="text-xs text-muted-foreground">
            Adding a marker displays a double barline at the start of this measure.
          </p>
        </div>
        <DialogFooter className="flex gap-2 pt-2">
          {currentMarker && (
            <Button variant="destructive" size="sm" onClick={() => onSave(null)}>
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Set</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
