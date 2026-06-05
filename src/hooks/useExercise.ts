import { useState, useRef, useEffect } from 'react';
import { saveScore } from '../api/earTrainingApi';
import type { EarTrainingScorePayload } from '../api/earTrainingApi';

export type GameMode = '10' | '20' | '30' | 'infinite';
export type GamePhase = 'idle' | 'playing' | 'result';
export type Feedback = 'correct' | 'wrong' | null;

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
  questionsAnswered: number;
  elapsedSeconds: number;
  feedback: Feedback;
  answerReveal: boolean;
  scoreSaved: boolean;
  stoppedEarly: boolean;
  processingRef: React.MutableRefObject<boolean>;
  startGame: () => void;
  stopGame: () => void;
  resetToIdle: () => void;
  handleAnswer: (isCorrect: boolean) => void;
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
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [answerReveal, setAnswerReveal] = useState(false);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const elapsedRef = useRef(0);

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
    processingRef.current = false;

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
      processingRef.current = false;
    }
  }

  function startGame() {
    clearTimers();
    setScore(0);
    setWrongAnswers(0);
    setQuestionsAnswered(0);
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    setFeedback(null);
    setAnswerReveal(false);
    setScoreSaved(false);
    setStoppedEarly(false);
    processingRef.current = false;
    const q = genQuestionRef.current(null);
    setQuestion(q);
    setGamePhase('playing');
  }

  function stopGame() {
    clearTimers();
    setGamePhase('result');
    setStoppedEarly(true);
    setAnswerReveal(false);
    setFeedback(null);
    processingRef.current = false;
  }

  function resetToIdle() {
    setGamePhase('idle');
    setQuestion(null);
  }

  function handleAnswer(isCorrect: boolean) {
    if (!question || processingRef.current) return;
    processingRef.current = true;
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
      }, 600);
    } else {
      const nextWrong = wrongAnswers + 1;
      const currentScore = score;
      setWrongAnswers(nextWrong);
      setFeedback('wrong');
      setAnswerReveal(true);

      if (gameModeRef.current === 'infinite') {
        answerTimerRef.current = setTimeout(() => {
          endGame(currentScore, nextWrong, questionsAnswered, elapsedRef.current);
        }, 1200);
      } else {
        const nextAnswered = questionsAnswered + 1;
        setQuestionsAnswered(nextAnswered);
        answerTimerRef.current = setTimeout(() => {
          advanceToNext(currentScore, nextWrong, nextAnswered, excludeKey);
        }, 900);
      }
    }
  }

  return {
    gamePhase,
    question,
    score,
    wrongAnswers,
    questionsAnswered,
    elapsedSeconds,
    feedback,
    answerReveal,
    scoreSaved,
    stoppedEarly,
    processingRef,
    startGame,
    stopGame,
    resetToIdle,
    handleAnswer,
  };
}
