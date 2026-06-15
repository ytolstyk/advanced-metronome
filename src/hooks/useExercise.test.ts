import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExercise } from './useExercise';
import type { ExerciseQuestion } from './useExercise';

// ── Mock earTrainingApi ─────────────────────────────────────────────────────

const mockSaveScore = vi.fn().mockResolvedValue(true);
vi.mock('../api/earTrainingApi', () => ({
  saveScore: (payload: unknown) => mockSaveScore(payload),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

interface SimpleQuestion extends ExerciseQuestion {
  key: string;
  label: string;
}

let questionCounter = 0;

function makeGenQuestion(correctKey = 'a') {
  return (excludeKey: string | null): SimpleQuestion => {
    questionCounter++;
    // Ensure we don't repeat the excludeKey
    const key = excludeKey === correctKey ? `${correctKey}-${questionCounter}` : correctKey;
    return { key, label: key };
  };
}

function makeOptions() {
  return {
    gameMode: '10' as const,
    authStatus: 'unauthenticated',
    generateQuestion: makeGenQuestion('a'),
    buildSavePayload: (score: number, wrong: number, total: number, elapsed: number) => ({
      exerciseType: 'test' as const,
      score,
      wrongAnswers: wrong,
      totalQuestions: total,
      elapsedSeconds: elapsed,
      gameMode: '10' as const,
      difficulty: 'test',
    }),
  };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  questionCounter = 0;
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 1. handleSkip — basic behaviour ──────────────────────────────────────────

describe('useExercise – handleSkip', () => {
  it('increments skipped count', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    expect(result.current.skipped).toBe(0);
    act(() => { result.current.handleSkip(); });
    expect(result.current.skipped).toBe(1);
  });

  it('does not increment wrongAnswers when skipping', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleSkip(); });
    expect(result.current.wrongAnswers).toBe(0);
  });

  it('does not increment score when skipping', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleSkip(); });
    expect(result.current.score).toBe(0);
  });

  it('advances to next question (changes question key)', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    const firstKey = result.current.question?.key;
    act(() => { result.current.handleSkip(); });
    const secondKey = result.current.question?.key;
    expect(secondKey).not.toBe(firstKey);
  });

  it('increments questionsAnswered when skipping', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    expect(result.current.questionsAnswered).toBe(0);
    act(() => { result.current.handleSkip(); });
    expect(result.current.questionsAnswered).toBe(1);
  });

  it('does not set answerReveal when skipping', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleSkip(); });
    expect(result.current.answerReveal).toBe(false);
  });

  it('accumulates skipped across multiple skips', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleSkip(); });
    act(() => { result.current.handleSkip(); });
    act(() => { result.current.handleSkip(); });
    expect(result.current.skipped).toBe(3);
  });

  it('is ignored when processingRef is true (guard against double fire)', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    // Trigger a wrong answer first — sets processingRef.current = true
    act(() => { result.current.handleAnswer(false); });
    const skippedBefore = result.current.skipped;
    act(() => { result.current.handleSkip(); });
    expect(result.current.skipped).toBe(skippedBefore);
  });
});

// ── 2. Skip counts toward question limit in finite modes ───────────────────

describe('useExercise – skip ends game in 10Q mode', () => {
  it('ends the game after 10 skips in 10Q mode', () => {
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: '10' }),
    );
    act(() => { result.current.startGame(); });

    for (let i = 0; i < 10; i++) {
      act(() => { result.current.handleSkip(); });
    }

    expect(result.current.gamePhase).toBe('result');
  });

  it('does not end game before 10 total (skip + answer) actions', () => {
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: '10' }),
    );
    act(() => { result.current.startGame(); });

    // 5 skips
    for (let i = 0; i < 5; i++) {
      act(() => { result.current.handleSkip(); });
    }
    expect(result.current.gamePhase).toBe('playing');

    // 4 correct answers (processingRef cleared synchronously for correct path via timer)
    for (let i = 0; i < 4; i++) {
      act(() => { result.current.handleAnswer(true); });
      act(() => { vi.advanceTimersByTime(600); });
    }
    expect(result.current.gamePhase).toBe('playing');

    // 1 more correct => 10 total => game over
    act(() => { result.current.handleAnswer(true); });
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current.gamePhase).toBe('result');
  });

  it('skipped count in result state reflects all skips', () => {
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: '10' }),
    );
    act(() => { result.current.startGame(); });

    for (let i = 0; i < 10; i++) {
      act(() => { result.current.handleSkip(); });
    }

    expect(result.current.skipped).toBe(10);
    expect(result.current.gamePhase).toBe('result');
  });
});

