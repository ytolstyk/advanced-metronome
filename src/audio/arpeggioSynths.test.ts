import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playArpeggio } from './arpeggioSynths';

// Hoist mock so it is available before module import resolves
const mockPluckString = vi.hoisted(() => vi.fn());

vi.mock('./chordSynths', () => ({
  pluckString: mockPluckString,
}));

// Minimal AudioContext / AudioNode stubs
function makeCtx(): AudioContext {
  return {} as AudioContext;
}

function makeDest(): AudioNode {
  return {} as AudioNode;
}

describe('playArpeggio', () => {
  beforeEach(() => {
    mockPluckString.mockClear();
  });

  // Standard 6-string open MIDI notes used internally
  const OPEN_MIDI_6 = [40, 45, 50, 55, 59, 64];

  it("'up' direction plays non-muted strings in ascending order (low to high)", () => {
    const frets = [3, 2, -1, 4, 0, 3];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    // non-muted: strings 0,1,3,4,5 → indices in that order
    expect(mockPluckString).toHaveBeenCalledTimes(5);

    // Each successive call's startTime should be strictly later
    const callTimes = mockPluckString.mock.calls.map((c: unknown[]) => c[3] as number);
    for (let i = 1; i < callTimes.length; i++) {
      expect(callTimes[i]).toBeGreaterThan(callTimes[i - 1]);
    }
  });

  it("'down' direction plays non-muted strings in descending order (high to low)", () => {
    const frets = [3, 2, 0, 4, 5, 3];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'down');

    expect(mockPluckString).toHaveBeenCalledTimes(6);

    // Frequencies should descend: high-e string (MIDI 64+3=67) first
    const freqs = mockPluckString.mock.calls.map((c: unknown[]) => c[2] as number);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeLessThan(freqs[i - 1]);
    }
  });

  it("'up-down' plays up then back down, omitting the top note on the return", () => {
    const frets = [2, 3, 4, 5, 4, 3];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up-down');

    // 6 up + 5 down (top note omitted) = 11 total calls
    expect(mockPluckString).toHaveBeenCalledTimes(11);
  });

  it('muted strings (fret === -1) are skipped', () => {
    const frets = [-1, -1, 5, -1, 3, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    // Only strings 2 and 4 are non-muted
    expect(mockPluckString).toHaveBeenCalledTimes(2);
  });

  it('open-string frets (fret === 0) are played, not skipped', () => {
    const frets = [0, -1, 0, -1, 0, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    expect(mockPluckString).toHaveBeenCalledTimes(3);
  });

  it('noteDelay properly spaces start times apart', () => {
    const frets = [3, 3, 3, 3, 3, 3];
    const noteDelay = 0.15;
    const startTime = 1.0;
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, startTime, noteDelay, 'up');

    expect(mockPluckString).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) {
      const callStartTime = mockPluckString.mock.calls[i][3] as number;
      expect(callStartTime).toBeCloseTo(startTime + i * noteDelay);
    }
  });

  it('first note starts exactly at the provided time parameter', () => {
    const frets = [5, 5, 5, 5, 5, 5];
    const startTime = 2.5;
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, startTime, 0.1, 'up');

    const firstCallTime = mockPluckString.mock.calls[0][3] as number;
    expect(firstCallTime).toBeCloseTo(startTime);
  });

  it('MIDI frequency calculation: freq = 440 * 2^((openMidi + fret - 69) / 12)', () => {
    // Single string, fret 5 on low E (MIDI 40): pitch = MIDI 45 = A4... actually MIDI 45 = A2
    // freq = 440 * 2^((40 + 5 - 69) / 12) = 440 * 2^(-24/12) = 440 * 2^(-2) = 110 Hz
    const frets = [5, -1, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    expect(mockPluckString).toHaveBeenCalledTimes(1);
    const freq = mockPluckString.mock.calls[0][2] as number;
    const expected = 440 * Math.pow(2, (40 + 5 - 69) / 12);
    expect(freq).toBeCloseTo(expected, 5);
  });

  it('MIDI frequency for open string (fret 0) equals 440 * 2^((openMidi - 69) / 12)', () => {
    // Open A string: MIDI 45, freq = 440 * 2^((45-69)/12) = 440 * 2^(-2) = 110 Hz
    const frets = [-1, 0, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    expect(mockPluckString).toHaveBeenCalledTimes(1);
    const freq = mockPluckString.mock.calls[0][2] as number;
    const expected = 440 * Math.pow(2, (45 + 0 - 69) / 12);
    expect(freq).toBeCloseTo(expected, 5);
  });

  it('uses custom openMidi tuning when provided', () => {
    // Drop D tuning: low string MIDI 38 instead of 40
    const dropDMidi = [38, 45, 50, 55, 59, 64];
    const frets = [5, -1, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, dropDMidi, 0, 0.1, 'up');

    expect(mockPluckString).toHaveBeenCalledTimes(1);
    const freq = mockPluckString.mock.calls[0][2] as number;
    const expected = 440 * Math.pow(2, (38 + 5 - 69) / 12);
    expect(freq).toBeCloseTo(expected, 5);
  });

  it("'up-down' with a single non-muted string produces just 1 call (no doubling)", () => {
    // Only one non-muted string: up=[s0], down=[s0].slice(1)=[] → total 1
    const frets = [3, -1, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up-down');

    expect(mockPluckString).toHaveBeenCalledTimes(1);
  });

  it("'up-down' with two non-muted strings produces 3 calls (up 2 + down 1 without top)", () => {
    const frets = [3, 5, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up-down');

    // up=[s0,s1], downSeq=[s1,s0], downSeq.slice(1)=[s0] → total 3
    expect(mockPluckString).toHaveBeenCalledTimes(3);
  });

  it('passes ctx and dest through to pluckString', () => {
    const ctx = makeCtx();
    const dest = makeDest();
    const frets = [3, -1, -1, -1, -1, -1];
    playArpeggio(ctx, dest, frets, OPEN_MIDI_6, 0, 0.1, 'up');

    expect(mockPluckString.mock.calls[0][0]).toBe(ctx);
    expect(mockPluckString.mock.calls[0][1]).toBe(dest);
  });

  it("defaults to 'up' direction when direction is omitted", () => {
    const frets = [3, 3, 3, 3, 3, 3];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1);

    // All 6 strings, times ascending
    expect(mockPluckString).toHaveBeenCalledTimes(6);
    const times = mockPluckString.mock.calls.map((c: unknown[]) => c[3] as number);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it('defaults to 0.1 noteDelay when noteDelay is omitted', () => {
    const frets = [3, 3, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0);

    const t0 = mockPluckString.mock.calls[0][3] as number;
    const t1 = mockPluckString.mock.calls[1][3] as number;
    expect(t1 - t0).toBeCloseTo(0.1);
  });

  it('produces no pluckString calls when all frets are muted', () => {
    const frets = [-1, -1, -1, -1, -1, -1];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    expect(mockPluckString).not.toHaveBeenCalled();
  });

  it("'up' sequence frequencies increase from low to high strings for ascending frets", () => {
    // Constant fret 5 across all strings: frequencies reflect openMidi ordering
    const frets = [5, 5, 5, 5, 5, 5];
    playArpeggio(makeCtx(), makeDest(), frets, OPEN_MIDI_6, 0, 0.1, 'up');

    const freqs = mockPluckString.mock.calls.map((c: unknown[]) => c[2] as number);
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }
  });
});
