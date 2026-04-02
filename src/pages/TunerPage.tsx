import { useState, useEffect, useRef, useCallback } from 'react';
import './TunerPage.css';
import type { StringCount } from '../data/tunings';
import { TUNINGS } from '../data/tunings';

// ── Helpers ────────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteToFreq(note: string, octave: number): number {
  const midi = (octave + 1) * 12 + NOTE_NAMES.indexOf(note);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function midiToNoteInfo(midi: number): { note: string; octave: number; cents: number } {
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  return {
    note: NOTE_NAMES[((rounded % 12) + 12) % 12],
    octave: Math.floor(rounded / 12) - 1,
    cents,
  };
}

// ── Pitch Detection (McLeod Pitch Method / NSDF) ───────────────────────────
function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const N = buffer.length;

  // RMS gate
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.008) return -1;

  const maxLag = Math.floor(N / 2);
  const nsdf = new Float32Array(maxLag);

  for (let tau = 0; tau < maxLag; tau++) {
    let acf = 0, energy = 0;
    for (let i = 0; i < N - tau; i++) {
      acf += buffer[i] * buffer[i + tau];
      energy += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
    }
    nsdf[tau] = energy > 0 ? 2 * acf / energy : 0;
  }

  // Find first zero crossing (skip initial positive lobe)
  let start = 0;
  while (start < maxLag - 1 && nsdf[start] > 0) start++;

  // Find global max after first zero crossing
  let globalMax = 0;
  for (let i = start; i < maxLag; i++) {
    if (nsdf[i] > globalMax) globalMax = nsdf[i];
  }
  if (globalMax < 0.25) return -1;

  // First peak above 80% of global max = fundamental
  const threshold = 0.8 * globalMax;
  let peakPos = -1;

  for (let i = start + 1; i < maxLag - 1; i++) {
    if (nsdf[i] > threshold && nsdf[i] >= nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) {
      peakPos = i;
      break;
    }
  }

  if (peakPos < 1 || peakPos >= maxLag - 1) return -1;

  // Parabolic interpolation
  const y1 = nsdf[peakPos - 1];
  const y2 = nsdf[peakPos];
  const y3 = nsdf[peakPos + 1];
  const d = 2 * y2 - y1 - y3;
  const shift = d !== 0 ? (y3 - y1) / (2 * d) : 0;

  return sampleRate / (peakPos + shift);
}

// ── Component ──────────────────────────────────────────────────────────────
const CENTS_RANGE = 50;
const IN_TUNE_THRESHOLD = 5;

