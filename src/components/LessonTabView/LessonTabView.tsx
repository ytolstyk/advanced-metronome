import { useMemo } from 'react';
import type { TabLine } from '@/data/lessons/types';
import './LessonTabView.css';

interface LessonTabViewProps {
  tab: TabLine[];
  activeBeatIndex?: number | null;
}

export function LessonTabView({ tab, activeBeatIndex }: LessonTabViewProps) {
  const colCount = useMemo(
    () => Math.max(...tab.map(l => l.steps.length)),
    [tab],
  );

  const colWidths = useMemo(() => {
    const widths: number[] = [];
    for (let i = 0; i < colCount; i++) {
      let max = 1;
      for (const line of tab) {
        const s = line.steps[i];
        if (s === '|') { max = Math.max(max, 1); }
        else if (s != null) { max = Math.max(max, s.length + 1); }
      }
      widths.push(max);
    }
    return widths;
  }, [tab, colCount]);

  return (
    <div className="lesson-tab-view">
      {tab.map((line) => (
        <div key={line.string} className="lesson-tab-line">
          <span className="lesson-tab-string">{line.string}</span>
          <span className="lesson-tab-content">
            {'|'}
            {line.steps.map((step, i) => {
              const w = colWidths[i];
              if (step === '|') {
                return <span key={i} className="lesson-tab-bar">{'|'}</span>;
              }
              const text = step == null ? '-'.repeat(w) : step.padEnd(w, '-');
              const isActive = activeBeatIndex != null && i === activeBeatIndex && step != null;
              return (
                <span
                  key={i}
                  className={isActive ? 'lesson-tab-beat lesson-tab-beat--active' : 'lesson-tab-beat'}
                >
                  {text}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
