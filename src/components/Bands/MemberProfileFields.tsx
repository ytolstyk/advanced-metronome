import { useId } from 'react';
import type { InstrumentKey } from '../../bandInstruments';
import { DisplayNameField } from './DisplayNameField';
import { InstrumentPicker } from './InstrumentPicker';

interface MemberProfileFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  instruments: readonly InstrumentKey[];
  onInstrumentsChange: (next: InstrumentKey[]) => void;
  autoFocus?: boolean;
}

/** What a member says about themselves in a band: a name and the instruments they play. */
export function MemberProfileFields({
  name,
  onNameChange,
  instruments,
  onInstrumentsChange,
  autoFocus,
}: MemberProfileFieldsProps) {
  const nameId = useId();
  const instrumentsId = useId();
  return (
    <>
      <DisplayNameField id={nameId} value={name} onChange={onNameChange} autoFocus={autoFocus} />
      <div className="grid gap-1.5">
        <span id={instrumentsId} className="text-sm font-medium leading-none">What do you play? (optional)</span>
        <InstrumentPicker labelledBy={instrumentsId} value={instruments} onChange={onInstrumentsChange} />
        <p className="text-xs text-muted-foreground">Pick as many as you like. Anyone with this band’s link can see them.</p>
      </div>
    </>
  );
}
