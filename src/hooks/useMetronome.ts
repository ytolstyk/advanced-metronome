import { useState, useRef, useEffect } from 'react';
import { ClickTrackEngine } from '@/audio/ClickTrackEngine';
import type { TrackPiece } from '@/audio/ClickTrackEngine';

const METRONOME_INFINITE_REPEATS = 999;

export interface UseMetronomeReturn {
  isOn: boolean;
  setEnabled: (enabled: boolean) => void;
  stop: () => void;
}

export function useMetronome(
  bpm: number,
  timeSig: { num: number; den: number },
): UseMetronomeReturn {
  const [isOn, setIsOn] = useState(false);
  const engineRef = useRef<ClickTrackEngine | null>(null);
  const isOnRef = useRef(false);

  function startEngine(currentBpm: number, currentTimeSig: { num: number; den: number }) {
    if (!engineRef.current) engineRef.current = new ClickTrackEngine();
    const piece: TrackPiece = {
      id: 'record-metro',
      label: `${currentBpm} BPM`,
      color: '#6ee7b7',
      groupId: null,
      timeSignature: { numerator: currentTimeSig.num, denominator: currentTimeSig.den },
      subdivision: 'quarter',
      bpm: currentBpm,
      repeats: METRONOME_INFINITE_REPEATS,
    };
    engineRef.current.start([piece], 0, 1, false, () => {}, () => {}, () => {});
  }

  // Auto-restart when BPM or time signature changes while the metronome is on
  useEffect(() => {
    if (!isOnRef.current) return;
    engineRef.current?.stop();
    startEngine(bpm, timeSig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, timeSig.num, timeSig.den]);

  // Hard unmount guard: stop the engine if React Router removes the owning component
  // while the metronome is playing (the open-prop effect in the modal doesn't cover this path)
  useEffect(() => {
    return () => { engineRef.current?.stop(); };
  }, []);

  function setEnabled(enabled: boolean) {
    setIsOn(enabled);
    isOnRef.current = enabled;
    if (!enabled) {
      engineRef.current?.stop();
    } else {
      startEngine(bpm, timeSig);
    }
  }

  function stop() {
    engineRef.current?.stop();
    setIsOn(false);
    isOnRef.current = false;
  }

  return { isOn, setEnabled, stop };
}
