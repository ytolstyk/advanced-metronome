import { useMemo, useRef, useCallback, useState } from 'react';
import type React from 'react';
import { Link, useParams } from 'react-router-dom';
import { getModule, getLesson, getNextLesson } from '@/data/lessons';
import { useLessonsProgress } from '@/hooks/useLessonsProgress';
import { useLessonAudio } from '@/hooks/useLessonAudio';
import { Fretboard } from '@/components/Fretboard/Fretboard';
import { LessonTabView } from '@/components/LessonTabView/LessonTabView';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { Lesson, LessonModule, TabLine, FretHighlight, PracticeNotes } from '@/data/lessons';
import './LessonPage.css';

export function LessonPage() {
  const { moduleId, lessonId } = useParams<{ moduleId: string; lessonId: string }>();
  const mod = useMemo(() => getModule(moduleId ?? ''), [moduleId]);
  const lesson = useMemo(() => getLesson(moduleId ?? '', lessonId ?? ''), [moduleId, lessonId]);

  if (!mod || !lesson) {
    return (
      <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[900px] mx-auto">
        <p className="text-[#888]">Lesson not found.</p>
        <Link to="/lessons" className="text-[#5b7fff] hover:underline text-sm">&larr; Back to Lessons</Link>
      </main>
    );
  }

  // Key resets example selection state when navigating to a different lesson
  return <LessonWithExamples key={lesson.id} mod={mod} lesson={lesson} />;
}

function LessonWithExamples({ mod, lesson }: { mod: LessonModule; lesson: Lesson }) {
  const [exampleIdx, setExampleIdx] = useState(0);
  const examples = lesson.examples ?? [];
  const activeTab: TabLine[] = exampleIdx === 0 ? lesson.tab : examples[exampleIdx - 1].tab;
  const activeHighlights: FretHighlight[] = exampleIdx === 0 ? lesson.fretHighlights : examples[exampleIdx - 1].fretHighlights;
  const activePracticeNotes: PracticeNotes = exampleIdx === 0 ? lesson.practiceNotes : examples[exampleIdx - 1].practiceNotes;

  const variantSelector = examples.length > 0 ? (
    <div className="flex gap-2 flex-wrap">
      {['Original', ...examples.map(e => e.name)].map((name, i) => (
        <button
          key={i}
          onClick={() => setExampleIdx(i)}
          className={
            exampleIdx === i
              ? 'px-3 py-1 rounded text-sm font-medium bg-[#5b7fff] text-white'
              : 'px-3 py-1 rounded text-sm font-medium border border-[#505270] text-[#aaa] hover:border-[#5b7fff] hover:text-[#eee]'
          }
        >
          {name}
        </button>
      ))}
    </div>
  ) : null;

  return (
    // Key forces full remount when example changes, resetting audio/bpm state
    <LessonInner
      key={`${lesson.id}-${exampleIdx}`}
      mod={mod}
      lesson={lesson}
      tab={activeTab}
      fretHighlights={activeHighlights}
      practiceNotes={activePracticeNotes}
      variantSelector={variantSelector}
    />
  );
}

