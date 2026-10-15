import { useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';

interface TextPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  maxLength: number;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
  /** Runs after every attempt, success or failure. */
  onSettled?: () => void;
}

/** One-field dialog (create/rename set list, rename band). Mount it per target so state resets. */
export function TextPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue = '',
  maxLength,
  submitLabel,
  onSubmit,
  onSettled,
}: TextPromptDialogProps) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const { run, busy, error } = useAsyncAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => onSubmit(value));
    onSettled?.();
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>{label}</Label>
            <Input
              id={inputId}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={maxLength}
              autoFocus
            />
          </div>
          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
