import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() ensures the mock refs are stable before vi.mock() hoisting runs.
const { mockSuggestQuery, mockDetectQuery } = vi.hoisted(() => {
  const mockSuggestQuery = vi.fn();
  const mockDetectQuery = vi.fn();
  return { mockSuggestQuery, mockDetectQuery };
});

vi.mock('aws-amplify/data', () => ({
  generateClient: vi.fn(() => ({
    queries: {
      suggestChordProgressions: mockSuggestQuery,
      detectChordProgression: mockDetectQuery,
    },
  })),
}));

vi.mock('./authUtils', () => ({
  isAuthenticated: vi.fn(),
}));

import {
  suggestChordProgressions,
  detectChordProgression,
  SUGGESTION_COUNT,
} from './aiApi';
import { YOUTUBE_URL_RE, YOUTUBE_VIDEO_ID_RE } from '../utils/youtubeUrl';
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
  mockDetectQuery.mockResolvedValue({ data: null, errors: undefined });
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

// ─────────────────────────────────────────────────────────────────────────────
// YOUTUBE_URL_RE — strict regex (clean watch URL, no extra params)
// ─────────────────────────────────────────────────────────────────────────────

describe('YOUTUBE_URL_RE — strict validation', () => {
  it('matches a standard https watch URL with www', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/watch?v=dQw4w9WgXcY')).toBe(true);
  });

  it('matches a standard http watch URL without www', () => {
    expect(YOUTUBE_URL_RE.test('http://youtube.com/watch?v=dQw4w9WgXcY')).toBe(true);
  });

  it('matches a video ID that contains hyphens and underscores', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/watch?v=abc-123_XYZ')).toBe(true);
  });

  it('does NOT match a URL with a timestamp param (?v=...&t=60)', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/watch?v=dQw4w9WgXcY&t=60')).toBe(false);
  });

  it('does NOT match a URL with a playlist param', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/watch?v=dQw4w9WgXcY&list=PLxxx')).toBe(false);
  });

  it('does NOT match a short link (youtu.be)', () => {
    expect(YOUTUBE_URL_RE.test('https://youtu.be/dQw4w9WgXcY')).toBe(false);
  });

  it('does NOT match a YouTube Shorts URL', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/shorts/dQw4w9WgXcY')).toBe(false);
  });

  it('does NOT match an empty string', () => {
    expect(YOUTUBE_URL_RE.test('')).toBe(false);
  });

  it('does NOT match a non-YouTube URL', () => {
    expect(YOUTUBE_URL_RE.test('https://vimeo.com/watch?v=123')).toBe(false);
  });

  it('does NOT match a URL missing the v= parameter', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/watch')).toBe(false);
  });

  it('does NOT match when ?t= param appears before v=', () => {
    expect(YOUTUBE_URL_RE.test('https://www.youtube.com/watch?t=60&v=dQw4w9WgXcY')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// YOUTUBE_VIDEO_ID_RE — permissive regex (extracts video ID from any YT URL)
// ─────────────────────────────────────────────────────────────────────────────

describe('YOUTUBE_VIDEO_ID_RE — permissive ID extraction', () => {
  function extractId(url: string): string | null {
    const match = YOUTUBE_VIDEO_ID_RE.exec(url);
    return match ? match[1] : null;
  }

  it('extracts video ID from a standard watch URL', () => {
    expect(extractId('https://www.youtube.com/watch?v=dQw4w9WgXcY')).toBe('dQw4w9WgXcY');
  });

  it('extracts video ID from a timestamped watch URL', () => {
    expect(extractId('https://www.youtube.com/watch?v=dQw4w9WgXcY&t=60')).toBe('dQw4w9WgXcY');
  });

  it('extracts video ID from a short link (youtu.be)', () => {
    expect(extractId('https://youtu.be/dQw4w9WgXcY')).toBe('dQw4w9WgXcY');
  });

  it('extracts video ID from a playlist URL with v= param', () => {
    expect(extractId('https://www.youtube.com/watch?list=PLxxx&v=dQw4w9WgXcY')).toBe('dQw4w9WgXcY');
  });

  it('extracts video ID from a URL with t= before v=', () => {
    expect(extractId('https://www.youtube.com/watch?t=60&v=dQw4w9WgXcY')).toBe('dQw4w9WgXcY');
  });

  it('returns null for a YouTube Shorts URL (no v= param, not youtu.be)', () => {
    expect(extractId('https://www.youtube.com/shorts/dQw4w9WgXcY')).toBeNull();
  });

  it('returns null for a non-YouTube URL', () => {
    expect(extractId('https://vimeo.com/watch?v=123')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractId('')).toBeNull();
  });

  it('extracts hyphenated video IDs correctly', () => {
    expect(extractId('https://www.youtube.com/watch?v=abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('extracts from youtu.be short link without extra params', () => {
    expect(extractId('https://youtu.be/xyzABC')).toBe('xyzABC');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectChordProgression
// ─────────────────────────────────────────────────────────────────────────────

const VALID_WATCH_URL = 'https://www.youtube.com/watch?v=testVideoId';

function makeChordResponse(overrides?: {
  status?: string;
  detectedBpm?: number;
  detectedKey?: string;
  chords?: unknown[];
}): string {
  return JSON.stringify({
    status: 'ok',
    detectedBpm: 120,
    detectedKey: 'C major',
    chords: [
      { root: 'C', type: 'major' },
      { root: 'G', type: 'major' },
    ],
    ...overrides,
  });
}

describe('detectChordProgression — auth guard', () => {
  it('throws when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'Sign in to use chord detection.',
    );
  });

  it('does not call Amplify when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow();
    expect(mockDetectQuery).not.toHaveBeenCalled();
  });
});

describe('detectChordProgression — URL validation', () => {
  it('throws for a YouTube Shorts URL', async () => {
    await expect(
      detectChordProgression('https://www.youtube.com/shorts/abc123', 0, 20),
    ).rejects.toThrow('YouTube Shorts links are not supported');
  });

  it('throws for a URL that has no recognisable video ID', async () => {
    await expect(
      detectChordProgression('https://vimeo.com/watch?v=12345', 0, 20),
    ).rejects.toThrow('Please enter a valid YouTube URL');
  });

  it('accepts a timestamped URL and normalises it to a clean watch URL', async () => {
    const timestampedUrl = 'https://www.youtube.com/watch?v=testVideoId&t=60';
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse(),
      errors: undefined,
    });

    await detectChordProgression(timestampedUrl, 0, 20);

    expect(mockDetectQuery).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.youtube.com/watch?v=testVideoId' }),
    );
  });

  it('accepts a short link (youtu.be) and normalises it to a clean watch URL', async () => {
    const shortUrl = 'https://youtu.be/shortLinkId';
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse(),
      errors: undefined,
    });

    await detectChordProgression(shortUrl, 0, 20);

    expect(mockDetectQuery).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.youtube.com/watch?v=shortLinkId' }),
    );
  });
});