function LessonInner({ mod, lesson, tab, fretHighlights, practiceNotes, variantSelector }: {
  mod: LessonModule;
  lesson: Lesson;
  tab: TabLine[];
  fretHighlights: FretHighlight[];
  practiceNotes: PracticeNotes;
  variantSelector?: React.ReactNode;
}) {
  const { markViewed, markComplete, isComplete, toggleFavorite, isFavorite } = useLessonsProgress();
  const [bpm, setBpm] = useState(practiceNotes.defaultBpm);
  const hasPlayedRef = useRef(false);

  const { isPlaying, activeNoteIdx, toggle, playNote } = useLessonAudio(practiceNotes.steps, bpm);

  const handlePlay = useCallback(() => {
    toggle();
    if (!hasPlayedRef.current) {
      hasPlayedRef.current = true;
      markViewed(lesson.id, mod.id);
    }
  }, [toggle, lesson.id, mod.id, markViewed]);

  const complete = isComplete(lesson.id);
  const fav = isFavorite(lesson.id);

  const prevLesson = useMemo(() => {
    const idx = mod.lessons.findIndex(l => l.id === lesson.id);
    if (idx <= 0) return null;
    return mod.lessons[idx - 1];
  }, [mod, lesson]);

  const nextLessonData = useMemo(
    () => getNextLesson(mod.id, lesson.id),
    [mod.id, lesson.id],
  );

  const highlightedDotKeys = useMemo(() => {
    if (activeNoteIdx === null) return null;
    const steps = practiceNotes.steps;
    if (steps.length === 0) return null;
    const entry = steps[activeNoteIdx % steps.length];
    const noteList = Array.isArray(entry) ? entry : [entry];
    return new Set(noteList.map(s => `${5 - s.string}-${s.fret}`));
  }, [activeNoteIdx, practiceNotes]);

  // Map activeNoteIdx to the tab column index using all strings
  const activeBeatIndex = useMemo(() => {
    if (activeNoteIdx === null || tab.length === 0) return null;
    const totalSteps = practiceNotes.steps.length;
    if (totalSteps === 0) return null;
    const noteIdx = activeNoteIdx % totalSteps;
    const colCount = Math.max(...tab.map(l => l.steps.length));
    let cumulative = 0;
    for (let i = 0; i < colCount; i++) {
      let colNotes = 0;
      for (const line of tab) {
        const s = line.steps[i];
        if (s && s !== '|') {
          colNotes = Math.max(colNotes, s.match(/\d+/g)?.length ?? 0);
        }
      }
      if (colNotes > 0) {
        if (noteIdx >= cumulative && noteIdx < cumulative + colNotes) return i;
        cumulative += colNotes;
      }
    }
    return null;
  }, [activeNoteIdx, practiceNotes, tab]);

  const difficultyColor =
    lesson.difficulty === 'beginner' ? '#22dd88' :
    lesson.difficulty === 'intermediate' ? '#ffca28' : '#e07878';

  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-12 max-w-[900px] mx-auto" aria-label={lesson.title}>
      <Link to={`/lessons/${mod.id}`} className="text-[#5b7fff] hover:underline text-sm">
        &larr; {mod.title}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-[#f0f0f0]">{lesson.title}</h1>
        <span className="lesson-difficulty-badge" style={{ color: difficultyColor, borderColor: difficultyColor }}>
          {lesson.difficulty}
        </span>
        <div className="flex gap-1 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleFavorite(lesson.id, mod.id)}
            aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <span style={{ color: fav ? '#ffca28' : '#666', fontSize: '1.2rem' }}>
              {fav ? '\u2605' : '\u2606'}
            </span>
          </Button>
        </div>
      </div>

      <section className="lesson-section">
        <h2 className="lesson-section-title">Explanation</h2>
        <p className="lesson-section-text">{lesson.explanation}</p>
      </section>

      <section className="lesson-section">
        <h2 className="lesson-section-title">Practice Routine</h2>
        <p className="lesson-section-text">{lesson.practiceRoutine}</p>
      </section>

      <section>{variantSelector}</section>

      <section>
        <h2 className="lesson-section-title">Tab</h2>
        <LessonTabView tab={tab} activeBeatIndex={activeBeatIndex} />
      </section>

      <section>
        <h2 className="lesson-section-title">Fretboard</h2>
        <div className="lesson-fretboard-wrap">
          <Fretboard
            highlights={fretHighlights}
            highlightedDotKeys={highlightedDotKeys}
            onNoteClick={(midi) => playNote(midi)}
            interactive
          />
        </div>
      </section>

      <section className="lesson-controls">
        <Button
          onClick={handlePlay}
          className={isPlaying
            ? 'bg-[#e07878] hover:bg-[#d06868] text-white'
            : 'bg-[#5b7fff] hover:bg-[#4a6ee8] text-white'}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </Button>

        <div className="lesson-bpm-control">
          <span className="text-[0.72rem] font-bold uppercase tracking-wider text-[#9898c8]">BPM</span>
          <input
            type="number"
            value={bpm}
            onChange={(e) => {
              const v = Math.min(300, Math.max(40, Number(e.target.value) || 40));
              setBpm(v);
            }}
            className="w-14 h-7 text-center font-bold bg-[#262736] border border-[#505270] rounded text-[#eee] text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <Slider
            min={40}
            max={300}
            step={1}
            value={[bpm]}
            onValueChange={([v]) => setBpm(v)}
            className="w-40 max-sm:w-28"
          />
        </div>
      </section>

      <div className="lesson-complete-section">
        <Button
          variant="outline"
          onClick={() => markComplete(lesson.id, mod.id)}
          className={complete
            ? 'border-[#22dd88] text-[#22dd88] hover:border-[#e05555] hover:text-[#e05555]'
            : 'border-[#505270] text-[#aaa] hover:border-[#22dd88] hover:text-[#22dd88]'}
        >
          {complete ? '\u2713 Completed' : 'Mark Complete'}
        </Button>
      </div>

      <div className="lesson-nav">
        {prevLesson ? (
          <Link to={`/lessons/${mod.id}/${prevLesson.id}`} className="lesson-nav-link">
            &larr; {prevLesson.title}
          </Link>
        ) : <span />}
        {nextLessonData ? (
          <Link to={`/lessons/${nextLessonData.moduleId}/${nextLessonData.lessonId}`} className="lesson-nav-link">
            {getLesson(nextLessonData.moduleId, nextLessonData.lessonId)?.title ?? 'Next'} &rarr;
          </Link>
        ) : <span />}
      </div>
    </main>
  );
}
