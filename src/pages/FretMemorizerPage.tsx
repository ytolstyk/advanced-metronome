import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { pluckString } from '@/audio/pluckString';
import type { StringCount } from '../data/tunings';
import { TUNINGS } from '../data/tunings';
import { saveScore } from '../api/fretMemorizerApi';
import './FretMemorizerPage.css';

// ── Note names & colors ────────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_FILL: Record<string, string> = {
  'C':  '#e05050', 'C#': '#b03838',
  'D':  '#e07828', 'D#': '#b05010',
  'E':  '#c8a800',
  'F':  '#9050e0', 'F#': '#6830b0',
  'G':  '#20b090', 'G#': '#107060',
  'A':  '#3878e0', 'A#': '#1050b0',
  'B':  '#d04080',
};

const NOTE_STROKE: Record<string, string> = {
  'C':  '#ff9999', 'C#': '#e06060',
  'D':  '#ffaa70', 'D#': '#e07840',
  'E':  '#f0d050',
  'F':  '#c090ff', 'F#': '#9868e0',
  'G':  '#50ddb0', 'G#': '#30a080',
  'A':  '#70aaff', 'A#': '#4080d0',
  'B':  '#ff90c0',
};

// ── Fretboard constants ────────────────────────────────────────────────────
const NUM_FRETS = 24;
const FRET_W = 64;
const STRING_H = 40;
const NUT_X = 40;
const LEFT_PAD = 8;
const RIGHT_PAD = 24;
const TOP_PAD = 40;
const BOTTOM_PAD = 40;
const CIRCLE_R = 14;
const SVG_W = LEFT_PAD + NUT_X + NUM_FRETS * FRET_W + RIGHT_PAD;
const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_DOT_FRETS = new Set([12, 24]);

function fretX(fret: number) {
  return LEFT_PAD + NUT_X + fret * FRET_W;
}
function stringY(svgStr: number) {
  return TOP_PAD + svgStr * STRING_H;
}
function svgH(numStrings: number) {
  return TOP_PAD + (numStrings - 1) * STRING_H + BOTTOM_PAD;
}

// ── Types ──────────────────────────────────────────────────────────────────
type GameMode = '10' | '20' | '30' | 'infinite';
type GamePhase = 'idle' | 'playing' | 'result';
type Feedback = 'correct' | 'wrong' | null;
type InputMode = 'click' | 'mic';

interface Question {
  targetNote: string;
  targetPc: number;
  targetSvgStr: number;
  validFrets: number[];
}

interface AnswerReveal {
  svgStr: number;
  frets: number[];
}

function generateQuestion(openMidi: number[], numStrings: number, allowedSvgStrings: number[], excludeKey: string | null = null): Question {
  // Try up to 40 times to get a question with valid frets that differs from the last question
  for (let attempt = 0; attempt < 40; attempt++) {
    const targetSvgStr = allowedSvgStrings[Math.floor(Math.random() * allowedSvgStrings.length)];
    const midiStrIdx = numStrings - 1 - targetSvgStr;
    const targetPc = Math.floor(Math.random() * 12);
    if (excludeKey === `${targetPc}-${targetSvgStr}`) continue;
    const validFrets: number[] = [];
    for (let fret = 0; fret <= NUM_FRETS; fret++) {
      if ((openMidi[midiStrIdx] + fret) % 12 === targetPc) {
        validFrets.push(fret);
      }
    }
    if (validFrets.length > 0) {
      return { targetNote: NOTE_NAMES[targetPc], targetPc, targetSvgStr, validFrets };
    }
  }
  // Fallback: C on first allowed string
  const fallbackSvgStr = allowedSvgStrings[0];
  const midiStrIdx = numStrings - 1 - fallbackSvgStr;
  const validFrets: number[] = [];
  for (let fret = 0; fret <= NUM_FRETS; fret++) {
    if ((openMidi[midiStrIdx] + fret) % 12 === 0) validFrets.push(fret);
  }
  return { targetNote: 'C', targetPc: 0, targetSvgStr: fallbackSvgStr, validFrets };
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Pitch detection (McLeod / NSDF) ────────────────────────────────────────
function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const N = buffer.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / N);
  if (rms < 0.02) return -1; // higher gate than tuner to reject ambient noise

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
  for (let i = start; i < maxLag; i++) if (nsdf[i] > globalMax) globalMax = nsdf[i];
  if (globalMax < 0.25) return -1;
  const threshold = 0.8 * globalMax;
  let peakPos = -1;
  for (let i = start + 1; i < maxLag - 1; i++) {
    if (nsdf[i] > threshold && nsdf[i] >= nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) {
      peakPos = i; break;
    }
  }
  if (peakPos < 1 || peakPos >= maxLag - 1) return -1;
  const y1 = nsdf[peakPos - 1], y2 = nsdf[peakPos], y3 = nsdf[peakPos + 1];
  const d = 2 * y2 - y1 - y3;
  const shift = d !== 0 ? (y3 - y1) / (2 * d) : 0;
  return sampleRate / (peakPos + shift);
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

