import { useState, useRef, useEffect } from 'react';
import { saveScore } from '../api/earTrainingApi';
import type { EarTrainingScorePayload } from '../api/earTrainingApi';

export type GameMode = '10' | '20' | '30' | 'infinite';
export type GamePhase = 'idle' | 'playing' | 'result';
export type Feedback = 'correct' | 'wrong' | null;

const CORRECT_ADVANCE_DELAY_MS = 600;
const WRONG_REVEAL_DELAY_MS = 1500;

export interface ExerciseQuestion {
  key: string;
}

interface UseExerciseOptions<Q extends ExerciseQuestion> {
  gameMode: GameMode;
  authStatus: string;
  generateQuestion: (excludeKey: string | null) => Q;
  buildSavePayload: (
    score: number,
    wrong: number,
    total: number,
    elapsed: number,
  ) => Omit<EarTrainingScorePayload, 'completedAt'>;
}

export interface UseExerciseReturn<Q extends ExerciseQuestion> {
  gamePhase: GamePhase;
  question: Q | null;
  score: number;
  wrongAnswers: number;
  skipped: number;
  questionsAnswered: number;
  elapsedSeconds: number;
  feedback: Feedback;
  answerReveal: boolean;
  scoreSaved: boolean;
  stoppedEarly: boolean;
  isProcessing: boolean;
  startGame: () => void;
  stopGame: () => void;
  resetToIdle: () => void;
  handleAnswer: (isCorrect: boolean) => void;
  handleSkip: () => void;
  resetRevealTimer: () => void;
}

