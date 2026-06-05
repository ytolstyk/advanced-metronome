import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { cn } from '../lib/utils';
import {
  INTERVAL_NAMES,
  INTERVAL_SEMITONES,
  INTERVAL_RANGE_MAX,
  type IntervalName,
  type IntervalRange,
  type IntervalDirection,
} from '../data/intervals';
import { CHORD_TYPE_LABELS, type ChordType } from '../data/chords';
import { SCALE_LABELS, SCALE_MODES, type ScaleMode } from '../data/scales';
import {
  playInterval,
  playEarTrainingChord,
  playScale,
} from '../audio/earTrainingSynths';
import { useExercise, type GameMode } from '../hooks/useExercise';
import {
  generateIntervalQuestion,
  generateChordQuestion,
  generateScaleQuestion,
} from './earTrainingLogic';
import './EarTrainingPage.css';

// ── Shared helpers ─────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const TOGGLE_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]';

const DEFAULT_CHORD_TYPES: ChordType[] = ['major', 'minor', '7', 'maj7', 'dim', 'aug', 'sus2', 'sus4'];
const DEFAULT_SCALE_MODES: ScaleMode[] = [
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian',
  'pentatonic_major', 'pentatonic_minor',
];

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ── Page shell ─────────────────────────────────────────────────────────────

type Tab = 'intervals' | 'chords' | 'scales';

