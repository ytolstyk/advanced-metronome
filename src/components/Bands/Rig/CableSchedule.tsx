import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RIG_LIMITS } from '../../../rigTypes';
import type { CableInfo } from '../../../rigView';
import { CARD_SURFACE, FIELD_LABEL_CLASS } from '../cardStyles';

interface CableScheduleProps {
  cables: readonly CableInfo[];
  /** Rows can be selected, labelled and removed. */
  editable: boolean;
  selectedCableId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onLabel: (id: string, label: string) => void;
}

/** Every cable in words, numbered like the chips on the diagram. Also the way to reach a cable with no chip. */
export function CableSchedule({ cables, editable, selectedCableId, onSelect, onRemove, onLabel }: CableScheduleProps) {
  if (cables.length === 0) return null;
  return (
    <section aria-labelledby="cable-schedule-heading" className="mt-4">
      <h3 id="cable-schedule-heading" className="mb-2 text-sm font-semibold text-foreground">Cable schedule</h3>
      <ul className="grid gap-2 md:grid-cols-2">
        {cables.map((c) => {
          const selected = c.cable.id === selectedCableId;
          const summary = (
            <>
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-background text-[11px] font-bold text-foreground"
                style={{ borderColor: c.kind.color }}
              >
                {c.n}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{c.title}</span>
                <span className="block break-words text-xs text-muted-foreground">{c.route}</span>
                {c.kind.needsAdapter && <span className="block text-xs text-amber-400">Needs an adapter ({c.kind.label})</span>}
              </span>
            </>
          );
          return (
            <li key={c.cable.id} className={cn('rounded-lg p-3', CARD_SURFACE, selected && 'ring-2 ring-primary')}>
              {editable ? (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-start gap-3 text-left"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : c.cable.id)}
                >
                  {summary}
                </button>
              ) : (
                <div className="flex items-start gap-3">{summary}</div>
              )}
              {editable && selected && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className={cn(FIELD_LABEL_CLASS, 'min-w-40 flex-1')}>
                    Label
                    <Input
                      key={c.cable.id}
                      defaultValue={c.cable.label ?? ''}
                      maxLength={RIG_LIMITS.cableLabelMax}
                      placeholder={c.kind.label}
                      className="min-h-11"
                      onBlur={(e) => onLabel(c.cable.id, e.currentTarget.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </label>
                  <Button variant="destructive" className="min-h-11" onClick={() => onRemove(c.cable.id)}>
                    Remove cable
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
