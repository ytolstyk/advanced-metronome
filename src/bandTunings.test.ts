import { describe, expect, it } from 'vitest';
import { BAND_LIMITS } from './bandTypes';
import { DEFAULT_TUNING, isPresetTuning, TUNING_PRESETS, tuningOrDefault } from './bandTunings';

describe('TUNING_PRESETS', () => {
  it('has no duplicates and no blank entries', () => {
    expect(new Set(TUNING_PRESETS).size).toBe(TUNING_PRESETS.length);
    for (const preset of TUNING_PRESETS) expect(preset.trim()).toBe(preset);
    for (const preset of TUNING_PRESETS) expect(preset).not.toBe('');
  });

  it('every preset fits the tuning length limit (so choosing one is always accepted)', () => {
    for (const preset of TUNING_PRESETS) expect(preset.length).toBeLessThanOrEqual(BAND_LIMITS.tuningMax);
  });

  it('includes the common tunings', () => {
    for (const name of ['E Standard', 'Eb Standard', 'D Standard', 'Drop D', 'DADGAD', 'Open G']) {
      expect(TUNING_PRESETS).toContain(name);
    }
  });
});

describe('DEFAULT_TUNING', () => {
  it('is E Standard and the first preset', () => {
    expect(DEFAULT_TUNING).toBe('E Standard');
    expect(TUNING_PRESETS[0]).toBe(DEFAULT_TUNING);
  });
});

describe('isPresetTuning', () => {
  it('is true for every preset', () => {
    for (const preset of TUNING_PRESETS) expect(isPresetTuning(preset)).toBe(true);
  });

  it('is false for custom text, blank, and near-misses (exact, case-sensitive match)', () => {
    for (const value of ['', ' ', 'D G D G B D', 'drop d', 'Drop D ', ' Drop D', 'E Standard.', 'Custom…']) {
      expect(isPresetTuning(value)).toBe(false);
    }
  });
});

describe('tuningOrDefault', () => {
  it('falls back to E Standard for null, undefined and the empty string', () => {
    expect(tuningOrDefault(null)).toBe('E Standard');
    expect(tuningOrDefault(undefined)).toBe('E Standard');
    expect(tuningOrDefault('')).toBe('E Standard');
  });

  it('returns a stored value untouched', () => {
    expect(tuningOrDefault('Drop D')).toBe('Drop D');
    expect(tuningOrDefault('D G D G B D')).toBe('D G D G B D');
  });
});
