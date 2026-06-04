import { useState } from 'react'
import * as at from '@coderline/alphatab'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { TabTrack } from '../../tabEditorTypes'
import { toAlphaTabScore } from '../../tabEditor/toAlphaTabScore'

interface ExportDialogProps {
  open: boolean
  track: TabTrack
  onClose: () => void
}

function triggerDownload(bytes: Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportDialog({ open, track, onClose }: ExportDialogProps) {
  const [error, setError] = useState<string | null>(null)

  const baseName = (track.title || 'tab').replace(/[/\\:*?"<>|]/g, '_')

  function handleExportGp7() {
    setError(null)
    try {
      const score = toAlphaTabScore(track)
      const exporter = new at.exporter.Gp7Exporter()
      const bytes = exporter.export(score, new at.Settings())
      triggerDownload(bytes, `${baseName}.gp`, 'application/octet-stream')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }

  function handleExportAlphaTex() {
    setError(null)
    try {
      const score = toAlphaTabScore(track)
      const exporter = new at.exporter.AlphaTexExporter()
      const text = exporter.exportToString(score, new at.Settings())
      const bytes = new TextEncoder().encode(text)
      triggerDownload(bytes, `${baseName}.alphatex`, 'text/plain')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Export tab</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1">
            <Button variant="outline" size="sm" className="justify-start" onClick={handleExportGp7}>
              Guitar Pro 7 (.gp)
            </Button>
            <p className="text-xs text-[#888] pl-1">
              Compatible with Guitar Pro 7 and later. Best for sharing with other musicians.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <Button variant="outline" size="sm" className="justify-start" onClick={handleExportAlphaTex}>
              AlphaTex (.alphatex)
            </Button>
            <p className="text-xs text-[#888] pl-1">
              Human-readable text format for use with alphaTab-based tools.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400 mt-1">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
