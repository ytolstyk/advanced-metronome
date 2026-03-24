import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getModule } from '@/data/lessons';
import type { Difficulty } from '@/data/lessons';
import { useLessonsProgress } from '@/hooks/useLessonsProgress';
import { Button } from '@/components/ui/button';
import './ModulePage.css';

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  beginner: '#22dd88',
  intermediate: '#ffca28',
  advanced: '#e07878',
};

export function ModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const mod = useMemo(() => getModule(moduleId ?? ''), [moduleId]);
  const { isComplete, isActive, isFavorite, toggleFavorite, getModuleProgress } = useLessonsProgress();

  if (!mod) {
    return (
      <main className="flex flex-col gap-4 px-4 pt-6 pb-12 max-w-[900px] mx-auto">
        <p className="text-[#888]">Module not found.</p>
        <Link to="/lessons" className="text-[#5b7fff] hover:underline text-sm">&larr; Back to Lessons</Link>
      </main>
    );
  }

  const { completed, total } = getModuleProgress(mod.id, mod.lessons);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-12 max-w-[900px] mx-auto" aria-label={mod.title}>
      <Link to="/lessons" className="text-[#5b7fff] hover:underline text-sm">&larr; Back to Lessons</Link>

      <div>
        <h1 className="text-xl font-bold text-[#f0f0f0]">{mod.title}</h1>
        <p className="text-[0.85rem] text-[#aaa] mt-1">{mod.description}</p>
        <div className="flex items-center gap-3 mt-3">
          <div className="lesson-progress-bar" style={{ maxWidth: 200 }}>
            <div className="lesson-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[0.75rem] text-[#888]">{completed}/{total} completed</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {mod.lessons.map((lesson) => {
          const complete = isComplete(lesson.id);
          const active = isActive(lesson.id);
          const fav = isFavorite(lesson.id);

          return (
            <div key={lesson.id} className="module-lesson-card">
              <Link to={`/lessons/${mod.id}/${lesson.id}`} className="module-lesson-link">
                <div className="module-lesson-status">
                  {complete ? (
                    <span className="module-lesson-check">&#10003;</span>
                  ) : active ? (
                    <span className="module-lesson-active" />
                  ) : (
                    <span className="module-lesson-empty" />
                  )}
                </div>
                <div className="module-lesson-info">
                  <span className="module-lesson-title">{lesson.title}</span>
                  <span
                    className="module-lesson-difficulty"
                    style={{ color: DIFFICULTY_COLORS[lesson.difficulty] }}
                  >
                    {lesson.difficulty}
                  </span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="module-lesson-fav-btn"
                onClick={() => toggleFavorite(lesson.id, mod.id)}
                aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
              >
                <span style={{ color: fav ? '#ffca28' : '#666', fontSize: '1.1rem' }}>
                  {fav ? '\u2605' : '\u2606'}
                </span>
              </Button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
