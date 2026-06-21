import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { pluckString } from '@/audio/pluckString';
import { detectPitch, freqToMidi } from '@/audio/pitchDetection';
import type { StringCount } from '../data/tunings';
import { TUNINGS } from '../data/tunings';
import { saveScore } from '../api/fretMemorizerApi';
import type { NoteAccMap, SessionEntry } from '../api/fretMemorizerApi';
import {
  loadNoteAccFromStorage,
  loadNoteAccuracy,
  saveNoteAccuracy,
  loadSessionHistoryFromStorage,
  saveSessionHistory,
} from '../api/fretMemorizerApi';
import { NOTE_NAMES } from '../data/noteColors';
import { useNoteColors } from '../context/noteColorsContextDef';
import './FretMemorizerPage.css';

// ── Fretboard constants ────────────────────────────────────────────────────
const NUM_FRETS = 24;
const MIN_FRET_W = 32;
const MAX_FRET_W = 64;
const STRING_H = 40;
const NUT_X = 40;
const LEFT_PAD = 8;
const RIGHT_PAD = 24;
const TOP_PAD = 40;
const BOTTOM_PAD = 40;
const SINGLE_DOT_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_DOT_FRETS = new Set([12, 24]);

// Mic detection constants (module-level — not component-level)
const SILENCE_RMS = 0.008;
const SILENCE_FRAMES = 6; // ~300ms at 20fps — guitar string must have decayed
// Capped lag for guitar range (60Hz min) to reduce NSDF from O(N²) to O(N×maxLag)
const GUITAR_MIN_FREQ_LAG = (sampleRate: number) => Math.ceil(sampleRate / 60);

function computeFretW(containerWidth: number): number {
  if (containerWidth <= 0) return MAX_FRET_W;
  const available = containerWidth - LEFT_PAD - NUT_X - RIGHT_PAD;
  return Math.max(MIN_FRET_W, Math.min(MAX_FRET_W, Math.floor(available / NUM_FRETS)));
}

