import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import './TunerPage.css';
import type { StringCount } from '../data/tunings';
import { TUNINGS } from '../data/tunings';
import { NOTE_NAMES } from '../data/noteColors';

function noteToFreq(note: string, octave: number, a4 = 440): number {
  const midi = (octave + 1) * 12 + NOTE_NAMES.indexOf(note);
  return a4 * Math.pow(2, (midi - 69) / 12);
}

function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
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
function detectPitch(buffer: Float32Array, sampleRate: number): { freq: number; confidence: number } {
  const N = buffer.length;

  let rms = 0;
  for (let i = 0; i < N; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.008) return { freq: -1, confidence: 0 };

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

  let start = 0;
  while (start < maxLag - 1 && nsdf[start] > 0) start++;

  let globalMax = 0;
  for (let i = start; i < maxLag; i++) {
    if (nsdf[i] > globalMax) globalMax = nsdf[i];
  }
  if (globalMax < 0.25) return { freq: -1, confidence: 0 };

  const threshold = 0.8 * globalMax;
  let peakPos = -1;

  for (let i = start + 1; i < maxLag - 1; i++) {
    if (nsdf[i] > threshold && nsdf[i] >= nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) {
      peakPos = i;
      break;
    }
  }

  if (peakPos < 1 || peakPos >= maxLag - 1) return { freq: -1, confidence: 0 };

  const y1 = nsdf[peakPos - 1];
  const y2 = nsdf[peakPos];
  const y3 = nsdf[peakPos + 1];
  const d = 2 * y2 - y1 - y3;
  const shift = d !== 0 ? (y3 - y1) / (2 * d) : 0;

  return { freq: sampleRate / (peakPos + shift), confidence: globalMax };
}

// ── Wave drawing ───────────────────────────────────────────────────────────
// Reference wave scrolls at SCROLL_RATE. Input wave scrolls at SCROLL_RATE
// ± drift, where drift is proportional to signed cents. In tune → waves
// overlap perfectly. Out of tune → they slide apart, creating a visible beat.
const WAVE_CYCLES  = 2.5;
const SCROLL_RATE  = 2 * Math.PI * 0.45; // comfortable horizontal scroll speed
const MAX_BEAT     = 2 * Math.PI * 0.3;  // extra drift at ±50 ¢

