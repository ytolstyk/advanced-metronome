import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RIG_LIMITS } from '../../../rigTypes';
import type { RigGear } from '../../../rigTypes';
import { CARD_SURFACE } from '../cardStyles';

export interface MemberGear {
  owner: string;
  name: string;
  gear: readonly RigGear[];
}

interface GearPanelProps {
  mine: readonly RigGear[];
  /** Everyone else's gear (read-only). */
  others: readonly MemberGear[];
  /** The caller's own gear can be changed (false while their saved row can't be read or is from a newer app). */
  editable: boolean;
  onAdd: () => void;
  onEdit: (gear: RigGear) => void;
  onDelete: (gear: RigGear) => void;
  onCopy: (gear: RigGear, fromName: string) => void;
}

function GearSummary({ gear }: { gear: RigGear }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium text-foreground">{gear.name}</p>
      <p className="text-xs text-muted-foreground">
        {gear.kind} · {gear.ports.length} {gear.ports.length === 1 ? 'port' : 'ports'}
        {gear.copiedFrom ? ` · copied from ${gear.copiedFrom}` : ''}
      </p>
      {gear.specs && <p className="break-words text-xs text-muted-foreground">{gear.specs}</p>}
    </div>
  );
}

/** The band's equipment: yours (editable) and everyone else's (read-only, copy into yours to use it). */
export function GearPanel({ mine, others, editable, onAdd, onEdit, onDelete, onCopy }: GearPanelProps) {
  const atCap = mine.length >= RIG_LIMITS.gearMax;
  return (
    <section aria-labelledby="gear-heading" className="mt-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="gear-heading" className="text-lg font-semibold text-foreground">Gear</h2>
        {editable && (
          <Button className="min-h-11" onClick={onAdd} disabled={atCap}>Add gear</Button>
        )}
      </div>
      {atCap && <p className="mb-2 text-sm text-muted-foreground">You have the most gear a member can keep ({RIG_LIMITS.gearMax}).</p>}

      <h3 className="mb-1 text-sm font-semibold text-foreground">Yours</h3>
      {mine.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          You haven’t added any gear yet. Use “Add gear” and start from a preset, or copy a piece from someone else below.
        </p>
      ) : (
        <ul className="mb-4 grid gap-2">
          {mine.map((g) => (
            <li key={g.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg p-3', CARD_SURFACE)}>
              <GearSummary gear={g} />
              {editable && (
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => onEdit(g)} aria-label={`Edit ${g.name}`}>Edit</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => onDelete(g)} aria-label={`Delete ${g.name}`}>Delete</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {others.map((m) =>
        m.gear.length === 0 ? null : (
          <div key={m.owner} className="mb-4">
            <h3 className="mb-1 text-sm font-semibold text-foreground">{m.name}’s gear</h3>
            <ul className="grid gap-2">
              {m.gear.map((g) => (
                <li key={g.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg p-3', CARD_SURFACE)}>
                  <GearSummary gear={g} />
                  {editable && (
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={atCap}
                      onClick={() => onCopy(g, m.name)}
                      aria-label={`Copy ${g.name} to my gear`}
                    >
                      Copy to my gear
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
