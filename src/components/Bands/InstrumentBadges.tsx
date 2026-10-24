import { Fragment } from 'react';
import { instrumentOptionsFor, type InstrumentKey } from '../../bandInstruments';
import { cn } from '@/lib/utils';
import { INSTRUMENT_ICONS } from './instrumentIcons';

/** Icons only, to sit next to a name; the labels are in the tooltip and the accessible name. */
export function InstrumentIcons({
  instruments,
  className,
}: {
  instruments: readonly InstrumentKey[];
  className?: string;
}) {
  const options = instrumentOptionsFor(instruments);
  if (options.length === 0) return null;
  const labels = options.map((o) => o.label).join(', ');
  return (
    <span role="img" aria-label={`plays ${labels}`} title={labels} className={cn('inline-flex items-center gap-0.5 align-middle text-muted-foreground', className)}>
      {options.map(({ key }) => {
        const Icon = INSTRUMENT_ICONS[key];
        return <Icon key={key} size={14} aria-hidden />;
      })}
    </span>
  );
}

/** Icon and label for each instrument, inline. */
export function InstrumentLabels({ instruments }: { instruments: readonly InstrumentKey[] }) {
  return (
    <>
      {instrumentOptionsFor(instruments).map(({ key, label }, index) => {
        const Icon = INSTRUMENT_ICONS[key];
        return (
          // The separator stays outside the nowrap span so a long list can still wrap between items.
          <Fragment key={key}>
            {index > 0 && ', '}
            <span className="whitespace-nowrap">
              <Icon size={14} aria-hidden className="mr-1 inline align-text-bottom" />
              {label}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}