describe('detectChordProgression — Amplify error handling', () => {
  it('throws when Amplify returns a non-empty errors array', async () => {
    mockDetectQuery.mockResolvedValue({ data: null, errors: [{ message: 'Lambda error' }] });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'Analysis failed — please try again.',
    );
  });

  it('throws when data is null with no errors', async () => {
    mockDetectQuery.mockResolvedValue({ data: null, errors: undefined });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'No response from analysis service.',
    );
  });

  it('throws when data is not valid JSON', async () => {
    mockDetectQuery.mockResolvedValue({ data: 'not json {{', errors: undefined });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'Analysis failed — please try again.',
    );
  });
});

describe('detectChordProgression — non-ok status codes', () => {
  it('throws the no_chords message for status "no_chords"', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ status: 'no_chords' }),
      errors: undefined,
    });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'No chords detected in this section',
    );
  });

  it('throws the video_unavailable message for status "video_unavailable"', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ status: 'video_unavailable' }),
      errors: undefined,
    });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'Could not access this video',
    );
  });

  it('throws the generic error message for status "error"', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ status: 'error' }),
      errors: undefined,
    });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'Analysis failed — please try again.',
    );
  });

  it('throws the generic error message for an unrecognised status', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ status: 'unknown_status' }),
      errors: undefined,
    });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'Analysis failed — please try again.',
    );
  });
});

