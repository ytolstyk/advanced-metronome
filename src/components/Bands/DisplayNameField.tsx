import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BAND_LIMITS } from '../../bandTypes';

interface DisplayNameFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

/** "Your name in this band": anyone holding the band's link can read it, so say so. */
export function DisplayNameField({ id, value, onChange, autoFocus }: DisplayNameFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Your name in this band</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={BAND_LIMITS.displayNameMax}
        required
        autoFocus={autoFocus}
      />
      <p className="text-xs text-muted-foreground">
        Anyone with this band’s link can see this name. Your email is never shown.
      </p>
    </div>
  );
}
