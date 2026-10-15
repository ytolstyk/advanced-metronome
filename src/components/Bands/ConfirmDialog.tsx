import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Extra controls rendered between the description and the buttons (e.g. a checkbox). */
  children?: ReactNode;
  onConfirm: () => Promise<void>;
  /** Runs after every attempt, success or failure (reload the page so it never shows stale data). */
  onSettled?: () => void;
}

/** Radix confirm dialog that shows a failure inline instead of closing silently. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  children,
  onConfirm,
  onSettled,
}: ConfirmDialogProps) {
  const { run, busy, error, clearError } = useAsyncAction();

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) clearError();
    onOpenChange(next);
  };

  const confirm = async () => {
    const ok = await run(onConfirm);
    onSettled?.();
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
