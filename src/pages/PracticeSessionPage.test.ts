/**
 * Unit tests for PracticeSessionPage private reducer logic.
 *
 * The reducer and its types are module-private. We use the re-declaration
 * pattern: mirror the relevant types and logic exactly, then test them in
 * isolation. Only the tag-related cases are re-declared here.
 */
import { describe, it, expect } from 'vitest';
import type { ToolId, PlanSession } from '../practiceSessionTypes';

// ── Re-declaration of private types (must match PracticeSessionPage.tsx) ─────

interface MinPageState {
  goalTags: string[];
  goalDurationMinutes: number | undefined;
  goalBpmRaw: string;
  goalSkillFocus: string;
  goalTools: ToolId[];
}

type TagAction =
  | { type: 'TOGGLE_GOAL_TAG'; tag: string }
  | { type: 'ADD_CUSTOM_TAG'; tag: string }
  | { type: 'APPLY_PLAN_SESSION'; session: PlanSession };

const MAX_TAG_LENGTH = 50;
const MAX_TAG_COUNT = 20;

function tagReducer(state: MinPageState, action: TagAction): MinPageState {
  switch (action.type) {
    case 'TOGGLE_GOAL_TAG': {
      const lower = action.tag.toLowerCase();
      const has = state.goalTags.some(t => t.toLowerCase() === lower);
      return {
        ...state,
        goalTags: has
          ? state.goalTags.filter(t => t.toLowerCase() !== lower)
          : [...state.goalTags, action.tag],
      };
    }
    case 'ADD_CUSTOM_TAG': {
      const trimmed = action.tag.trim();
      if (!trimmed || trimmed.length > MAX_TAG_LENGTH) return state;
      if (state.goalTags.length >= MAX_TAG_COUNT) return state;
      const lower = trimmed.toLowerCase();
      if (state.goalTags.some(t => t.toLowerCase() === lower)) return state;
      return { ...state, goalTags: [...state.goalTags, trimmed] };
    }
    case 'APPLY_PLAN_SESSION':
      return {
        ...state,
        goalDurationMinutes: action.session.durationMin,
        goalBpmRaw: action.session.targetBpm ? String(action.session.targetBpm) : '',
        goalSkillFocus: action.session.skillFocus,
        goalTools: action.session.tools,
        goalTags: [],
      };
  }
}

function makeTagState(overrides: Partial<MinPageState> = {}): MinPageState {
  return {
    goalTags: [],
    goalDurationMinutes: 30,
    goalBpmRaw: '',
    goalSkillFocus: '',
    goalTools: [],
    ...overrides,
  };
}

// ── TOGGLE_GOAL_TAG ───────────────────────────────────────────────────────────

describe('pageReducer – TOGGLE_GOAL_TAG', () => {
  it('adds a tag when it is not yet in goalTags', () => {
    const state = makeTagState();
    const next = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Theory' });
    expect(next.goalTags).toEqual(['Theory']);
  });

  it('removes a tag when it is already in goalTags', () => {
    const state = makeTagState({ goalTags: ['Theory', 'Technique'] });
    const next = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Theory' });
    expect(next.goalTags).toEqual(['Technique']);
  });

  it('does not mutate the original state', () => {
    const state = makeTagState({ goalTags: ['Theory'] });
    tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Song' });
    expect(state.goalTags).toEqual(['Theory']); // original unchanged
  });

  it('preserves other state fields when toggling a tag', () => {
    const state = makeTagState({ goalBpmRaw: '120', goalSkillFocus: 'scales' });
    const next = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Theory' });
    expect(next.goalBpmRaw).toBe('120');
    expect(next.goalSkillFocus).toBe('scales');
  });

  it('is idempotent when toggling a tag twice (returns to original)', () => {
    const state = makeTagState();
    const after1 = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Theory' });
    const after2 = tagReducer(after1, { type: 'TOGGLE_GOAL_TAG', tag: 'Theory' });
    expect(after2.goalTags).toEqual([]);
  });

  it('adding multiple distinct tags accumulates them all', () => {
    let state = makeTagState();
    state = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Theory' });
    state = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Technique' });
    state = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Song' });
    expect(state.goalTags).toEqual(['Theory', 'Technique', 'Song']);
  });

  it('deduplicates case-insensitively: toggling existing tag in different case removes it', () => {
    const state = makeTagState({ goalTags: ['Technique'] });
    // 'technique' (lowercase) matches 'Technique' — should remove it
    const next = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'technique' });
    expect(next.goalTags).toEqual([]);
  });

  it('does not add a tag when its lowercase form already exists under a different case', () => {
    const state = makeTagState({ goalTags: ['technique'] });
    const next = tagReducer(state, { type: 'TOGGLE_GOAL_TAG', tag: 'Technique' });
    // 'Technique' matches 'technique' — should remove, not add a second entry
    expect(next.goalTags).toEqual([]);
  });
});

// ── ADD_CUSTOM_TAG ────────────────────────────────────────────────────────────