function drawWave(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  confidence: number,
  cents: number | null,
  inTune: boolean,
  phaseTarget: number,
  phaseInput: number,
) {
  ctx.clearRect(0, 0, W, H);
  const cy = H / 2;
  const A  = H * 0.32;
  const hasSignal = confidence > 0.05;
  const k = WAVE_CYCLES * 2 * Math.PI / W; // spatial frequency

  // Faint centre guide
  ctx.strokeStyle = '#22223a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(W, cy);
  ctx.stroke();

  // Reference wave (always visible)
  ctx.strokeStyle = '#5060b8';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  for (let x = 0; x <= W; x++) {
    const y = cy + A * Math.sin(k * x + phaseTarget);
    if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!hasSignal) return;

  const absCents  = Math.abs(cents ?? 50);
  const color     = inTune ? '#5ddb7a' : absCents < 20 ? '#d4a840' : '#e07878';
  const confScale = Math.min(confidence / 0.5, 1);

  // Glow pass
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = inTune ? 16 : 8;
  ctx.strokeStyle = color;
  ctx.lineWidth   = inTune ? 2.5 : 2;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  for (let x = 0; x <= W; x++) {
    const y = cy + A * confScale * Math.sin(k * x + phaseInput);
    if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();
  ctx.restore();

  // Main input wave
  ctx.strokeStyle = color;
  ctx.lineWidth   = inTune ? 2.5 : 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x++) {
    const y = cy + A * confScale * Math.sin(k * x + phaseInput);
    if (x === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();
}

// ── Component ──────────────────────────────────────────────────────────────
const IN_TUNE_THRESHOLD = 5;

export function TunerPage() {
  const [stringCount, setStringCount] = useState<StringCount>(6);
  const [presetIdx, setPresetIdx] = useState(0);
  const [selectedString, setSelectedString] = useState(0);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [a4, setA4] = useState(440);
  const [confidence, setConfidence] = useState(0);
  const [playingRefIdx, setPlayingRefIdx] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const refOscRef = useRef<OscillatorNode | null>(null);
  const refCtxRef = useRef<AudioContext | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRafRef = useRef<number | null>(null);
  const phaseTargetRef = useRef(0);
  const phaseInputRef  = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  const safePresetIdx = Math.min(presetIdx, TUNINGS[stringCount].length - 1);
  const preset = TUNINGS[stringCount][safePresetIdx];
  const safeStringIdx = Math.min(selectedString, preset.strings.length - 1);
  const target = preset.strings[safeStringIdx];
  const targetFreq = noteToFreq(target.note, target.octave, a4);

  // Live values for the ring RAF loop — updated every render, no subscription needed
  const liveRef = useRef({ detectedFreq, targetFreq, confidence, cents: null as number | null, inTune: false });

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
    setConfidence(0);
  }, []);

  useEffect(() => { return stopListening; }, [stopListening]);

  const stopReferenceTone = useCallback(() => {
    refOscRef.current?.stop();
    refOscRef.current = null;
    void refCtxRef.current?.close();
    refCtxRef.current = null;
    setPlayingRefIdx(null);
  }, []);

  useEffect(() => { return stopReferenceTone; }, [stopReferenceTone]);

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
        if (frameRef.current % 3 !== 0) return;

        analyser.getFloatTimeDomainData(buf);
        const { freq, confidence: rawConf } = detectPitch(buf, ctx.sampleRate);

        if (freq > 20 && freq < 2000) {
          historyRef.current = [...historyRef.current.slice(-4), freq];
          const sorted = [...historyRef.current].sort((a, b) => a - b);
          setDetectedFreq(sorted[Math.floor(sorted.length / 2)]);
          setConfidence(rawConf);
        } else {
          if (historyRef.current.length > 0) historyRef.current = [];
          setDetectedFreq(null);
          setConfidence(0);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
      setIsListening(true);
    } catch (err) {
      setPermissionError(err instanceof Error ? err.message : 'Microphone access denied');
    }
  }, []);

  // ── Reference tone ─────────────────────────────────────────────────────
  const toggleReferenceTone = useCallback((idx: number) => {
    refOscRef.current?.stop();
    refOscRef.current = null;
    void refCtxRef.current?.close();
    refCtxRef.current = null;

    if (playingRefIdx === idx) {
      setPlayingRefIdx(null);
      return;
    }

    const s = preset.strings[idx];
    const freq = noteToFreq(s.note, s.octave, a4);
    const ctx = new AudioContext();
    refCtxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(gain);
    osc.start();
    refOscRef.current = osc;
    setPlayingRefIdx(idx);
  }, [playingRefIdx, preset.strings, a4]);

  // ── Derived values ─────────────────────────────────────────────────────
  let cents: number | null = null;
  let closestNote: string | null = null;
  let closestOctave: number | null = null;
  let detectedHz: string | null = null;

  if (detectedFreq !== null) {
    const midi = freqToMidi(detectedFreq, a4);
    const info = midiToNoteInfo(midi);
    closestNote = info.note;
    closestOctave = info.octave;
    cents = info.cents;
    detectedHz = detectedFreq.toFixed(1);
  }

  const inTune = cents !== null && Math.abs(cents) <= IN_TUNE_THRESHOLD;
  const isFlat = cents !== null && cents < -IN_TUNE_THRESHOLD;
  const isSharp = cents !== null && cents > IN_TUNE_THRESHOLD;
  const hasSignal = detectedFreq !== null;
  const statusClass = inTune ? 'in-tune' : isFlat ? 'flat' : isSharp ? 'sharp' : '';
  const confidenceClass = confidence > 0.7 ? 'high' : confidence > 0.4 ? 'mid' : 'low';

  // Sync live values into the ref after every render so the ring RAF loop
  // always reads the latest state without needing to re-subscribe
  useLayoutEffect(() => {
    liveRef.current = { detectedFreq, targetFreq, confidence, cents, inTune };
  });

  // ── Wave animation loop ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth  || 440;
    const H   = canvas.offsetHeight || 110;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx2d.scale(dpr, dpr);

    const loop = (timestamp: number) => {
      const dt = lastTimeRef.current !== null ? (timestamp - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = timestamp;

      const { confidence: conf, cents: c, inTune: it } = liveRef.current;

      // Signed cents: sharp → input scrolls faster (leads), flat → slower (lags).
      const drift = c !== null ? (c / 50) * MAX_BEAT : 0;
      phaseTargetRef.current += SCROLL_RATE * dt;
      phaseInputRef.current  += (SCROLL_RATE + drift) * dt;

      drawWave(ctx2d, W, H, conf, c, it,
        phaseTargetRef.current, phaseInputRef.current);

      ringRafRef.current = requestAnimationFrame(loop);
    };

    ringRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (ringRafRef.current !== null) cancelAnimationFrame(ringRafRef.current);
      lastTimeRef.current = null;
    };
  }, []); // runs once; live values come from liveRef

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
                onClick={() => { setStringCount(c); stopReferenceTone(); }}
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
            onChange={e => { setPresetIdx(Number(e.target.value)); stopReferenceTone(); }}
          >
            {TUNINGS[stringCount].map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="tuner-config-group">
          <label htmlFor="a4-slider" className="tuner-config-label">A4</label>
          <input
            type="range"
            id="a4-slider"
            min={432}
            max={446}
            step={1}
            value={a4}
            onChange={e => setA4(Number(e.target.value))}
            className="a4-slider"
            aria-label={`A4 reference: ${a4} Hz`}
          />
          <span className="a4-value">{a4} Hz</span>
        </div>
      </div>

      {/* ── String selector ───────────────────────────────────────────── */}
      <div className="string-selector" role="group" aria-label="Select string to tune">
        {preset.strings.map((s, i) => (
          <div key={i} className="str-btn-group">
            <button
              type="button"
              className={`str-btn${safeStringIdx === i ? ' active' : ''}`}
              onClick={() => setSelectedString(i)}
              aria-pressed={safeStringIdx === i}
              aria-label={`String ${i + 1}: ${s.note}${s.octave}`}
            >
              <span className="str-num" aria-hidden="true">{i + 1}</span>
              <span className="str-note" aria-hidden="true">{s.note}{s.octave}</span>
            </button>
            <button
              type="button"
              className={`str-ref-btn${playingRefIdx === i ? ' playing' : ''}`}
              onClick={() => toggleReferenceTone(i)}
              aria-pressed={playingRefIdx === i}
              aria-label={`${playingRefIdx === i ? 'Stop' : 'Play'} reference tone for string ${i + 1}: ${s.note}${s.octave}`}
            >
              {playingRefIdx === i ? '■' : '♪'}
            </button>
          </div>
        ))}
      </div>

      {/* ── Wave canvas ───────────────────────────────────────────────── */}
      <canvas ref={canvasRef} className="wave-canvas" aria-hidden="true" />

      {/* ── Detected note ─────────────────────────────────────────────── */}
      <div className={`detected-note ${statusClass}`} aria-hidden="true">
        {closestNote ?? (isListening ? '' : '—')}
        {closestOctave !== null && <span className="detected-octave">{closestOctave}</span>}
      </div>

      {/* ── Status + readout ──────────────────────────────────────────── */}
      <div className="tuner-status" aria-live="polite" aria-atomic="true">
        {isSharp && <span className="dir-arrow dir-down">Tune down ▼</span>}
        {inTune  && <span className="dir-ok">✓ In tune</span>}
        {isFlat  && <span className="dir-arrow dir-up">▲ Tune up</span>}
        {!hasSignal && isListening && <span className="dir-idle">Listening…</span>}
        <span className="sr-only">
          {hasSignal && closestNote
            ? `${closestNote}${closestOctave ?? ''}, ${inTune ? 'in tune' : isSharp ? `${cents} cents sharp, tune down` : `${Math.abs(cents ?? 0)} cents flat, tune up`}`
            : 'No signal detected'}
        </span>
      </div>

      <div className="tuner-readout" aria-hidden="true">
        <div className="readout-row">
          <span className="detected-cents">
            {cents !== null ? `${cents > 0 ? '+' : ''}${cents} ¢` : '—'}
          </span>
          <span className="readout-sep">·</span>
          <span className="detected-hz">{detectedHz ? `${detectedHz} Hz` : '—'}</span>
        </div>
        <div className="confidence-wrap">
          <span className="confidence-label">Signal</span>
          <div className="confidence-track" title={`Signal confidence: ${Math.round(confidence * 100)}%`}>
            <div
              className={`confidence-fill ${confidenceClass}`}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
        </div>
        <div className="target-info">
          Target: {target.note}{target.octave} · {targetFreq.toFixed(1)} Hz
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