export function EarTrainingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('intervals');
  const audioCtxRef = useRef<AudioContext | null>(null);

  function getOrCreateCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  const TAB_CLS = (tab: Tab) =>
    cn(
      'px-4 py-2 text-[0.85rem] font-semibold rounded-md transition-colors',
      activeTab === tab
        ? 'border border-[#5b7fff] bg-[#252850] text-[#8eaaff]'
        : 'border border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]',
    );

  return (
    <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[900px] mx-auto" aria-label="Ear Training">
      <h1 className="text-xl font-bold text-[#d0d0f0]">Ear Training</h1>

      <div className="flex gap-2">
        <button className={TAB_CLS('intervals')} onClick={() => setActiveTab('intervals')}>Intervals</button>
        <button className={TAB_CLS('chords')} onClick={() => setActiveTab('chords')}>Chords</button>
        <button className={TAB_CLS('scales')} onClick={() => setActiveTab('scales')}>Scales</button>
      </div>

      {activeTab === 'intervals' && <IntervalsExercise getCtx={getOrCreateCtx} />}
      {activeTab === 'chords' && <ChordsExercise getCtx={getOrCreateCtx} />}
      {activeTab === 'scales' && <ScalesExercise getCtx={getOrCreateCtx} />}
    </main>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function GameModeRow({
  gameMode,
  onChange,
}: {
  gameMode: GameMode;
  onChange: (v: GameMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] w-14">Mode</span>
      <ToggleGroup type="single" value={gameMode} onValueChange={(v) => { if (v) onChange(v as GameMode); }} className="flex gap-1">
        {(['10', '20', '30', 'infinite'] as const).map((m) => (
          <ToggleGroupItem key={m} value={m} className={TOGGLE_CLS}>
            {m === 'infinite' ? '∞' : `${m}Q`}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function QuestionBanner({
  feedback,
  score,
  wrongAnswers,
  questionsAnswered,
  elapsedSeconds,
  gameMode,
  onStop,
  onPlayAgain,
}: {
  feedback: 'correct' | 'wrong' | null;
  score: number;
  wrongAnswers: number;
  questionsAnswered: number;
  elapsedSeconds: number;
  gameMode: GameMode;
  onStop: () => void;
  onPlayAgain: () => void;
}) {
  const limit = gameMode === 'infinite' ? null : parseInt(gameMode, 10);
  void questionsAnswered;

  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3',
        feedback === 'correct'
          ? 'border-[#22dd88] bg-[#081a10] et-feedback-correct'
          : feedback === 'wrong'
            ? 'border-[#dd4444] bg-[#1a0808] et-feedback-wrong'
            : 'border-[#3a3a60] bg-[#0b0b16]',
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">
          Listen and identify
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPlayAgain}
            className="h-8 px-3 text-[0.78rem] font-semibold rounded-md border border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd] transition-colors"
          >
            ♪ Play Again
          </button>
          {feedback && (
            <span className={cn('text-sm font-semibold', feedback === 'correct' ? 'text-[#22dd88]' : 'text-[#ff7777]')}>
              {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
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
          onClick={onStop}
          className="h-9 px-4 text-[0.82rem] font-semibold rounded-md border border-[#6a2020] bg-[#0f0808] text-[#dd7777] hover:border-[#dd4444] hover:text-[#ff8888] transition-colors shrink-0"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

function ResultScreen({
  score,
  wrongAnswers,
  questionsAnswered,
  elapsedSeconds,
  scoreSaved,
  stoppedEarly,
  authStatus,
  onPlayAgain,
  onChangeSettings,
}: {
  score: number;
  wrongAnswers: number;
  questionsAnswered: number;
  elapsedSeconds: number;
  scoreSaved: boolean;
  stoppedEarly: boolean;
  authStatus: string;
  onPlayAgain: () => void;
  onChangeSettings: () => void;
}) {
  return (
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
      {authStatus === 'authenticated' && !stoppedEarly && (
        <div className="text-[0.75rem] text-center text-[#606080]">
          {scoreSaved ? '✓ Score saved' : 'Saving score…'}
        </div>
      )}
      <div className="flex gap-3 justify-center">
        <button
          onClick={onPlayAgain}
          className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] transition-colors"
        >
          Play Again
        </button>
        <button
          onClick={onChangeSettings}
          className="h-9 px-5 text-[0.82rem] font-semibold rounded-md border border-[#3a3a60] bg-[#0b0b16] text-[#8888b8] hover:border-[#5050a0] hover:text-[#aaaacc] transition-colors"
        >
          Change Settings
        </button>
      </div>
    </div>
  );
}

// ── Answer button styling helper ───────────────────────────────────────────

function answerBtnCls(
  isCorrect: boolean,
  isGuessed: boolean,
  feedback: 'correct' | 'wrong' | null,
  answerReveal: boolean,
): string {
  if (feedback === 'correct' && isCorrect) {
    return 'border-[#22dd88] bg-[#081a10] text-[#22dd88] et-feedback-correct';
  }
  if (feedback === 'wrong' && isGuessed && !isCorrect) {
    return 'border-[#dd4444] bg-[#1a0808] text-[#ff7777] et-feedback-wrong';
  }
  if (answerReveal && isCorrect && !isGuessed) {
    return 'border-[#e09020] bg-[#1a1000] text-[#ffd060]';
  }
  return 'border-[#505270] bg-[#1e1f2c] text-[#aaa] hover:border-[#7070a0] hover:text-[#ddd]';
}

// ── Intervals exercise ─────────────────────────────────────────────────────

function IntervalsExercise({ getCtx }: { getCtx: () => AudioContext }) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const v = lsGet('earTraining.intervals.gameMode');
    return (v === '10' || v === '20' || v === '30' || v === 'infinite') ? v : '10';
  });
  const [range, setRange] = useState<IntervalRange>(() => {
    const v = lsGet('earTraining.intervals.range');
    return (v === 'up-to-tritone' || v === 'up-to-octave' || v === 'all') ? v : 'up-to-octave';
  });
  const [direction, setDirection] = useState<IntervalDirection>(() => {
    const v = lsGet('earTraining.intervals.direction');
    return (v === 'ascending' || v === 'descending' || v === 'harmonic' || v === 'random') ? v : 'random';
  });

  const [guessState, setGuessState] = useState<{ key: string; guess: IntervalName } | null>(null);
  const stopCurrentSoundRef = useRef<() => void>(() => {});

  useEffect(() => { lsSet('earTraining.intervals.gameMode', gameMode); }, [gameMode]);
  useEffect(() => { lsSet('earTraining.intervals.range', range); }, [range]);
  useEffect(() => { lsSet('earTraining.intervals.direction', direction); }, [direction]);

  const genQuestion = useCallback(
    (excludeKey: string | null) => generateIntervalQuestion(range, direction, excludeKey),
    [range, direction],
  );

  const buildPayload = useCallback(
    (score: number, wrong: number, total: number, elapsed: number) => ({
      exerciseType: 'intervals',
      score,
      wrongAnswers: wrong,
      totalQuestions: total,
      elapsedSeconds: elapsed,
      gameMode,
      difficulty: `${direction}/${range}`,
    }),
    [gameMode, direction, range],
  );

  const exercise = useExercise({
    gameMode,
    authStatus,
    generateQuestion: genQuestion,
    buildSavePayload: buildPayload,
  });

  // Derived: ignore guess if it's for a different question (avoids useEffect-based reset)
  const userGuess = guessState !== null && guessState.key === exercise.question?.key ? guessState.guess : null;

  const prevQuestionKey = useRef<string | null>(null);
  useEffect(() => {
    if (exercise.question && exercise.question.key !== prevQuestionKey.current && exercise.gamePhase === 'playing') {
      prevQuestionKey.current = exercise.question.key;
      stopCurrentSoundRef.current();
      const ctx = getCtx();
      stopCurrentSoundRef.current = playInterval(ctx, exercise.question.rootMidi, exercise.question.semitones, exercise.question.actualDirection);
    }
    if (exercise.gamePhase !== 'playing') {
      prevQuestionKey.current = null;
      stopCurrentSoundRef.current();
      stopCurrentSoundRef.current = () => {};
    }
  }, [exercise.question, exercise.gamePhase, getCtx]);

  function playCurrentQuestion() {
    if (!exercise.question) return;
    stopCurrentSoundRef.current();
    const ctx = getCtx();
    stopCurrentSoundRef.current = playInterval(ctx, exercise.question.rootMidi, exercise.question.semitones, exercise.question.actualDirection);
  }

  function onAnswer(name: IntervalName) {
    if (!exercise.question) return;
    stopCurrentSoundRef.current();
    stopCurrentSoundRef.current = () => {};
    setGuessState({ key: exercise.question.key, guess: name });
    exercise.handleAnswer(name === exercise.question.intervalName);
  }

  const maxSemitones = INTERVAL_RANGE_MAX[range];
  const answerOptions = INTERVAL_NAMES.filter((n) => INTERVAL_SEMITONES[n] <= maxSemitones);

  if (exercise.gamePhase === 'result') {
    return (
      <ResultScreen
        score={exercise.score}
        wrongAnswers={exercise.wrongAnswers}
        questionsAnswered={exercise.questionsAnswered}
        elapsedSeconds={exercise.elapsedSeconds}
        scoreSaved={exercise.scoreSaved}
        stoppedEarly={exercise.stoppedEarly}
        authStatus={authStatus}
        onPlayAgain={exercise.startGame}
        onChangeSettings={exercise.resetToIdle}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {exercise.gamePhase === 'idle' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-5 py-4 flex flex-col gap-3">
          <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">Settings</div>
          <GameModeRow gameMode={gameMode} onChange={setGameMode} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] w-14">Range</span>
            <ToggleGroup type="single" value={range} onValueChange={(v) => { if (v) setRange(v as IntervalRange); }} className="flex gap-1">
              <ToggleGroupItem value="up-to-tritone" className={TOGGLE_CLS}>Up to Tritone</ToggleGroupItem>
              <ToggleGroupItem value="up-to-octave" className={TOGGLE_CLS}>Up to Octave</ToggleGroupItem>
              <ToggleGroupItem value="all" className={TOGGLE_CLS}>All</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] w-14">Dir</span>
            <ToggleGroup type="single" value={direction} onValueChange={(v) => { if (v) setDirection(v as IntervalDirection); }} className="flex gap-1">
              <ToggleGroupItem value="ascending" className={TOGGLE_CLS}>Ascending</ToggleGroupItem>
              <ToggleGroupItem value="descending" className={TOGGLE_CLS}>Descending</ToggleGroupItem>
              <ToggleGroupItem value="harmonic" className={TOGGLE_CLS}>Harmonic</ToggleGroupItem>
              <ToggleGroupItem value="random" className={TOGGLE_CLS}>Random</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-[0.75rem] text-[#606080]">
            {gameMode === 'infinite'
              ? 'Answer until you make a mistake or stop.'
              : `Answer ${gameMode} questions. Wrong answers are tracked but the game continues.`}
          </p>
          <button
            onClick={exercise.startGame}
            className="self-start h-10 px-6 text-[0.9rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] hover:text-[#66ffbb] transition-colors"
          >
            ▶ Start
          </button>
        </div>
      )}

      {exercise.gamePhase === 'playing' && (
        <>
          <QuestionBanner
            feedback={exercise.feedback}
            score={exercise.score}
            wrongAnswers={exercise.wrongAnswers}
            questionsAnswered={exercise.questionsAnswered}
            elapsedSeconds={exercise.elapsedSeconds}
            gameMode={gameMode}
            onStop={exercise.stopGame}
            onPlayAgain={playCurrentQuestion}
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {answerOptions.map((name) => (
              <button
                key={name}
                onClick={() => onAnswer(name)}
                disabled={exercise.processingRef.current}
                className={cn(
                  'px-3 py-2.5 text-[0.82rem] font-semibold rounded-md border transition-colors',
                  answerBtnCls(
                    name === exercise.question?.intervalName,
                    name === userGuess,
                    exercise.feedback,
                    exercise.answerReveal,
                  ),
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Chords exercise ────────────────────────────────────────────────────────

function ChordsExercise({ getCtx }: { getCtx: () => AudioContext }) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const v = lsGet('earTraining.chords.gameMode');
    return (v === '10' || v === '20' || v === '30' || v === 'infinite') ? v : '10';
  });
  const [enabledTypes, setEnabledTypes] = useState<Set<ChordType>>(() => {
    try {
      const raw = lsGet('earTraining.chords.enabledTypes');
      if (raw) {
        const arr = JSON.parse(raw) as ChordType[];
        if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
      }
    } catch { /* ignore */ }
    return new Set(DEFAULT_CHORD_TYPES);
  });

  const [guessState, setGuessState] = useState<{ key: string; guess: ChordType } | null>(null);
  const stopCurrentSoundRef = useRef<() => void>(() => {});

  useEffect(() => { lsSet('earTraining.chords.gameMode', gameMode); }, [gameMode]);
  useEffect(() => { lsSet('earTraining.chords.enabledTypes', JSON.stringify([...enabledTypes])); }, [enabledTypes]);

  const genQuestion = useCallback(
    (excludeKey: string | null) => generateChordQuestion(enabledTypes, excludeKey),
    [enabledTypes],
  );

  const buildPayload = useCallback(
    (score: number, wrong: number, total: number, elapsed: number) => ({
      exerciseType: 'chords',
      score,
      wrongAnswers: wrong,
      totalQuestions: total,
      elapsedSeconds: elapsed,
      gameMode,
      difficulty: [...enabledTypes].sort().join(','),
    }),
    [gameMode, enabledTypes],
  );

  const exercise = useExercise({
    gameMode,
    authStatus,
    generateQuestion: genQuestion,
    buildSavePayload: buildPayload,
  });

  const userGuess = guessState !== null && guessState.key === exercise.question?.key ? guessState.guess : null;

  const prevQuestionKey = useRef<string | null>(null);
  useEffect(() => {
    if (exercise.question && exercise.question.key !== prevQuestionKey.current && exercise.gamePhase === 'playing') {
      prevQuestionKey.current = exercise.question.key;
      stopCurrentSoundRef.current();
      const ctx = getCtx();
      stopCurrentSoundRef.current = playEarTrainingChord(ctx, exercise.question.root, exercise.question.type);
    }
    if (exercise.gamePhase !== 'playing') {
      prevQuestionKey.current = null;
      stopCurrentSoundRef.current();
      stopCurrentSoundRef.current = () => {};
    }
  }, [exercise.question, exercise.gamePhase, getCtx]);

  function playCurrentQuestion() {
    if (!exercise.question) return;
    stopCurrentSoundRef.current();
    const ctx = getCtx();
    stopCurrentSoundRef.current = playEarTrainingChord(ctx, exercise.question.root, exercise.question.type);
  }

  function toggleType(type: ChordType) {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function onAnswer(type: ChordType) {
    if (!exercise.question) return;
    stopCurrentSoundRef.current();
    stopCurrentSoundRef.current = () => {};
    setGuessState({ key: exercise.question.key, guess: type });
    exercise.handleAnswer(type === exercise.question.type);
  }

  if (exercise.gamePhase === 'result') {
    return (
      <ResultScreen
        score={exercise.score}
        wrongAnswers={exercise.wrongAnswers}
        questionsAnswered={exercise.questionsAnswered}
        elapsedSeconds={exercise.elapsedSeconds}
        scoreSaved={exercise.scoreSaved}
        stoppedEarly={exercise.stoppedEarly}
        authStatus={authStatus}
        onPlayAgain={exercise.startGame}
        onChangeSettings={exercise.resetToIdle}
      />
    );
  }

  const answerOptions = [...enabledTypes];

  return (
    <div className="flex flex-col gap-4">
      {exercise.gamePhase === 'idle' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-5 py-4 flex flex-col gap-3">
          <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">Settings</div>
          <GameModeRow gameMode={gameMode} onChange={setGameMode} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8]">Chord Types</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CHORD_TYPE_LABELS) as ChordType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    TOGGLE_CLS,
                    enabledTypes.has(type) && '!border-[#5b7fff] !bg-[#252850] !text-[#8eaaff]',
                  )}
                >
                  {CHORD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="text-[0.72rem] text-[#606080]">{enabledTypes.size} type{enabledTypes.size !== 1 ? 's' : ''} selected</p>
          </div>
          <p className="text-[0.75rem] text-[#606080]">
            {gameMode === 'infinite'
              ? 'Answer until you make a mistake or stop.'
              : `Answer ${gameMode} questions. Wrong answers are tracked but the game continues.`}
          </p>
          <button
            onClick={exercise.startGame}
            className="self-start h-10 px-6 text-[0.9rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] hover:text-[#66ffbb] transition-colors"
          >
            ▶ Start
          </button>
        </div>
      )}

      {exercise.gamePhase === 'playing' && (
        <>
          <QuestionBanner
            feedback={exercise.feedback}
            score={exercise.score}
            wrongAnswers={exercise.wrongAnswers}
            questionsAnswered={exercise.questionsAnswered}
            elapsedSeconds={exercise.elapsedSeconds}
            gameMode={gameMode}
            onStop={exercise.stopGame}
            onPlayAgain={playCurrentQuestion}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {answerOptions.map((type) => (
              <button
                key={type}
                onClick={() => onAnswer(type)}
                disabled={exercise.processingRef.current}
                className={cn(
                  'px-3 py-2.5 text-[0.82rem] font-semibold rounded-md border transition-colors',
                  answerBtnCls(
                    type === exercise.question?.type,
                    type === userGuess,
                    exercise.feedback,
                    exercise.answerReveal,
                  ),
                )}
              >
                {CHORD_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Scales exercise ────────────────────────────────────────────────────────

function ScalesExercise({ getCtx }: { getCtx: () => AudioContext }) {
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const v = lsGet('earTraining.scales.gameMode');
    return (v === '10' || v === '20' || v === '30' || v === 'infinite') ? v : '10';
  });
  const [enabledModes, setEnabledModes] = useState<Set<ScaleMode>>(() => {
    try {
      const raw = lsGet('earTraining.scales.enabledModes');
      if (raw) {
        const arr = JSON.parse(raw) as ScaleMode[];
        if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
      }
    } catch { /* ignore */ }
    return new Set(DEFAULT_SCALE_MODES);
  });

  const [guessState, setGuessState] = useState<{ key: string; guess: ScaleMode } | null>(null);
  const stopCurrentSoundRef = useRef<() => void>(() => {});

  useEffect(() => { lsSet('earTraining.scales.gameMode', gameMode); }, [gameMode]);
  useEffect(() => { lsSet('earTraining.scales.enabledModes', JSON.stringify([...enabledModes])); }, [enabledModes]);

  const genQuestion = useCallback(
    (excludeKey: string | null) => generateScaleQuestion(enabledModes, excludeKey),
    [enabledModes],
  );

  const buildPayload = useCallback(
    (score: number, wrong: number, total: number, elapsed: number) => ({
      exerciseType: 'scales',
      score,
      wrongAnswers: wrong,
      totalQuestions: total,
      elapsedSeconds: elapsed,
      gameMode,
      difficulty: [...enabledModes].sort().join(','),
    }),
    [gameMode, enabledModes],
  );

  const exercise = useExercise({
    gameMode,
    authStatus,
    generateQuestion: genQuestion,
    buildSavePayload: buildPayload,
  });

  const userGuess = guessState !== null && guessState.key === exercise.question?.key ? guessState.guess : null;

  const prevQuestionKey = useRef<string | null>(null);
  useEffect(() => {
    if (exercise.question && exercise.question.key !== prevQuestionKey.current && exercise.gamePhase === 'playing') {
      prevQuestionKey.current = exercise.question.key;
      stopCurrentSoundRef.current();
      const ctx = getCtx();
      stopCurrentSoundRef.current = playScale(ctx, exercise.question.rootMidi, exercise.question.mode);
    }
    if (exercise.gamePhase !== 'playing') {
      prevQuestionKey.current = null;
      stopCurrentSoundRef.current();
      stopCurrentSoundRef.current = () => {};
    }
  }, [exercise.question, exercise.gamePhase, getCtx]);

  function playCurrentQuestion() {
    if (!exercise.question) return;
    stopCurrentSoundRef.current();
    const ctx = getCtx();
    stopCurrentSoundRef.current = playScale(ctx, exercise.question.rootMidi, exercise.question.mode);
  }

  function toggleMode(mode: ScaleMode) {
    setEnabledModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        if (next.size > 1) next.delete(mode);
      } else {
        next.add(mode);
      }
      return next;
    });
  }

  function onAnswer(mode: ScaleMode) {
    if (!exercise.question) return;
    stopCurrentSoundRef.current();
    stopCurrentSoundRef.current = () => {};
    setGuessState({ key: exercise.question.key, guess: mode });
    exercise.handleAnswer(mode === exercise.question.mode);
  }

  if (exercise.gamePhase === 'result') {
    return (
      <ResultScreen
        score={exercise.score}
        wrongAnswers={exercise.wrongAnswers}
        questionsAnswered={exercise.questionsAnswered}
        elapsedSeconds={exercise.elapsedSeconds}
        scoreSaved={exercise.scoreSaved}
        stoppedEarly={exercise.stoppedEarly}
        authStatus={authStatus}
        onPlayAgain={exercise.startGame}
        onChangeSettings={exercise.resetToIdle}
      />
    );
  }

  const answerOptions = [...enabledModes];

  return (
    <div className="flex flex-col gap-4">
      {exercise.gamePhase === 'idle' && (
        <div className="rounded-xl border border-[#3a3a60] bg-[#0b0b16] px-5 py-4 flex flex-col gap-3">
          <div className="text-[0.7rem] font-bold uppercase tracking-wider text-[#8080b8]">Settings</div>
          <GameModeRow gameMode={gameMode} onChange={setGameMode} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8]">Scale Modes</span>
            <div className="flex flex-wrap gap-1.5">
              {SCALE_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => toggleMode(mode)}
                  className={cn(
                    TOGGLE_CLS,
                    enabledModes.has(mode) && '!border-[#5b7fff] !bg-[#252850] !text-[#8eaaff]',
                  )}
                >
                  {SCALE_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className="text-[0.72rem] text-[#606080]">{enabledModes.size} mode{enabledModes.size !== 1 ? 's' : ''} selected</p>
          </div>
          <p className="text-[0.75rem] text-[#606080]">
            {gameMode === 'infinite'
              ? 'Answer until you make a mistake or stop.'
              : `Answer ${gameMode} questions. Wrong answers are tracked but the game continues.`}
          </p>
          <button
            onClick={exercise.startGame}
            className="self-start h-10 px-6 text-[0.9rem] font-semibold rounded-md border border-[#22dd88] bg-[#081a10] text-[#22dd88] hover:border-[#66ffbb] hover:text-[#66ffbb] transition-colors"
          >
            ▶ Start
          </button>
        </div>
      )}

      {exercise.gamePhase === 'playing' && (
        <>
          <QuestionBanner
            feedback={exercise.feedback}
            score={exercise.score}
            wrongAnswers={exercise.wrongAnswers}
            questionsAnswered={exercise.questionsAnswered}
            elapsedSeconds={exercise.elapsedSeconds}
            gameMode={gameMode}
            onStop={exercise.stopGame}
            onPlayAgain={playCurrentQuestion}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {answerOptions.map((mode) => (
              <button
                key={mode}
                onClick={() => onAnswer(mode)}
                disabled={exercise.processingRef.current}
                className={cn(
                  'px-3 py-2.5 text-[0.82rem] font-semibold rounded-md border transition-colors',
                  answerBtnCls(
                    mode === exercise.question?.mode,
                    mode === userGuess,
                    exercise.feedback,
                    exercise.answerReveal,
                  ),
                )}
              >
                {SCALE_LABELS[mode]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
