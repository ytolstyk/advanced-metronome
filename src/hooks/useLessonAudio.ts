import { useState, useRef, useEffect, useCallback } from 'react';
import type { PracticeStep } from '@/data/lessons/types';
import { pluckString } from '@/audio/pluckString';

const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

export function useLessonAudio(steps: (PracticeStep | PracticeStep[])[], bpm: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeNoteIdx, setActiveNoteIdx] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentIdxRef = useRef(0);
  const bpmRef = useRef(bpm);
  const stepsRef = useRef(steps);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

  useEffect(() => () => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const play = useCallback(() => {
    const s = stepsRef.current;
    if (s.length === 0) return;
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    nextNoteTimeRef.current = ctx.currentTime;
    currentIdxRef.current = 0;
    setActiveNoteIdx(0);
    setIsPlaying(true);

    schedulerRef.current = setInterval(() => {
      const audioCtx = audioCtxRef.current!;
      const n = stepsRef.current;
      if (n.length === 0) return;
      const beatDur = 60 / bpmRef.current;

      while (nextNoteTimeRef.current < audioCtx.currentTime + 0.1) {
        const idx = currentIdxRef.current % n.length;
        const entry = n[idx];
        const noteList = Array.isArray(entry) ? entry : [entry];
        for (const step of noteList) {
          const midi = OPEN_MIDI[step.string] + step.fret;
          const freq = 440 * Math.pow(2, (midi - 69) / 12);
          pluckString(audioCtx, freq, nextNoteTimeRef.current, 0.3);
        }

        const delay = Math.max(0, (nextNoteTimeRef.current - audioCtx.currentTime) * 1000);
        const capturedIdx = idx;
        setTimeout(() => setActiveNoteIdx(capturedIdx), delay);

        nextNoteTimeRef.current += beatDur;
        currentIdxRef.current++;
      }
    }, 25);
  }, [getCtx]);

  const stop = useCallback(() => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    setIsPlaying(false);
    setActiveNoteIdx(null);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) stop(); else play();
  }, [isPlaying, play, stop]);

  const playNote = useCallback((midiNote: number) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    pluckString(ctx, freq, ctx.currentTime, 0.3);
  }, [getCtx]);

  return { isPlaying, activeNoteIdx, play, stop, toggle, playNote };
}
