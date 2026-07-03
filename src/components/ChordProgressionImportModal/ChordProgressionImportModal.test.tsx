/**
 * Unit tests for ChordProgressionImportModal.
 *
 * Strategy: mock @/api/chordDetectionApi at the module level so URL validation
 * logic (via @/utils/youtubeUrl, which is real) is exercised; only stub the
 * async detectChordProgression function that talks to Amplify.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ChordDetectionResult } from '@/api/chordDetectionApi';
import type { RootNote, ChordType } from '@/data/chords';

const { mockDetectChordProgression } = vi.hoisted(() => {
  const mockDetectChordProgression = vi.fn();
  return { mockDetectChordProgression };
});

vi.mock('@/api/chordDetectionApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/chordDetectionApi')>();
  return {
    ...actual,
    detectChordProgression: mockDetectChordProgression,
  };
});

import { ChordProgressionImportModal } from './ChordProgressionImportModal';

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcY';
const SHORTS_URL = 'https://www.youtube.com/shorts/dQw4w9WgXcY';
const INVALID_URL = 'https://vimeo.com/123456';

function makeChord(root: RootNote, type: ChordType): { root: RootNote; type: ChordType } {
  return { root, type };
}

function makeResult(override?: Partial<ChordDetectionResult>): ChordDetectionResult {
  return {
    chords: [makeChord('C', 'major'), makeChord('G', 'major')],
    detectedBpm: 140,
    detectedKeyRoot: 'C',
    detectedKeyMode: 'major',
    ...override,
  };
}

interface RenderProps {
  open?: boolean;
  currentBpm?: number;
  onClose?: () => void;
  onApply?: (chords: Array<{ root: RootNote; type: ChordType }>, newBpm?: number) => void;
}

function renderModal(props: RenderProps = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onApply = props.onApply ?? vi.fn();
  return {
    onClose,
    onApply,
    ...render(
      <ChordProgressionImportModal
        open={props.open ?? true}
        currentBpm={props.currentBpm ?? 120}
        onClose={onClose}
        onApply={onApply}
      />,
    ),
  };
}

function setUrl(value: string) {
  const input = screen.getByLabelText('YouTube URL');
  fireEvent.change(input, { target: { value } });
}

async function clickDetectChords() {
  const btn = screen.getByRole('button', { name: 'Detect Chords' });
  fireEvent.click(btn);
}

// ── beforeEach ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Idle state
// ─────────────────────────────────────────────────────────────────────────────

describe('ChordProgressionImportModal — idle state', () => {
  it('renders the YouTube URL input', () => {
    renderModal();
    expect(screen.getByLabelText('YouTube URL')).toBeInTheDocument();
  });

  it('renders the Start time input', () => {
    renderModal();
    expect(screen.getByLabelText('Start (mm:ss)')).toBeInTheDocument();
  });

  it('renders the End time input', () => {
    renderModal();
    expect(screen.getByLabelText('End (mm:ss)')).toBeInTheDocument();
  });

  it('renders the Detect Chords button', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Detect Chords' })).toBeInTheDocument();
  });

  it('Detect Chords button is disabled when URL is empty', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Detect Chords' })).toBeDisabled();
  });

  it('Detect Chords button becomes enabled after a valid URL is typed', () => {
    renderModal();
    setUrl(VALID_URL);
    expect(screen.getByRole('button', { name: 'Detect Chords' })).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL validation
// ─────────────────────────────────────────────────────────────────────────────

describe('ChordProgressionImportModal — URL validation', () => {
  it('shows a Shorts error for a YouTube Shorts URL', () => {
    renderModal();
    setUrl(SHORTS_URL);
    expect(screen.getByText(/Shorts links are not supported/i)).toBeInTheDocument();
  });

  it('shows an invalid URL error for a non-YouTube URL', () => {
    renderModal();
    setUrl(INVALID_URL);
    expect(screen.getByText(/valid YouTube URL/i)).toBeInTheDocument();
  });

  it('Detect Chords button stays disabled when URL has a validation error', () => {
    renderModal();
    setUrl(SHORTS_URL);
    expect(screen.getByRole('button', { name: 'Detect Chords' })).toBeDisabled();
  });

  it('clears the error when a valid URL is typed after an invalid one', () => {
    renderModal();
    setUrl(SHORTS_URL);
    expect(screen.getByText(/Shorts links are not supported/i)).toBeInTheDocument();

    setUrl(VALID_URL);
    expect(screen.queryByText(/Shorts links are not supported/i)).not.toBeInTheDocument();
  });

  it('Detect Chords button is enabled after correcting an invalid URL', () => {
    renderModal();
    setUrl(INVALID_URL);
    expect(screen.getByRole('button', { name: 'Detect Chords' })).toBeDisabled();

    setUrl(VALID_URL);
    expect(screen.getByRole('button', { name: 'Detect Chords' })).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('ChordProgressionImportModal — loading state', () => {
  it('shows the Analyzing spinner after clicking Detect Chords', async () => {
    // Never resolves so we can inspect the loading state
    mockDetectChordProgression.mockImplementation(() => new Promise(() => {}));

    renderModal();
    setUrl(VALID_URL);
    await clickDetectChords();

    await waitFor(() => {
      expect(screen.getByText(/Analyzing/i)).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────

describe('ChordProgressionImportModal — error state', () => {
  it('shows a Try Again button when detectChordProgression rejects', async () => {
    mockDetectChordProgression.mockRejectedValue(new Error('Service unavailable'));

    renderModal();
    setUrl(VALID_URL);
    await clickDetectChords();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    });
  });

  it('displays the error message returned by the rejection', async () => {
    mockDetectChordProgression.mockRejectedValue(
      new Error('No chords detected in this section'),
    );

    renderModal();
    setUrl(VALID_URL);
    await clickDetectChords();

    await waitFor(() => {
      expect(screen.getByText(/No chords detected/i)).toBeInTheDocument();
    });
  });

  it('clicking Try Again returns to the idle form', async () => {
    mockDetectChordProgression.mockRejectedValue(new Error('Failed'));

    renderModal();
    setUrl(VALID_URL);
    await clickDetectChords();

    const tryAgain = await screen.findByRole('button', { name: 'Try Again' });
    fireEvent.click(tryAgain);

    await waitFor(() => {
      expect(screen.getByLabelText('YouTube URL')).toBeInTheDocument();
    });
  });

  it('shows the error state when end time is not after start time', async () => {
    renderModal();
    setUrl(VALID_URL);

    // Set start = 0:30, end = 0:10 (end before start)
    fireEvent.change(screen.getByLabelText('Start (mm:ss)'), { target: { value: '0:30' } });
    fireEvent.change(screen.getByLabelText('End (mm:ss)'), { target: { value: '0:10' } });

    await clickDetectChords();

    await waitFor(() => {
      expect(screen.getByText(/End time must be after start time/i)).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Preview state
// ─────────────────────────────────────────────────────────────────────────────

describe('ChordProgressionImportModal — preview state', () => {
  async function goToPreview(result: ChordDetectionResult, currentBpm = 120) {
    mockDetectChordProgression.mockResolvedValue(result);
    renderModal({ currentBpm });
    setUrl(VALID_URL);
    await clickDetectChords();
    await waitFor(() => {
      expect(screen.getByText(/This will replace your current progression/i)).toBeInTheDocument();
    });
  }

  it('shows the overwrite notice in preview state', async () => {
    await goToPreview(makeResult());
    expect(screen.getByText(/This will replace your current progression/i)).toBeInTheDocument();
  });

  it('renders chord pills for detected chords', async () => {
    await goToPreview(makeResult());
    // chordName('C', 'major') = 'C Major', chordName('G', 'major') = 'G Major'
    expect(screen.getByText('C Major')).toBeInTheDocument();
    expect(screen.getByText('G Major')).toBeInTheDocument();
  });

  it('renders the detected BPM chip', async () => {
    await goToPreview(makeResult({ detectedBpm: 140 }));
    expect(screen.getByText('140 BPM')).toBeInTheDocument();
  });

  it('renders the detected key chip', async () => {
    await goToPreview(makeResult({ detectedKeyRoot: 'D', detectedKeyMode: 'minor' }));
    expect(screen.getByText('Key: D minor')).toBeInTheDocument();
  });

  it('renders the Apply button in preview state', async () => {
    await goToPreview(makeResult());
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('BPM checkbox is hidden when detected BPM diff is <= 5% of current BPM', async () => {
    // currentBpm=120, detectedBpm=124 → diff≈3.3% → hidden
    await goToPreview(makeResult({ detectedBpm: 124 }), 120);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('BPM checkbox is hidden when detected BPM matches current BPM exactly', async () => {
    await goToPreview(makeResult({ detectedBpm: 120 }), 120);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('BPM checkbox is shown when detected BPM diff is > 5% of current BPM', async () => {
    // currentBpm=120, detectedBpm=140 → diff≈16.7% → shown
    await goToPreview(makeResult({ detectedBpm: 140 }), 120);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('BPM checkbox is shown when detected BPM is just above the 5% threshold', async () => {
    // currentBpm=120, detectedBpm=127 → diff≈5.8% → shown
    await goToPreview(makeResult({ detectedBpm: 127 }), 120);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('BPM checkbox is hidden when detected BPM is 0', async () => {
    await goToPreview(makeResult({ detectedBpm: 0 }), 120);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Apply button
// ─────────────────────────────────────────────────────────────────────────────

describe('ChordProgressionImportModal — Apply button', () => {
  const BIG_BPM_DIFF_RESULT = makeResult({ detectedBpm: 160 }); // diff > 5% from 120

  async function goToPreviewAndApply(
    result: ChordDetectionResult,
    currentBpm: number,
    adoptBpm: boolean,
  ) {
    const onApply = vi.fn();
    mockDetectChordProgression.mockResolvedValue(result);
    render(
      <ChordProgressionImportModal
        open
        currentBpm={currentBpm}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );
    setUrl(VALID_URL);
    await clickDetectChords();
    await screen.findByText(/This will replace your current progression/i);

    // Default after analysis: adoptBpm=true when diff is material.
    // Click the checkbox only when we want to UNCHECK it (i.e., not adopting BPM).
    // When diff is small the checkbox is not rendered at all, so guard with queryByRole.
    if (!adoptBpm) {
      const checkbox = screen.queryByRole('checkbox');
      if (checkbox) fireEvent.click(checkbox);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    return onApply;
  }

  it('calls onApply with the detected chords when checkbox is unchecked', async () => {
    const onApply = await goToPreviewAndApply(BIG_BPM_DIFF_RESULT, 120, false);

    expect(onApply).toHaveBeenCalledTimes(1);
    const [chords, newBpm] = onApply.mock.calls[0] as [Array<{ root: RootNote; type: ChordType }>, number | undefined];
    expect(chords).toEqual(BIG_BPM_DIFF_RESULT.chords);
    expect(newBpm).toBeUndefined();
  });

  it('calls onApply with detectedBpm when checkbox is checked and diff > 5%', async () => {
    const onApply = await goToPreviewAndApply(BIG_BPM_DIFF_RESULT, 120, true);

    expect(onApply).toHaveBeenCalledTimes(1);
    const [, newBpm] = onApply.mock.calls[0] as [Array<{ root: RootNote; type: ChordType }>, number | undefined];
    expect(newBpm).toBe(160);
  });

  it('calls onApply without BPM when diff is <= 5% (checkbox not rendered)', async () => {
    // detectedBpm=122 from currentBpm=120 → diff≈1.7% → checkbox hidden → Apply passes undefined
    const result = makeResult({ detectedBpm: 122 });
    const onApply = await goToPreviewAndApply(result, 120, false);

    const [, newBpm] = onApply.mock.calls[0] as [Array<{ root: RootNote; type: ChordType }>, number | undefined];
    expect(newBpm).toBeUndefined();
  });
});
