import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AccentLevel, TrackPiece } from './ClickTrackEngine';

// ── Hoist synth mocks so they are available in vi.mock() factories ──────────
const { mockAccentClick, mockBeatClick, mockSubClick, mockGhostClick, mockCountdownClick } =
  vi.hoisted(() => ({
    mockAccentClick: vi.fn(),
    mockBeatClick: vi.fn(),
    mockSubClick: vi.fn(),
    mockGhostClick: vi.fn(),
    mockCountdownClick: vi.fn(),
  }));

vi.mock('./clickSynth', () => ({
  accentClick: mockAccentClick,
  beatClick: mockBeatClick,
  subClick: mockSubClick,
  ghostClick: mockGhostClick,
  countdownClick: mockCountdownClick,
}));

// ── Import after mock registration ─────────────────────────────────────────
import { ClickTrackEngine } from './ClickTrackEngine';

// ── Fake AudioContext ───────────────────────────────────────────────────────

function makeFakeGainNode() {
  return {
    gain: { value: 1, setValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
}

function makeFakeCtx(overrides: Partial<{
  currentTime: number;
  state: AudioContextState;
}> = {}): AudioContext {
  const gainNode = makeFakeGainNode();
  return {
    currentTime: overrides.currentTime ?? 0,
    state: overrides.state ?? 'running',
    destination: {} as AudioDestinationNode,
    createGain: vi.fn(() => gainNode),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSimplePiece(overrides: Partial<TrackPiece> = {}): TrackPiece {
  return {
    id: 'piece-1',
    label: 'Test',
    color: '#fff',
    groupId: null,
    timeSignature: { numerator: 4, denominator: 4 },
    subdivision: 'quarter',
    bpm: 120,
    repeats: 1,
    ...overrides,
  };
}


// ── scheduleNext accent routing — no accentPattern ─────────────────────────

describe('ClickTrackEngine scheduleNext accent routing — no accentPattern', () => {
  let engine: ClickTrackEngine;
  let fakeCtx: AudioContext;
  let capturedGainNode: ReturnType<typeof makeFakeGainNode>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ClickTrackEngine();
    fakeCtx = makeFakeCtx({ currentTime: 0 });
    capturedGainNode = makeFakeGainNode();
    (fakeCtx.createGain as ReturnType<typeof vi.fn>).mockReturnValue(capturedGainNode);
    fakeCtx.createGain();
  });

  function driveAt(subIdx: number, piece: TrackPiece): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = engine as any;
    e.ctx = fakeCtx;
    e.masterGain = capturedGainNode;
    e.pieces = [piece];
    e.isRunning = true;
    e.isPaused = false;
    e.countdownStep = 0;
    e.pieceIndex = 0;
    e.repetition = 0;
    e.subIndex = subIdx;
    e.nextBeatTime = fakeCtx.currentTime;
    e.scheduleNext();
  }

  it('calls accentClick on beat 0 when no accentPattern is provided', () => {
    const piece = makeSimplePiece(); // no accentPattern
    driveAt(0, piece);

    expect(mockAccentClick).toHaveBeenCalledOnce();
    expect(mockBeatClick).not.toHaveBeenCalled();
    expect(mockGhostClick).not.toHaveBeenCalled();
    expect(mockSubClick).not.toHaveBeenCalled();
  });

  it('calls beatClick on beat 1 (non-zero beat) when no accentPattern is provided', () => {
    const piece = makeSimplePiece();
    driveAt(1, piece);

    expect(mockBeatClick).toHaveBeenCalledOnce();
    expect(mockAccentClick).not.toHaveBeenCalled();
    expect(mockGhostClick).not.toHaveBeenCalled();
  });

  it('calls subClick on a sub-tick (non-beat position) when no accentPattern', () => {
    // Use eighth subdivision (2 subs per beat), advance subIndex to 1 (mid-beat)
    const piece = makeSimplePiece({ subdivision: 'eighth' });
    driveAt(1, piece); // sub-tick 1 = mid-beat, not on-beat

    expect(mockSubClick).toHaveBeenCalledOnce();
    expect(mockAccentClick).not.toHaveBeenCalled();
    expect(mockBeatClick).not.toHaveBeenCalled();
    expect(mockGhostClick).not.toHaveBeenCalled();
  });
});

// ── scheduleNext accent routing — with accentPattern ───────────────────────

describe('ClickTrackEngine scheduleNext accent routing — with accentPattern', () => {
  let engine: ClickTrackEngine;
  let fakeCtx: AudioContext;
  // Capture masterGain before any vi.clearAllMocks() wipes mock.results
  let capturedGainNode: ReturnType<typeof makeFakeGainNode>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ClickTrackEngine();
    fakeCtx = makeFakeCtx({ currentTime: 0 });
    capturedGainNode = makeFakeGainNode();
    (fakeCtx.createGain as ReturnType<typeof vi.fn>).mockReturnValue(capturedGainNode);
    fakeCtx.createGain(); // trigger so the engine can call it too
  });

  function driveAtSubIndex(
    e: ClickTrackEngine,
    piece: TrackPiece,
    subIdx: number,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eng = e as any;
    eng.ctx = fakeCtx;
    eng.masterGain = capturedGainNode;
    eng.pieces = [piece];
    eng.isRunning = true;
    eng.isPaused = false;
    eng.countdownStep = 0;
    eng.pieceIndex = 0;
    eng.repetition = 0;
    eng.subIndex = subIdx;
    eng.nextBeatTime = fakeCtx.currentTime;
    eng.scheduleNext();
  }

  it('calls ghostClick on beat 0 when accentPattern[0] = ghost', () => {
    const accentPattern: AccentLevel[] = ['ghost', 'normal'];
    const piece = makeSimplePiece({ accentPattern });
    driveAtSubIndex(engine, piece, 0);

    expect(mockGhostClick).toHaveBeenCalledOnce();
    expect(mockAccentClick).not.toHaveBeenCalled();
    expect(mockBeatClick).not.toHaveBeenCalled();
  });

  it('calls beatClick on beat 1 when accentPattern[1] = normal', () => {
    const accentPattern: AccentLevel[] = ['ghost', 'normal'];
    const piece = makeSimplePiece({ accentPattern });
    driveAtSubIndex(engine, piece, 1); // beat 1

    expect(mockBeatClick).toHaveBeenCalledOnce();
    expect(mockGhostClick).not.toHaveBeenCalled();
    expect(mockAccentClick).not.toHaveBeenCalled();
  });

  it('calls accentClick on beat 0 when accentPattern[0] = accent', () => {
    const accentPattern: AccentLevel[] = ['accent', 'ghost'];
    const piece = makeSimplePiece({ accentPattern });
    driveAtSubIndex(engine, piece, 0);

    expect(mockAccentClick).toHaveBeenCalledOnce();
    expect(mockGhostClick).not.toHaveBeenCalled();
    expect(mockBeatClick).not.toHaveBeenCalled();
  });

  it('calls ghostClick on beat 1 when accentPattern[1] = ghost', () => {
    const accentPattern: AccentLevel[] = ['accent', 'ghost'];
    const piece = makeSimplePiece({ accentPattern });
    driveAtSubIndex(engine, piece, 1);

    expect(mockGhostClick).toHaveBeenCalledOnce();
    expect(mockAccentClick).not.toHaveBeenCalled();
    expect(mockBeatClick).not.toHaveBeenCalled();
  });

  it('full 4/4 pattern: accent, normal, ghost, normal fires correct synths', () => {
    const accentPattern: AccentLevel[] = ['accent', 'normal', 'ghost', 'normal'];
    const piece = makeSimplePiece({ accentPattern, timeSignature: { numerator: 4, denominator: 4 } });

    // Beat 0: accent
    driveAtSubIndex(engine, piece, 0);
    expect(mockAccentClick).toHaveBeenCalledOnce();

    vi.clearAllMocks();

    // Beat 1: normal → beatClick
    driveAtSubIndex(engine, piece, 1);
    expect(mockBeatClick).toHaveBeenCalledOnce();

    vi.clearAllMocks();

    // Beat 2: ghost → ghostClick
    driveAtSubIndex(engine, piece, 2);
    expect(mockGhostClick).toHaveBeenCalledOnce();

    vi.clearAllMocks();

    // Beat 3: normal → beatClick
    driveAtSubIndex(engine, piece, 3);
    expect(mockBeatClick).toHaveBeenCalledOnce();
  });

  it('sub-ticks always call subClick regardless of accentPattern', () => {
    const accentPattern: AccentLevel[] = ['accent', 'ghost', 'normal', 'ghost'];
    // Eighth subdivision → 2 subs per beat, so subIndex 1 = first sub of beat 0 (not on-beat)
    const piece = makeSimplePiece({ accentPattern, subdivision: 'eighth' });
    driveAtSubIndex(engine, piece, 1); // mid-beat

    expect(mockSubClick).toHaveBeenCalledOnce();
    expect(mockAccentClick).not.toHaveBeenCalled();
    expect(mockGhostClick).not.toHaveBeenCalled();
    expect(mockBeatClick).not.toHaveBeenCalled();
  });

  it('accentPattern out-of-bounds index falls back to normal (beatClick)', () => {
    // Pattern only has 2 entries but piece has 4 beats — beat 3 has no entry → should be normal
    const accentPattern: AccentLevel[] = ['accent', 'normal'];
    const piece = makeSimplePiece({
      accentPattern,
      timeSignature: { numerator: 4, denominator: 4 },
    });
    driveAtSubIndex(engine, piece, 3); // beat 3, pattern index 3 is undefined → fallback

    // undefined accentPattern entry → default formula: subTickInMeasure===0 → accent, else normal
    // subIndex 3 is not 0, so fallback 'normal' → beatClick
    expect(mockBeatClick).toHaveBeenCalledOnce();
    expect(mockAccentClick).not.toHaveBeenCalled();
  });
});

