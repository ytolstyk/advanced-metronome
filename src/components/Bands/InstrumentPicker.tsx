import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { INSTRUMENT_OPTIONS, isInstrumentKey, type InstrumentKey } from '../../bandInstruments';
import { INSTRUMENT_ICONS } from './instrumentIcons';

interface InstrumentPickerProps {
  labelledBy: string;
  value: readonly InstrumentKey[];
  onChange: (next: InstrumentKey[]) => void;
}

/** Big tap targets, several can be on at once (one tab stop; arrow keys step through them in order). */
export function InstrumentPicker({ labelledBy, value, onChange }: InstrumentPickerProps) {
  return (
    <ToggleGroup
      type="multiple"
      aria-labelledby={labelledBy}
      value={[...value]}
      // `isInstrumentKey` narrows the Radix `string[]` to the key type.
      onValueChange={(next) => onChange(next.filter(isInstrumentKey))}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {INSTRUMENT_OPTIONS.map(({ key, label }) => {
        const Icon = INSTRUMENT_ICONS[key];
        return (
          <ToggleGroupItem
            key={key}
            value={key}
            variant="outline"
            className={cn(
              // Fixed height with room for a two-line label ('Winds & brass' wraps in a narrow cell), so every tile matches.
              'h-24 flex-col gap-1.5 whitespace-normal px-2 py-2 text-center text-sm leading-tight [&_svg]:size-7',
              'data-[state=on]:border-primary data-[state=on]:bg-primary/15 data-[state=on]:text-foreground',
            )}
          >
            <Icon aria-hidden />
            {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