// ── Fretboard ──────────────────────────────────────────────────────────────
interface FretboardProps {
  openMidi: number[];           // low → high
  numStrings: number;
  stringNames: string[];        // top → bottom (high → low)
  showNotes: boolean;
  focusedSvgStrings: Set<number>;
  highlightedKey: string | null;
  revealedKey: string | null;
  gamePhase: GamePhase;
  targetSvgStr: number | null;
  answerReveal: AnswerReveal | null;
  onFretClick: (svgStr: number, fret: number, midiNote: number, noteName: string) => void;
}

function Fretboard({
  openMidi, numStrings, stringNames, showNotes, focusedSvgStrings,
  highlightedKey, revealedKey,
  gamePhase, targetSvgStr, answerReveal,
  onFretClick,
}: FretboardProps) {
  const height = svgH(numStrings);
  const markerY = TOP_PAD + (numStrings - 1) * STRING_H + 24;

  // Fret position markers
  const markers: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    const cx = fretX(fret) - FRET_W / 2;
    if (SINGLE_DOT_FRETS.has(fret)) {
      markers.push(<circle key={`m${fret}`} cx={cx} cy={markerY} r={4} fill="#6060a0" />);
    } else if (DOUBLE_DOT_FRETS.has(fret)) {
      markers.push(
        <circle key={`ma${fret}`} cx={cx - 8} cy={markerY} r={4} fill="#6060a0" />,
        <circle key={`mb${fret}`} cx={cx + 8} cy={markerY} r={4} fill="#6060a0" />,
      );
    }
  }

  // Fret number labels
  const fretLabels: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    fretLabels.push(
      <text key={`fl${fret}`} x={fretX(fret) - FRET_W / 2} y={TOP_PAD - 24}
        textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#8888bb">
        {fret}
      </text>,
    );
  }

  // Note dots (one per fret×string intersection)
  const dots: React.ReactNode[] = [];
  for (let svgStr = 0; svgStr < numStrings; svgStr++) {
    const midiStrIdx = numStrings - 1 - svgStr;
    const cy = stringY(svgStr);

    for (let fret = 0; fret <= NUM_FRETS; fret++) {
      const midiNote = openMidi[midiStrIdx] + fret;
      const pc = midiNote % 12;
      const noteName = NOTE_NAMES[pc];
      const dotKey = `${svgStr}-${fret}`;
      const cx = fret === 0
        ? LEFT_PAD + NUT_X / 2
        : fretX(fret) - FRET_W / 2;

      const isHighlighted = dotKey === highlightedKey;
      const isRevealed = dotKey === revealedKey;
      const isAnswerReveal = answerReveal?.svgStr === svgStr && answerReveal.frets.includes(fret);

      let fill: string;
      let stroke: string;
      let opacity = 1;
      let textOpacity = 1;

      const isFocused = focusedSvgStrings.has(svgStr);

      if (isHighlighted) {
        fill = '#22dd88';
        stroke = '#66ffbb';
      } else if (isAnswerReveal) {
        fill = '#e09020';
        stroke = '#ffd060';
      } else if (gamePhase === 'playing') {
        fill = 'transparent';
        stroke = 'transparent';
        opacity = 0;
        textOpacity = 0;
      } else if (!isFocused) {
        fill = 'transparent';
        stroke = 'transparent';
        opacity = 0;
        textOpacity = 0;
      } else if (!showNotes) {
        if (isRevealed) {
          fill = NOTE_FILL[noteName] ?? '#888';
          stroke = NOTE_STROKE[noteName] ?? '#aaa';
        } else {
          fill = 'transparent';
          stroke = 'transparent';
          opacity = 0;
          textOpacity = 0;
        }
      } else {
        fill = NOTE_FILL[noteName] ?? '#888';
        stroke = NOTE_STROKE[noteName] ?? '#aaa';
      }

      // Make invisible dots still clickable with a larger transparent hit area
      dots.push(
        <g
          key={dotKey}
          onClick={() => onFretClick(svgStr, fret, midiNote, noteName)}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label={`${noteName} on ${stringNames[svgStr]} string fret ${fret}`}
        >
          {/* Hit area — always covers full circle */}
          <circle cx={cx} cy={cy} r={CIRCLE_R + 4} fill="transparent" />
          <circle
            cx={cx} cy={cy} r={CIRCLE_R}
            fill={fill} stroke={stroke} strokeWidth="1.5"
            opacity={opacity}
          />
          <text
            x={cx} y={cy}
            textAnchor="middle" dominantBaseline="central"
            fontSize="11" fontWeight="700" fill="white"
            opacity={textOpacity}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {noteName}
          </text>
        </g>,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${height}`} width={SVG_W} height={height} aria-label="Guitar fretboard">
      {/* String lines */}
      {Array.from({ length: numStrings }, (_, i) => (
        <line
          key={`str${i}`}
          x1={LEFT_PAD} y1={stringY(i)} x2={SVG_W - RIGHT_PAD} y2={stringY(i)}
          stroke={gamePhase === 'playing' && i === targetSvgStr ? '#5b7fff' : '#444466'}
          strokeWidth={i === 0 ? 0.8 : i === numStrings - 1 ? 1.8 : 1 + i * 0.2}
          className={gamePhase === 'playing' && i === targetSvgStr ? 'fm-string-glow' : undefined}
        />
      ))}

      {/* Nut */}
      <line
        x1={LEFT_PAD + NUT_X} y1={TOP_PAD - 4}
        x2={LEFT_PAD + NUT_X} y2={TOP_PAD + (numStrings - 1) * STRING_H + 4}
        stroke="#aaaacc" strokeWidth="3" strokeLinecap="round"
      />

      {/* Fret lines */}
      {Array.from({ length: NUM_FRETS }, (_, i) => (
        <line
          key={`fret${i}`}
          x1={fretX(i + 1)} y1={TOP_PAD - 2}
          x2={fretX(i + 1)} y2={TOP_PAD + (numStrings - 1) * STRING_H + 2}
          stroke="#333355" strokeWidth="1"
        />
      ))}

      {/* String name labels */}
      {stringNames.map((name, i) => (
        <text
          key={`sn${i}`}
          x={LEFT_PAD + NUT_X / 2} y={stringY(i)}
          textAnchor="middle" dominantBaseline="central"
          fontSize="12" fill={gamePhase === 'playing' && i === targetSvgStr ? '#8eaaff' : '#777799'}
          fontWeight="600"
        >
          {name}
        </text>
      ))}

      {fretLabels}
      {markers}
      {dots}
    </svg>
  );
}

// ── Toggle style ───────────────────────────────────────────────────────────
const TOGGLE_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]';

// ── FretMemorizerPage ──────────────────────────────────────────────────────
export function FretMemorizerPage() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  // ── Guitar config ────────────────────────────────────────────────────────
  const [stringCount, setStringCount] = useState<StringCount>(() => {
    const v = localStorage.getItem('fretMem.stringCount');
    const n = Number(v);
    return (n === 6 || n === 7 || n === 8) ? n as StringCount : 6;
  });
  const [tuningIdx, setTuningIdx] = useState(() => {
    const v = parseInt(localStorage.getItem('fretMem.tuningIdx') ?? '0', 10);
    return isNaN(v) ? 0 : v;
  });

  // Keep tuningIdx in range when stringCount changes
  const safeTuningIdx = Math.min(tuningIdx, TUNINGS[stringCount].length - 1);
  const tuning = TUNINGS[stringCount][safeTuningIdx];

  // openMidi: low → high (same order as tuning.strings)
  const openMidi = tuning.strings.map(
    ({ note, octave }) => (octave + 1) * 12 + NOTE_NAMES.indexOf(note),
  );
  // stringNames: top → bottom (high → low for display)
  const stringNames = [...tuning.strings].reverse().map((s) => s.note);

  // ── String focus ─────────────────────────────────────────────────────────
  const [focusedSvgStrings, setFocusedSvgStrings] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`fretMem.focusedStrings.${stringCount}`);
      if (raw) {
        const arr = JSON.parse(raw) as number[];
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch { /* ignore */ }
    return new Set(Array.from({ length: stringCount }, (_, i) => i));
  });

  // ── Explore state ────────────────────────────────────────────────────────
  const [showNotes, setShowNotes] = useState(() => localStorage.getItem('fretMem.showNotes') !== 'false');
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Game state ───────────────────────────────────────────────────────────
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const v = localStorage.getItem('fretMem.gameMode');
    return (v === '10' || v === '20' || v === '30' || v === 'infinite') ? v as GameMode : '10';
  });
  const [question, setQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [answerReveal, setAnswerReveal] = useState<AnswerReveal | null>(null);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false); // prevents double-clicks during feedback

  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Input mode + mic state ────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>(() => {
    const v = localStorage.getItem('fretMem.inputMode');
    return (v === 'click' || v === 'mic') ? v as InputMode : 'click';
  });
  const [micError, setMicError] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  // 'waiting_silence' = waiting for audio to go quiet before accepting a new answer
  // 'active'          = listening for the player's note
  // 'off'             = not running
  const [micListenPhase, setMicListenPhase] = useState<'off' | 'waiting_silence' | 'active'>('off');

  // ── Persist selections ────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('fretMem.stringCount', String(stringCount)); }, [stringCount]);
  useEffect(() => { localStorage.setItem('fretMem.tuningIdx', String(tuningIdx)); }, [tuningIdx]);
  useEffect(() => {
    localStorage.setItem(`fretMem.focusedStrings.${stringCount}`, JSON.stringify([...focusedSvgStrings]));
  }, [stringCount, focusedSvgStrings]);
  useEffect(() => { localStorage.setItem('fretMem.showNotes', String(showNotes)); }, [showNotes]);
  useEffect(() => { localStorage.setItem('fretMem.gameMode', gameMode); }, [gameMode]);
  useEffect(() => { localStorage.setItem('fretMem.inputMode', inputMode); }, [inputMode]);

  const micCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micFrameRef = useRef(0);
  // Silence-gate: how many consecutive frames have been below the silence threshold
  const silenceFramesRef = useRef(0);
  // Consecutive-note detection: reset whenever pitch class changes
  const consecutivePcRef = useRef<number | null>(null);
  const consecutiveCountRef = useRef(0);
  // Current detection state (ref so RAF always sees latest value)
  const micDetectStateRef = useRef<'off' | 'waiting_silence' | 'active'>('off');
  const handleMicAnswerRef = useRef<((pc: number) => void) | null>(null);

  function getOrCreateAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  // ── Mic lifecycle ────────────────────────────────────────────────────────
  // RMS must stay below this for SILENCE_FRAMES consecutive ticks before detection activates.
  // Using the original TunerPage gate (0.008) so even quiet rooms trigger quickly.
  const SILENCE_RMS = 0.008;
  const SILENCE_FRAMES = 6; // ~300ms at 20fps — guitar string must have decayed

  const stopMic = useCallback(() => {
    if (micRafRef.current !== null) cancelAnimationFrame(micRafRef.current);
    micRafRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (micCtxRef.current) void micCtxRef.current.close();
    micCtxRef.current = null;
    micAnalyserRef.current = null;
    micFrameRef.current = 0;
    silenceFramesRef.current = 0;
    consecutivePcRef.current = null;
    consecutiveCountRef.current = 0;
    micDetectStateRef.current = 'off';
    setMicNote(null);
    setMicListenPhase('off');
  }, [setMicNote, setMicListenPhase]);

  const startMic = useCallback(async (): Promise<boolean> => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      micCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      micAnalyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      const tick = () => {
        micRafRef.current = requestAnimationFrame(tick);
        micFrameRef.current++;
        if (micFrameRef.current % 3 !== 0) return;

        analyser.getFloatTimeDomainData(buf);

        if (micDetectStateRef.current === 'waiting_silence') {
          // Compute RMS to detect silence (without full pitch detection)
          let rms = 0;
          for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          rms = Math.sqrt(rms / buf.length);

          if (rms < SILENCE_RMS) {
            silenceFramesRef.current++;
            if (silenceFramesRef.current >= SILENCE_FRAMES) {
              // String has stopped — now safe to listen for the player's answer
              micDetectStateRef.current = 'active';
              silenceFramesRef.current = 0;
              consecutivePcRef.current = null;
              consecutiveCountRef.current = 0;
              setMicNote(null);
              setMicListenPhase('active');
            }
          } else {
            silenceFramesRef.current = 0; // string still ringing — keep waiting
          }
          return;
        }

        if (micDetectStateRef.current !== 'active') return;

        const freq = detectPitch(buf, ctx.sampleRate);

        if (freq >= 60 && freq <= 1400) {
          const midi = freqToMidi(freq);
          const cents = (midi - Math.round(midi)) * 100;
          if (Math.abs(cents) <= 25) {
            const pc = ((Math.round(midi) % 12) + 12) % 12;
            setMicNote(NOTE_NAMES[pc]);
            // Require 3 CONSECUTIVE frames of the same pc — resets on any change
            if (pc === consecutivePcRef.current) {
              consecutiveCountRef.current++;
            } else {
              consecutivePcRef.current = pc;
              consecutiveCountRef.current = 1;
            }
            if (consecutiveCountRef.current >= 3) {
              handleMicAnswerRef.current?.(pc);
            }
          } else {
            // Pitch exists but not close enough to any semitone — reset streak
            consecutivePcRef.current = null;
            consecutiveCountRef.current = 0;
          }
        } else {
          // No pitch detected — reset streak
          consecutivePcRef.current = null;
          consecutiveCountRef.current = 0;
          setMicNote(null);
        }
      };

      micRafRef.current = requestAnimationFrame(tick);
      return true;
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Microphone access denied');
      return false;
    }
  }, [setMicError, setMicNote, setMicListenPhase, SILENCE_RMS, SILENCE_FRAMES]);

  // Called after each question is set — waits for silence before listening
  function beginSilenceWait() {
    micDetectStateRef.current = 'waiting_silence';
    silenceFramesRef.current = 0;
    consecutivePcRef.current = null;
    consecutiveCountRef.current = 0;
    setMicListenPhase('waiting_silence');
    setMicNote(null);
  }

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase === 'playing') {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gamePhase]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => () => {
    [timerRef, feedbackTimer, answerTimer, advanceTimer, highlightTimer, revealTimer].forEach((r) => {
      if (r.current) clearTimeout(r.current as ReturnType<typeof setTimeout>);
    });
    stopMic();
  }, [stopMic]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const clearFeedbackTimers = useCallback(() => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    if (answerTimer.current) clearTimeout(answerTimer.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    feedbackTimer.current = null;
    answerTimer.current = null;
    advanceTimer.current = null;
  }, []);

  function endGame(finalScore: number, finalWrong: number, finalTotal: number, finalElapsed: number) {
    clearFeedbackTimers();
    stopMic();
    setGamePhase('result');
    setHighlightedKey(null);
    setAnswerReveal(null);
    setFeedback(null);
    processingRef.current = false;

    if (authStatus === 'authenticated') {
      void saveScore({
        score: finalScore,
        wrongAnswers: finalWrong,
        totalQuestions: finalTotal,
        elapsedSeconds: finalElapsed,
        gameMode,
        stringCount,
        tuning: tuning.name,
      }).then((ok) => setScoreSaved(ok));
    }
  }

  async function handleStartGame() {
    if (inputMode === 'mic') {
      const ok = await startMic();
      if (!ok) return;
    }
    clearFeedbackTimers();
    setScore(0);
    setWrongAnswers(0);
    setQuestionsAnswered(0);
    setElapsedSeconds(0);
    setFeedback(null);
    setAnswerReveal(null);
    setHighlightedKey(null);
    setScoreSaved(false);
    setStoppedEarly(false);
    processingRef.current = false;
    const q = generateQuestion(openMidi, stringCount, [...focusedSvgStrings]);
    setQuestion(q);
    setGamePhase('playing');
    if (inputMode === 'mic') beginSilenceWait();
  }

  function stopGame() {
    clearFeedbackTimers();
    stopMic();
    setGamePhase('result');
    setStoppedEarly(true);
    setHighlightedKey(null);
    setAnswerReveal(null);
    setFeedback(null);
    processingRef.current = false;
  }

  function playAgain() {
    setGamePhase('idle');
    setQuestion(null);
  }

  function advanceToNext(
    nextScore: number, nextWrong: number, nextAnswered: number, currentElapsed: number, excludeKey: string | null,
  ) {
    const limit = gameMode === 'infinite' ? Infinity : parseInt(gameMode, 10);
    if (nextAnswered >= limit) {
      endGame(nextScore, nextWrong, nextAnswered, currentElapsed);
    } else {
      const q = generateQuestion(openMidi, stringCount, [...focusedSvgStrings], excludeKey);
      setQuestion(q);
      setHighlightedKey(null);
      setAnswerReveal(null);
      setFeedback(null);
      processingRef.current = false;
      if (inputMode === 'mic') beginSilenceWait();
    }
  }

  // ── Fret click handler ───────────────────────────────────────────────────
  function handleFretClick(svgStr: number, fret: number, midiNote: number) {
    // Play sound always
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    pluckString(ctx, freq, ctx.currentTime, 0.35);

    if (gamePhase === 'idle') {
      const key = `${svgStr}-${fret}`;
      // Highlight
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setHighlightedKey(key);
      highlightTimer.current = setTimeout(() => setHighlightedKey(null), 1000);

      // Reveal note if hidden
      if (!showNotes) {
        if (revealTimer.current) clearTimeout(revealTimer.current);
        setRevealedKey(key);
        revealTimer.current = setTimeout(() => setRevealedKey(null), 1500);
      }
      return;
    }

    if (gamePhase !== 'playing' || !question || processingRef.current) return;
    if (inputMode === 'mic') return; // mic mode: answers come from microphone only

    const isCorrectStr = svgStr === question.targetSvgStr;
    const isCorrectFret = question.validFrets.includes(fret);
    const isCorrect = isCorrectStr && isCorrectFret;

    processingRef.current = true;
    clearFeedbackTimers();

    if (isCorrect) {
      const nextScore = score + 1;
      const nextAnswered = questionsAnswered + 1;
      setScore(nextScore);
      setQuestionsAnswered(nextAnswered);
      setFeedback('correct');
      setHighlightedKey(`${svgStr}-${fret}`);

      const currentKey = `${question.targetPc}-${question.targetSvgStr}`;
      feedbackTimer.current = setTimeout(() => {
        advanceToNext(nextScore, wrongAnswers, nextAnswered, elapsedSeconds, currentKey);
      }, 600);
    } else {
      const nextWrong = wrongAnswers + 1;
      setWrongAnswers(nextWrong);
      setFeedback('wrong');

      if (gameMode === 'infinite') {
        // Show answer then end
        setAnswerReveal({ svgStr: question.targetSvgStr, frets: question.validFrets });
        answerTimer.current = setTimeout(() => {
          endGame(score, nextWrong, questionsAnswered, elapsedSeconds);
        }, 1200);
      } else {
        const nextAnswered = questionsAnswered + 1;
        setQuestionsAnswered(nextAnswered);
        setAnswerReveal({ svgStr: question.targetSvgStr, frets: question.validFrets });

        const currentKey = `${question.targetPc}-${question.targetSvgStr}`;
        answerTimer.current = setTimeout(() => {
          advanceToNext(score, nextWrong, nextAnswered, elapsedSeconds, currentKey);
        }, 900);
      }
    }
  }

  // ── String count change resets tuning ────────────────────────────────────
  function handleStringCountChange(v: string) {
    if (!v || gamePhase === 'playing') return;
    const n = Number(v) as StringCount;
    setStringCount(n);
    setTuningIdx(0);
    try {
      const raw = localStorage.getItem(`fretMem.focusedStrings.${n}`);
      if (raw) {
        const arr = JSON.parse(raw) as number[];
        if (Array.isArray(arr) && arr.length > 0) {
          setFocusedSvgStrings(new Set(arr));
        } else {
          setFocusedSvgStrings(new Set(Array.from({ length: n }, (_, i) => i)));
        }
      } else {
        setFocusedSvgStrings(new Set(Array.from({ length: n }, (_, i) => i)));
      }
    } catch {
      setFocusedSvgStrings(new Set(Array.from({ length: n }, (_, i) => i)));
    }
    setGamePhase('idle');
    setQuestion(null);
  }

  function handleTuningChange(v: string) {
    if (!v || gamePhase === 'playing') return;
    setTuningIdx(Number(v));
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const limit = gameMode === 'infinite' ? null : parseInt(gameMode, 10);
  const targetStringName = question != null ? stringNames[question.targetSvgStr] : null;

  // ── Mic answer handler (kept fresh via effect so closures always see latest state) ─
  useEffect(() => {
    handleMicAnswerRef.current = (pc: number) => {
      if (micDetectStateRef.current !== 'active' || !question) return;
      micDetectStateRef.current = 'off';
      consecutivePcRef.current = null;
      consecutiveCountRef.current = 0;
      processingRef.current = true;
      clearFeedbackTimers();

      const isCorrect = pc === question.targetPc;
      if (isCorrect) {
        const nextScore = score + 1;
        const nextAnswered = questionsAnswered + 1;
        setScore(nextScore);
        setQuestionsAnswered(nextAnswered);
        setFeedback('correct');
        const currentKey = `${question.targetPc}-${question.targetSvgStr}`;
        feedbackTimer.current = setTimeout(() => {
          advanceToNext(nextScore, wrongAnswers, nextAnswered, elapsedSeconds, currentKey);
        }, 600);
      } else {
        const nextWrong = wrongAnswers + 1;
        setWrongAnswers(nextWrong);
        setFeedback('wrong');
        if (gameMode === 'infinite') {
          setAnswerReveal({ svgStr: question.targetSvgStr, frets: question.validFrets });
          answerTimer.current = setTimeout(() => {
            endGame(score, nextWrong, questionsAnswered, elapsedSeconds);
          }, 1200);
        } else {
          const nextAnswered = questionsAnswered + 1;
          setQuestionsAnswered(nextAnswered);
          setAnswerReveal({ svgStr: question.targetSvgStr, frets: question.validFrets });
          const currentKey = `${question.targetPc}-${question.targetSvgStr}`;
          answerTimer.current = setTimeout(() => {
            advanceToNext(score, nextWrong, nextAnswered, elapsedSeconds, currentKey);
          }, 900);
        }
      }
    };
  });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1400px] mx-auto" aria-label="Fret memorizer">
      <h1 className="text-xl font-bold text-[#d0d0f0]">Fret Memorizer</h1>

      {/* ── Guitar config ─────────────────────────────────────────────────── */}
      {gamePhase !== 'playing' && (
        <div className="flex flex-col gap-3">
          {/* String count */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1 w-14">
              Strings
            </span>
            <ToggleGroup
              type="single"
              value={String(stringCount)}
              onValueChange={handleStringCountChange}
              className="flex gap-1"
            >
              {(['6', '7', '8'] as const).map((n) => (
                <ToggleGroupItem key={n} value={n} className={TOGGLE_CLS}>{n}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Tuning */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1 w-14">
              Tuning
            </span>
            <ToggleGroup
              type="single"
              value={String(safeTuningIdx)}
              onValueChange={handleTuningChange}
              className="flex flex-wrap gap-1"
            >
              {TUNINGS[stringCount].map((preset, idx) => (
                <ToggleGroupItem key={preset.name} value={String(idx)} className={TOGGLE_CLS}>
                  {preset.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* String focus selector */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1 w-14">
              Focus
            </span>
            {stringNames.map((name, svgStr) => (
              <button
                key={svgStr}
                onClick={() => {
                  setFocusedSvgStrings((prev) => {
                    const next = new Set(prev);
                    if (next.has(svgStr)) {
                      if (next.size > 1) next.delete(svgStr);
                    } else {
                      next.add(svgStr);
                    }
                    return next;
                  });
                }}
                className={
                  TOGGLE_CLS +
                  (focusedSvgStrings.has(svgStr)
                    ? ' !border-[#5b7fff] !bg-[#252850] !text-[#8eaaff]'
                    : '')
                }
              >
                {name}
              </button>
            ))}
          </div>

          {/* Show notes toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotes((v) => !v)}
              className={
                'px-4 py-1.5 text-[0.82rem] font-semibold rounded-md border transition-colors ' +
                (showNotes
                  ? 'border-[#22dd88] bg-[#0d1f17] text-[#22dd88]'
                  : 'border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]')
              }
            >
              {showNotes ? '✦ Show Notes' : 'Show Notes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Note color legend ──────────────────────────────────────────────── */}
      {showNotes && gamePhase !== 'playing' && (
        <div className="flex flex-wrap gap-2">
          {NOTE_NAMES.map((note) => (
            <span key={note} className="flex items-center gap-1 text-[0.72rem] text-[#aaaacc]">
              <svg width="14" height="14">
                <circle cx="7" cy="7" r="6" fill={NOTE_FILL[note]} stroke={NOTE_STROKE[note]} strokeWidth="1.5" />
              </svg>
              {note}
            </span>
          ))}
        </div>
      )}

      {/* ── Game question banner ───────────────────────────────────────────── */}
      {gamePhase === 'playing' && question && (
        <div className={`rounded-xl border px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3
          ${feedback === 'correct' ? 'border-[#22dd88] bg-[#081a10] fm-feedback-correct' :
            feedback === 'wrong'   ? 'border-[#dd4444] bg-[#1a0808] fm-feedback-wrong' :
                                     'border-[#3a3a60] bg-[#0b0b16]'}`}
        >
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8] mb-1">
              Find this note
            </div>
            <div className="text-2xl font-bold text-white tracking-wide">
              <span style={{ color: NOTE_FILL[question.targetNote] ?? '#fff' }}>
                {question.targetNote}
              </span>
              <span className="text-[#666688] mx-2 text-xl font-normal">on</span>
              <span className="text-[#8eaaff]">{targetStringName}</span>
              <span className="text-[#666688] ml-2 text-xl font-normal">string</span>
            </div>
            {feedback && (
              <div className={`mt-1 text-sm font-semibold ${feedback === 'correct' ? 'text-[#22dd88]' : 'text-[#ff7777]'}`}>
                {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong — highlighted in orange'}
              </div>
            )}
            {inputMode === 'mic' && !feedback && (
              <div className="mt-1 text-sm text-[#8080b8] flex items-center gap-1.5">
                <span>🎤</span>
                {micListenPhase === 'waiting_silence'
                  ? <span>let the string stop ringing…</span>
                  : micNote
                    ? <span style={{ color: NOTE_FILL[micNote] ?? '#aaa', fontWeight: 700 }}>{micNote}</span>
                    : <span>play the note</span>
                }
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 shrink-0">
            {/* Timer */}
            <div className="text-center">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Time</div>
              <div className="text-xl font-bold tabular-nums text-[#aaaacc]">{formatTime(elapsedSeconds)}</div>
            </div>
            {/* Score */}
            <div className="text-center">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Score</div>
              <div className="text-xl font-bold tabular-nums text-[#22dd88]">
                {score}{limit != null ? <span className="text-[#555578] text-base">/{limit}</span> : null}
              </div>
            </div>
            {/* Wrong */}
            {wrongAnswers > 0 && (
              <div className="text-center">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Wrong</div>
                <div className="text-xl font-bold tabular-nums text-[#ff7777]">{wrongAnswers}</div>
              </div>
            )}
            {/* Stop button */}
            <button
              onClick={stopGame}
              className="h-9 px-4 text-[0.82rem] font-semibold rounded-md border border-[#6a2020] bg-[#0f0808] text-[#dd7777] hover:border-[#dd4444] hover:text-[#ff8888] transition-colors shrink-0"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* ── Fretboard ─────────────────────────────────────────────────────── */}
      {gamePhase !== 'result' && (
        <div className="overflow-x-auto rounded-xl border border-[#333355] bg-[#0d0d18] p-3">
          <Fretboard
            openMidi={openMidi}
            numStrings={stringCount}
            stringNames={stringNames}
            showNotes={showNotes}
            focusedSvgStrings={focusedSvgStrings}
            highlightedKey={highlightedKey}
            revealedKey={revealedKey}
            gamePhase={gamePhase}
            targetSvgStr={question?.targetSvgStr ?? null}
            answerReveal={answerReveal}
            onFretClick={handleFretClick}
          />
        </div>
      )}

      {/* ── Game controls (idle) ───────────────────────────────────────────── */}
      {gamePhase === 'idle' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">
              Practice Game
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.75rem] text-[#9898c8]">Mode:</span>
              <ToggleGroup
                type="single"
                value={gameMode}
                onValueChange={(v) => { if (v) setGameMode(v as GameMode); }}
                className="flex gap-1"
              >
                {(['10', '20', '30', 'infinite'] as const).map((m) => (
                  <ToggleGroupItem key={m} value={m} className={TOGGLE_CLS}>
                    {m === 'infinite' ? '∞' : `${m}Q`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.75rem] text-[#9898c8]">Input:</span>
              <ToggleGroup
                type="single"
                value={inputMode}
                onValueChange={(v) => { if (v) { setInputMode(v as InputMode); setMicError(null); } }}
                className="flex gap-1"
              >
                <ToggleGroupItem value="click" className={TOGGLE_CLS}>Click</ToggleGroupItem>
                <ToggleGroupItem value="mic" className={TOGGLE_CLS}>🎤 Microphone</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {micError && (
              <p className="text-[0.75rem] text-[#ff7777]">Mic error: {micError}</p>
            )}
            <p className="text-[0.75rem] text-[#606080]">
              {gameMode === 'infinite'
                ? 'Answer until you make a mistake or stop.'
                : `Answer ${gameMode} questions. Wrong answers are tracked but the game continues.`}
              {inputMode === 'mic' && ' Play the note on your guitar — the mic will listen.'}
            </p>
          </div>
          <button
            onClick={() => { void handleStartGame(); }}
            className="h-10 px-6 text-[0.9rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] hover:text-[#66ffbb] transition-colors shrink-0"
          >
            ▶ Start Practice
          </button>
        </div>
      )}

      {/* ── Result screen ─────────────────────────────────────────────────── */}
      {gamePhase === 'result' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-6 py-6 flex flex-col gap-4 max-w-md mx-auto w-full">
          <div className="text-lg font-bold text-[#d0d0f0]">Game Over</div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8] mb-1">Correct</div>
              <div className="text-3xl font-bold text-[#22dd88]">{score}</div>
            </div>
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8] mb-1">Wrong</div>
              <div className="text-3xl font-bold text-[#ff7777]">{wrongAnswers}</div>
            </div>
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8] mb-1">Time</div>
              <div className="text-3xl font-bold tabular-nums text-[#aaaacc]">{formatTime(elapsedSeconds)}</div>
            </div>
          </div>

          {questionsAnswered > 0 && (
            <div className="text-center text-[0.82rem] text-[#8888b8]">
              {Math.round((score / questionsAnswered) * 100)}% accuracy over {questionsAnswered} question{questionsAnswered !== 1 ? 's' : ''}
            </div>
          )}

          {authStatus === 'authenticated' && !stoppedEarly && (
            <div className="text-[0.75rem] text-center text-[#606080]">
              {scoreSaved ? '✓ Score saved' : 'Saving score…'}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={playAgain}
              className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] transition-colors"
            >
              Play Again
            </button>
            <button
              onClick={() => { setGamePhase('idle'); setQuestion(null); }}
              className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#3a3a60] bg-[#0b0b16] text-[#8888b8] hover:border-[#5050a0] hover:text-[#aaaacc] transition-colors"
            >
              Back to Explore
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
