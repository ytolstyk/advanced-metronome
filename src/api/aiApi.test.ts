import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() ensures the mock ref is stable before vi.mock() hoisting runs.
const { mockSuggestQuery } = vi.hoisted(() => {
  const mockSuggestQuery = vi.fn();
  return { mockSuggestQuery };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    queries: {
      suggestChordProgressions: mockSuggestQuery,
    },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

import { suggestChordProgressions, SUGGESTION_COUNT } from './aiApi';
import { isAuthenticated } from './authUtils';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRawProgression(root = 'C', type = 'major', description = 'A test progression') {
  return {
    chords: [{ root, type }],
    description,
  };
}

function makeRawResponse(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeRawProgression('C', 'major', `Progression ${i + 1}`),
  );
}

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthenticated).mockResolvedValue(true);
  mockSuggestQuery.mockResolvedValue({ data: null, errors: undefined });
});

// ── Auth guard ─────────────────────────────────────────────────────────────

describe('suggestChordProgressions — auth guard', () => {
  it('throws when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    await expect(suggestChordProgressions('happy jazz')).rejects.toThrow(
      'AI suggestions are unavailable.',
    );
  });

  it('does not call the Amplify query when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    await expect(suggestChordProgressions('test')).rejects.toThrow();
    expect(mockSuggestQuery).not.toHaveBeenCalled();
  });
});

// ── Prompt validation ──────────────────────────────────────────────────────

describe('suggestChordProgressions — prompt validation', () => {
  it('throws when prompt is exactly MAX_PROMPT_LENGTH + 1 characters', async () => {
    const overLong = 'a'.repeat(501);

    await expect(suggestChordProgressions(overLong)).rejects.toThrow(
      'Prompt must be 500 characters or fewer.',
    );
  });

  it('throws when prompt is significantly longer than the limit', async () => {
    const overLong = 'x'.repeat(1000);

    await expect(suggestChordProgressions(overLong)).rejects.toThrow(
      'Prompt must be 500 characters or fewer.',
    );
  });

  it('does not throw for a prompt of exactly MAX_PROMPT_LENGTH characters', async () => {
    const atLimit = 'a'.repeat(500);
    const progressions = makeRawResponse(1);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(progressions), errors: undefined });

    await expect(suggestChordProgressions(atLimit)).resolves.toBeDefined();
  });

  it('does not throw for a prompt shorter than MAX_PROMPT_LENGTH', async () => {
    const progressions = makeRawResponse(1);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(progressions), errors: undefined });

    await expect(suggestChordProgressions('short prompt')).resolves.toBeDefined();
  });
});

// ── Amplify error handling ─────────────────────────────────────────────────

describe('suggestChordProgressions — Amplify error handling', () => {
  it('throws when Amplify returns a non-empty errors array', async () => {
    mockSuggestQuery.mockResolvedValue({
      data: null,
      errors: [{ message: 'Lambda error' }],
    });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'AI suggestions are unavailable.',
    );
  });

  it('throws when Amplify returns multiple errors', async () => {
    mockSuggestQuery.mockResolvedValue({
      data: null,
      errors: [{ message: 'err1' }, { message: 'err2' }],
    });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'AI suggestions are unavailable.',
    );
  });

  it('throws when data is null and errors is undefined', async () => {
    mockSuggestQuery.mockResolvedValue({ data: null, errors: undefined });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'No progressions returned — try rephrasing your prompt.',
    );
  });

  it('throws when data is an empty string', async () => {
    mockSuggestQuery.mockResolvedValue({ data: '', errors: undefined });

    // Empty string is falsy — treated the same as null
    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'No progressions returned — try rephrasing your prompt.',
    );
  });
});

// ── Parsed JSON validation ─────────────────────────────────────────────────

