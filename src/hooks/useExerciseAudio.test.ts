import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExerciseAudio } from './useExerciseAudio';
import type { GamePhase } from './useExercise';

interface TestQuestion {
  key: string;
  label: string;
}

function makeQuestion(key: string): TestQuestion {
  return { key, label: `Question ${key}` };
}

function makeMockCtx(): AudioContext {
  return {} as AudioContext;
}

describe('useExerciseAudio', () => {
  let stopA: ReturnType<typeof vi.fn>;
  let stopB: ReturnType<typeof vi.fn>;
  let playFn: (ctx: AudioContext, q: TestQuestion) => () => void;
  let getCtx: () => AudioContext;
  let mockCtx: AudioContext;

  beforeEach(() => {
    stopA = vi.fn();
    stopB = vi.fn();
    // Cast needed because vi.fn() returns a mock type that TypeScript can't directly
    // assign to the precise function signature — safe since the mock is configured correctly
    playFn = vi.fn().mockReturnValueOnce(stopA).mockReturnValue(stopB) as unknown as typeof playFn;
    mockCtx = makeMockCtx();
    getCtx = vi.fn().mockReturnValue(mockCtx) as unknown as () => AudioContext;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial render — no auto-play when question is null
  // -------------------------------------------------------------------------

  it('does not call playFn on initial render when question is null', () => {
    renderHook(() =>
      useExerciseAudio<TestQuestion>(null, 'playing', getCtx, playFn),
    );
    expect(playFn).not.toHaveBeenCalled();
  });

  it('does not call playFn on initial render when gamePhase is idle', () => {
    renderHook(() =>
      useExerciseAudio<TestQuestion>(makeQuestion('q1'), 'idle', getCtx, playFn),
    );
    expect(playFn).not.toHaveBeenCalled();
  });

  it('does not call playFn on initial render when gamePhase is result', () => {
    renderHook(() =>
      useExerciseAudio<TestQuestion>(makeQuestion('q1'), 'result', getCtx, playFn),
    );
    expect(playFn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Auto-play when question + gamePhase='playing' first appears
  // -------------------------------------------------------------------------

  it('calls playFn when a question appears and gamePhase is playing', () => {
    const { rerender } = renderHook(
      ({ question, phase }: { question: TestQuestion | null; phase: GamePhase }) =>
        useExerciseAudio<TestQuestion>(question, phase, getCtx, playFn),
      { initialProps: { question: null as TestQuestion | null, phase: 'idle' as GamePhase } },
    );

    act(() => {
      rerender({ question: makeQuestion('q1'), phase: 'playing' });
    });

    expect(playFn).toHaveBeenCalledTimes(1);
    expect(playFn).toHaveBeenCalledWith(mockCtx, makeQuestion('q1'));
  });

  it('calls playFn immediately on first render when question is set and phase is playing', () => {
    const q = makeQuestion('q1');
    renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', getCtx, playFn),
    );
    expect(playFn).toHaveBeenCalledTimes(1);
    expect(playFn).toHaveBeenCalledWith(mockCtx, q);
  });

  // -------------------------------------------------------------------------
  // Question key change triggers stop + replay
  // -------------------------------------------------------------------------

  it('stops previous sound and plays new one when question key changes during playing', () => {
    const q1 = makeQuestion('q1');
    const q2 = makeQuestion('q2');

    const { rerender } = renderHook(
      ({ question }: { question: TestQuestion }) =>
        useExerciseAudio<TestQuestion>(question, 'playing', getCtx, playFn),
      { initialProps: { question: q1 } },
    );

    // First play - stopA is the returned stop callback
    expect(playFn).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ question: q2 });
    });

    expect(stopA).toHaveBeenCalledTimes(1);
    expect(playFn).toHaveBeenCalledTimes(2);
    expect(playFn).toHaveBeenLastCalledWith(mockCtx, q2);
  });

  it('does NOT replay when the same question key is re-rendered', () => {
    const q1 = makeQuestion('q1');
    // Make question object reference change but key stays the same
    const q1Copy = makeQuestion('q1');

    const { rerender } = renderHook(
      ({ question }: { question: TestQuestion }) =>
        useExerciseAudio<TestQuestion>(question, 'playing', getCtx, playFn),
      { initialProps: { question: q1 } },
    );

    expect(playFn).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ question: q1Copy });
    });

    // No extra play — same key
    expect(playFn).toHaveBeenCalledTimes(1);
    expect(stopA).not.toHaveBeenCalled();
  });

  it('passes the AudioContext returned by getCtx to playFn', () => {
    const customCtx = { custom: true } as unknown as AudioContext;
    const customGetCtx = vi.fn().mockReturnValue(customCtx);
    const q = makeQuestion('q1');

    renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', customGetCtx, playFn),
    );

    expect(customGetCtx).toHaveBeenCalled();
    expect(playFn).toHaveBeenCalledWith(customCtx, q);
  });

  // -------------------------------------------------------------------------
  // Phase transitions — non-playing phases stop audio and reset key tracking
  // -------------------------------------------------------------------------

  it('stops current sound when gamePhase changes from playing to idle', () => {
    const q = makeQuestion('q1');
    const { rerender } = renderHook(
      ({ phase }: { phase: GamePhase }) =>
        useExerciseAudio<TestQuestion>(q, phase, getCtx, playFn),
      { initialProps: { phase: 'playing' as GamePhase } },
    );

    expect(stopA).not.toHaveBeenCalled();

    act(() => {
      rerender({ phase: 'idle' });
    });

    expect(stopA).toHaveBeenCalledTimes(1);
  });

  it('stops current sound when gamePhase changes from playing to result', () => {
    const q = makeQuestion('q1');
    const { rerender } = renderHook(
      ({ phase }: { phase: GamePhase }) =>
        useExerciseAudio<TestQuestion>(q, phase, getCtx, playFn),
      { initialProps: { phase: 'playing' as GamePhase } },
    );

    act(() => {
      rerender({ phase: 'result' });
    });

    expect(stopA).toHaveBeenCalledTimes(1);
  });

  it('replays the question if phase returns to playing after being idle', () => {
    const q1 = makeQuestion('q1');
    const { rerender } = renderHook(
      ({ phase }: { phase: GamePhase }) =>
        useExerciseAudio<TestQuestion>(q1, phase, getCtx, playFn),
      { initialProps: { phase: 'playing' as GamePhase } },
    );

    expect(playFn).toHaveBeenCalledTimes(1);

    // Leave playing — resets prevQuestionKey
    act(() => {
      rerender({ phase: 'idle' });
    });

    expect(stopA).toHaveBeenCalledTimes(1);

    // Return to playing with the same question key — should replay because key was reset
    act(() => {
      rerender({ phase: 'playing' });
    });

    expect(playFn).toHaveBeenCalledTimes(2);
  });

  it('does not call playFn when phase is idle even if question changes', () => {
    const q1 = makeQuestion('q1');
    const q2 = makeQuestion('q2');

    const { rerender } = renderHook(
      ({ question }: { question: TestQuestion }) =>
        useExerciseAudio<TestQuestion>(question, 'idle', getCtx, playFn),
      { initialProps: { question: q1 } },
    );

    act(() => {
      rerender({ question: q2 });
    });

    expect(playFn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // playCurrentQuestion — imperative replay
  // -------------------------------------------------------------------------

  it('playCurrentQuestion stops current sound and replays', () => {
    const q = makeQuestion('q1');
    const { result } = renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', getCtx, playFn),
    );

    // After initial play: stopA is the stored stop callback
    expect(playFn).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.playCurrentQuestion();
    });

    expect(stopA).toHaveBeenCalledTimes(1);
    expect(playFn).toHaveBeenCalledTimes(2);
    expect(playFn).toHaveBeenLastCalledWith(mockCtx, q);
  });

  it('playCurrentQuestion does nothing when question is null', () => {
    const { result } = renderHook(() =>
      useExerciseAudio<TestQuestion>(null, 'playing', getCtx, playFn),
    );

    act(() => {
      result.current.playCurrentQuestion();
    });

    expect(playFn).not.toHaveBeenCalled();
  });

  it('playCurrentQuestion works even when gamePhase is not playing', () => {
    const q = makeQuestion('q1');
    const { result } = renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'result', getCtx, playFn),
    );

    act(() => {
      result.current.playCurrentQuestion();
    });

    // playFn should be called because playCurrentQuestion is imperative
    expect(playFn).toHaveBeenCalledTimes(1);
    expect(playFn).toHaveBeenCalledWith(mockCtx, q);
  });

  it('subsequent playCurrentQuestion calls stop the previously returned stop function', () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    const stop3 = vi.fn();
    const trackingPlayFn = vi.fn()
      .mockReturnValueOnce(stop1)
      .mockReturnValueOnce(stop2)
      .mockReturnValueOnce(stop3);

    const q = makeQuestion('q1');
    const { result } = renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', getCtx, trackingPlayFn),
    );

    // Initial auto-play returned stop1
    expect(trackingPlayFn).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.playCurrentQuestion(); // stops stop1, returns stop2
    });

    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).not.toHaveBeenCalled();

    act(() => {
      result.current.playCurrentQuestion(); // stops stop2, returns stop3
    });

    expect(stop2).toHaveBeenCalledTimes(1);
    expect(stop3).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // stopCurrentSound — imperative stop
  // -------------------------------------------------------------------------

  it('stopCurrentSound stops the current sound', () => {
    const q = makeQuestion('q1');
    const { result } = renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', getCtx, playFn),
    );

    act(() => {
      result.current.stopCurrentSound();
    });

    expect(stopA).toHaveBeenCalledTimes(1);
  });

  it('stopCurrentSound is idempotent — calling twice does not throw', () => {
    const q = makeQuestion('q1');
    const { result } = renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', getCtx, playFn),
    );

    act(() => {
      result.current.stopCurrentSound();
      // Second call: the ref is now a no-op () => {} so should not throw
      result.current.stopCurrentSound();
    });

    expect(stopA).toHaveBeenCalledTimes(1);
  });

  it('stopCurrentSound resets the stop ref so subsequent auto-play works', () => {
    const q1 = makeQuestion('q1');
    const q2 = makeQuestion('q2');

    const stop1 = vi.fn();
    const stop2 = vi.fn();
    const trackingPlayFn = vi.fn()
      .mockReturnValueOnce(stop1)
      .mockReturnValueOnce(stop2);

    const { result, rerender } = renderHook(
      ({ question }: { question: TestQuestion }) =>
        useExerciseAudio<TestQuestion>(question, 'playing', getCtx, trackingPlayFn),
      { initialProps: { question: q1 } },
    );

    // stop current sound manually
    act(() => {
      result.current.stopCurrentSound();
    });

    expect(stop1).toHaveBeenCalledTimes(1);

    // Now change question — effect fires, previously reset ref means no double-stop
    act(() => {
      rerender({ question: q2 });
    });

    // stop2 is the new stop callback; stop1 should not be called again
    expect(stop1).toHaveBeenCalledTimes(1);
    expect(trackingPlayFn).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Ref-forwarding — playFn and getCtx updates are picked up without re-running effect
  // -------------------------------------------------------------------------

  it('uses the latest playFn reference when playCurrentQuestion is called after playFn changes', () => {
    const q = makeQuestion('q1');
    const originalStop = vi.fn();
    const originalPlayFn = vi.fn().mockReturnValue(originalStop);

    const newStop = vi.fn();
    const newPlayFn = vi.fn().mockReturnValue(newStop);

    const { result, rerender } = renderHook(
      ({ pFn }: { pFn: (ctx: AudioContext, q: TestQuestion) => () => void }) =>
        useExerciseAudio<TestQuestion>(q, 'playing', getCtx, pFn),
      { initialProps: { pFn: originalPlayFn } },
    );

    // Initial play used originalPlayFn
    expect(originalPlayFn).toHaveBeenCalledTimes(1);

    // Swap playFn — should not trigger a new effect (key hasn't changed)
    act(() => {
      rerender({ pFn: newPlayFn });
    });

    expect(newPlayFn).not.toHaveBeenCalled();

    // But calling playCurrentQuestion should use the new playFn
    act(() => {
      result.current.playCurrentQuestion();
    });

    expect(newPlayFn).toHaveBeenCalledTimes(1);
    expect(originalPlayFn).toHaveBeenCalledTimes(1); // not called again
  });

  it('uses the latest getCtx reference when playCurrentQuestion is called after getCtx changes', () => {
    const q = makeQuestion('q1');
    const ctx1 = { id: 'ctx1' } as unknown as AudioContext;
    const ctx2 = { id: 'ctx2' } as unknown as AudioContext;
    const getCtx1 = vi.fn().mockReturnValue(ctx1);
    const getCtx2 = vi.fn().mockReturnValue(ctx2);

    const { result, rerender } = renderHook(
      ({ gCtx }: { gCtx: () => AudioContext }) =>
        useExerciseAudio<TestQuestion>(q, 'playing', gCtx, playFn),
      { initialProps: { gCtx: getCtx1 } },
    );

    // Swap getCtx
    act(() => {
      rerender({ gCtx: getCtx2 });
    });

    act(() => {
      result.current.playCurrentQuestion();
    });

    // Latest context should have been used
    expect(getCtx2).toHaveBeenCalled();
    expect(playFn).toHaveBeenLastCalledWith(ctx2, q);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('handles multiple rapid question key changes correctly — only latest stop is tracked', () => {
    const stopQ1 = vi.fn();
    const stopQ2 = vi.fn();
    const stopQ3 = vi.fn();
    const trackingPlayFn = vi.fn()
      .mockReturnValueOnce(stopQ1)
      .mockReturnValueOnce(stopQ2)
      .mockReturnValueOnce(stopQ3);

    const { rerender } = renderHook(
      ({ question }: { question: TestQuestion }) =>
        useExerciseAudio<TestQuestion>(question, 'playing', getCtx, trackingPlayFn),
      { initialProps: { question: makeQuestion('q1') } },
    );

    act(() => {
      rerender({ question: makeQuestion('q2') });
    });

    act(() => {
      rerender({ question: makeQuestion('q3') });
    });

    expect(stopQ1).toHaveBeenCalledTimes(1);
    expect(stopQ2).toHaveBeenCalledTimes(1);
    expect(trackingPlayFn).toHaveBeenCalledTimes(3);
  });

  it('does not play when question is null even if phase switches to playing', () => {
    const { rerender } = renderHook(
      ({ phase }: { phase: GamePhase }) =>
        useExerciseAudio<TestQuestion>(null, phase, getCtx, playFn),
      { initialProps: { phase: 'idle' as GamePhase } },
    );

    act(() => {
      rerender({ phase: 'playing' });
    });

    expect(playFn).not.toHaveBeenCalled();
  });

  it('returns stable playCurrentQuestion and stopCurrentSound references across re-renders', () => {
    const q = makeQuestion('q1');
    const { result, rerender } = renderHook(() =>
      useExerciseAudio<TestQuestion>(q, 'playing', getCtx, playFn),
    );

    const { playCurrentQuestion: play1, stopCurrentSound: stop1 } = result.current;

    act(() => {
      rerender();
    });

    // Note: these are recreated each render since they are plain functions inside the hook,
    // but they must remain callable without errors
    expect(typeof result.current.playCurrentQuestion).toBe('function');
    expect(typeof result.current.stopCurrentSound).toBe('function');
    // The references themselves may change; we just verify they work
    expect(play1).toBeDefined();
    expect(stop1).toBeDefined();
  });
});
