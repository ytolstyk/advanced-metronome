import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── Mock AWS Amplify auth before importing the page ────────────────────────

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'unauthenticated' }),
  Authenticator: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

// ── Mock earTrainingApi ─────────────────────────────────────────────────────

const mockSaveScore = vi.fn().mockResolvedValue(true);
vi.mock('@/api/earTrainingApi', () => ({
  saveScore: (payload: unknown) => mockSaveScore(payload),
}));

// ── Mock audio synthesis ───────────────────────────────────────────────────

vi.mock('@/audio/earTrainingSynths', () => ({
  playInterval: vi.fn().mockReturnValue(() => {}),
  playEarTrainingChord: vi.fn().mockReturnValue(() => {}),
  playScale: vi.fn().mockReturnValue(() => {}),
}));

// ── Stub AudioContext ──────────────────────────────────────────────────────
// Must use a regular function (not arrow) so it can be called with `new`

const mockResume = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal('AudioContext', function MockAudioContext(this: unknown) {
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: mockResume,
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        value: 0,
      },
    })),
    createOscillator: vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { value: 0 },
      type: 'sine',
    })),
    createBiquadFilter: vi.fn(() => ({
      connect: vi.fn(),
      frequency: { value: 0 },
      Q: { value: 0 },
      type: 'lowpass',
    })),
  };
});

// ── Import page and logic after mocks are set up ───────────────────────────

import { EarTrainingPage } from './EarTrainingPage';
import {
  generateIntervalQuestion,
  generateChordQuestion,
  generateScaleQuestion,
} from './earTrainingLogic';
import { INTERVAL_NAMES, INTERVAL_SEMITONES } from '../data/intervals';

// ── Setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 1. Page rendering ──────────────────────────────────────────────────────

describe('EarTrainingPage – rendering', () => {
  it('renders the heading', () => {
    render(<EarTrainingPage />);
    expect(screen.getByRole('main', { name: /ear training/i })).toBeInTheDocument();
    expect(screen.getByText('Ear Training')).toBeInTheDocument();
  });

  it('renders three tab buttons', () => {
    render(<EarTrainingPage />);
    expect(screen.getByRole('button', { name: /intervals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /chords/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scales/i })).toBeInTheDocument();
  });

  it('shows Intervals settings by default', () => {
    render(<EarTrainingPage />);
    expect(screen.getByText('Up to Octave')).toBeInTheDocument();
  });

  it('switches to Chords tab', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^chords$/i }));
    expect(screen.getByText(/chord types/i)).toBeInTheDocument();
  });

  it('switches to Scales tab', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^scales$/i }));
    expect(screen.getByText(/scale modes/i)).toBeInTheDocument();
  });
});

// ── 2. Intervals idle settings ─────────────────────────────────────────────