describe('suggestChordProgressions — parsed JSON validation', () => {
  it('throws when data is a JSON empty array', async () => {
    mockSuggestQuery.mockResolvedValue({ data: '[]', errors: undefined });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'No progressions returned — try rephrasing your prompt.',
    );
  });

  it('throws when data is valid JSON but not an array', async () => {
    mockSuggestQuery.mockResolvedValue({
      data: JSON.stringify({ chords: [], description: 'not an array' }),
      errors: undefined,
    });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'No progressions returned — try rephrasing your prompt.',
    );
  });

  it('throws when data is not valid JSON (parse error)', async () => {
    mockSuggestQuery.mockResolvedValue({ data: 'this is not json{{{', errors: undefined });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'No progressions returned — try rephrasing your prompt.',
    );
  });

  it('drops a progression that has no chords field', async () => {
    const raw = [
      { description: 'missing chords field' },
      makeRawProgression('C', 'major', 'Valid one'),
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Valid one');
  });

  it('drops a progression that has no description field', async () => {
    const raw = [
      { chords: [{ root: 'C', type: 'major' }] },
      makeRawProgression('A', 'minor', 'Valid one'),
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Valid one');
  });

  it('drops a chord with an invalid root', async () => {
    const raw = [
      {
        chords: [
          { root: 'X', type: 'major' },
          { root: 'C', type: 'major' },
        ],
        description: 'Has invalid root',
      },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
    expect(result[0].chords).toHaveLength(1);
    expect(result[0].chords[0]).toEqual({ root: 'C', type: 'major' });
  });

  it('drops a chord with an invalid type', async () => {
    const raw = [
      {
        chords: [
          { root: 'C', type: 'unknown' },
          { root: 'G', type: 'major' },
        ],
        description: 'Has invalid type',
      },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
    expect(result[0].chords).toHaveLength(1);
    expect(result[0].chords[0]).toEqual({ root: 'G', type: 'major' });
  });

  it('drops a progression whose entire chords array fails validation', async () => {
    const raw = [
      {
        chords: [
          { root: 'X', type: 'fake' },
          { root: 'Z', type: 'bogus' },
        ],
        description: 'All chords are invalid',
      },
      makeRawProgression('E', 'minor', 'Valid one'),
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Valid one');
  });

  it('throws when all progressions are dropped after validation', async () => {
    const raw = [
      { description: 'no chords field at all' },
      { chords: [{ root: 'Z', type: 'garbage' }], description: 'all chords invalid' },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    await expect(suggestChordProgressions('test')).rejects.toThrow(
      'No progressions returned — try rephrasing your prompt.',
    );
  });

  it('keeps only valid chords in a mixed valid/invalid chords array', async () => {
    const raw = [
      {
        chords: [
          { root: 'C', type: 'major' },
          { root: 'INVALID', type: 'major' },
          { root: 'A', type: 'NOT_A_TYPE' },
          { root: 'G', type: '7' },
        ],
        description: 'Mixed bag',
      },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
    expect(result[0].chords).toEqual([
      { root: 'C', type: 'major' },
      { root: 'G', type: '7' },
    ]);
  });

  it('accepts all valid ROOT_NOTES', async () => {
    const validRoots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const raw = [
      {
        chords: validRoots.map((root) => ({ root, type: 'major' })),
        description: 'All roots',
      },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result[0].chords).toHaveLength(validRoots.length);
  });

  it('accepts all valid CHORD_TYPES', async () => {
    const validTypes = [
      'major', 'minor', 'sus2', 'sus4', 'aug', 'dim', 'dim7', 'm7b5',
      'add9', 'add4', 'add7', 'maj7', 'm7', '7', '6', 'm6', '9', 'maj9', '5',
    ];
    const raw = [
      {
        chords: validTypes.map((type) => ({ root: 'C', type })),
        description: 'All types',
      },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result[0].chords).toHaveLength(validTypes.length);
  });
});

// ── Happy path ─────────────────────────────────────────────────────────────

describe('suggestChordProgressions — happy path', () => {
  it('returns parsed progressions when data is valid JSON', async () => {
    const raw = [makeRawProgression('G', 'minor', 'Melancholic in G minor')];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('melancholic');

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Melancholic in G minor');
    expect(result[0].chords).toEqual([{ root: 'G', type: 'minor' }]);
  });

  it('passes the prompt to the Amplify query', async () => {
    const progressions = makeRawResponse(1);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(progressions), errors: undefined });

    await suggestChordProgressions('upbeat summer vibes');

    expect(mockSuggestQuery).toHaveBeenCalledWith({ prompt: 'upbeat summer vibes' });
  });

  it(`slices results to at most SUGGESTION_COUNT (${SUGGESTION_COUNT}) items`, async () => {
    const raw = makeRawResponse(SUGGESTION_COUNT + 2);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(SUGGESTION_COUNT);
  });

  it('returns all items when response has fewer than SUGGESTION_COUNT', async () => {
    const raw = makeRawResponse(1);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(1);
  });

  it('preserves chords array on each returned progression', async () => {
    const raw = [
      {
        chords: [
          { root: 'C', type: 'major' },
          { root: 'A', type: 'minor' },
          { root: 'F', type: 'major' },
          { root: 'G', type: 'major' },
        ],
        description: 'Classic I-vi-IV-V',
      },
    ];
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('classic');

    expect(result[0].chords).toHaveLength(4);
    expect(result[0].chords[1]).toEqual({ root: 'A', type: 'minor' });
  });

  it('returns exactly SUGGESTION_COUNT items when response has exactly that many', async () => {
    const raw = makeRawResponse(SUGGESTION_COUNT);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result).toHaveLength(SUGGESTION_COUNT);
  });

  it('takes the first SUGGESTION_COUNT progressions in order', async () => {
    const raw = makeRawResponse(SUGGESTION_COUNT + 1);
    mockSuggestQuery.mockResolvedValue({ data: JSON.stringify(raw), errors: undefined });

    const result = await suggestChordProgressions('test');

    expect(result[0].description).toBe('Progression 1');
    expect(result[SUGGESTION_COUNT - 1].description).toBe(`Progression ${SUGGESTION_COUNT}`);
  });
});
