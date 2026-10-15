import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dismissBand } from '../../api/bandsApi';
import { bandPath } from '../../bandRoutes';
import type { MyBandEntry } from '../../bandTypes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { InlineAlert } from './InlineAlert';

interface BandCardProps {
  entry: MyBandEntry;
  onDismissed: () => void;
}

export function BandCard({ entry, onDismissed }: BandCardProps) {
  const { band, status, isOwner } = entry;
  const { run, busy, error } = useAsyncAction();

  if (status === 'removed') {
    const dismiss = async () => {
      if (await run(() => dismissBand(band.id))) onDismissed();
    };
    return (
      <li className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="font-medium text-foreground">{band.name}</p>
        <p className="mt-1 text-sm text-red-300">You were removed from this band.</p>
        {error && <InlineAlert tone="error" className="mt-2">{error}</InlineAlert>}
        <Button variant="outline" size="sm" className="mt-3" onClick={dismiss} disabled={busy}>
          {busy ? 'Dismissing…' : 'Dismiss'}
        </Button>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={bandPath(band.id)}
        className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-foreground no-underline transition-colors hover:bg-accent"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{band.name}</span>
          <span className="block text-xs text-muted-foreground">{isOwner ? 'Owner' : 'Member'}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
