import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BeatTextDialogProps {
  open: boolean
  currentText: string | undefined
  onClose: () => void
  onSave: (text: string | null) => void
}

export function BeatTextDialog({ open, currentText, onClose, onSave }: BeatTextDialogProps) {
  const [text, setText] = useState(currentText ?? '')

  function handleSave() {
    const trimmed = text.trim()
    onSave(trimmed || null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Beat Text</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          <Label htmlFor="beat-text-input" className="text-sm">Text annotation for this beat</Label>
          <Input
            id="beat-text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleSave() }
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
            autoFocus
            placeholder="e.g. let ring, accel., etc."
          />
        </div>
        <DialogFooter className="flex gap-2 pt-2">
          {currentText && (
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