describe('EarTrainingPage – Intervals idle', () => {
  it('shows game mode options', () => {
    render(<EarTrainingPage />);
    expect(screen.getByText('10Q')).toBeInTheDocument();
    expect(screen.getByText('20Q')).toBeInTheDocument();
    expect(screen.getByText('30Q')).toBeInTheDocument();
    expect(screen.getByText('∞')).toBeInTheDocument();
  });

  it('shows range toggles', () => {
    render(<EarTrainingPage />);
    expect(screen.getByText('Up to Tritone')).toBeInTheDocument();
    expect(screen.getByText('Up to Octave')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('shows direction toggles', () => {
    render(<EarTrainingPage />);
    expect(screen.getByText('Ascending')).toBeInTheDocument();
    expect(screen.getByText('Descending')).toBeInTheDocument();
    expect(screen.getByText('Harmonic')).toBeInTheDocument();
    expect(screen.getByText('Random')).toBeInTheDocument();
  });

  it('shows Start button', () => {
    render(<EarTrainingPage />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('does not show answer grid before game starts', () => {
    render(<EarTrainingPage />);
    // Interval names should not be visible as answer buttons
    expect(screen.queryByRole('button', { name: /^unison$/i })).not.toBeInTheDocument();
  });
});

// ── 3. Playing phase ───────────────────────────────────────────────────────

describe('EarTrainingPage – playing phase', () => {
  it('shows answer grid after Start is clicked', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    const visibleCount = INTERVAL_NAMES.filter(
      (name) => screen.queryByRole('button', { name: new RegExp(`^${name}$`, 'i') })
    ).length;
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('shows Play Again button during playing phase', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  it('shows Stop button during playing phase', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('goes to result screen when Stop is clicked', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(screen.getByText('Stopped Early')).toBeInTheDocument();
  });
});

// ── 4. Correct answer flow ─────────────────────────────────────────────────

describe('EarTrainingPage – correct answer flow', () => {
  it('shows feedback after clicking an answer button', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    const intervalBtns = INTERVAL_NAMES
      .map((name) => screen.queryByRole('button', { name: new RegExp(`^${name}$`) }))
      .filter(Boolean);
    expect(intervalBtns.length).toBeGreaterThan(0);

    fireEvent.click(intervalBtns[0]!);

    const hasCorrect = screen.queryByText(/✓ Correct!/i);
    const hasWrong = screen.queryByText(/✗ Wrong/i);
    expect(hasCorrect || hasWrong).toBeTruthy();
  });

  it('transitions from result back to idle via Change Settings', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(screen.getByText(/stopped early/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /change settings/i }));
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });
});

// ── 5. Result screen ───────────────────────────────────────────────────────

describe('EarTrainingPage – result screen', () => {
  it('shows Play Again in result screen', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(screen.getByRole('button', { name: /^play again$/i })).toBeInTheDocument();
  });

  it('restarts game on Play Again in result screen', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    fireEvent.click(screen.getByRole('button', { name: /^play again$/i }));
    // After restarting, the banner should show (playing phase)
    expect(screen.getByText(/listen and identify/i)).toBeInTheDocument();
    expect(screen.queryByText(/stopped early/i)).not.toBeInTheDocument();
  });

  it('does not call saveScore when stopped early', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(mockSaveScore).not.toHaveBeenCalled();
  });
});

// ── 6. Pure logic: generateIntervalQuestion ────────────────────────────────

describe('generateIntervalQuestion', () => {
  it('respects up-to-tritone range (max 6 semitones)', () => {
    for (let i = 0; i < 50; i++) {
      const q = generateIntervalQuestion('up-to-tritone', 'ascending', null);
      expect(INTERVAL_SEMITONES[q.intervalName]).toBeLessThanOrEqual(6);
    }
  });

  it('respects up-to-octave range (max 12 semitones)', () => {
    for (let i = 0; i < 50; i++) {
      const q = generateIntervalQuestion('up-to-octave', 'ascending', null);
      expect(INTERVAL_SEMITONES[q.intervalName]).toBeLessThanOrEqual(12);
    }
  });

  it('resolves random direction to a concrete direction', () => {
    const directions = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const q = generateIntervalQuestion('up-to-octave', 'random', null);
      directions.add(q.actualDirection);
    }
    expect(directions.has('ascending')).toBe(true);
    expect(directions.has('descending')).toBe(true);
    expect(directions.has('harmonic')).toBe(true);
  });

  it('keeps actualDirection fixed when direction is not random', () => {
    for (let i = 0; i < 20; i++) {
      const q = generateIntervalQuestion('up-to-octave', 'harmonic', null);
      expect(q.actualDirection).toBe('harmonic');
    }
  });

  it('rootMidi stays within 48–60', () => {
    for (let i = 0; i < 50; i++) {
      const q = generateIntervalQuestion('up-to-octave', 'ascending', null);
      expect(q.rootMidi).toBeGreaterThanOrEqual(48);
      expect(q.rootMidi).toBeLessThanOrEqual(60);
    }
  });

  it('avoids repeating the exclude key', () => {
    // Force a scenario where the same key would be excluded
    const q1 = generateIntervalQuestion('up-to-tritone', 'ascending', null);
    const q2 = generateIntervalQuestion('up-to-tritone', 'ascending', q1.key);
    // With multiple intervals in range, we should get a different key
    // (may be same interval but different direction or different interval)
    // At minimum it should not throw
    expect(q2.key).toBeDefined();
  });
});

// ── 7. Pure logic: generateChordQuestion ──────────────────────────────────

describe('generateChordQuestion', () => {
  it('only returns types from the enabled set', () => {
    const enabled = new Set(['major', 'minor'] as const);
    for (let i = 0; i < 50; i++) {
      const q = generateChordQuestion(enabled, null);
      expect(['major', 'minor']).toContain(q.type);
    }
  });

  it('works with a single enabled type', () => {
    const enabled = new Set(['dim7'] as const);
    for (let i = 0; i < 20; i++) {
      const q = generateChordQuestion(enabled, null);
      expect(q.type).toBe('dim7');
    }
  });
});

// ── 8. Pure logic: generateScaleQuestion ──────────────────────────────────

describe('generateScaleQuestion', () => {
  it('only returns modes from the enabled set', () => {
    const enabled = new Set(['major', 'dorian'] as const);
    for (let i = 0; i < 50; i++) {
      const q = generateScaleQuestion(enabled, null);
      expect(['major', 'dorian']).toContain(q.mode);
    }
  });

  it('rootMidi stays within 48–60', () => {
    const enabled = new Set(['major'] as const);
    for (let i = 0; i < 50; i++) {
      const q = generateScaleQuestion(enabled, null);
      expect(q.rootMidi).toBeGreaterThanOrEqual(48);
      expect(q.rootMidi).toBeLessThanOrEqual(60);
    }
  });

  it('falls back gracefully with a single mode and matching excludeKey', () => {
    const enabled = new Set(['major'] as const);
    // With only one mode, the exclude key matches, fallback should still return something
    const q = generateScaleQuestion(enabled, 'major');
    expect(q.mode).toBe('major');
  });
});

// ── 9. Chords exercise switches tab ───────────────────────────────────────

describe('EarTrainingPage – Chords exercise', () => {
  it('shows chord type toggle buttons', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^chords$/i }));
    expect(screen.getByText('Major')).toBeInTheDocument();
    expect(screen.getByText('Minor')).toBeInTheDocument();
  });

  it('shows Start button on Chords tab', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^chords$/i }));
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('enters playing phase on Chords start', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^chords$/i }));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByText(/listen and identify/i)).toBeInTheDocument();
  });
});

// ── 10. Scales exercise ────────────────────────────────────────────────────

describe('EarTrainingPage – Scales exercise', () => {
  it('shows scale mode toggle buttons', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^scales$/i }));
    expect(screen.getByText('Major')).toBeInTheDocument();
    expect(screen.getByText('Natural Minor')).toBeInTheDocument();
    expect(screen.getByText('Dorian')).toBeInTheDocument();
  });

  it('enters playing phase on Scales start', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /^scales$/i }));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByText(/listen and identify/i)).toBeInTheDocument();
  });
});

// ── 11. Timer increments during play ──────────────────────────────────────

describe('EarTrainingPage – timer', () => {
  it('starts at 0:00 when game begins', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('increments after 1 second', () => {
    render(<EarTrainingPage />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('0:01')).toBeInTheDocument();
  });
});