export function useExercise<Q extends ExerciseQuestion>({
  gameMode,
  authStatus,
  generateQuestion,
  buildSavePayload,
}: UseExerciseOptions<Q>): UseExerciseReturn<Q> {
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [question, setQuestion] = useState<Q | null>(null);
  const [score, setScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [answerReveal, setAnswerReveal] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Internal guard for closure accuracy — isProcessing state is the reactive UI counterpart
  const processingRef = useRef(false);
  const elapsedRef = useRef(0);

  // Stores the pending advance/endGame callback during the wrong-answer reveal window
  const revealAdvanceFnRef = useRef<(() => void) | null>(null);
  // Incremented on each wrong answer (and on start/stop) so stale closures self-discard
  const revealNonceRef = useRef(0);
  // Tracks when the reveal window started so resetRevealTimer uses a time ceiling, not a reset
  const revealStartTimeRef = useRef(0);

  // Keep callbacks fresh in refs so timeout closures always use latest values
  const genQuestionRef = useRef(generateQuestion);
  useEffect(() => { genQuestionRef.current = generateQuestion; }, [generateQuestion]);

  const buildPayloadRef = useRef(buildSavePayload);
  useEffect(() => { buildPayloadRef.current = buildSavePayload; }, [buildSavePayload]);

  const gameModeRef = useRef(gameMode);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  const authStatusRef = useRef(authStatus);
  useEffect(() => { authStatusRef.current = authStatus; }, [authStatus]);

  function clearTimers() {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    feedbackTimerRef.current = null;
    answerTimerRef.current = null;
  }

  function setProcessing(value: boolean) {
    processingRef.current = value;
    setIsProcessing(value);
  }

  // Elapsed timer
  useEffect(() => {
    if (gamePhase === 'playing') {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSeconds(elapsedRef.current);
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

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimers();
  }, []);

  function endGame(finalScore: number, finalWrong: number, finalTotal: number, finalElapsed: number) {
    clearTimers();
    setGamePhase('result');
    setAnswerReveal(false);
    setFeedback(null);
    setProcessing(false);

    if (authStatusRef.current === 'authenticated') {
      const payload = buildPayloadRef.current(finalScore, finalWrong, finalTotal, finalElapsed);
      void saveScore({ ...payload, completedAt: new Date().toISOString() })
        .then((ok) => setScoreSaved(ok));
    }
  }

  function advanceToNext(
    nextScore: number,
    nextWrong: number,
    nextAnswered: number,
    excludeKey: string,
  ) {
    const mode = gameModeRef.current;
    const limit = mode === 'infinite' ? Infinity : parseInt(mode, 10);
    if (nextAnswered >= limit) {
      endGame(nextScore, nextWrong, nextAnswered, elapsedRef.current);
    } else {
      const q = genQuestionRef.current(excludeKey);
      setQuestion(q);
      setAnswerReveal(false);
      setFeedback(null);
      setProcessing(false);
    }
  }

  function startGame() {
    clearTimers();
    revealAdvanceFnRef.current = null;
    revealNonceRef.current++;
    setScore(0);
    setWrongAnswers(0);
    setSkipped(0);
    setQuestionsAnswered(0);
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    setFeedback(null);
    setAnswerReveal(false);
    setScoreSaved(false);
    setStoppedEarly(false);
    setProcessing(false);
    const q = genQuestionRef.current(null);
    setQuestion(q);
    setGamePhase('playing');
  }

  function stopGame() {
    clearTimers();
    revealAdvanceFnRef.current = null;
    revealNonceRef.current++;
    setGamePhase('result');
    setStoppedEarly(true);
    setAnswerReveal(false);
    setFeedback(null);
    setProcessing(false);
  }

  function resetToIdle() {
    setGamePhase('idle');
    setQuestion(null);
  }

  function handleAnswer(isCorrect: boolean) {
    if (!question || processingRef.current) return;
    setProcessing(true);
    clearTimers();

    const excludeKey = question.key;

    if (isCorrect) {
      const nextScore = score + 1;
      const nextAnswered = questionsAnswered + 1;
      const currentWrong = wrongAnswers;
      setScore(nextScore);
      setQuestionsAnswered(nextAnswered);
      setFeedback('correct');
      feedbackTimerRef.current = setTimeout(() => {
        advanceToNext(nextScore, currentWrong, nextAnswered, excludeKey);
      }, CORRECT_ADVANCE_DELAY_MS);
    } else {
      const nextWrong = wrongAnswers + 1;
      const currentScore = score;
      const currentAnswered = questionsAnswered; // snapshot before any setState
      setWrongAnswers(nextWrong);
      setFeedback('wrong');
      setAnswerReveal(true);

      // Nonce guards against double-fire if natural timer and resetRevealTimer race
      const myNonce = ++revealNonceRef.current;
      revealStartTimeRef.current = Date.now();

      if (gameModeRef.current === 'infinite') {
        setQuestionsAnswered(currentAnswered + 1);
        const endFn = () => {
          if (revealNonceRef.current !== myNonce) return;
          revealAdvanceFnRef.current = null;
          endGame(currentScore, nextWrong, currentAnswered + 1, elapsedRef.current);
        };
        revealAdvanceFnRef.current = endFn;
        answerTimerRef.current = setTimeout(endFn, WRONG_REVEAL_DELAY_MS);
      } else {
        const nextAnswered = currentAnswered + 1;
        setQuestionsAnswered(nextAnswered);
        const advanceFn = () => {
          if (revealNonceRef.current !== myNonce) return;
          revealAdvanceFnRef.current = null;
          advanceToNext(currentScore, nextWrong, nextAnswered, excludeKey);
        };
        revealAdvanceFnRef.current = advanceFn;
        answerTimerRef.current = setTimeout(advanceFn, WRONG_REVEAL_DELAY_MS);
      }
    }
  }

  function handleSkip() {
    if (!question || processingRef.current) return;
    setProcessing(true);
    clearTimers();
    revealAdvanceFnRef.current = null;
    const excludeKey = question.key;
    const nextSkipped = skipped + 1;
    const nextAnswered = questionsAnswered + 1;
    setSkipped(nextSkipped);
    setQuestionsAnswered(nextAnswered);
    advanceToNext(score, wrongAnswers, nextAnswered, excludeKey);
  }

  // Reschedules the reveal advance timer using remaining time from the original window,
  // so replaying audio cannot extend the reveal beyond WRONG_REVEAL_DELAY_MS from when
  // the wrong answer was given.
  function resetRevealTimer() {
    if (!revealAdvanceFnRef.current) return;
    if (answerTimerRef.current) clearTimeout(answerTimerRef.current);
    const elapsed = Date.now() - revealStartTimeRef.current;
    const remaining = Math.max(0, WRONG_REVEAL_DELAY_MS - elapsed);
    answerTimerRef.current = setTimeout(revealAdvanceFnRef.current, remaining);
  }

  return {
    gamePhase,
    question,
    score,
    wrongAnswers,
    skipped,
    questionsAnswered,
    elapsedSeconds,
    feedback,
    answerReveal,
    scoreSaved,
    stoppedEarly,
    isProcessing,
    startGame,
    stopGame,
    resetToIdle,
    handleAnswer,
    handleSkip,
    resetRevealTimer,
  };
}
