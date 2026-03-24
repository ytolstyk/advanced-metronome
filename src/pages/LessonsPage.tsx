import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TECHNIQUE_MODULES, THEORY_MODULES, ALL_MODULES } from '@/data/lessons';
import type { LessonModule } from '@/data/lessons';
import { useLessonsProgress } from '@/hooks/useLessonsProgress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import './LessonsPage.css';

const FILTER_ITEM_CLS =
  'h-auto px-3 py-1 text-[0.82rem] font-semibold rounded-md ' +
  'border border-[#505270] bg-[#1e1f2c] text-[#aaa] ' +
  'hover:bg-[#1e1f2c] hover:border-[#7070a0] hover:text-[#ddd] ' +
  'data-[state=on]:border-[#5b7fff] data-[state=on]:bg-[#252850] data-[state=on]:text-[#8eaaff]';

function ModuleCard({ mod }: { mod: LessonModule }) {
  const { getModuleProgress, favorites } = useLessonsProgress();
  const { completed, total } = getModuleProgress(mod.id, mod.lessons);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const hasFavLesson = mod.lessons.some(l => favorites.has(l.id));

  return (
    <Link to={`/lessons/${mod.id}`} className="lesson-module-card">
      <div className="lesson-module-header">
        <h3 className="lesson-module-title">{mod.title}</h3>
        {hasFavLesson && <span className="lesson-module-fav-indicator" title="Has favorite lessons">&#9733;</span>}
      </div>
      <p className="lesson-module-desc">{mod.description}</p>
      <div className="lesson-module-footer">
        <div className="lesson-progress-bar">
          <div className="lesson-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="lesson-progress-text">{completed}/{total} completed</span>
      </div>
    </Link>
  );
}

export function LessonsPage() {
  const [filter, setFilter] = useState<string>('all');
  const { progress, favorites } = useLessonsProgress();

  // Find the "continue" lesson: first active but not completed lesson
  const continuePath = useMemo(() => {
    for (const mod of ALL_MODULES) {
      for (const lesson of mod.lessons) {
        const status = progress.get(lesson.id);
        if (status === 'active') {
          return `/lessons/${mod.id}/${lesson.id}`;
        }
      }
    }
    // If all viewed lessons are completed, find next unstarted
    for (const mod of ALL_MODULES) {
      for (const lesson of mod.lessons) {
        if (!progress.has(lesson.id)) {
          return `/lessons/${mod.id}/${lesson.id}`;
        }
      }
    }
    return null;
  }, [progress]);

  const filteredTechnique = useMemo(() => {
    if (filter !== 'favorites') return TECHNIQUE_MODULES;
    return TECHNIQUE_MODULES.filter(m => m.lessons.some(l => favorites.has(l.id)));
  }, [filter, favorites]);

  const filteredTheory = useMemo(() => {
    if (filter !== 'favorites') return THEORY_MODULES;
    return THEORY_MODULES.filter(m => m.lessons.some(l => favorites.has(l.id)));
  }, [filter, favorites]);

  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-12 max-w-[1100px] mx-auto" aria-label="Lessons">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[#f0f0f0]">Lessons</h1>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={filter} onValueChange={(v) => { if (v) setFilter(v); }} className="flex gap-1">
            <ToggleGroupItem value="all" className={FILTER_ITEM_CLS}>All</ToggleGroupItem>
            <ToggleGroupItem value="favorites" className={FILTER_ITEM_CLS}>&#9733; Favorites</ToggleGroupItem>
          </ToggleGroup>
          {continuePath && (
            <Link to={continuePath}>
              <Button variant="outline" className="border-[#5b7fff] text-[#8eaaff] hover:bg-[#252850]">
                Continue
              </Button>
            </Link>
          )}
        </div>
      </div>

      {filteredTechnique.length > 0 && (
        <section>
          <h2 className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mb-3">Technique</h2>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {filteredTechnique.map(mod => <ModuleCard key={mod.id} mod={mod} />)}
          </div>
        </section>
      )}

      {filteredTheory.length > 0 && (
        <section>
          <h2 className="text-[0.7rem] font-bold uppercase tracking-wider text-[#9898c8] mb-3">Theory</h2>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {filteredTheory.map(mod => <ModuleCard key={mod.id} mod={mod} />)}
          </div>
        </section>
      )}

      {filteredTechnique.length === 0 && filteredTheory.length === 0 && (
        <p className="text-[#888] text-center py-12">No modules with favorite lessons found.</p>
      )}
    </main>
  );
}
