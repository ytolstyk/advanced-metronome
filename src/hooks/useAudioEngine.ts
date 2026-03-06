import { useRef, useCallback, useEffect } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import type { AppState } from '../types';
import type { Action } from '../state';

export function useAudioEngine(
  state: AppState,
  dispatch: React.Dispatch<Action>,
  humanize: number,
  volume: number,
) {
  const engineRef = useRef<AudioEngine | null>(null);

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
    }
    return engineRef.current;
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  const play = useCallback(() => {
    const engine = getEngine();
    engine.setOnBeat((beat) => {
      dispatch({ type: 'SET_CURRENT_BEAT', beat });
    });
    engine.setOnStop(() => {
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      dispatch({ type: 'SET_CURRENT_BEAT', beat: 0 });
      dispatch({ type: 'SET_CURRENT_LOOP', loop: 0 });
    });
    engine.start(
      state.pattern,
      state.config.measures,
      state.config.bpm,
      state.config.loopCount,
    );
    dispatch({ type: 'SET_PLAYING', isPlaying: true });
  }, [state.pattern, state.config, dispatch, getEngine]);

  const pause = useCallback(() => {
    getEngine().pause();
    dispatch({ type: 'SET_PLAYING', isPlaying: false });
  }, [dispatch, getEngine]);

  const stop = useCallback(() => {
    getEngine().stop();
    dispatch({ type: 'SET_PLAYING', isPlaying: false });
    dispatch({ type: 'SET_CURRENT_BEAT', beat: 0 });
    dispatch({ type: 'SET_CURRENT_LOOP', loop: 0 });
  }, [dispatch, getEngine]);

  const resume = useCallback(() => {
    const engine = getEngine();
    engine.setOnBeat((beat) => {
      dispatch({ type: 'SET_CURRENT_BEAT', beat });
    });
    engine.setOnStop(() => {
      dispatch({ type: 'SET_PLAYING', isPlaying: false });
      dispatch({ type: 'SET_CURRENT_BEAT', beat: 0 });
      dispatch({ type: 'SET_CURRENT_LOOP', loop: 0 });
    });
    engine.resume(
      state.pattern,
      state.config.measures,
      state.config.bpm,
      state.config.loopCount,
    );
    dispatch({ type: 'SET_PLAYING', isPlaying: true });
  }, [state.pattern, state.config, dispatch, getEngine]);

  const togglePlayback = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else if (state.currentBeat > 0) {
      resume();
    } else {
      play();
    }
  }, [state.isPlaying, state.currentBeat, play, pause, resume]);

  // Update engine config when it changes during playback
  useEffect(() => {
    if (engineRef.current && state.isPlaying) {
      engineRef.current.updateConfig(
        state.pattern,
        state.config.measures,
        state.config.bpm,
        state.config.loopCount,
      );
    }
  }, [state.pattern, state.config, state.isPlaying]);

  useEffect(() => {
    engineRef.current?.setHumanize(humanize);
  }, [humanize]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  return {
    play,
    pause,
    stop,
    resume,
    togglePlayback,
    getEngine,
  };
}