// ── 3. Skip in infinite mode ───────────────────────────────────────────────

describe('useExercise – skip in infinite mode', () => {
  it('advances to next question without ending game', () => {
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: 'infinite' }),
    );
    act(() => { result.current.startGame(); });

    for (let i = 0; i < 20; i++) {
      act(() => { result.current.handleSkip(); });
    }

    expect(result.current.gamePhase).toBe('playing');
    expect(result.current.skipped).toBe(20);
  });

  it('does not end the game on a wrong answer mid-skip streak (wrong ends infinite)', () => {
    // Infinite mode: wrong answer ends game via answerTimer, skip does not
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: 'infinite' }),
    );
    act(() => { result.current.startGame(); });

    // 3 skips — should stay playing
    for (let i = 0; i < 3; i++) {
      act(() => { result.current.handleSkip(); });
    }
    expect(result.current.gamePhase).toBe('playing');

    // Wrong answer in infinite → sets reveal timer → after 1500ms → result
    act(() => { result.current.handleAnswer(false); });
    expect(result.current.gamePhase).toBe('playing'); // still playing, timer pending
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.gamePhase).toBe('result');
  });

  it('counts the terminal wrong answer in questionsAnswered (off-by-1 regression)', () => {
    // 3 correct answers then 1 wrong → totalQuestions should be 4, not 3
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: 'infinite' }),
    );
    act(() => { result.current.startGame(); });

    act(() => { result.current.handleAnswer(true); });
    act(() => { vi.advanceTimersByTime(600); });
    act(() => { result.current.handleAnswer(true); });
    act(() => { vi.advanceTimersByTime(600); });
    act(() => { result.current.handleAnswer(true); });
    act(() => { vi.advanceTimersByTime(600); });

    act(() => { result.current.handleAnswer(false); });
    act(() => { vi.advanceTimersByTime(1500); });

    expect(result.current.gamePhase).toBe('result');
    expect(result.current.questionsAnswered).toBe(4);
    expect(result.current.score).toBe(3);
    expect(result.current.wrongAnswers).toBe(1);
  });
});

// ── 4. Wrong answer sets answerReveal ─────────────────────────────────────

describe('useExercise – wrong answer reveal', () => {
  it('sets answerReveal to true on wrong answer', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    expect(result.current.answerReveal).toBe(false);
    act(() => { result.current.handleAnswer(false); });
    expect(result.current.answerReveal).toBe(true);
  });

  it('sets feedback to wrong on wrong answer', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleAnswer(false); });
    expect(result.current.feedback).toBe('wrong');
  });

  it('increments wrongAnswers on wrong answer', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleAnswer(false); });
    expect(result.current.wrongAnswers).toBe(1);
  });

  it('does not set answerReveal on correct answer', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleAnswer(true); });
    expect(result.current.answerReveal).toBe(false);
  });

  it('clears answerReveal when advancing to next question after 1500ms (finite mode)', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleAnswer(false); });
    expect(result.current.answerReveal).toBe(true);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.answerReveal).toBe(false);
  });
});

// ── 5. resetRevealTimer uses a time ceiling (not an unlimited deferral) ───

describe('useExercise – resetRevealTimer', () => {
  it('advances at the original 1500ms deadline even when reset is called before it', () => {
    // resetRevealTimer schedules remaining = max(0, 1500 - elapsed).
    // Reset at t=1000ms → remaining=500ms → still fires at t=1500ms total.
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });

    const firstQuestionKey = result.current.question?.key;
    act(() => { result.current.handleAnswer(false); });

    // Reset at 1000ms — remaining = 500ms, fires at t=1500ms (not t=2500ms)
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { result.current.resetRevealTimer(); });

    // 500ms later (t=1500ms total) — advance fires
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.question?.key).not.toBe(firstQuestionKey);
    expect(result.current.answerReveal).toBe(false);
  });

  it('does advance once the remaining time from the reset has elapsed', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });

    act(() => { result.current.handleAnswer(false); });

    // Reset at 1000ms — remaining = 500ms
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { result.current.resetRevealTimer(); });

    // Advance 500ms (the ceiling remaining time)
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.answerReveal).toBe(false);
  });

  it('is a no-op if called when there is no pending reveal advance', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    // No wrong answer yet — revealAdvanceFnRef is null
    expect(() => {
      act(() => { result.current.resetRevealTimer(); });
    }).not.toThrow();
  });

  it('multiple resets all converge on the same original 1500ms deadline', () => {
    // Each reset computes remaining from the original wrong-answer timestamp,
    // so the advance cannot be pushed past 1500ms from when it was triggered.
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    const firstKey = result.current.question?.key;

    act(() => { result.current.handleAnswer(false); });

    // Reset at t=500ms: remaining=1000ms
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { result.current.resetRevealTimer(); });
    // Reset at t=1000ms: remaining=500ms
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { result.current.resetRevealTimer(); });

    // At t=1499ms (1ms before the 1500ms ceiling): still showing reveal
    act(() => { vi.advanceTimersByTime(499); });
    expect(result.current.question?.key).toBe(firstKey);
    expect(result.current.answerReveal).toBe(true);

    // At t=1500ms: advance fires
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.answerReveal).toBe(false);
  });
});

