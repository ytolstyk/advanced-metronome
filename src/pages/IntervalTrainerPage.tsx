import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { pluckString } from '@/audio/pluckString';
import type { StringCount } from '../data/tunings';
import { TUNINGS } from '../data/tunings';
import type { IntervalName } from '../data/intervals';
import { INTERVAL_SEMITONES } from '../data/intervals';
import { saveScore } from '../api/intervalTrainerApi';
import { NOTE_NAMES } from '../data/noteColors';
import { useNoteColors } from '../context/noteColorsContextDef';
import './IntervalTrainerPage.css';

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

interface IntervalQuestion {
  interval: IntervalName;
  rootFret: number;
  targetFret: number;
  svgStr: number;
  rootNoteName: string;
  rootMidi: number;
}

// ── Difficulty tiers (each level adds intervals to the pool) ──────────────
const TIERS: IntervalName[][] = [
  ['Perfect 4th', 'Perfect 5th'],
  ['Minor 3rd', 'Major 3rd', 'Octave'],
  ['Major 2nd', 'Minor 6th', 'Major 6th'],
  ['Minor 2nd', 'Minor 7th', 'Major 7th', 'Tritone'],
];
const TIER_NAMES = ['Starter', 'Easy', 'Medium', 'Hard'];

function getActiveIntervals(tierIdx: number): IntervalName[] {
  return TIERS.slice(0, tierIdx + 1).flat();
}

