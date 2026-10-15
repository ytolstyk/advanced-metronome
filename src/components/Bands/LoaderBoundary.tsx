import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { LoaderState } from '../../hooks/useLoader';
import { InlineAlert } from './InlineAlert';

interface LoaderBoundaryProps<T> {
  state: LoaderState<T>;
  refreshing: boolean;
  reload: () => Promise<void>;
  /** Shown while the first load runs, e.g. "Loading band…". */
  loadingText: string;
  /** Prefix of the failure message, e.g. "Couldn’t load this band". */
  errorPrefix: string;
  /** Message from a failed background refresh while older data is still on screen. */
  refreshError?: string | null;
  children: (data: T) => ReactNode;
}

/** The shared loading / failed-first-load (with retry) / ready switch used by every Bands page. */
export function LoaderBoundary<T>({
  state,
  refreshing,
  reload,
  loadingText,
  errorPrefix,
  refreshError,
  children,
}: LoaderBoundaryProps<T>) {
  if (state.status === 'loading') return <p className="py-8 text-center text-sm text-muted-foreground">{loadingText}</p>;
  if (state.status === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
        <p>
          {errorPrefix}: {state.message}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void reload()} disabled={refreshing}>
          {refreshing ? 'Retrying…' : 'Try again'}
        </Button>
      </div>
    );
  }
  return (
    <>
      {refreshError && <InlineAlert tone="warning" className="mb-4">Couldn’t refresh, so this may be out of date: {refreshError}</InlineAlert>}
      {children(state.data)}
    </>
  );
}