describe('detectChordProgression — chord validation', () => {
  it('drops chords with an invalid root', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({
        chords: [{ root: 'INVALID', type: 'major' }, { root: 'G', type: 'major' }],
      }),
      errors: undefined,
    });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.chords).toHaveLength(1);
    expect(result.chords[0]).toMatchObject({ root: 'G', type: 'major' });
  });

  it('drops chords with an invalid type', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({
        chords: [{ root: 'C', type: 'BOGUS' }, { root: 'A', type: 'minor' }],
      }),
      errors: undefined,
    });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.chords).toHaveLength(1);
    expect(result.chords[0]).toMatchObject({ root: 'A', type: 'minor' });
  });

  it('throws when all chords are invalid (nothing survives validation)', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ chords: [{ root: 'XX', type: 'fake' }] }),
      errors: undefined,
    });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'No recognizable chords',
    );
  });

  it('throws when chords array is empty', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ chords: [] }),
      errors: undefined,
    });

    await expect(detectChordProgression(VALID_WATCH_URL, 0, 20)).rejects.toThrow(
      'No recognizable chords',
    );
  });

  it('returns all valid chords without deduplication (dedup is a page-layer concern)', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({
        chords: [
          { root: 'C', type: 'major' },
          { root: 'C', type: 'major' },
          { root: 'G', type: 'major' },
        ],
      }),
      errors: undefined,
    });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    // API returns raw chords without dedup — caller is responsible for dedup
    expect(result.chords).toHaveLength(3);
  });

  it('returns more than 8 chords without truncation (slot-mapping is a page-layer concern)', async () => {
    const manyChords = [
      { root: 'C', type: 'major' }, { root: 'G', type: 'major' },
      { root: 'A', type: 'minor' }, { root: 'F', type: 'major' },
      { root: 'D', type: 'minor' }, { root: 'E', type: 'minor' },
      { root: 'B', type: 'minor' }, { root: 'C#', type: 'major' },
      { root: 'D#', type: 'minor' }, { root: 'G#', type: 'major' },
    ];
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ chords: manyChords }),
      errors: undefined,
    });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.chords).toHaveLength(10);
  });
});

describe('detectChordProgression — happy path', () => {
  it('returns chords, detectedBpm, and key fields on success', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({ detectedBpm: 140, detectedKey: 'G major' }),
      errors: undefined,
    });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.detectedBpm).toBe(140);
    expect(result.detectedKeyRoot).toBe('G');
    expect(result.detectedKeyMode).toBe('major');
  });

  it('returns chords in order matching the server response', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse({
        chords: [{ root: 'C', type: 'major' }, { root: 'G', type: '7' }],
      }),
      errors: undefined,
    });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.chords[0]).toMatchObject({ root: 'C', type: 'major' });
    expect(result.chords[1]).toMatchObject({ root: 'G', type: '7' });
    expect(result.chords).toHaveLength(2);
  });

  it('passes startSec and endSec to the Amplify query', async () => {
    mockDetectQuery.mockResolvedValue({
      data: makeChordResponse(),
      errors: undefined,
    });

    await detectChordProgression(VALID_WATCH_URL, 10, 30);

    expect(mockDetectQuery).toHaveBeenCalledWith(
      expect.objectContaining({ startSec: 10, endSec: 30 }),
    );
  });

  it('returns detectedBpm as 0 when detectedBpm is missing from response', async () => {
    const rawWithoutBpm = JSON.stringify({
      status: 'ok',
      detectedKey: 'A minor',
      chords: [{ root: 'A', type: 'minor' }],
    });
    mockDetectQuery.mockResolvedValue({ data: rawWithoutBpm, errors: undefined });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.detectedBpm).toBe(0);
  });

  it('returns empty detectedKeyRoot/detectedKeyMode when detectedKey is missing from response', async () => {
    const rawWithoutKey = JSON.stringify({
      status: 'ok',
      detectedBpm: 100,
      chords: [{ root: 'A', type: 'minor' }],
    });
    mockDetectQuery.mockResolvedValue({ data: rawWithoutKey, errors: undefined });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.detectedKeyRoot).toBe('');
    expect(result.detectedKeyMode).toBe('');
  });

  it('rejects an invalid detectedKey from the Lambda (e.g., bad root)', async () => {
    const rawBadKey = JSON.stringify({
      status: 'ok',
      detectedBpm: 100,
      detectedKey: 'BADROOT major',
      chords: [{ root: 'A', type: 'minor' }],
    });
    mockDetectQuery.mockResolvedValue({ data: rawBadKey, errors: undefined });

    const result = await detectChordProgression(VALID_WATCH_URL, 0, 20);

    expect(result.detectedKeyRoot).toBe('');
    expect(result.detectedKeyMode).toBe('');
  });
});
