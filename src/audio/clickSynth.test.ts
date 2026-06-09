import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  accentClick,
  beatClick,
  subClick,
  ghostClick,
  countdownClick,
} from './clickSynth';

// ── Fake AudioContext helpers ──────────────────────────────────────────────

function makeGainNode() {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
}

function makeOscillatorNode() {
  return {
    frequency: { value: 0 },
    type: 'sine' as OscillatorType,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeCtx(gainNode: ReturnType<typeof makeGainNode>, oscNode: ReturnType<typeof makeOscillatorNode>): AudioContext {
  return {
    createGain: vi.fn(() => gainNode),
    createOscillator: vi.fn(() => oscNode),
  } as unknown as AudioContext;
}

// ── ghostClick ─────────────────────────────────────────────────────────────

describe('ghostClick', () => {
  let gainNode: ReturnType<typeof makeGainNode>;
  let oscNode: ReturnType<typeof makeOscillatorNode>;
  let ctx: AudioContext;
  let dest: AudioNode;

  beforeEach(() => {
    gainNode = makeGainNode();
    oscNode = makeOscillatorNode();
    ctx = makeCtx(gainNode, oscNode);
    dest = {} as AudioNode;
  });

  it('creates one oscillator and one gain node', () => {
    ghostClick(ctx, dest, 1.0);
    expect(ctx.createOscillator).toHaveBeenCalledOnce();
    expect(ctx.createGain).toHaveBeenCalledOnce();
  });

  it('uses 700 Hz frequency', () => {
    ghostClick(ctx, dest, 1.0);
    expect(oscNode.frequency.value).toBe(700);
  });

  it('uses sine wave type', () => {
    ghostClick(ctx, dest, 1.0);
    expect(oscNode.type).toBe('sine');
  });

  it('sets initial gain to 0.15 at the scheduled time', () => {
    ghostClick(ctx, dest, 2.5);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.15, 2.5);
  });

  it('ramps down to 0.001 (envelope decay)', () => {
    ghostClick(ctx, dest, 0);
    const [targetValue] = (gainNode.gain.exponentialRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls[0] as [number, number];
    expect(targetValue).toBeCloseTo(0.001);
  });

  it('starts and stops the oscillator', () => {
    ghostClick(ctx, dest, 1.0);
    expect(oscNode.start).toHaveBeenCalledOnce();
    expect(oscNode.stop).toHaveBeenCalledOnce();
  });

  it('connects oscillator → gain → dest', () => {
    ghostClick(ctx, dest, 1.0);
    expect(oscNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(dest);
  });

  it('stop time is after start time', () => {
    const t = 1.0;
    ghostClick(ctx, dest, t);
    const startTime = (oscNode.start as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
    const stopTime = (oscNode.stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
    expect(stopTime).toBeGreaterThan(startTime);
  });
});

// ── ghostClick vs beatClick gain comparison ────────────────────────────────

describe('ghostClick gain is lower than beatClick gain', () => {
  it('ghostClick initial gain (0.15) is less than beatClick initial gain (0.6)', () => {
    const ghostGain = makeGainNode();
    const ghostOsc = makeOscillatorNode();
    const ghostCtx = makeCtx(ghostGain, ghostOsc);

    const beatGain = makeGainNode();
    const beatOsc = makeOscillatorNode();
    const beatCtx = makeCtx(beatGain, beatOsc);

    const dest = {} as AudioNode;
    ghostClick(ghostCtx, dest, 0);
    beatClick(beatCtx, dest, 0);

    const ghostInitial = (ghostGain.gain.setValueAtTime as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
    const beatInitial = (beatGain.gain.setValueAtTime as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;

    expect(ghostInitial).toBeLessThan(beatInitial);
    expect(ghostInitial).toBeCloseTo(0.15);
    expect(beatInitial).toBeCloseTo(0.6);
  });
});

// ── accentClick ────────────────────────────────────────────────────────────

describe('accentClick', () => {
  it('uses 1000 Hz frequency and gain 0.9', () => {
    const gainNode = makeGainNode();
    const oscNode = makeOscillatorNode();
    const ctx = makeCtx(gainNode, oscNode);
    accentClick(ctx, {} as AudioNode, 0);

    expect(oscNode.frequency.value).toBe(1000);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.9, 0);
  });
});

// ── beatClick ─────────────────────────────────────────────────────────────

describe('beatClick', () => {
  it('uses 700 Hz frequency and gain 0.6', () => {
    const gainNode = makeGainNode();
    const oscNode = makeOscillatorNode();
    const ctx = makeCtx(gainNode, oscNode);
    beatClick(ctx, {} as AudioNode, 0);

    expect(oscNode.frequency.value).toBe(700);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.6, 0);
  });
});

// ── subClick ──────────────────────────────────────────────────────────────

describe('subClick', () => {
  it('uses 500 Hz frequency and gain 0.35', () => {
    const gainNode = makeGainNode();
    const oscNode = makeOscillatorNode();
    const ctx = makeCtx(gainNode, oscNode);
    subClick(ctx, {} as AudioNode, 0);

    expect(oscNode.frequency.value).toBe(500);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.35, 0);
  });
});

// ── countdownClick ────────────────────────────────────────────────────────

describe('countdownClick', () => {
  it('uses 1200 Hz frequency and gain 1.0', () => {
    const gainNode = makeGainNode();
    const oscNode = makeOscillatorNode();
    const ctx = makeCtx(gainNode, oscNode);
    countdownClick(ctx, {} as AudioNode, 0);

    expect(oscNode.frequency.value).toBe(1200);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 0);
  });
});