// ── Question generation ────────────────────────────────────────────────────
function generateQuestion(
  openMidi: number[],
  numStrings: number,
  activeIntervals: IntervalName[],
  excludeKey: string | null = null,
): IntervalQuestion {
  for (let attempt = 0; attempt < 40; attempt++) {
    const svgStr = Math.floor(Math.random() * numStrings);
    const midiStrIdx = numStrings - 1 - svgStr;
    const interval = activeIntervals[Math.floor(Math.random() * activeIntervals.length)];
    const semitones = INTERVAL_SEMITONES[interval];
    const maxRootFret = NUM_FRETS - semitones;
    if (maxRootFret < 0) continue;
    const rootFret = Math.floor(Math.random() * (maxRootFret + 1));
    const targetFret = rootFret + semitones;
    const questionKey = `${svgStr}-${rootFret}-${interval}`;
    if (questionKey === excludeKey) continue;
    const rootMidi = openMidi[midiStrIdx] + rootFret;
    return { interval, rootFret, targetFret, svgStr, rootMidi, rootNoteName: NOTE_NAMES[rootMidi % 12] };
  }
  // Fallback
  const rootMidi = openMidi[numStrings - 1];
  return {
    interval: 'Perfect 5th',
    rootFret: 0,
    targetFret: 7,
    svgStr: 0,
    rootMidi,
    rootNoteName: NOTE_NAMES[rootMidi % 12],
  };
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Fretboard ──────────────────────────────────────────────────────────────
interface FretboardProps {
  openMidi: number[];
  numStrings: number;
  stringNames: string[];
  showNotes: boolean;
  question: IntervalQuestion | null;
  gamePhase: GamePhase;
  highlightedFret: number | null;
  answerRevealFret: number | null;
  idleHighlightKey: string | null;
  onFretClick: (svgStr: number, fret: number, midiNote: number, noteName: string) => void;
  noteFill: Record<string, string>;
  noteStroke: Record<string, string>;
}

function Fretboard({
  openMidi, numStrings, stringNames, showNotes,
  question, gamePhase, highlightedFret, answerRevealFret, idleHighlightKey,
  onFretClick, noteFill, noteStroke,
}: FretboardProps) {
  const height = svgH(numStrings);
  const markerY = TOP_PAD + (numStrings - 1) * STRING_H + 24;

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

  const fretLabels: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    fretLabels.push(
      <text key={`fl${fret}`} x={fretX(fret) - FRET_W / 2} y={TOP_PAD - 24}
        textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#8888bb">
        {fret}
      </text>,
    );
  }

  const dots: React.ReactNode[] = [];
  for (let svgStr = 0; svgStr < numStrings; svgStr++) {
    const midiStrIdx = numStrings - 1 - svgStr;
    const cy = stringY(svgStr);
    const isActiveString = gamePhase === 'playing' && question != null && svgStr === question.svgStr;

    for (let fret = 0; fret <= NUM_FRETS; fret++) {
      const midiNote = openMidi[midiStrIdx] + fret;
      const noteName = NOTE_NAMES[midiNote % 12];
      const dotKey = `${svgStr}-${fret}`;
      const cx = fret === 0 ? LEFT_PAD + NUT_X / 2 : fretX(fret) - FRET_W / 2;

      let fill = 'transparent';
      let stroke = 'transparent';
      let opacity = 0;
      let textOpacity = 0;
      let clickable = true;

      if (gamePhase === 'playing' && question != null) {
        if (isActiveString) {
          if (fret === question.rootFret) {
            fill = '#5b7fff'; stroke = '#8eaaff'; opacity = 1; textOpacity = 0;
          } else if (highlightedFret !== null && fret === highlightedFret) {
            fill = '#22dd88'; stroke = '#66ffbb'; opacity = 1; textOpacity = 0;
          } else if (answerRevealFret !== null && fret === answerRevealFret) {
            fill = '#e09020'; stroke = '#ffd060'; opacity = 1; textOpacity = 0;
          }
          // else: transparent, opacity 0 — but still clickable via hit area
        } else {
          clickable = false;
        }
      } else if (gamePhase === 'idle') {
        if (dotKey === idleHighlightKey) {
          fill = '#22dd88'; stroke = '#66ffbb'; opacity = 1; textOpacity = 1;
        } else if (showNotes) {
          fill = noteFill[noteName] ?? '#888';
          stroke = noteStroke[noteName] ?? '#aaa';
          opacity = 1; textOpacity = 1;
        }
      } else {
        clickable = false;
      }

      if (!clickable) {
        dots.push(
          <g key={dotKey}>
            <circle cx={cx} cy={cy} r={CIRCLE_R} fill={fill} stroke={stroke} strokeWidth="1.5" opacity={opacity} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              fontSize="11" fontWeight="700" fill="white" opacity={textOpacity}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {noteName}
            </text>
          </g>,
        );
      } else {
        dots.push(
          <g
            key={dotKey}
            onClick={() => onFretClick(svgStr, fret, midiNote, noteName)}
            style={{ cursor: 'pointer' }}
            role="button"
            aria-label={`${noteName} on ${stringNames[svgStr]} string fret ${fret}`}
          >
            <circle cx={cx} cy={cy} r={CIRCLE_R + 4} fill="transparent" />
            <circle cx={cx} cy={cy} r={CIRCLE_R} fill={fill} stroke={stroke} strokeWidth="1.5" opacity={opacity} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
              fontSize="11" fontWeight="700" fill="white" opacity={textOpacity}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {noteName}
            </text>
          </g>,
        );
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${height}`} width={SVG_W} height={height} aria-label="Guitar fretboard">
      {Array.from({ length: numStrings }, (_, i) => (
        <line
          key={`str${i}`}
          x1={LEFT_PAD} y1={stringY(i)} x2={SVG_W - RIGHT_PAD} y2={stringY(i)}
          stroke={gamePhase === 'playing' && i === question?.svgStr ? '#5b7fff' : '#444466'}
          strokeWidth={i === 0 ? 0.8 : i === numStrings - 1 ? 1.8 : 1 + i * 0.2}
          className={gamePhase === 'playing' && i === question?.svgStr ? 'it-string-glow' : undefined}
        />
      ))}

      <line
        x1={LEFT_PAD + NUT_X} y1={TOP_PAD - 4}
        x2={LEFT_PAD + NUT_X} y2={TOP_PAD + (numStrings - 1) * STRING_H + 4}
        stroke="#aaaacc" strokeWidth="3" strokeLinecap="round"
      />

      {Array.from({ length: NUM_FRETS }, (_, i) => (
        <line
          key={`fret${i}`}
          x1={fretX(i + 1)} y1={TOP_PAD - 2}
          x2={fretX(i + 1)} y2={TOP_PAD + (numStrings - 1) * STRING_H + 2}
          stroke="#333355" strokeWidth="1"
        />
      ))}

      {stringNames.map((name, i) => (
        <text
          key={`sn${i}`}
          x={LEFT_PAD + NUT_X / 2} y={stringY(i)}
          textAnchor="middle" dominantBaseline="central"
          fontSize="12" fill={gamePhase === 'playing' && i === question?.svgStr ? '#8eaaff' : '#777799'}
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

// ── IntervalTrainerPage ────────────────────────────────────────────────────
export function IntervalTrainerPage() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const { noteFill, noteStroke } = useNoteColors();

  // ── Guitar config ────────────────────────────────────────────────────────
  const [stringCount, setStringCount] = useState<StringCount>(() => {
    const v = localStorage.getItem('intervalTrainer.stringCount');
    const n = Number(v);
    return (n === 6 || n === 7 || n === 8) ? n as StringCount : 6;
  });
  const [tuningIdx, setTuningIdx] = useState(() => {
    const v = parseInt(localStorage.getItem('intervalTrainer.tuningIdx') ?? '0', 10);
    return isNaN(v) ? 0 : v;
  });
  const [showNotes, setShowNotes] = useState(() =>
    localStorage.getItem('intervalTrainer.showNotes') !== 'false',
  );

  const safeTuningIdx = Math.min(tuningIdx, TUNINGS[stringCount].length - 1);
  const tuning = TUNINGS[stringCount][safeTuningIdx];
  const openMidi = tuning.strings.map(
    ({ note, octave }) => (octave + 1) * 12 + NOTE_NAMES.indexOf(note),
  );
  const stringNames = [...tuning.strings].reverse().map((s) => s.note);

  // ── Difficulty ───────────────────────────────────────────────────────────
  const [selectedTierIdx, setSelectedTierIdx] = useState(() => {
    const v = parseInt(localStorage.getItem('intervalTrainer.selectedTierIdx') ?? '0', 10);
    return isNaN(v) ? 0 : Math.min(Math.max(v, 0), TIERS.length - 1);
  });

  const activeIntervals = getActiveIntervals(selectedTierIdx);

  // ── Game state ───────────────────────────────────────────────────────────
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const v = localStorage.getItem('intervalTrainer.gameMode');
    return (v === '10' || v === '20' || v === '30' || v === 'infinite') ? v as GameMode : '10';
  });
  const [question, setQuestion] = useState<IntervalQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [highlightedFret, setHighlightedFret] = useState<number | null>(null);
  const [answerRevealFret, setAnswerRevealFret] = useState<number | null>(null);
  const [idleHighlightKey, setIdleHighlightKey] = useState<string | null>(null);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [usedIntervals, setUsedIntervals] = useState<IntervalName[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const usedIntervalsRef = useRef<Set<IntervalName>>(new Set());

  // ── Persist selections ────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('intervalTrainer.stringCount', String(stringCount)); }, [stringCount]);
  useEffect(() => { localStorage.setItem('intervalTrainer.tuningIdx', String(tuningIdx)); }, [tuningIdx]);
  useEffect(() => { localStorage.setItem('intervalTrainer.showNotes', String(showNotes)); }, [showNotes]);
  useEffect(() => { localStorage.setItem('intervalTrainer.gameMode', gameMode); }, [gameMode]);
  useEffect(() => { localStorage.setItem('intervalTrainer.selectedTierIdx', String(selectedTierIdx)); }, [selectedTierIdx]);

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
    [feedbackTimer, answerTimer, advanceTimer, idleHighlightTimer].forEach((r) => {
      if (r.current) clearTimeout(r.current as ReturnType<typeof setTimeout>);
    });
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getOrCreateAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

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
    setGamePhase('result');
    setHighlightedFret(null);
    setAnswerRevealFret(null);
    setFeedback(null);
    processingRef.current = false;

    const intervals = [...usedIntervalsRef.current];
    setUsedIntervals(intervals);

    if (authStatus === 'authenticated') {
      void saveScore({
        score: finalScore,
        wrongAnswers: finalWrong,
        totalQuestions: finalTotal,
        elapsedSeconds: finalElapsed,
        gameMode,
        stringCount,
        tuning: tuning.name,
        intervalsJson: JSON.stringify(intervals),
      }).then((ok) => setScoreSaved(ok));
    }
  }

  function handleStartGame() {
    clearFeedbackTimers();
    usedIntervalsRef.current = new Set();
    setScore(0);
    setWrongAnswers(0);
    setQuestionsAnswered(0);
    setElapsedSeconds(0);
    setFeedback(null);
    setHighlightedFret(null);
    setAnswerRevealFret(null);
    setScoreSaved(false);
    setStoppedEarly(false);
    setUsedIntervals([]);
    processingRef.current = false;
    const q = generateQuestion(openMidi, stringCount, activeIntervals);
    usedIntervalsRef.current.add(q.interval);
    setQuestion(q);
    setGamePhase('playing');
  }

  function stopGame() {
    clearFeedbackTimers();
    setGamePhase('result');
    setStoppedEarly(true);
    setHighlightedFret(null);
    setAnswerRevealFret(null);
    setFeedback(null);
    processingRef.current = false;
    setUsedIntervals([...usedIntervalsRef.current]);
  }

  function playAgain() {
    setGamePhase('idle');
    setQuestion(null);
  }

  function advanceToNext(
    nextScore: number, nextWrong: number, nextAnswered: number,
    currentElapsed: number, excludeKey: string | null,
  ) {
    const limit = gameMode === 'infinite' ? Infinity : parseInt(gameMode, 10);
    if (nextAnswered >= limit) {
      endGame(nextScore, nextWrong, nextAnswered, currentElapsed);
    } else {
      const q = generateQuestion(openMidi, stringCount, activeIntervals, excludeKey);
      usedIntervalsRef.current.add(q.interval);
      setQuestion(q);
      setHighlightedFret(null);
      setAnswerRevealFret(null);
      setFeedback(null);
      processingRef.current = false;
    }
  }

  // ── Fret click handler ───────────────────────────────────────────────────
  function handleFretClick(svgStr: number, fret: number, midiNote: number) {
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    pluckString(ctx, freq, ctx.currentTime, 0.35);

    if (gamePhase === 'idle') {
      const key = `${svgStr}-${fret}`;
      if (idleHighlightTimer.current) clearTimeout(idleHighlightTimer.current);
      setIdleHighlightKey(key);
      idleHighlightTimer.current = setTimeout(() => setIdleHighlightKey(null), 1000);
      return;
    }

    if (gamePhase !== 'playing' || !question || processingRef.current) return;

    const isCorrect = svgStr === question.svgStr && fret === question.targetFret;
    processingRef.current = true;
    clearFeedbackTimers();

    if (isCorrect) {
      const nextScore = score + 1;
      const nextAnswered = questionsAnswered + 1;
      setScore(nextScore);
      setQuestionsAnswered(nextAnswered);
      setFeedback('correct');
      setHighlightedFret(fret);

      const excludeKey = `${question.svgStr}-${question.rootFret}-${question.interval}`;
      feedbackTimer.current = setTimeout(() => {
        advanceToNext(nextScore, wrongAnswers, nextAnswered, elapsedSeconds, excludeKey);
      }, 600);
    } else {
      const nextWrong = wrongAnswers + 1;
      setWrongAnswers(nextWrong);
      setFeedback('wrong');
      setAnswerRevealFret(question.targetFret);

      if (gameMode === 'infinite') {
        answerTimer.current = setTimeout(() => {
          endGame(score, nextWrong, questionsAnswered, elapsedSeconds);
        }, 1200);
      } else {
        const nextAnswered = questionsAnswered + 1;
        setQuestionsAnswered(nextAnswered);
        const excludeKey = `${question.svgStr}-${question.rootFret}-${question.interval}`;
        answerTimer.current = setTimeout(() => {
          advanceToNext(score, nextWrong, nextAnswered, elapsedSeconds, excludeKey);
        }, 900);
      }
    }
  }

  // ── String/tuning change handlers ─────────────────────────────────────────
  function handleStringCountChange(v: string) {
    if (!v || gamePhase === 'playing') return;
    setStringCount(Number(v) as StringCount);
    setTuningIdx(0);
    setGamePhase('idle');
    setQuestion(null);
  }

  function handleTuningChange(v: string) {
    if (!v || gamePhase === 'playing') return;
    setTuningIdx(Number(v));
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const limit = gameMode === 'infinite' ? null : parseInt(gameMode, 10);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1400px] mx-auto" aria-label="Interval trainer">
      <h1 className="text-xl font-bold text-[#d0d0f0]">Interval Trainer</h1>

      {/* ── Guitar config ─────────────────────────────────────────────────── */}
      {gamePhase !== 'playing' && (
        <div className="flex flex-col gap-3">
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

      {/* ── Game question banner ───────────────────────────────────────────── */}
      {gamePhase === 'playing' && question && (
        <div className={`rounded-xl border px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3
          ${feedback === 'correct' ? 'border-[#22dd88] bg-[#081a10] it-feedback-correct' :
            feedback === 'wrong'   ? 'border-[#dd4444] bg-[#1a0808] it-feedback-wrong' :
                                     'border-[#3a3a60] bg-[#0b0b16]'}`}
        >
          <div>
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8] mb-1">
              Find the interval
            </div>
            <div className="text-2xl font-bold text-white tracking-wide">
              <span className="text-[#8eaaff]">{question.interval}</span>
              <span className="text-[#666688] mx-2 text-xl font-normal">above</span>
              <span style={{ color: noteFill[question.rootNoteName] ?? '#fff' }}>
                {question.rootNoteName}
              </span>
            </div>
            <div className="text-[0.75rem] text-[#6060a0] mt-0.5">
              on the <span className="text-[#8eaaff]">{stringNames[question.svgStr]}</span> string — blue dot is the root
            </div>
            {feedback && (
              <div className={`mt-1 text-sm font-semibold ${feedback === 'correct' ? 'text-[#22dd88]' : 'text-[#ff7777]'}`}>
                {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong — highlighted in orange'}
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="text-center">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Time</div>
              <div className="text-xl font-bold tabular-nums text-[#aaaacc]">{formatTime(elapsedSeconds)}</div>
            </div>
            <div className="text-center">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Score</div>
              <div className="text-xl font-bold tabular-nums text-[#22dd88]">
                {score}{limit != null ? <span className="text-[#555578] text-base">/{limit}</span> : null}
              </div>
            </div>
            {wrongAnswers > 0 && (
              <div className="text-center">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Wrong</div>
                <div className="text-xl font-bold tabular-nums text-[#ff7777]">{wrongAnswers}</div>
              </div>
            )}
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
            question={question}
            gamePhase={gamePhase}
            highlightedFret={highlightedFret}
            answerRevealFret={answerRevealFret}
            idleHighlightKey={idleHighlightKey}
            onFretClick={handleFretClick}
            noteFill={noteFill}
            noteStroke={noteStroke}
          />
        </div>
      )}

      {/* ── Game controls (idle) ───────────────────────────────────────────── */}
      {gamePhase === 'idle' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-5 py-4 flex flex-col gap-4">
          <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">
            Practice Game
          </div>

          {/* Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.75rem] text-[#9898c8] w-20 shrink-0">Mode:</span>
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

          {/* Difficulty */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] text-[#9898c8]">Difficulty:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {TIERS.map((tierIntervals, idx) => {
                const isSelected = selectedTierIdx === idx;
                const cumulativeIntervals = TIERS.slice(0, idx + 1).flat();
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedTierIdx(idx)}
                    className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-[#5b7fff] bg-[#252850]'
                        : 'border-[#3a3a60] bg-[#0d0d1a] hover:border-[#5050a0]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[0.82rem] font-semibold ${isSelected ? 'text-[#8eaaff]' : 'text-[#9898c8]'}`}>
                        {TIER_NAMES[idx]}
                      </span>
                      {idx > 0 && (
                        <span className="text-[0.65rem] text-[#505278] font-medium uppercase tracking-wide">
                          +{tierIntervals.length} more
                        </span>
                      )}
                    </div>
                    <div className="text-[0.72rem] text-[#555578] leading-relaxed">
                      {cumulativeIntervals.join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-[0.75rem] text-[#606080] flex-1">
              {gameMode === 'infinite'
                ? 'Answer until you make a mistake or stop.'
                : `Answer ${gameMode} questions. Wrong answers are tracked but the game continues.`}
            </p>
            <button
              onClick={handleStartGame}
              className="h-10 px-6 text-[0.9rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] hover:text-[#66ffbb] transition-colors shrink-0"
            >
              ▶ Start Practice
            </button>
          </div>
        </div>
      )}

      {/* ── Result screen ─────────────────────────────────────────────────── */}
      {gamePhase === 'result' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-6 py-6 flex flex-col gap-4 max-w-md mx-auto w-full">
          <div className="text-lg font-bold text-[#d0d0f0]">
            {stoppedEarly ? 'Stopped Early' : 'Game Over'}
          </div>

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

          {usedIntervals.length > 0 && (
            <div className="text-[0.75rem] text-[#606080]">
              <span className="text-[#8080b8] font-semibold">Practiced: </span>
              {usedIntervals.join(', ')}
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
