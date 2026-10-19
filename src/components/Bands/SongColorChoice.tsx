import { Check } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SONG_COLOR_OPTIONS, songColorAriaName, songColorName, type ColorLabels } from '../../bandSongColors';
import { isSongColorKey } from '../../bandUtils';
import type { SongColorKey } from '../../bandTypes';

interface SongColorChoiceProps {
  labelledBy: string;
  value: SongColorKey | null;
  /** The band's names for its colors. */
  labels?: ColorLabels;
  /** Picking the selected color again clears it. */
  onChange: (color: SongColorKey | null) => void;
}

/** Inline color choice for a form: the palette as round swatches (one tab stop, arrow keys move), with the chosen color's name below. */
export function SongColorChoice({ labelledBy, value, labels, onChange }: SongColorChoiceProps) {
  return (
    <div className="grid gap-1.5">
      <ToggleGroup
        type="single"
        aria-labelledby={labelledBy}
        value={value ?? ''}
        onValueChange={(next) => onChange(isSongColorKey(next) ? next : null)}
        className="flex-wrap justify-start gap-2"
      >
        {SONG_COLOR_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.key}
            value={option.key}
            aria-label={songColorAriaName(option.key, labels)}
            title={songColorName(option.key, labels)}
            className="size-11 min-w-0 rounded-full border border-white/60 p-0 hover:opacity-90 data-[state=on]:bg-transparent"
            style={{ backgroundColor: option.hex }}
          >
            {value === option.key && (
              <span className="rounded-full bg-black/60 p-0.5 text-white" aria-hidden>
                <Check size={14} />
              </span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {value ? songColorName(value, labels) : 'No color'}
      </p>
    </div>
  );
}