// ── ClickTrackEngine lifecycle ──────────────────────────────────────────────

describe('ClickTrackEngine lifecycle', () => {
  it('stop() clears the timer without throwing', () => {
    const engine = new ClickTrackEngine();
    // stop before start — should be a no-op
    expect(() => engine.stop()).not.toThrow();
  });

  it('pause() before start is a no-op', () => {
    const engine = new ClickTrackEngine();
    expect(() => engine.pause()).not.toThrow();
  });

  it('resume() before start is a no-op', () => {
    const engine = new ClickTrackEngine();
    expect(() => engine.resume()).not.toThrow();
  });

  it('updateSpeed sets the speed multiplier', () => {
    const engine = new ClickTrackEngine();
    engine.updateSpeed(1.5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((engine as any).speedMultiplier).toBe(1.5);
  });
});

// ── prime() ─────────────────────────────────────────────────────────────────

describe('ClickTrackEngine.prime', () => {
  it('creates and resumes a suspended audio context without starting playback', () => {
    const ctx = makeFakeCtx({ state: 'suspended' });
    vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
    const engine = new ClickTrackEngine();
    engine.prime();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(mockAccentClick).not.toHaveBeenCalled();
    expect((engine as unknown as { isRunning: boolean }).isRunning).toBe(false);
    vi.unstubAllGlobals();
  });

  it('does not resume a context that is already running, and reuses it for start()', () => {
    const ctx = makeFakeCtx({ state: 'running' });
    const Ctor = vi.fn(function () { return ctx; });
    vi.stubGlobal('AudioContext', Ctor);
    const engine = new ClickTrackEngine();
    engine.prime();
    engine.start([makeSimplePiece()], 0, 1, false, vi.fn(), vi.fn(), vi.fn());
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(Ctor).toHaveBeenCalledTimes(1);
    engine.stop();
    vi.unstubAllGlobals();
  });
});

describe('ClickTrackEngine end-of-track callback', () => {
  it('a track that has finished scheduling cannot stop or report on a run started right after it', () => {
    vi.useFakeTimers();
    const ctx = makeFakeCtx({ state: 'running' });
    vi.stubGlobal('AudioContext', vi.fn(function () { return ctx; }));
    const engine = new ClickTrackEngine();
    const firstStopped = vi.fn();
    const secondStopped = vi.fn();
    engine.start([makeSimplePiece({ repeats: 1 })], 0, 1, false, vi.fn(), vi.fn(), firstStopped);
    const internals = engine as unknown as { scheduleNext(): void; isRunning: boolean };
    // schedule the whole bar, then the step that finds the end and arms the "finished" callback
    for (let i = 0; i < 10 && internals.isRunning; i++) internals.scheduleNext(); // like the scheduler loop, stop once it ends
    expect(internals.isRunning).toBe(false);

    // a different song is started before the first one's callback fires
    engine.start([makeSimplePiece({ id: 'other' })], 0, 1, false, vi.fn(), vi.fn(), secondStopped);
    vi.advanceTimersByTime(10_000);

    expect(firstStopped).not.toHaveBeenCalled();
    expect(secondStopped).not.toHaveBeenCalled();
    expect(internals.isRunning).toBe(true);
    engine.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

