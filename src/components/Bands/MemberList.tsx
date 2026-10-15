import { Button } from '@/components/ui/button';
import type { BandView } from '../../bandTypes';

interface MemberListProps {
  view: BandView;
  onRemove?: (sub: string, name: string) => void;
}

/** Roster rows: the owner first (even without a Member row), then everyone else by name. */
function rosterRows(view: BandView): { sub: string; name: string }[] {
  const subs = view.members.map((m) => m.owner);
  if (view.band.owner && !subs.includes(view.band.owner)) subs.push(view.band.owner);
  return subs
    .map((sub) => ({ sub, name: view.displayNames.get(sub) ?? 'Owner' }))
    .sort(
      (a, b) =>
        Number(b.sub === view.band.owner) - Number(a.sub === view.band.owner) || a.name.localeCompare(b.name),
    );
}

/** Roster with display names (never email). The owner gets a Remove action on other members. */
export function MemberList({ view, onRemove }: MemberListProps) {
  const owner = view.band.owner;
  return (
    <ul className="grid gap-1.5">
      {rosterRows(view).map(({ sub, name }) => (
        <li key={sub} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-card px-3 py-1.5">
          <span className="min-w-0 truncate text-sm text-foreground/90">
            {name}
            {sub === owner && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Owner</span>}
            {sub === view.sub && <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">You</span>}
          </span>
          {onRemove && sub !== owner && (
            <Button variant="ghost" size="sm" onClick={() => onRemove(sub, name)} aria-label={`Remove ${name}`}>
              Remove
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
