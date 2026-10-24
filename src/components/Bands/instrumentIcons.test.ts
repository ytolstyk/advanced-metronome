import { describe, expect, it } from 'vitest';
import { INSTRUMENT_OPTIONS } from '../../bandInstruments';
import { INSTRUMENT_ICONS } from './instrumentIcons';

describe('INSTRUMENT_ICONS', () => {
  it('has an icon for every instrument option', () => {
    for (const { key } of INSTRUMENT_OPTIONS) expect(INSTRUMENT_ICONS[key]).toBeTruthy();
  });
});
