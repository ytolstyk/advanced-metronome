import { describe, it, expect } from 'vitest';
import type { ToolId } from './practiceSessionTypes';
import {
  TOOL_META,
  formatDuration,
  formatLocalDate,
  formatShortDuration,
  computeStreak,
  computeWeeklyCalendar,
  computeNudges,
  NUDGE_DAYS,
} from './practiceSessionUtils';
import type { CompletedSession } from './practiceSessionTypes';

// ── TOOL_META: metronome entry ─────────────────────────────────────────────

describe('TOOL_META.metronome', () => {
  it('exists in TOOL_META', () => {
    expect(TOOL_META.metronome).toBeDefined();
  });

  it('has route /metronome', () => {
    expect(TOOL_META.metronome.route).toBe('/metronome');
  });

  it('has a non-empty label', () => {
    expect(TOOL_META.metronome.label).toBeTruthy();
  });

  it('has a non-empty short label', () => {
    expect(TOOL_META.metronome.short).toBeTruthy();
  });
});

// ── TOOL_META: all ToolId values have entries ──────────────────────────────

describe('TOOL_META completeness', () => {
  const allToolIds: ToolId[] = [
    'drums',
    'tuner',
    'chords',
    'scales',
    'circle',
    'click-track',
    'fret-memorizer',
    'tab-editor',
    'ear-training',
    'chord-progression',
    'caged',
    'metronome',
  ];

  for (const toolId of allToolIds) {
    it(`has an entry for '${toolId}'`, () => {
      expect(TOOL_META[toolId]).toBeDefined();
      expect(TOOL_META[toolId].route).toBeTruthy();
      expect(TOOL_META[toolId].label).toBeTruthy();
    });
  }
});

// ── practiceSessionTypes: 'metronome' is a valid ToolId ───────────────────

describe("practiceSessionTypes: 'metronome' ToolId", () => {
  it("'metronome' can be assigned to ToolId without TypeScript error", () => {
    // This is a compile-time check — if it compiles it passes
    const id: ToolId = 'metronome';
    expect(id).toBe('metronome');
  });

  it("'metronome' is accepted in a ToolId array", () => {
    const tools: ToolId[] = ['drums', 'metronome', 'tuner'];
    expect(tools).toContain('metronome');
  });
});

// ── formatDuration ────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds less than a minute as mm:ss', () => {
    expect(formatDuration(45)).toBe('00:45');
  });

  it('formats exactly 60 seconds as 01:00', () => {
    expect(formatDuration(60)).toBe('01:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatDuration(90)).toBe('01:30');
  });

  it('formats 3661 seconds as 1:01:01', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('formats 0 seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });
});

// ── formatShortDuration ───────────────────────────────────────────────────

describe('formatShortDuration', () => {
  it('formats seconds < 60 as Xs', () => {
    expect(formatShortDuration(30)).toBe('30s');
  });

  it('formats 60 seconds as 1m', () => {
    expect(formatShortDuration(60)).toBe('1m');
  });

  it('formats 90 seconds as 1m', () => {
    expect(formatShortDuration(90)).toBe('1m');
  });

  it('formats 3600 seconds as 1h 0m', () => {
    expect(formatShortDuration(3600)).toBe('1h 0m');
  });
});

// ── formatLocalDate ───────────────────────────────────────────────────────

describe('formatLocalDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const d = new Date(2024, 0, 5); // Jan 5, 2024
    expect(formatLocalDate(d)).toBe('2024-01-05');
  });

  it('pads month and day with leading zeros', () => {
    const d = new Date(2024, 8, 9); // Sep 9, 2024
    expect(formatLocalDate(d)).toBe('2024-09-09');
  });
});

// ── computeStreak ─────────────────────────────────────────────────────────