export function TunerPage() {
  const [stringCount, setStringCount] = useState<StringCount>(6);
  const [presetIdx, setPresetIdx] = useState(0);
  const [selectedString, setSelectedString] = useState(0);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const frameRef = useRef(0);

  const safePresetIdx = Math.min(presetIdx, TUNINGS[stringCount].length - 1);
  const preset = TUNINGS[stringCount][safePresetIdx];
  const safeStringIdx = Math.min(selectedString, preset.strings.length - 1);
  const target = preset.strings[safeStringIdx];
  const targetFreq = noteToFreq(target.note, target.octave);

  // ── Audio lifecycle ────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current) void audioCtxRef.current.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    historyRef.current = [];
    frameRef.current = 0;
    setIsListening(false);
    setDetectedFreq(null);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const startListening = useCallback(async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;

      ctx.createMediaStreamSource(stream).connect(analyser);

      const buf = new Float32Array(analyser.fftSize);

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        frameRef.current++;
        if (frameRef.current % 3 !== 0) return; // ~20 fps

        analyser.getFloatTimeDomainData(buf);
        const freq = detectPitch(buf, ctx.sampleRate);

        if (freq > 20 && freq < 2000) {
          historyRef.current = [...historyRef.current.slice(-4), freq];
          const sorted = [...historyRef.current].sort((a, b) => a - b);
          setDetectedFreq(sorted[Math.floor(sorted.length / 2)]);
        } else {
          if (historyRef.current.length > 0) historyRef.current = [];
          setDetectedFreq(null);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
      setIsListening(true);
    } catch (err) {
      setPermissionError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────
  let cents: number | null = null;
  let closestNote: string | null = null;
  let closestOctave: number | null = null;
  let detectedHz: string | null = null;

  if (detectedFreq !== null) {
    const midi = freqToMidi(detectedFreq);
    const info = midiToNoteInfo(midi);
    closestNote = info.note;
    closestOctave = info.octave;
    cents = info.cents;
    detectedHz = detectedFreq.toFixed(1);
  }

  const clampedCents = cents !== null ? Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents)) : 0;
  const inTune = cents !== null && Math.abs(cents) <= IN_TUNE_THRESHOLD;
  const isFlat = cents !== null && cents < -IN_TUNE_THRESHOLD;
  const isSharp = cents !== null && cents > IN_TUNE_THRESHOLD;
  const hasSignal = detectedFreq !== null;

  // Cursor position: 0 = top (sharp), 50 = center (in tune), 100 = bottom (flat)
  // cents > 0 means sharp → cursor goes up; cents < 0 means flat → cursor goes down
  const cursorPercent = 50 - (clampedCents / CENTS_RANGE) * 50;

  const statusClass = inTune ? 'in-tune' : isFlat ? 'flat' : isSharp ? 'sharp' : '';

  return (
    <main className="tuner-page" aria-label="Guitar tuner">

      {/* ── Config row ────────────────────────────────────────────────── */}
      <div className="tuner-config">
        <div className="tuner-config-group">
          <span id="strings-label" className="tuner-config-label">Strings</span>
          <div className="string-count-btns" role="group" aria-labelledby="strings-label">
            {([6, 7, 8] as StringCount[]).map(c => (
              <button
                key={c}
                type="button"
                className={`sc-btn${stringCount === c ? ' active' : ''}`}
                onClick={() => setStringCount(c)}
                aria-pressed={stringCount === c}
                aria-label={`${c}-string`}
              >{c}</button>
            ))}
          </div>
        </div>
        <div className="tuner-config-group">
          <label htmlFor="tuning-select" className="tuner-config-label">Tuning</label>
          <select
            id="tuning-select"
            className="tuner-select"
            value={safePresetIdx}
            onChange={e => setPresetIdx(Number(e.target.value))}
          >
            {TUNINGS[stringCount].map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── String selector ───────────────────────────────────────────── */}
      <div className="string-selector" role="group" aria-label="Select string to tune">
        {preset.strings.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`str-btn${safeStringIdx === i ? ' active' : ''}`}
            onClick={() => setSelectedString(i)}
            aria-pressed={safeStringIdx === i}
            aria-label={`String ${i + 1}: ${s.note}${s.octave}`}
          >
            <span className="str-num" aria-hidden="true">{i + 1}</span>
            <span className="str-note" aria-hidden="true">{s.note}{s.octave}</span>
          </button>
        ))}
      </div>

      {/* ── Main tuner display ────────────────────────────────────────── */}
      <div className="tuner-display">

        {/* Left: direction hint */}
        <div className="tuner-direction">
          {isSharp && <span className="dir-arrow dir-down">Tune down</span>}
          {inTune && <span className="dir-ok">In tune</span>}
          {isFlat && <span className="dir-arrow dir-up">Tune up</span>}
        </div>

        {/* Center: vertical meter */}
        <div className="meter-column">
          <span className="meter-edge-label sharp-label">Sharp</span>
          <div className="meter-track">
            {/* Tick marks */}
            <div className="meter-tick" style={{ top: '0%' }}><span>+50</span></div>
            <div className="meter-tick" style={{ top: '25%' }}><span>+25</span></div>
            <div className="meter-tick meter-tick-center" style={{ top: '50%' }}><span>0</span></div>
            <div className="meter-tick" style={{ top: '75%' }}><span>-25</span></div>
            <div className="meter-tick" style={{ top: '100%' }}><span>-50</span></div>

            {/* Center target zone */}
            <div className="meter-target-zone" />

            {/* Cursor */}
            <div
              className={`meter-cursor ${statusClass}`}
              style={{
                top: `${cursorPercent}%`,
                opacity: hasSignal ? 1 : 0.15,
              }}
            />
          </div>
          <span className="meter-edge-label flat-label">Flat</span>
        </div>

        {/* Right: note readout */}
        <div className="tuner-readout" aria-live="polite" aria-atomic="true">
          <div className={`detected-note ${statusClass}`} aria-hidden="true">
            {closestNote ?? '—'}
            {closestOctave !== null && <span className="detected-octave">{closestOctave}</span>}
          </div>
          <div className="detected-cents" aria-hidden="true">
            {cents !== null ? `${cents > 0 ? '+' : ''}${cents} ¢` : '—'}
          </div>
          <div className="detected-hz" aria-hidden="true">
            {detectedHz ? `${detectedHz} Hz` : '—'}
          </div>
          <div className="target-info" aria-hidden="true">
            Target: {target.note}{target.octave} · {targetFreq.toFixed(1)} Hz
          </div>
          <span className="sr-only">
            {hasSignal && closestNote
              ? `${closestNote}${closestOctave ?? ''}, ${inTune ? 'in tune' : isSharp ? `${cents} cents sharp, tune down` : `${Math.abs(cents ?? 0)} cents flat, tune up`}`
              : 'No signal detected'}
          </span>
        </div>
      </div>

      {/* ── Start / Stop ──────────────────────────────────────────────── */}
      <button
        type="button"
        className={`tuner-mic-btn${isListening ? ' listening' : ''}`}
        onClick={() => isListening ? stopListening() : void startListening()}
        aria-pressed={isListening}
      >
        {isListening ? 'Stop' : 'Start Tuner'}
      </button>

      {permissionError && <p className="tuner-error" role="alert">{permissionError}</p>}
    </main>
  );
}
