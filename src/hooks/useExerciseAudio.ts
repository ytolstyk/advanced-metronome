import { useRef, useEffect, useCallback } from 'react';
import type { ExerciseQuestion, GamePhase } from './useExercise';

// Manages the audio lifecycle for an ear-training exercise:
// stops the previous sound, plays the new one when the question changes,
// and stops all audio when the game phase leaves 'playing' or on unmount.
// playFn must be stable (wrap in useCallback at the call site).

export function useExerciseAudio<Q extends ExerciseQuestion>(
  question: Q | null,
  gamePhase: GamePhase,
  getCtx: () => AudioContext,
  playFn: (ctx: AudioContext, q: Q) => () => void,
): { playCurrentQuestion: () => void; stopCurrentSound: () => void } {
  const stopRef = useRef<() => void>(() => {});
  const prevKeyRef = useRef<string | null>(null);
  // Keep callbacks in refs so the effect only depends on question/gamePhase
  const playFnRef = useRef(playFn);
  useEffect(() => { playFnRef.current = playFn; }, [playFn]);
  const getCtxRef = useRef(getCtx);
  useEffect(() => { getCtxRef.current = getCtx; }, [getCtx]);

  useEffect(() => {
    if (question && question.key !== prevKeyRef.current && gamePhase === 'playing') {
      prevKeyRef.current = question.key;
      stopRef.current();
      stopRef.current = playFnRef.current(getCtxRef.current(), question);
    }
    if (gamePhase !== 'playing') {
      prevKeyRef.current = null;
      stopRef.current();
      stopRef.current = () => {};
    }
  }, [question, gamePhase]);

  // Separate unmount-only effect so navigation away stops any playing audio
  // without interfering with the lifecycle effect's dep-change re-fires
  useEffect(() => () => {
    stopRef.current();
    stopRef.current = () => {};
  }, []);

  const playCurrentQuestion = useCallback(() => {
    if (!question) return;
    stopRef.current();
    stopRef.current = playFnRef.current(getCtxRef.current(), question);
  }, [question]);

  const stopCurrentSound = useCallback(() => {
    stopRef.current();
    stopRef.current = () => {};
  }, []);

  return { playCurrentQuestion, stopCurrentSound };
}
