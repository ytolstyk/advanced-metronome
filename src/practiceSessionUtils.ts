import type { CompletedSession, ToolId } from './practiceSessionTypes';

export const TOOL_META: Record<ToolId, { label: string; route: string; short: string }> = {
  drums:               { label: 'Drum Machine',       route: '/drums',             short: 'Drums' },
  tuner:               { label: 'Tuner',              route: '/tuner',             short: 'Tuner' },
  chords:              { label: 'Chords',             route: '/chords',            short: 'Chords' },
  scales:              { label: 'Scales',             route: '/scales',            short: 'Scales' },
  circle:              { label: 'Circle of 5ths',     route: '/circle',            short: 'Circle' },
  'click-track':       { label: 'Click Track',        route: '/click-track',       short: 'Click' },
  'fret-memorizer':    { label: 'Fret Memorizer',     route: '/fret-memorizer',    short: 'Frets' },
  'tab-editor':        { label: 'Tab Editor',         route: '/tab-editor',        short: 'Tabs' },
  'ear-training':      { label: 'Ear Training',       route: '/ear-training',      short: 'Ears' },
  'chord-progression': { label: 'Chord Progression',  route: '/chord-progression', short: 'Chords+' },
  caged:               { label: 'CAGED System',       route: '/caged',             short: 'CAGED' },
};

export const NUDGE_DAYS = 5;

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatShortDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface CalendarDay {
  dateKey: string;
  dayLabel: string;
  durationSeconds: number;
  hasSession: boolean;
  isToday: boolean;
}

export function computeStreak(sessions: CompletedSession[], now = new Date()): number {
  if (sessions.length === 0) return 0;
  const daySet = new Set(sessions.map(s => formatLocalDate(new Date(s.completedAt))));
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = formatLocalDate(d);
    if (daySet.has(key)) {
      streak++;
    } else if (i === 0) {
      continue; // no session today yet — keep checking yesterday
    } else {
      break;
    }
  }
  return streak;
}

export function computeWeeklyCalendar(sessions: CompletedSession[], now = new Date()): CalendarDay[] {
  const days: CalendarDay[] = [];
  const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = formatLocalDate(d);
    const daySessions = sessions.filter(
      s => formatLocalDate(new Date(s.completedAt)) === dateKey,
    );
    days.push({
      dateKey,
      dayLabel: dayAbbr[d.getDay()],
      durationSeconds: daySessions.reduce((acc, s) => acc + s.durationSeconds, 0),
      hasSession: daySessions.length > 0,
      isToday: i === 0,
    });
  }
  return days;
}

export function computeNudges(sessions: CompletedSession[], now = new Date()): string[] {
  if (sessions.length === 0) return [];
  const lastUsed = new Map<ToolId, Date>();
  for (const session of sessions) {
    const completedDate = new Date(session.completedAt);
    for (const [tool, seconds] of Object.entries(session.toolTimes) as [ToolId, number][]) {
      if (seconds > 0) {
        const prev = lastUsed.get(tool);
        if (!prev || completedDate > prev) lastUsed.set(tool, completedDate);
      }
    }
  }
  const nudges: Array<{ msg: string; days: number }> = [];
  for (const [tool, date] of lastUsed.entries()) {
    const daysSince = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (daysSince >= NUDGE_DAYS) {
      nudges.push({
        msg: `You haven't practiced ${TOOL_META[tool].label} in ${daysSince} day${daysSince !== 1 ? 's' : ''}`,
        days: daysSince,
      });
    }
  }
  return nudges
    .sort((a, b) => b.days - a.days)
    .slice(0, 3)
    .map(n => n.msg);
}
