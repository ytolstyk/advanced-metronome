import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PublishTabDialogProps {
  open: boolean
  isUpdate: boolean
  initialValues: { title: string; artist: string; tabAuthor: string; year: string }
  onClose: () => void
  onConfirm: (values: { title: string; artist: string; tabAuthor: string; year: string }) => Promise<void>
}

export function PublishTabDialog({ open, isUpdate, initialValues, onClose, onConfirm }: PublishTabDialogProps) {
  const [title, setTitle] = useState(initialValues.title)
  const [artist, setArtist] = useState(initialValues.artist)
  const [tabAuthor, setTabAuthor] = useState(initialValues.tabAuthor)
  const [year, setYear] = useState(initialValues.year)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [validated, setValidated] = useState(false)

  async function handleConfirm() {
    setValidated(true)
    if (!title.trim() || !artist.trim() || !tabAuthor.trim() || !year.trim()) return
    setStatus('saving')
    setErrorMsg('')
    try {
      await onConfirm({ title: title.trim(), artist: artist.trim(), tabAuthor: tabAuthor.trim(), year: year.trim() })
      setStatus('ok')
      setTimeout(() => { setStatus('idle'); onClose() }, 1200)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  const fields = [
    { id: 'pub-title', label: 'Song title', value: title, set: setTitle },
    { id: 'pub-artist', label: 'Artist / band', value: artist, set: setArtist },
    { id: 'pub-tabauthor', label: 'Tab author', value: tabAuthor, set: setTabAuthor },
    { id: 'pub-year', label: 'Year', value: year, set: setYear },
  ] as const

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isUpdate ? 'Update published tab' : 'Publish to Tab Library'}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-[#888] -mt-1">
          {isUpdate
            ? 'Update the public version of this tab with your latest changes.'
            : 'Make this tab publicly available to all users. Anyone can view and play it.'}
        </p>
        <div className="flex flex-col gap-3 pt-1">
          {fields.map(({ id, label, value, set }) => {
            const isMissing = validated && !value.trim()
            return (
              <div key={id} className="flex flex-col gap-1">
                <Label htmlFor={id} className={isMissing ? 'text-red-400' : ''}>{label}</Label>
                <Input
                  id={id}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirm() }}
                  className={isMissing ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  autoFocus={id === 'pub-title'}
                />
                {isMissing && <span className="text-xs text-red-400">Required</span>}
              </div>
            )
          })}
          {status === 'error' && errorMsg && (
            <p className="text-xs text-red-400 break-all">{errorMsg}</p>
          )}
          <Button onClick={() => void handleConfirm()} disabled={status === 'saving'} className="mt-1">
            {status === 'saving' ? 'Publishing…'
              : status === 'ok' ? 'Published!'
              : status === 'error' ? 'Try again'
              : isUpdate ? 'Update' : 'Publish'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