describe('computeStreak', () => {
  it('returns 0 for empty session list', () => {
    expect(computeStreak([], new Date())).toBe(0);
  });

  it('returns 1 when only today has a session', () => {
    const now = new Date('2024-03-10T12:00:00Z');
    const sessions: CompletedSession[] = [
      {
        id: 's1',
        goal: { tools: ['metronome'] },
        startedAt: '2024-03-10T11:00:00Z',
        completedAt: '2024-03-10T11:30:00Z',
        durationSeconds: 1800,
        toolTimes: { metronome: 1800 },
        notes: '',
      },
    ];
    expect(computeStreak(sessions, now)).toBe(1);
  });

  it('returns 0 when last session was 2 days ago', () => {
    const now = new Date('2024-03-10T12:00:00Z');
    const sessions: CompletedSession[] = [
      {
        id: 's1',
        goal: { tools: ['drums'] },
        startedAt: '2024-03-08T10:00:00Z',
        completedAt: '2024-03-08T10:30:00Z',
        durationSeconds: 1800,
        toolTimes: { drums: 1800 },
        notes: '',
      },
    ];
    expect(computeStreak(sessions, now)).toBe(0);
  });
});

// ── computeWeeklyCalendar ─────────────────────────────────────────────────

describe('computeWeeklyCalendar', () => {
  it('returns exactly 7 days', () => {
    const calendar = computeWeeklyCalendar([], new Date('2024-03-10T12:00:00Z'));
    expect(calendar).toHaveLength(7);
  });

  it('last entry is today with isToday=true', () => {
    const now = new Date('2024-03-10T12:00:00Z');
    const calendar = computeWeeklyCalendar([], now);
    expect(calendar[6].isToday).toBe(true);
  });

  it('marks a day with a session as hasSession=true', () => {
    const now = new Date('2024-03-10T12:00:00Z');
    const sessions: CompletedSession[] = [
      {
        id: 's1',
        goal: { tools: ['metronome'] },
        startedAt: '2024-03-10T11:00:00Z',
        completedAt: '2024-03-10T11:30:00Z',
        durationSeconds: 1800,
        toolTimes: { metronome: 1800 },
        notes: '',
      },
    ];
    const calendar = computeWeeklyCalendar(sessions, now);
    const today = calendar.find(d => d.isToday);
    expect(today?.hasSession).toBe(true);
  });
});

// ── computeNudges ─────────────────────────────────────────────────────────

describe('computeNudges', () => {
  it('returns empty array for no sessions', () => {
    expect(computeNudges([], new Date())).toEqual([]);
  });

  it('returns a nudge for a tool not used in >= NUDGE_DAYS days', () => {
    const now = new Date('2024-03-20T12:00:00Z');
    const oldDate = new Date('2024-03-10T12:00:00Z'); // 10 days ago
    const sessions: CompletedSession[] = [
      {
        id: 's1',
        goal: { tools: ['metronome'] },
        startedAt: oldDate.toISOString(),
        completedAt: oldDate.toISOString(),
        durationSeconds: 600,
        toolTimes: { metronome: 600 },
        notes: '',
      },
    ];
    const nudges = computeNudges(sessions, now);
    expect(nudges.length).toBeGreaterThan(0);
    expect(nudges[0]).toContain('Metronome');
  });

  it('does not nudge for a tool used recently (within NUDGE_DAYS)', () => {
    const now = new Date('2024-03-20T12:00:00Z');
    const recentDate = new Date('2024-03-19T12:00:00Z'); // 1 day ago
    const sessions: CompletedSession[] = [
      {
        id: 's1',
        goal: { tools: ['metronome'] },
        startedAt: recentDate.toISOString(),
        completedAt: recentDate.toISOString(),
        durationSeconds: 600,
        toolTimes: { metronome: 600 },
        notes: '',
      },
    ];
    const nudges = computeNudges(sessions, now);
    expect(nudges).toHaveLength(0);
  });

  it('NUDGE_DAYS constant is 5', () => {
    expect(NUDGE_DAYS).toBe(5);
  });

  it('returns at most 3 nudges', () => {
    const now = new Date('2024-03-20T12:00:00Z');
    const oldDate = new Date('2024-03-01T12:00:00Z'); // 19 days ago
    const sessions: CompletedSession[] = [
      {
        id: 's1',
        goal: { tools: ['metronome', 'drums', 'tuner', 'chords'] },
        startedAt: oldDate.toISOString(),
        completedAt: oldDate.toISOString(),
        durationSeconds: 3600,
        toolTimes: { metronome: 900, drums: 900, tuner: 900, chords: 900 },
        notes: '',
      },
    ];
    const nudges = computeNudges(sessions, now);
    expect(nudges.length).toBeLessThanOrEqual(3);
  });
});
