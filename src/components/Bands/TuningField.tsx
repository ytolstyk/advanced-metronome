import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BAND_LIMITS } from '../../bandTypes';
import { isPresetTuning, TUNING_PRESETS } from '../../bandTunings';

/** A Select item can't have an empty value, and no preset is named this. */
const CUSTOM = '__custom__';

interface TuningFieldProps {
  id: string;
  /** A preset name, free text, or `''` (the default is used). */
  value: string;
  onChange: (tuning: string) => void;
}

/** Common tunings in a dropdown, plus "Custom…" which reveals a free-text field. */
export function TuningField({ id, value, onChange }: TuningFieldProps) {
  // Custom mode is a choice, not a function of the text: typing "Drop D" must not flip back to the preset.
  // The initial mode comes from `value`, so the parent mounts this per song (as the song dialog does).
  const [custom, setCustom] = useState(value !== '' && !isPresetTuning(value));
  const customInput = useRef<HTMLInputElement>(null);
  // Set only when Custom was just picked, so closing the list any other way returns focus to the trigger.
  const focusCustom = useRef(false);
  return (
    <div className="grid gap-2">
      <Select
        value={custom ? CUSTOM : value}
        onValueChange={(next) => {
          if (next === CUSTOM) {
            setCustom(true);
            focusCustom.current = true;
            onChange('');
          } else {
            setCustom(false);
            onChange(next);
          }
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          // Radix hands focus back to the trigger when the list closes; after picking Custom it belongs in the text field.
          onCloseAutoFocus={(e) => {
            if (!focusCustom.current) return;
            focusCustom.current = false;
            e.preventDefault();
            customInput.current?.focus();
          }}
        >
          {TUNING_PRESETS.map((tuning) => (
            <SelectItem key={tuning} value={tuning}>{tuning}</SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          ref={customInput}
          aria-label="Custom tuning"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={BAND_LIMITS.tuningMax}
          placeholder="e.g. D G D G B D"
          required
          pattern=".*\S.*"
          title="Enter a tuning"
        />
      )}
    </div>
  );
}