function fretX(fret: number, fretW: number) {
  return LEFT_PAD + NUT_X + fret * fretW;
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
type AppView = 'game' | 'stats';
type StudyPhase = 'showing' | 'revealing' | 'off';

interface StudyTarget {
  svgStr: number;
  fret: number;
  pc: number;
  note: string;
}

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

// ── Accuracy colour helpers ────────────────────────────────────────────────
function accuracyColor(acc: number): string {
  if (acc >= 0.9) return '#22dd88';
  if (acc >= 0.7) return '#88cc44';
  if (acc >= 0.5) return '#ddaa22';
  return '#dd4444';
}

function accuracyStroke(acc: number): string {
  if (acc >= 0.9) return '#66ffbb';
  if (acc >= 0.7) return '#aaee66';
  if (acc >= 0.5) return '#ffcc44';
  return '#ff7777';
}

function getWorstNotes(m: NoteAccMap, n: number, minAttempts = 3): number[] {
  return Object.entries(m)
    .filter(([, v]) => v.total >= minAttempts)
    .map(([pc, v]) => ({ pc: Number(pc), acc: v.correct / v.total }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, n)
    .map((x) => x.pc);
}

// ── generateQuestion ───────────────────────────────────────────────────────
function generateQuestion(
  openMidi: number[],
  numStrings: number,
  allowedSvgStrings: number[],
  excludeKey: string | null = null,
  allowedPcs?: number[],
): Question {
  for (let attempt = 0; attempt < 40; attempt++) {
    const targetSvgStr = allowedSvgStrings[Math.floor(Math.random() * allowedSvgStrings.length)];
    const midiStrIdx = numStrings - 1 - targetSvgStr;
    const targetPc = allowedPcs && allowedPcs.length > 0
      ? allowedPcs[Math.floor(Math.random() * allowedPcs.length)]
      : Math.floor(Math.random() * 12);
    if (excludeKey === `${targetPc}-${targetSvgStr}`) continue;
    const validFrets: number[] = [];
    for (let fret = 0; fret <= NUM_FRETS; fret++) {
      if ((openMidi[midiStrIdx] + fret) % 12 === targetPc) validFrets.push(fret);
    }
    if (validFrets.length > 0) {
      return { targetNote: NOTE_NAMES[targetPc], targetPc, targetSvgStr, validFrets };
    }
  }
  const fallbackPc = allowedPcs && allowedPcs.length > 0 ? allowedPcs[0] : 0;
  const fallbackSvgStr = allowedSvgStrings[0];
  const midiStrIdx = numStrings - 1 - fallbackSvgStr;
  const validFrets: number[] = [];
  for (let fret = 0; fret <= NUM_FRETS; fret++) {
    if ((openMidi[midiStrIdx] + fret) % 12 === fallbackPc) validFrets.push(fret);
  }
  return { targetNote: NOTE_NAMES[fallbackPc], targetPc: fallbackPc, targetSvgStr: fallbackSvgStr, validFrets };
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── SessionChart ───────────────────────────────────────────────────────────
function SessionChart({ sessions }: { sessions: SessionEntry[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-[0.75rem] text-[#606080] py-4 text-center">
        Complete a game to see your history
      </p>
    );
  }
  const count = sessions.length;
  const W = 400;
  const H = 64;
  const barW = Math.max(6, Math.floor((W - (count - 1) * 2) / count));
  const gap = 2;
  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-16"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Session history bar chart"
      >
        {sessions.map((s, i) => {
          const acc = s.total > 0 ? s.score / s.total : 0;
          const barH = Math.max(3, Math.round(acc * H));
          const x = i * (barW + gap);
          const y = H - barH;
          return (
            <g key={s.date}>
              <rect x={x} y={y} width={barW} height={barH} fill={accuracyColor(acc)} rx={1} opacity={0.9} />
              <title>{`${new Date(s.date).toLocaleDateString()}: ${s.score}/${s.total} (${Math.round(acc * 100)}%)`}</title>
            </g>
          );
        })}
      </svg>
      {count >= 2 && (
        <div className="flex justify-between text-[0.65rem] text-[#606080]">
          <span>{new Date(sessions[0].date).toLocaleDateString()}</span>
          <span>{new Date(sessions[count - 1].date).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}

// ── Fretboard ──────────────────────────────────────────────────────────────
interface FretboardProps {
  openMidi: number[];
  numStrings: number;
  stringNames: string[];
  showNotes: boolean;
  focusedSvgStrings: Set<number>;
  highlightedKey: string | null;
  revealedKey: string | null;
  gamePhase: GamePhase;
  targetSvgStr: number | null;
  answerReveal: AnswerReveal | null;
  onFretClick: (svgStr: number, fret: number, midiNote: number) => void;
  noteFill: Record<string, string>;
  noteStroke: Record<string, string>;
  fretW: number;
  circleR: number;
  /** When set, colours all dots by note accuracy — overrides normal game rendering */
  heatmapData?: NoteAccMap;
  /** Key (svgStr-fret) of the study-mode highlighted position */
  studyHighlightKey?: string;
  /** Whether to reveal the note name on the study highlight dot */
  studyRevealNote?: boolean;
}

function Fretboard({
  openMidi, numStrings, stringNames, showNotes, focusedSvgStrings,
  highlightedKey, revealedKey,
  gamePhase, targetSvgStr, answerReveal,
  onFretClick, noteFill, noteStroke,
  fretW, circleR,
  heatmapData,
  studyHighlightKey, studyRevealNote,
}: FretboardProps) {
  const svgW = LEFT_PAD + NUT_X + NUM_FRETS * fretW + RIGHT_PAD;
  const height = svgH(numStrings);
  const markerY = TOP_PAD + (numStrings - 1) * STRING_H + 24;

  const markers: React.ReactNode[] = [];
  for (let fret = 1; fret <= NUM_FRETS; fret++) {
    const cx = fretX(fret, fretW) - fretW / 2;
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
      <text key={`fl${fret}`} x={fretX(fret, fretW) - fretW / 2} y={TOP_PAD - 24}
        textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#8888bb">
        {fret}
      </text>,
    );
  }

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
        : fretX(fret, fretW) - fretW / 2;

      const isHighlighted = dotKey === highlightedKey;
      const isRevealed = dotKey === revealedKey;
      const isAnswerReveal = answerReveal?.svgStr === svgStr && answerReveal.frets.includes(fret);
      const isStudyHighlight = dotKey === studyHighlightKey;
      const isFocused = focusedSvgStrings.has(svgStr);

      let fill: string;
      let stroke: string;
      let opacity = 1;
      let textOpacity = 1;

      if (heatmapData !== undefined) {
        const data = heatmapData[pc];
        if (data && data.total > 0) {
          const acc = data.correct / data.total;
          fill = accuracyColor(acc);
          stroke = accuracyStroke(acc);
        } else {
          fill = '#2a2a44';
          stroke = '#3a3a66';
          opacity = 0.6;
          textOpacity = 0.5;
        }
      } else if (isStudyHighlight) {
        fill = studyRevealNote ? (noteFill[noteName] ?? '#888') : '#9966ff';
        stroke = studyRevealNote ? (noteStroke[noteName] ?? '#aaa') : '#cc99ff';
        opacity = 1;
        textOpacity = studyRevealNote ? 1 : 0;
      } else if (isHighlighted) {
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
          fill = noteFill[noteName] ?? '#888';
          stroke = noteStroke[noteName] ?? '#aaa';
        } else {
          fill = 'transparent';
          stroke = 'transparent';
          opacity = 0;
          textOpacity = 0;
        }
      } else {
        fill = noteFill[noteName] ?? '#888';
        stroke = noteStroke[noteName] ?? '#aaa';
      }

      dots.push(
        <g
          key={dotKey}
          onClick={() => onFretClick(svgStr, fret, midiNote)}
          style={{ cursor: 'pointer' }}
          role="button"
          aria-label={`${noteName} on ${stringNames[svgStr]} string fret ${fret}`}
        >
          <circle cx={cx} cy={cy} r={circleR + 4} fill="transparent" />
          <circle
            cx={cx} cy={cy} r={circleR}
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
    <svg viewBox={`0 0 ${svgW} ${height}`} width={svgW} height={height} aria-label="Guitar fretboard">
      {Array.from({ length: numStrings }, (_, i) => (
        <line
          key={`str${i}`}
          x1={LEFT_PAD} y1={stringY(i)} x2={svgW - RIGHT_PAD} y2={stringY(i)}
          stroke={gamePhase === 'playing' && i === targetSvgStr ? '#5b7fff' : '#444466'}
          strokeWidth={i === 0 ? 0.8 : i === numStrings - 1 ? 1.8 : 1 + i * 0.2}
          className={gamePhase === 'playing' && i === targetSvgStr ? 'fm-string-glow' : undefined}
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
          x1={fretX(i + 1, fretW)} y1={TOP_PAD - 2}
          x2={fretX(i + 1, fretW)} y2={TOP_PAD + (numStrings - 1) * STRING_H + 2}
          stroke="#333355" strokeWidth="1"
        />
      ))}
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

// ── Streak thresholds ──────────────────────────────────────────────────────
const STREAK_TIERS = { xl: 20, lg: 10, md: 5 } as const;

function streakTier(streak: number): 'xl' | 'lg' | 'md' | 'sm' {
  if (streak >= STREAK_TIERS.xl) return 'xl';
  if (streak >= STREAK_TIERS.lg) return 'lg';
  if (streak >= STREAK_TIERS.md) return 'md';
  return 'sm';
}

// ── StreakFlame ────────────────────────────────────────────────────────────
function StreakFlame({ streak }: { streak: number }) {
  if (streak < 1) return null;
  const tier = streakTier(streak);
  const sizeClass = { xl: 'text-3xl', lg: 'text-2xl', md: 'text-xl', sm: 'text-lg' }[tier];
  const color = { xl: '#ff4400', lg: '#ff7700', md: '#ffaa00', sm: '#ffcc44' }[tier];
  return (
    <div className="text-center">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#8080b8]">Streak</div>
      <div className={`${sizeClass} font-bold tabular-nums leading-tight fm-streak-${tier}`} style={{ color }}>
        {streak >= STREAK_TIERS.md ? '🔥' : ''}{streak}
      </div>
    </div>
  );
}

// ── FretMemorizerPage ──────────────────────────────────────────────────────
export function FretMemorizerPage() {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const { noteFill, noteStroke } = useNoteColors();

  // ── Responsive fretboard sizing ──────────────────────────────────────────
  // One ResizeObserver on the game fretboard container.
  // Both game and heatmap fretboards reuse the same fretW since they're
  // never on screen simultaneously (and the container widths are equivalent).
  const fretboardContainerRef = useRef<HTMLDivElement>(null);
  const [fretboardWidth, setFretboardWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = fretboardContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentBoxSize?.[0]?.inlineSize ?? entries[0].contentRect.width;
      setFretboardWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fretW = fretboardWidth !== null ? computeFretW(fretboardWidth) : null;
  const circleR = fretW !== null ? Math.max(10, Math.floor(fretW * 0.22)) : 0;

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

  const safeTuningIdx = Math.min(tuningIdx, TUNINGS[stringCount].length - 1);
  const tuning = TUNINGS[stringCount][safeTuningIdx];

  const openMidi = useMemo(
    () => tuning.strings.map(({ note, octave }) => (octave + 1) * 12 + NOTE_NAMES.indexOf(note)),
    [tuning],
  );
  const stringNames = useMemo(
    () => [...tuning.strings].reverse().map((s) => s.note),
    [tuning],
  );

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

  // ── Stats & progression state ────────────────────────────────────────────
  const [appView, setAppView] = useState<AppView>('game');
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [noteAccuracy, setNoteAccuracy] = useState<NoteAccMap>(() => loadNoteAccFromStorage());
  const [sessionHistory, setSessionHistory] = useState<SessionEntry[]>(() => loadSessionHistoryFromStorage());
  const [focusedPcs, setFocusedPcs] = useState<number[] | null>(null);

  // Load note accuracy from cloud on mount (overrides localStorage with merged data)
  useEffect(() => {
    void loadNoteAccuracy().then(setNoteAccuracy);
  }, []);

  // ── Study mode state ─────────────────────────────────────────────────────
  const [studyMode, setStudyMode] = useState(() => localStorage.getItem('fretMem.studyMode') === 'true');
  const [studyPhase, setStudyPhase] = useState<StudyPhase>('off');
  const [studyTarget, setStudyTarget] = useState<StudyTarget | null>(null);
  const studyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Input mode + mic state ────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>(() => {
    const v = localStorage.getItem('fretMem.inputMode');
    return (v === 'click' || v === 'mic') ? v as InputMode : 'click';
  });
  const [micError, setMicError] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
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
  useEffect(() => { localStorage.setItem('fretMem.studyMode', String(studyMode)); }, [studyMode]);

  const micCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micFrameRef = useRef(0);
  const silenceFramesRef = useRef(0);
  const consecutivePcRef = useRef<number | null>(null);
  const consecutiveCountRef = useRef(0);
  const micDetectStateRef = useRef<'off' | 'waiting_silence' | 'active'>('off');
  const handleMicAnswerRef = useRef<((pc: number) => void) | null>(null);

  function getOrCreateAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  // ── Note accuracy update ──────────────────────────────────────────────────
  const updateNoteAcc = useCallback((pc: number, correct: boolean) => {
    setNoteAccuracy((prev) => {
      const entry = prev[pc] ?? { correct: 0, total: 0 };
      const next: NoteAccMap = {
        ...prev,
        [pc]: { correct: entry.correct + (correct ? 1 : 0), total: entry.total + 1 },
      };
      void saveNoteAccuracy(next); // fire-and-forget (localStorage + cloud when auth)
      return next;
    });
  }, []);

  // ── Mic lifecycle ────────────────────────────────────────────────────────
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
  }, []);

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
      // Capped lag range: guitar min 60Hz → reduces O(N²) to O(N × maxLag)
      const maxLag = GUITAR_MIN_FREQ_LAG(ctx.sampleRate);

      const tick = () => {
        micRafRef.current = requestAnimationFrame(tick);
        micFrameRef.current++;
        if (micFrameRef.current % 3 !== 0) return;

        analyser.getFloatTimeDomainData(buf);

        if (micDetectStateRef.current === 'waiting_silence') {
          let rms = 0;
          for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          rms = Math.sqrt(rms / buf.length);
          if (rms < SILENCE_RMS) {
            silenceFramesRef.current++;
            if (silenceFramesRef.current >= SILENCE_FRAMES) {
              micDetectStateRef.current = 'active';
              silenceFramesRef.current = 0;
              consecutivePcRef.current = null;
              consecutiveCountRef.current = 0;
              setMicNote(null);
              setMicListenPhase('active');
            }
          } else {
            silenceFramesRef.current = 0;
          }
          return;
        }

        if (micDetectStateRef.current !== 'active') return;

        const freq = detectPitch(buf, ctx.sampleRate, 0.02, maxLag);

        if (freq >= 60 && freq <= 1400) {
          const midi = freqToMidi(freq);
          const cents = (midi - Math.round(midi)) * 100;
          if (Math.abs(cents) <= 25) {
            const pc = ((Math.round(midi) % 12) + 12) % 12;
            setMicNote(NOTE_NAMES[pc]);
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
            consecutivePcRef.current = null;
            consecutiveCountRef.current = 0;
          }
        } else {
          consecutivePcRef.current = null;
          consecutiveCountRef.current = 0;
          setMicNote(null);
        }
      };

      micRafRef.current = requestAnimationFrame(tick);
      return true;
    } catch (err) {
      const MIC_ERRORS: Record<string, string> = {
        NotAllowedError: 'Microphone access denied',
        NotFoundError: 'No microphone found',
      };
      setMicError(err instanceof Error ? (MIC_ERRORS[err.name] ?? err.message) : 'Microphone error');
      return false;
    }
  }, []);

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
    if (studyTimerRef.current) clearTimeout(studyTimerRef.current);
    stopMic();
    // Close game AudioContext to avoid Chrome's 6-context limit
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
    }
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

  function pushSessionHistory(s: number, t: number) {
    setSessionHistory((prev) => {
      const next = [...prev, { date: new Date().toISOString(), score: s, total: t }];
      saveSessionHistory(next);
      return next;
    });
  }

  function endGame(finalScore: number, finalWrong: number, finalTotal: number, finalElapsed: number, finalBest: number) {
    clearFeedbackTimers();
    stopMic();
    setGamePhase('result');
    setHighlightedKey(null);
    setAnswerReveal(null);
    setFeedback(null);
    processingRef.current = false;
    setBestStreak(finalBest);
    if (finalTotal > 0) pushSessionHistory(finalScore, finalTotal);

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

  function advanceToNext(
    nextScore: number, nextWrong: number, nextAnswered: number,
    currentElapsed: number, excludeKey: string | null, currentBestStreak: number,
  ) {
    const limit = gameMode === 'infinite' ? Infinity : parseInt(gameMode, 10);
    if (nextAnswered >= limit) {
      endGame(nextScore, nextWrong, nextAnswered, currentElapsed, currentBestStreak);
    } else {
      const q = generateQuestion(openMidi, stringCount, [...focusedSvgStrings], excludeKey, focusedPcs ?? undefined);
      setQuestion(q);
      setHighlightedKey(null);
      setAnswerReveal(null);
      setFeedback(null);
      processingRef.current = false;
      if (inputMode === 'mic') beginSilenceWait();
    }
  }

  // ── Shared answer handler (click + mic paths) ─────────────────────────────
  // Defined in the component body so it closes over the latest render's state.
  // The no-deps mic useEffect below captures this function to stay in sync.
  function processAnswer(isCorrect: boolean, highlightKeyOnCorrect?: string) {
    if (!question || processingRef.current) return;
    processingRef.current = true;
    clearFeedbackTimers();
    updateNoteAcc(question.targetPc, isCorrect);

    if (isCorrect) {
      const nextScore = score + 1;
      const nextAnswered = questionsAnswered + 1;
      const nextStreak = streak + 1;
      const nextBest = Math.max(bestStreak, nextStreak);
      setScore(nextScore);
      setQuestionsAnswered(nextAnswered);
      setStreak(nextStreak);
      setBestStreak(nextBest);
      setFeedback('correct');
      if (highlightKeyOnCorrect) setHighlightedKey(highlightKeyOnCorrect);

      const currentKey = `${question.targetPc}-${question.targetSvgStr}`;
      feedbackTimer.current = setTimeout(() => {
        advanceToNext(nextScore, wrongAnswers, nextAnswered, elapsedSeconds, currentKey, nextBest);
      }, 600);
    } else {
      const nextWrong = wrongAnswers + 1;
      setWrongAnswers(nextWrong);
      setStreak(0);
      setFeedback('wrong');

      if (gameMode === 'infinite') {
        setAnswerReveal({ svgStr: question.targetSvgStr, frets: question.validFrets });
        answerTimer.current = setTimeout(() => {
          endGame(score, nextWrong, questionsAnswered, elapsedSeconds, bestStreak);
        }, 1200);
      } else {
        const nextAnswered = questionsAnswered + 1;
        setQuestionsAnswered(nextAnswered);
        setAnswerReveal({ svgStr: question.targetSvgStr, frets: question.validFrets });
        const currentKey = `${question.targetPc}-${question.targetSvgStr}`;
        answerTimer.current = setTimeout(() => {
          advanceToNext(score, nextWrong, nextAnswered, elapsedSeconds, currentKey, bestStreak);
        }, 900);
      }
    }
  }

  // ── Study mode ───────────────────────────────────────────────────────────
  function pickStudyQuestion() {
    if (studyTimerRef.current) clearTimeout(studyTimerRef.current);

    const svgStrList = [...focusedSvgStrings];
    const svgStr = svgStrList[Math.floor(Math.random() * svgStrList.length)];
    const midiStrIdx = stringCount - 1 - svgStr;

    let fret: number;
    if (focusedPcs && focusedPcs.length > 0) {
      const validFrets: number[] = [];
      for (let f = 0; f <= NUM_FRETS; f++) {
        if (focusedPcs.includes((openMidi[midiStrIdx] + f) % 12)) validFrets.push(f);
      }
      fret = validFrets.length > 0
        ? validFrets[Math.floor(Math.random() * validFrets.length)]
        : Math.floor(Math.random() * (NUM_FRETS + 1));
    } else {
      fret = Math.floor(Math.random() * (NUM_FRETS + 1));
    }

    const midiNote = openMidi[midiStrIdx] + fret;
    const pc = midiNote % 12;
    setStudyTarget({ svgStr, fret, pc, note: NOTE_NAMES[pc] });
    setStudyPhase('showing');
    studyTimerRef.current = setTimeout(() => setStudyPhase('revealing'), 3000);
  }

  function stopStudy() {
    if (studyTimerRef.current) clearTimeout(studyTimerRef.current);
    studyTimerRef.current = null;
    setStudyPhase('off');
    setStudyTarget(null);
    setGamePhase('idle');
  }

  // ── Start/stop ───────────────────────────────────────────────────────────
  async function handleStartGame() {
    if (studyMode) {
      setScore(0); setWrongAnswers(0); setQuestionsAnswered(0);
      setElapsedSeconds(0); setStreak(0); setBestStreak(0);
      setGamePhase('playing');
      pickStudyQuestion();
      return;
    }

    if (inputMode === 'mic') {
      const ok = await startMic();
      if (!ok) return;
    }
    clearFeedbackTimers();
    setScore(0); setWrongAnswers(0); setQuestionsAnswered(0);
    setElapsedSeconds(0); setStreak(0); setBestStreak(0);
    setFeedback(null); setAnswerReveal(null); setHighlightedKey(null);
    setScoreSaved(false); setStoppedEarly(false);
    processingRef.current = false;
    const q = generateQuestion(openMidi, stringCount, [...focusedSvgStrings], null, focusedPcs ?? undefined);
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
    setStreak(0);
    setBestStreak(0);
  }

  // ── Focus mode ───────────────────────────────────────────────────────────
  function startFocusMode() {
    const worst = getWorstNotes(noteAccuracy, 5);
    if (worst.length === 0) return;
    setFocusedPcs(worst);
    setAppView('game');
  }

  // ── Fret click handler ───────────────────────────────────────────────────
  const handleFretClick = useCallback((svgStr: number, fret: number, midiNote: number) => {
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    pluckString(ctx, 440 * Math.pow(2, (midiNote - 69) / 12), ctx.currentTime, 0.35);

    // In study mode, just play audio
    if (studyPhase !== 'off') return;

    if (gamePhase === 'idle') {
      const key = `${svgStr}-${fret}`;
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setHighlightedKey(key);
      highlightTimer.current = setTimeout(() => setHighlightedKey(null), 1000);
      if (!showNotes) {
        if (revealTimer.current) clearTimeout(revealTimer.current);
        setRevealedKey(key);
        revealTimer.current = setTimeout(() => setRevealedKey(null), 1500);
      }
      return;
    }

    if (gamePhase !== 'playing' || inputMode === 'mic') return;

    const isCorrectStr = svgStr === question?.targetSvgStr;
    const isCorrectFret = question?.validFrets.includes(fret) ?? false;
    processAnswer(isCorrectStr && isCorrectFret, isCorrectStr && isCorrectFret ? `${svgStr}-${fret}` : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyPhase, gamePhase, showNotes, inputMode, question]);

  // ── String count change ───────────────────────────────────────────────────
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

  // ── Derived values ────────────────────────────────────────────────────────
  const limit = gameMode === 'infinite' ? null : parseInt(gameMode, 10);
  const targetStringName = question != null ? stringNames[question.targetSvgStr] : null;
  const worstNotes = useMemo(() => getWorstNotes(noteAccuracy, 5), [noteAccuracy]);
  const isStudyActive = studyPhase !== 'off';
  const studyHighlightKey = studyTarget != null ? `${studyTarget.svgStr}-${studyTarget.fret}` : undefined;

  // ── Mic answer handler ────────────────────────────────────────────────────
  // Re-assigned every render so the callback always closes over the latest
  // score/streak/question values without needing them in a dep array.
  // Do NOT add a dependency array here.
  useEffect(() => {
    handleMicAnswerRef.current = (pc: number) => {
      if (micDetectStateRef.current !== 'active' || !question) return;
      micDetectStateRef.current = 'off';
      consecutivePcRef.current = null;
      consecutiveCountRef.current = 0;
      processAnswer(pc === question.targetPc);
    };
  });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[1400px] mx-auto" aria-label="Fret memorizer">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#d0d0f0]">Fret Memorizer</h1>
        {appView === 'game' && gamePhase !== 'playing' && (
          <button
            onClick={() => setAppView('stats')}
            className="h-8 px-3 text-[0.78rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#9898c8] hover:border-[#7070a0] hover:text-[#c0c0e8] transition-colors flex items-center gap-1.5"
          >
            <span>📊</span> Stats
          </button>
        )}
        {appView === 'stats' && (
          <button
            onClick={() => setAppView('game')}
            className="h-8 px-3 text-[0.78rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#9898c8] hover:border-[#7070a0] hover:text-[#c0c0e8] transition-colors"
          >
            ← Back to Game
          </button>
        )}
      </div>

      {/* ── Stats panel ─────────────────────────────────────────────────── */}
      {appView === 'stats' && (
        <div className="flex flex-col gap-5">
          {/* Heatmap — reuses the game fretboard container for sizing (mutually exclusive views) */}
          <div className="rounded-xl border border-[#333355] bg-[#0b0b16] p-4">
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8] mb-3">
              Note Accuracy Heatmap
            </div>
            <div className="flex flex-wrap gap-3 mb-3">
              {([['≥90%', 0.95], ['70–89%', 0.78], ['50–69%', 0.59], ['<50%', 0.3], ['No data', -1]] as const).map(([label, acc]) => (
                <span key={label} className="flex items-center gap-1 text-[0.7rem] text-[#aaaacc]">
                  <svg width="10" height="10" aria-hidden>
                    <circle cx="5" cy="5" r="4"
                      fill={acc < 0 ? '#2a2a44' : accuracyColor(acc as number)}
                      stroke={acc < 0 ? '#3a3a66' : accuracyStroke(acc as number)}
                      strokeWidth="1"
                    />
                  </svg>
                  {label}
                </span>
              ))}
            </div>
            {Object.keys(noteAccuracy).length === 0 && (
              <p className="text-[0.75rem] text-[#606080] mb-3">
                Play games to build accuracy data — dots colour up as you practice
              </p>
            )}
            {/* Reuses fretW measured when game fretboard was last visible (same container width) */}
            <div className="overflow-x-auto">
              {fretW !== null && (
                <Fretboard
                  openMidi={openMidi}
                  numStrings={stringCount}
                  stringNames={stringNames}
                  showNotes={true}
                  focusedSvgStrings={new Set(Array.from({ length: stringCount }, (_, i) => i))}
                  highlightedKey={null}
                  revealedKey={null}
                  gamePhase="idle"
                  targetSvgStr={null}
                  answerReveal={null}
                  onFretClick={handleFretClick}
                  noteFill={noteFill}
                  noteStroke={noteStroke}
                  fretW={fretW}
                  circleR={circleR}
                  heatmapData={noteAccuracy}
                />
              )}
            </div>
          </div>

          {/* Session history */}
          <div className="rounded-xl border border-[#333355] bg-[#0b0b16] p-4">
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8] mb-3">
              Session History{sessionHistory.length > 0 ? ` (last ${sessionHistory.length})` : ''}
            </div>
            <p className="text-[0.68rem] text-[#606080] mb-2">Bar height = accuracy %, colour = performance tier</p>
            <SessionChart sessions={sessionHistory} />
          </div>

          {/* Per-note accuracy */}
          {Object.keys(noteAccuracy).length > 0 && (
            <div className="rounded-xl border border-[#333355] bg-[#0b0b16] p-4">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8] mb-3">
                Per-Note Accuracy
              </div>
              <div className="flex flex-wrap gap-2">
                {NOTE_NAMES.map((name, pc) => {
                  const data = noteAccuracy[pc];
                  if (!data || data.total === 0) return (
                    <span key={name} className="flex items-center gap-1 text-[0.72rem] text-[#555577] border border-[#333355] rounded px-2 py-0.5">
                      <svg width="8" height="8" aria-hidden><circle cx="4" cy="4" r="3" fill="#2a2a44" /></svg>
                      {name}
                    </span>
                  );
                  const acc = data.correct / data.total;
                  return (
                    <span key={name} className="flex items-center gap-1 text-[0.72rem] text-[#d0d0f0] border rounded px-2 py-0.5"
                      style={{ borderColor: accuracyColor(acc), background: `${accuracyColor(acc)}18` }}>
                      <svg width="8" height="8" aria-hidden>
                        <circle cx="4" cy="4" r="3" fill={accuracyColor(acc)} />
                      </svg>
                      {name} {Math.round(acc * 100)}%
                      <span className="text-[#666688]">({data.total})</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Focus mode */}
          <div className="rounded-xl border border-[#4a3a20] bg-[#0f0d08] p-4">
            <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#b8a870] mb-2">Focus Mode</div>
            {worstNotes.length === 0 ? (
              <p className="text-[0.75rem] text-[#888870]">
                Play at least 3 attempts per note to unlock Focus Mode — it restricts the quiz to your weakest pitch classes.
              </p>
            ) : (
              <>
                <p className="text-[0.75rem] text-[#aaaacc] mb-3">
                  Your weakest notes:{' '}
                  {worstNotes.map((pc, i) => {
                    const data = noteAccuracy[pc];
                    const acc = data ? data.correct / data.total : 0;
                    return (
                      <span key={pc}>
                        {i > 0 && ', '}
                        <span className="font-semibold" style={{ color: accuracyColor(acc) }}>
                          {NOTE_NAMES[pc]} ({Math.round(acc * 100)}%)
                        </span>
                      </span>
                    );
                  })}
                  . Focus Mode restricts the quiz to these until they reach 80%+.
                </p>
                <button
                  onClick={startFocusMode}
                  className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#ddaa44] bg-[#1a1408] text-[#ddaa44] hover:border-[#ffcc66] hover:text-[#ffcc66] transition-colors"
                >
                  Start Focus Mode
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Game view ───────────────────────────────────────────────────── */}
      {appView === 'game' && (
        <>
          {/* Guitar config */}
          {gamePhase !== 'playing' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1 w-14">Strings</span>
                <ToggleGroup type="single" value={String(stringCount)} onValueChange={handleStringCountChange} className="flex gap-1">
                  {(['6', '7', '8'] as const).map((n) => (
                    <ToggleGroupItem key={n} value={n} className={TOGGLE_CLS}>{n}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1 w-14">Tuning</span>
                <ToggleGroup type="single" value={String(safeTuningIdx)} onValueChange={handleTuningChange} className="flex flex-wrap gap-1">
                  {TUNINGS[stringCount].map((preset, idx) => (
                    <ToggleGroupItem key={preset.name} value={String(idx)} className={TOGGLE_CLS}>
                      {preset.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mr-1 w-14">Focus</span>
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
                      (focusedSvgStrings.has(svgStr) ? ' !border-[#5b7fff] !bg-[#252850] !text-[#8eaaff]' : '')
                    }
                  >
                    {name}
                  </button>
                ))}
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

          {/* Note color legend */}
          {showNotes && gamePhase !== 'playing' && (
            <div className="flex flex-wrap gap-2">
              {NOTE_NAMES.map((note) => (
                <span key={note} className="flex items-center gap-1 text-[0.72rem] text-[#aaaacc]">
                  <svg width="14" height="14" aria-hidden>
                    <circle cx="7" cy="7" r="6" fill={noteFill[note]} stroke={noteStroke[note]} strokeWidth="1.5" />
                  </svg>
                  {note}
                </span>
              ))}
            </div>
          )}

          {/* Study mode banner */}
          {gamePhase === 'playing' && studyMode && studyTarget && (
            <div className="rounded-xl border border-[#4a3a88] bg-[#0d0b18] px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9966cc] mb-1">Study Mode</div>
                {studyPhase === 'showing' ? (
                  <>
                    <div className="text-xl font-semibold text-[#c0b0ff]">
                      What note is highlighted on the <span className="text-[#8eaaff]">{stringNames[studyTarget.svgStr]}</span> string?
                    </div>
                    <div className="text-[0.75rem] text-[#7070a0] mt-1">Revealing in 3 seconds…</div>
                  </>
                ) : (
                  <>
                    <div className="text-[0.75rem] text-[#9090c0] mb-1">That note is:</div>
                    <div className="text-3xl font-bold" style={{ color: noteFill[studyTarget.note] ?? '#fff' }}>
                      {studyTarget.note}
                    </div>
                    <div className="text-[0.75rem] text-[#7070a0] mt-1">
                      Fret {studyTarget.fret} on {stringNames[studyTarget.svgStr]} string
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {studyPhase === 'revealing' && (
                  <button
                    onClick={pickStudyQuestion}
                    className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#9966cc] bg-[#150d22] text-[#cc99ff] hover:border-[#cc99ff] transition-colors"
                  >
                    Next →
                  </button>
                )}
                <button
                  onClick={stopStudy}
                  className="h-9 px-4 text-[0.82rem] font-semibold rounded-md border border-[#6a2020] bg-[#0f0808] text-[#dd7777] hover:border-[#dd4444] hover:text-[#ff8888] transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          {/* Quiz banner */}
          {gamePhase === 'playing' && !studyMode && question && (
            <div className={`rounded-xl border px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3
              ${feedback === 'correct' ? 'border-[#22dd88] bg-[#081a10] fm-feedback-correct' :
                feedback === 'wrong'   ? 'border-[#dd4444] bg-[#1a0808] fm-feedback-wrong' :
                                         'border-[#3a3a60] bg-[#0b0b16]'}`}
            >
              <div>
                {focusedPcs && (
                  <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#ddaa44] mb-1">
                    Focus Mode: {focusedPcs.map((pc) => NOTE_NAMES[pc]).join(', ')}
                  </div>
                )}
                <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8] mb-1">Find this note</div>
                <div className="text-2xl font-bold text-white tracking-wide">
                  <span style={{ color: noteFill[question.targetNote] ?? '#fff' }}>{question.targetNote}</span>
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
                        ? <span style={{ color: noteFill[micNote] ?? '#aaa', fontWeight: 700 }}>{micNote}</span>
                        : <span>play the note</span>
                    }
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0 flex-wrap">
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
                <StreakFlame streak={streak} />
                <button
                  onClick={stopGame}
                  className="h-9 px-4 text-[0.82rem] font-semibold rounded-md border border-[#6a2020] bg-[#0f0808] text-[#dd7777] hover:border-[#dd4444] hover:text-[#ff8888] transition-colors shrink-0"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          {/* Fretboard */}
          {gamePhase !== 'result' && (
            <div
              ref={fretboardContainerRef}
              className="overflow-x-auto rounded-xl border border-[#333355] bg-[#0d0d18] p-3"
            >
              {fretW !== null && (
                <Fretboard
                  openMidi={openMidi}
                  numStrings={stringCount}
                  stringNames={stringNames}
                  showNotes={showNotes}
                  focusedSvgStrings={focusedSvgStrings}
                  highlightedKey={isStudyActive ? null : highlightedKey}
                  revealedKey={revealedKey}
                  gamePhase={gamePhase}
                  targetSvgStr={isStudyActive ? null : (question?.targetSvgStr ?? null)}
                  answerReveal={answerReveal}
                  onFretClick={handleFretClick}
                  noteFill={noteFill}
                  noteStroke={noteStroke}
                  fretW={fretW}
                  circleR={circleR}
                  studyHighlightKey={studyHighlightKey}
                  studyRevealNote={studyPhase === 'revealing'}
                />
              )}
            </div>
          )}

          {/* Idle controls */}
          {gamePhase === 'idle' && (
            <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-5 py-4 flex flex-col gap-4">
              {focusedPcs && (
                <div className="flex items-center gap-2 text-[0.75rem] rounded-lg border border-[#4a3a20] bg-[#0f0d08] px-3 py-2 text-[#ddaa66]">
                  <span>🎯 Focus Mode active:</span>
                  <span className="font-semibold">{focusedPcs.map((pc) => NOTE_NAMES[pc]).join(', ')}</span>
                  <button
                    onClick={() => setFocusedPcs(null)}
                    className="ml-auto text-[#888] hover:text-[#bbb] transition-colors"
                    aria-label="Clear focus mode"
                  >
                    ✕ Clear
                  </button>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex flex-col gap-2 flex-1">
                  <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">Practice Game</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.75rem] text-[#9898c8]">Mode:</span>
                    <ToggleGroup type="single" value={gameMode}
                      onValueChange={(v) => { if (v) setGameMode(v as GameMode); }} className="flex gap-1">
                      {(['10', '20', '30', 'infinite'] as const).map((m) => (
                        <ToggleGroupItem key={m} value={m} className={TOGGLE_CLS}>
                          {m === 'infinite' ? '∞' : `${m}Q`}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.75rem] text-[#9898c8]">Input:</span>
                    <ToggleGroup type="single" value={inputMode}
                      onValueChange={(v) => { if (v) { setInputMode(v as InputMode); setMicError(null); } }}
                      className="flex gap-1">
                      <ToggleGroupItem value="click" className={TOGGLE_CLS}>Click</ToggleGroupItem>
                      <ToggleGroupItem value="mic" className={TOGGLE_CLS}>🎤 Microphone</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.75rem] text-[#9898c8]">Style:</span>
                    <ToggleGroup type="single" value={studyMode ? 'study' : 'quiz'}
                      onValueChange={(v) => { if (v) setStudyMode(v === 'study'); }} className="flex gap-1">
                      <ToggleGroupItem value="quiz" className={TOGGLE_CLS}>Quiz</ToggleGroupItem>
                      <ToggleGroupItem value="study" className={TOGGLE_CLS}>📖 Study</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  {micError && <p className="text-[0.75rem] text-[#ff7777]">Mic error: {micError}</p>}
                  <p className="text-[0.75rem] text-[#606080]">
                    {studyMode
                      ? 'Study mode: a fret is highlighted — its note name reveals after 3 seconds. No scoring.'
                      : gameMode === 'infinite'
                        ? 'Answer until you make a mistake or stop.'
                        : `Answer ${gameMode} questions. Wrong answers are tracked but the game continues.`}
                    {!studyMode && inputMode === 'mic' && ' Play the note on your guitar — the mic will listen.'}
                  </p>
                </div>
                <button
                  onClick={() => { void handleStartGame(); }}
                  className={`h-10 px-6 text-[0.9rem] font-semibold rounded-md border transition-colors shrink-0 ${
                    studyMode
                      ? 'border-[#9966cc] bg-[#150d22] text-[#cc99ff] hover:border-[#cc99ff] hover:text-[#ddbbff]'
                      : 'border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] hover:text-[#66ffbb]'
                  }`}
                >
                  {studyMode ? '📖 Start Study' : '▶ Start Practice'}
                </button>
              </div>
            </div>
          )}

          {/* Result screen */}
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

              {bestStreak >= STREAK_TIERS.md && (
                <div className="flex items-center justify-center gap-2 text-[0.82rem] text-[#ffaa44]">
                  <span className={`font-bold ${streakTier(bestStreak) === 'xl' ? 'text-2xl' : streakTier(bestStreak) === 'lg' ? 'text-xl' : 'text-lg'}`}>
                    🔥 {bestStreak}
                  </span>
                  <span className="text-[#888870]">best streak this session</span>
                </div>
              )}

              {authStatus === 'authenticated' && !stoppedEarly && (
                <div className="text-[0.75rem] text-center text-[#606080]">
                  {scoreSaved ? '✓ Score saved' : 'Saving score…'}
                </div>
              )}

              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={playAgain}
                  className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] transition-colors"
                >
                  Play Again
                </button>
                <button
                  onClick={() => { setGamePhase('idle'); setQuestion(null); setStreak(0); setBestStreak(0); }}
                  className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#3a3a60] bg-[#0b0b16] text-[#8888b8] hover:border-[#5050a0] hover:text-[#aaaacc] transition-colors"
                >
                  Back to Explore
                </button>
                <button
                  onClick={() => { setGamePhase('idle'); setQuestion(null); setStreak(0); setBestStreak(0); setAppView('stats'); }}
                  className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#9898c8] hover:border-[#7070a0] hover:text-[#c0c0e8] transition-colors flex items-center gap-1.5"
                >
                  <span>📊</span> View Stats
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