describe('pageReducer – ADD_CUSTOM_TAG', () => {
  it('adds a trimmed custom tag', () => {
    const state = makeTagState();
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: 'Sweep Picking' });
    expect(next.goalTags).toEqual(['Sweep Picking']);
  });

  it('trims whitespace before adding', () => {
    const state = makeTagState();
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: '  Legato  ' });
    expect(next.goalTags).toEqual(['Legato']);
  });

  it('returns unchanged state for an empty string', () => {
    const state = makeTagState();
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: '' });
    expect(next).toBe(state);
  });

  it('returns unchanged state for a whitespace-only string', () => {
    const state = makeTagState();
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: '   ' });
    expect(next).toBe(state);
  });

  it('returns unchanged state when tag exceeds 50 characters', () => {
    const state = makeTagState();
    const longTag = 'a'.repeat(51);
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: longTag });
    expect(next).toBe(state);
  });

  it('accepts a tag of exactly 50 characters', () => {
    const state = makeTagState();
    const fiftyChars = 'a'.repeat(50);
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: fiftyChars });
    expect(next.goalTags).toContain(fiftyChars);
  });

  it('returns unchanged state for a duplicate tag', () => {
    const state = makeTagState({ goalTags: ['Theory'] });
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: 'Theory' });
    expect(next).toBe(state);
  });

  it('rejects a tag whose lowercase form matches an existing tag (case-insensitive deduplication)', () => {
    const state = makeTagState({ goalTags: ['Theory'] });
    // 'theory' should be rejected because 'Theory' is already present (case-insensitive check)
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: 'theory' });
    expect(next).toBe(state);
  });

  it('rejects a tag that matches the uppercase form of an existing lowercase tag', () => {
    const state = makeTagState({ goalTags: ['technique'] });
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: 'TECHNIQUE' });
    expect(next).toBe(state);
  });

  it('returns unchanged state when the tag count is at MAX_TAG_COUNT', () => {
    const fullTags = Array.from({ length: MAX_TAG_COUNT }, (_, i) => `tag${i}`);
    const state = makeTagState({ goalTags: fullTags });
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: 'NewTag' });
    expect(next).toBe(state);
    expect(next.goalTags).toHaveLength(MAX_TAG_COUNT);
  });

  it('accepts a tag when count is one below MAX_TAG_COUNT', () => {
    const almostFull = Array.from({ length: MAX_TAG_COUNT - 1 }, (_, i) => `tag${i}`);
    const state = makeTagState({ goalTags: almostFull });
    const next = tagReducer(state, { type: 'ADD_CUSTOM_TAG', tag: 'OneMore' });
    expect(next.goalTags).toHaveLength(MAX_TAG_COUNT);
    expect(next.goalTags).toContain('OneMore');
  });
});

// ── APPLY_PLAN_SESSION ────────────────────────────────────────────────────────

describe('pageReducer – APPLY_PLAN_SESSION', () => {
  it('resets goalTags to an empty array', () => {
    const state = makeTagState({ goalTags: ['Theory', 'Technique'] });
    const session: PlanSession = {
      durationMin: 30,
      skillFocus: 'Scales',
      tools: [],
    };
    const next = tagReducer(state, { type: 'APPLY_PLAN_SESSION', session });
    expect(next.goalTags).toEqual([]);
  });

  it('applies durationMin from the plan session', () => {
    const state = makeTagState({ goalDurationMinutes: 60 });
    const session: PlanSession = {
      durationMin: 45,
      skillFocus: 'Arpeggios',
      tools: ['metronome'],
    };
    const next = tagReducer(state, { type: 'APPLY_PLAN_SESSION', session });
    expect(next.goalDurationMinutes).toBe(45);
  });

  it('sets goalBpmRaw from targetBpm when provided', () => {
    const state = makeTagState({ goalBpmRaw: '' });
    const session: PlanSession = {
      durationMin: 30,
      targetBpm: 120,
      skillFocus: 'Sweep picking',
      tools: [],
    };
    const next = tagReducer(state, { type: 'APPLY_PLAN_SESSION', session });
    expect(next.goalBpmRaw).toBe('120');
  });

  it('sets goalBpmRaw to empty string when targetBpm is absent', () => {
    const state = makeTagState({ goalBpmRaw: '90' });
    const session: PlanSession = {
      durationMin: 30,
      skillFocus: 'Ear training',
      tools: [],
    };
    const next = tagReducer(state, { type: 'APPLY_PLAN_SESSION', session });
    expect(next.goalBpmRaw).toBe('');
  });

  it('applies skillFocus and tools from the plan session', () => {
    const state = makeTagState();
    const session: PlanSession = {
      durationMin: 20,
      skillFocus: 'Pentatonic runs',
      tools: ['scales', 'metronome'],
    };
    const next = tagReducer(state, { type: 'APPLY_PLAN_SESSION', session });
    expect(next.goalSkillFocus).toBe('Pentatonic runs');
    expect(next.goalTools).toEqual(['scales', 'metronome']);
  });
});
