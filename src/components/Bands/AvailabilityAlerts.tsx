import { Button } from '@/components/ui/button';
import { AVAILABILITY_LIMITS } from '../../bandTypes';
import type { SaveBlockReason } from '../../availabilityUtils';
import { InlineAlert } from './InlineAlert';

const BLOCK_TEXT: Record<SaveBlockReason, string> = {
  'newer-format': 'Your times were saved by a newer version of the app, so they can’t be edited here. Reload the page to update.',
  unavailable: 'Your times can’t be edited right now.',
  failed: 'We couldn’t read your saved times, so editing is off to avoid overwriting them. Try again in a moment.',
};

interface Props {
  /** The roster was too long to load completely. */
  rosterIncomplete: boolean;
  /** Members left out by the read limit. */
  excluded: number;
  /** Names of members whose rows couldn't be read. */
  unreadableNames: string[];
  blocked: SaveBlockReason | null;
  willReplaceUnreadable: boolean;
  replacedUnreadable: boolean;
  onReload: () => void;
}

/** Everything that can be wrong or incomplete about the data on screen, in one place. */
export function AvailabilityAlerts({
  rosterIncomplete,
  excluded,
  unreadableNames,
  blocked,
  willReplaceUnreadable,
  replacedUnreadable,
  onReload,
}: Props) {
  return (
    <>
      {rosterIncomplete && (
        <InlineAlert tone="warning" className="mb-3">
          Some members may be missing from this list (it was too long to load completely).
        </InlineAlert>
      )}
      {excluded > 0 && (
        <InlineAlert tone="warning" className="mb-3">
          {excluded} more {excluded === 1 ? 'member isn’t' : 'members aren’t'} shown (up to {AVAILABILITY_LIMITS.maxParticipants}{' '}
          are read), so the best times may be incomplete.
        </InlineAlert>
      )}
      {unreadableNames.length > 0 && (
        <InlineAlert tone="warning" className="mb-3">
          Couldn’t read the times of {unreadableNames.join(', ')}.{' '}
          <Button variant="link" className="h-auto min-h-11 p-0 align-baseline" onClick={onReload}>
            Try again
          </Button>
        </InlineAlert>
      )}
      {blocked && <InlineAlert tone="warning" className="mb-3">{BLOCK_TEXT[blocked]}</InlineAlert>}
      {willReplaceUnreadable && (
        <InlineAlert tone="warning" className="mb-3">Your saved times couldn’t be read. Saving will replace them.</InlineAlert>
      )}
      {replacedUnreadable && <InlineAlert tone="warning" className="mb-3">We reset your saved times.</InlineAlert>}
    </>
  );
}
