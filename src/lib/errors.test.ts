import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });
  it('falls back for empty messages and non-errors', () => {
    expect(errorMessage(new Error(''))).toBe('Something went wrong');
    expect(errorMessage('a string')).toBe('Something went wrong');
    expect(errorMessage(null)).toBe('Something went wrong');
    expect(errorMessage({ message: 'not an Error instance' }, 'custom')).toBe('custom');
  });
});