// ── 6. Nonce guard prevents double-fire ──────────────────────────────────

describe('useExercise – nonce guard', () => {
  it('stopping game cancels any pending reveal advance', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleAnswer(false); });

    // Stop game before timer fires
    act(() => { result.current.stopGame(); });
    expect(result.current.gamePhase).toBe('result');

    // Advance past the timer — should not re-trigger anything
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.gamePhase).toBe('result');
    expect(result.current.stoppedEarly).toBe(true);
  });

  it('starting a new game resets skipped to 0', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    act(() => { result.current.startGame(); });
    act(() => { result.current.handleSkip(); });
    act(() => { result.current.handleSkip(); });
    expect(result.current.skipped).toBe(2);

    // Start again
    act(() => { result.current.startGame(); });
    expect(result.current.skipped).toBe(0);
  });
});

// ── 7. Accuracy formula: score / (score + wrongAnswers) ──────────────────

describe('useExercise – accuracy formula', () => {
  it('computes accuracy from score and wrongAnswers (not questionsAnswered)', () => {
    // In finite mode, skip increments questionsAnswered without touching score/wrong.
    // Accuracy should be score/(score+wrong), NOT score/questionsAnswered.
    const { result } = renderHook(() =>
      useExercise({ ...makeOptions(), gameMode: '10' }),
    );
    act(() => { result.current.startGame(); });

    // 3 correct answers
    for (let i = 0; i < 3; i++) {
      act(() => { result.current.handleAnswer(true); });
      act(() => { vi.advanceTimersByTime(600); });
    }

    // 4 skips (counts toward limit but not toward wrong)
    for (let i = 0; i < 4; i++) {
      act(() => { result.current.handleSkip(); });
    }

    // 2 wrong answers (via timer) and then 1 more correct to reach 10
    // Wrong in finite mode: questionsAnswered incremented immediately, advance after 1500ms
    act(() => { result.current.handleAnswer(false); });
    act(() => { vi.advanceTimersByTime(1500); });
    act(() => { result.current.handleAnswer(false); });
    act(() => { vi.advanceTimersByTime(1500); });

    // game ends here (3+4+2=9, need 1 more)
    expect(result.current.gamePhase).toBe('playing');
    act(() => { result.current.handleAnswer(true); });
    act(() => { vi.advanceTimersByTime(600); });

    expect(result.current.gamePhase).toBe('result');

    const { score, wrongAnswers, skipped, questionsAnswered } = result.current;
    // score=4, wrongAnswers=2, skipped=4, questionsAnswered=10
    expect(score).toBe(4);
    expect(wrongAnswers).toBe(2);
    expect(skipped).toBe(4);
    expect(questionsAnswered).toBe(10);

    // Accuracy = score / (score + wrong) = 4 / 6 ≈ 66.7%
    // NOT score / questionsAnswered = 4 / 10 = 40%
    const accuracyDenominator = score + wrongAnswers; // 6
    const accuracy = Math.round((score / accuracyDenominator) * 100);
    expect(accuracy).toBe(67);
  });
});

// ── 8. Initial state ──────────────────────────────────────────────────────

describe('useExercise – initial state', () => {
  it('starts in idle phase with zero skipped', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    expect(result.current.gamePhase).toBe('idle');
    expect(result.current.skipped).toBe(0);
    expect(result.current.answerReveal).toBe(false);
    expect(result.current.question).toBeNull();
  });

  it('exposes handleSkip and resetRevealTimer as functions', () => {
    const { result } = renderHook(() => useExercise(makeOptions()));
    expect(typeof result.current.handleSkip).toBe('function');
    expect(typeof result.current.resetRevealTimer).toBe('function');
  });
});
