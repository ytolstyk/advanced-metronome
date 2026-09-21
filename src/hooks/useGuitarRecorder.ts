import { useState, useRef, useCallback, useEffect } from 'react';
import { getSupportedMimeType } from '@/utils/mediaRecorderUtils';

export const MAX_RECORD_SEC = 30;
const BITRATE = 64_000;
// 512 gives ~11ms of data per RAF frame — sufficient for smooth RMS meter at 60fps
const ANALYSER_FFT_SIZE = 512;
// empirical: mic RMS peaks ~0.1–0.15; ×8 maps that to 0–1 display range
const VOLUME_METER_GAIN = 8;
const RECORDER_TIMESLICE_MS = 100;

export interface UseGuitarRecorderReturn {
  isRecording: boolean;
  secondsLeft: number;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  audioDevices: MediaDeviceInfo[];
  error: string | null;
  meterBarRef: React.RefObject<HTMLDivElement | null>;
  /** Call on dialog open: resets state and enumerates audio devices */
  open: () => Promise<void>;
  /** Call on dialog close: tears down all streams and revokes object URL */
  close: () => void;
  /** Start recording from deviceId; returns an error message or null on success */
  start: (deviceId: string) => Promise<string | null>;
  /** Stop recording; triggers onstop which sets recordedBlob/recordedUrl asynchronously */
  stop: () => void;
}

export function useGuitarRecorder(): UseGuitarRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORD_SEC);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const volumeCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterBarRef = useRef<HTMLDivElement | null>(null);
  // Prevents creating an object URL after the modal has been closed mid-recording
  const closedRef = useRef(false);
  // Stable ref to stop so the countdown interval can always reach the latest stop fn.
  // Initialized below after stop is defined; kept in sync via useEffect.
  const stopRef = useRef<() => void>(() => {});

  const stopStreams = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    volumeCtxRef.current?.close();
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current = null;
    volumeCtxRef.current = null;
  }, []);

  const open = useCallback(async () => {
    closedRef.current = false;
    setError(null);
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(all.filter(d => d.kind === 'audioinput'));
    } catch {
      setError('Could not access microphone. Please check your browser permissions.');
    }
  }, []);

  const close = useCallback(() => {
    closedRef.current = true;
    stopStreams();
    setIsRecording(false);
    setSecondsLeft(MAX_RECORD_SEC);
    if (meterBarRef.current) meterBarRef.current.style.width = '0%';
    setRecordedBlob(null);
    setRecordedUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }, [stopStreams]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
  }, []);

  // Keep stopRef current so the countdown interval closure always reaches the latest stop fn
  useEffect(() => { stopRef.current = stop; }, [stop]);

  // Hard unmount guard: if the owning component is removed by React Router while recording,
  // the open-prop effect never fires its cleanup branch — so we must self-clean here.
  useEffect(() => {
    return () => {
      closedRef.current = true;
      stopStreams();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async (deviceId: string): Promise<string | null> => {
    closedRef.current = false;
    // Revoke any previous recording
    setRecordedUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setRecordedBlob(null);
    setError(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      const msg = 'Could not access microphone. Please check your browser permissions.';
      setError(msg);
      return msg;
    }
    // Guard: modal/component closed while getUserMedia was pending
    if (closedRef.current) {
      stream.getTracks().forEach(t => t.stop());
      return null;
    }
    streamRef.current = stream;

    // Volume meter: direct DOM writes bypass React re-renders entirely
    const ctx = new AudioContext();
    volumeCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    function tick() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      const rms = Math.sqrt(sum / buf.length);
      if (meterBarRef.current) {
        meterBarRef.current.style.width = `${Math.round(Math.min(1, rms * VOLUME_METER_GAIN) * 100)}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    // MediaRecorder
    // getSupportedMimeType already verified support internally — no double-check needed
    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: BITRATE,
    });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      // Guard: modal closed mid-recording — discard the blob, don't create a URL
      if (closedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      if (meterBarRef.current) meterBarRef.current.style.width = '0%';
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      stream.getTracks().forEach(t => t.stop());
      volumeCtxRef.current?.close();
      setIsRecording(false);
    };
    recorder.start(RECORDER_TIMESLICE_MS);
    setIsRecording(true);

    let secs = MAX_RECORD_SEC;
    setSecondsLeft(secs);
    timerRef.current = setInterval(() => {
      secs -= 1;
      setSecondsLeft(secs);
      if (secs <= 0) stopRef.current();
    }, 1000);

    return null;
  }, []);

  return {
    isRecording, secondsLeft, recordedBlob, recordedUrl,
    audioDevices, error, meterBarRef,
    open, close, start, stop,
  };
}
