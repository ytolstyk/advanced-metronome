import { Button } from '@/components/ui/button';
import { instrumentOptionsFor } from '../../bandInstruments';
import type { BandView } from '../../bandTypes';
import { INSTRUMENT_ICONS } from './instrumentIcons';

interface MemberListProps {
  view: BandView;
  onRemove?: (sub: string, name: string) => void;
  /** Shown on the caller's own row. */
  onEditProfile?: () => void;
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

/** Roster with display names and instruments (never email). The owner gets a Remove action on other members. */
export function MemberList({ view, onRemove, onEditProfile }: MemberListProps) {
  const owner = view.band.owner;
  const played = new Map(view.members.map((m) => [m.owner, instrumentOptionsFor(m.instruments)]));
  return (
    <ul className="grid gap-1.5">
      {rosterRows(view).map(({ sub, name }) => {
        const instruments = played.get(sub) ?? [];
        const isSelf = sub === view.sub;
        return (
          <li key={sub} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-card px-3 py-1.5">
            <div className="min-w-0">
              <span className="block truncate text-sm text-foreground/90">
                {name}
                {sub === owner && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Owner</span>}
                {isSelf && <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-xs text-primary">You</span>}
              </span>
              {instruments.length > 0 && (
                <ul aria-label={`${name} plays`} className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {instruments.map(({ key, label }) => {
                    const Icon = INSTRUMENT_ICONS[key];
                    return (
                      <li key={key} className="inline-flex items-center gap-1.5">
                        <Icon size={20} aria-hidden />
                        {label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {onEditProfile && isSelf && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditProfile}
                aria-label={instruments.length > 0 ? 'Edit your name and instruments' : 'Add instruments to your profile'}
              >
                {instruments.length > 0 ? 'Edit' : 'Add instruments'}
              </Button>
            )}
            {onRemove && sub !== owner && (
              <Button variant="ghost" size="sm" onClick={() => onRemove(sub, name)} aria-label={`Remove ${name}`}>
                Remove
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
