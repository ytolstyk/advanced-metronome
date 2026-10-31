import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackPiece } from './ClickTrackEngine';

type ClickKind = 'accent' | 'beat' | 'sub';
interface ClickCall {
  kind: ClickKind;
  ctx: unknown;
  dest: unknown;
  time: number;
}

const { clicks } = vi.hoisted(() => ({ clicks: [] as ClickCall[] }));

vi.mock('./clickSynth', () => {
  const make = (kind: ClickKind) => (ctx: unknown, dest: unknown, time: number) => {
    clicks.push({ kind, ctx, dest, time });
  };
  return { accentClick: make('accent'), beatClick: make('beat'), subClick: make('sub') };
});

vi.mock('./clickExportSinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./clickExportSinks')>();
  return { ...actual, mp3Sink: vi.fn(actual.mp3Sink), wavSink: vi.fn(actual.wavSink) };
});

import { exportClickTrack } from './exportClickTrack';
import { mp3Sink, wavSink } from './clickExportSinks';

// Mirrors the module constants (mono, 22.05 kHz, 5 s slices, at most 500 clicks per slice).
const SAMPLE_RATE = 22050;
const CHUNK_SECONDS = 5;
const CHUNK = CHUNK_SECONDS * SAMPLE_RATE;
const MAX_CLICKS = 500;
const LEAD = Math.round(0.05 * SAMPLE_RATE);

/** Local sample `i` of every rendered chunk reads `ramp(i)`, so the output reveals which frames were kept. */
const ramp = (i: number) => Math.fround((i % 2000) / 4000);

class FakeOfflineAudioContext {
  static instances: FakeOfflineAudioContext[] = [];
  readonly destination = { id: 'destination' };
  readonly channels: number;
  readonly length: number;
  readonly sampleRate: number;
  constructor(channels: number, length: number, sampleRate: number) {
    this.channels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    FakeOfflineAudioContext.instances.push(this);
  }
  startRendering = vi.fn(async () => ({
    getChannelData: (ch: number) => {
      const data = new Float32Array(this.length);
      for (let i = 0; i < data.length; i++) data[i] = ch === 0 ? ramp(i) : -ramp(i); // only channel 0 is requested (mono)
      return data;
    },
  }));
}

const piece = (over: Partial<TrackPiece> = {}): TrackPiece => ({
  id: 'p1',
  label: 'Verse',
  color: '#8b5cf6',
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 4,
  ...over,
});

let createdBlobs: Blob[];
let downloads: string[];

beforeEach(() => {
  vi.useFakeTimers();
  clicks.length = 0;
  FakeOfflineAudioContext.instances = [];
  createdBlobs = [];
  downloads = [];
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    createdBlobs.push(blob as Blob);
    return 'blob:fake';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ctxs = () => FakeOfflineAudioContext.instances;

interface Chunk {
  /** First kept sample, and one past the last (global). */
  start: number;
  end: number;
  lead: number;
  /** Global time (s) of the context's sample 0, and of the end of its kept range. */
  origin: number;
  endSec: number;
}
/** Rebuilds each chunk's kept range from the context lengths: every chunk is `lead + (end - start)` samples. */
function chunks(): Chunk[] {
  const out: Chunk[] = [];
  let start = 0;
  for (const ctx of ctxs()) {
    const lead = Math.min(LEAD, start);
    const end = start + ctx.length - lead;
    out.push({ start, end, lead, origin: (start - lead) / SAMPLE_RATE, endSec: end / SAMPLE_RATE });
    start = end;
  }
  return out;
}
const keptSamples = () => chunks().reduce((n, c) => n + (c.end - c.start), 0);

/** Global times of the clicks scheduled into chunk `k` (chunk-local time + the chunk's origin). */
const globalTimes = (k: number) => {
  const { origin } = chunks()[k]!;
  return clicks.filter((c) => c.ctx === ctxs()[k]).map((c) => c.time + origin);
};

const TOL = 1e-6;
const has = (times: number[], t: number) => times.filter((x) => Math.abs(x - t) < TOL).length;

/**
 * Every expected click must be scheduled exactly once in the chunk that keeps it, again in the next
 * chunk when it falls in that chunk's lead region, and nowhere else. Clicks within TOL of a
 * boundary are skipped (float rounding makes their owner ambiguous).
 */
function expectOwnership(expected: number[]) {
  const cs = chunks();
  cs.forEach((c, k) => {
    const startSec = c.start / SAMPLE_RATE;
    const times = globalTimes(k);
    expect(new Set(times.map((t) => t.toFixed(6))).size).toBe(times.length); // nothing twice in a chunk
    for (const t of expected) {
      const nearEdge = [c.origin, startSec, c.endSec].some((edge) => Math.abs(t - edge) < TOL);
      if (nearEdge) continue;
      const shouldRender = t >= c.origin && t < c.endSec;
      expect(has(times, t), `click at ${t} in chunk ${k}`).toBe(shouldRender ? 1 : 0);
    }
  });
}

describe('exportClickTrack', () => {
  describe('a short track', () => {
    it('renders with a single offline context sized to the track plus the 0.5 s tail', async () => {
      // 2 measures of 4/4 at 120 BPM = 4 s (+ 0.5 s tail fits in one 5 s slice)
      await exportClickTrack([piece({ repeats: 2 })], 100);
      expect(ctxs()).toHaveLength(1);
      const ctx = ctxs()[0]!;
      expect(ctx.channels).toBe(1);
      expect(ctx.sampleRate).toBe(SAMPLE_RATE);
      expect(ctx.length).toBe(Math.ceil(SAMPLE_RATE * 4.5));
      expect(ctx.startRendering).toHaveBeenCalledTimes(1);
    });

    it('schedules every click once, an accent on each downbeat, and routes them to the context destination', async () => {
      await exportClickTrack([piece({ repeats: 2 })], 100);
      expect(clicks.map((c) => [c.kind, c.time])).toEqual([
        ['accent', 0], ['beat', 0.5], ['beat', 1], ['beat', 1.5],
        ['accent', 2], ['beat', 2.5], ['beat', 3], ['beat', 3.5],
      ]);
      for (const c of clicks) {
        expect(c.ctx).toBe(ctxs()[0]);
        expect(c.dest).toBe(ctxs()[0]!.destination);
      }
    });

    it('uses sub clicks between the beats of a subdivided measure', async () => {
      await exportClickTrack([piece({ subdivision: 'eighth', repeats: 1 })], 100);
      expect(clicks.map((c) => c.kind)).toEqual(['accent', 'sub', 'beat', 'sub', 'beat', 'sub', 'beat', 'sub']);
      expect(clicks.map((c) => c.time)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    });

    it('stretches the timing by the speed percentage', async () => {
      await exportClickTrack([piece({ repeats: 1 })], 50);
      expect(clicks.map((c) => c.time)).toEqual([0, 1, 2, 3]);
      expect(ctxs()[0]!.length).toBe(Math.ceil(SAMPLE_RATE * 4.5));
    });

    it('splits a 4.5 s track at the 5 s slice length only once it passes it', async () => {
      await exportClickTrack([piece({ repeats: 3 })], 100); // 6 s + 0.5 s tail
      expect(ctxs()).toHaveLength(2);
      expect(ctxs()[0]!.length).toBe(CHUNK);
    });

    it('downloads a WAV named by the caller (default click-track.wav)', async () => {
      await exportClickTrack([piece()], 100);
      await exportClickTrack([piece()], 100, 'my-song.wav');
      expect(downloads).toEqual(['click-track.wav', 'my-song.wav']);
      expect(createdBlobs).toHaveLength(2);
      expect(createdBlobs[0]!.type).toBe('audio/wav');
    });

    it('revokes the object URL only after a delay, so the download can still start', async () => {
      await exportClickTrack([piece()], 100);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(59_999);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    it('writes a header whose data size matches the audio and PCM from the rendered buffer', async () => {
      await exportClickTrack([piece({ repeats: 1 })], 100);
      const total = Math.ceil(SAMPLE_RATE * 2.5);
      const view = new DataView(await createdBlobs[0]!.arrayBuffer());
      expect(createdBlobs[0]!.size).toBe(44 + total * 2);
      expect(view.getUint32(40, true)).toBe(total * 2);
      expect(view.getUint32(4, true)).toBe(36 + total * 2);
      expect(view.getInt16(44, true)).toBe(0);
      // frame 1 = local sample 1 (mono: one 16-bit value per frame)
      expect(view.getInt16(44 + 2, true)).toBe(Math.trunc(ramp(1) * 0x7fff));
    });
  });

  describe('no clicks', () => {
    it('does nothing for an empty track', async () => {
      await exportClickTrack([], 100);
      expect(ctxs()).toHaveLength(0);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });

    it('does nothing when every piece has zero repeats', async () => {
      await exportClickTrack([piece({ repeats: 0 })], 100);
      expect(ctxs()).toHaveLength(0);
      expect(downloads).toEqual([]);
    });
  });

  describe('a track longer than one slice', () => {
    // 6 measures of 4/4 at 120 BPM = 12 s, clicks every 0.5 s (24 clicks, far below the click cap)
    const longPieces = [piece({ repeats: 6 })];
    const total = Math.ceil(SAMPLE_RATE * 12.5);
    const expected = Array.from({ length: 24 }, (_, i) => i * 0.5);

    it('splits at 5 s into contexts whose kept lengths sum to the track; later contexts add the lead', async () => {
      await exportClickTrack(longPieces, 100);
      expect(ctxs()).toHaveLength(3);
      expect(ctxs()[0]!.length).toBe(CHUNK); // first chunk has no lead
      expect(ctxs()[1]!.length).toBe(CHUNK + LEAD);
      expect(ctxs()[2]!.length).toBe(total - 2 * CHUNK + LEAD); // kept remainder + 50 ms lead
      expect(keptSamples()).toBe(total);
    });

    it('uses a 50 ms lead of round(0.05 * 22050) = 1103 samples', () => {
      expect(LEAD).toBe(1103);
    });

    it('splits a very long track into 5 s chunks with only the last one shorter', async () => {
      // 20 measures at 120 BPM = 40 s -> 8 full chunks + remainder
      await exportClickTrack([piece({ repeats: 20 })], 100);
      const totalSamples = Math.ceil(SAMPLE_RATE * 40.5);
      expect(chunks().map((c) => c.end - c.start)).toEqual([...Array<number>(8).fill(CHUNK), totalSamples - 8 * CHUNK]);
    });

    it('renders each chunk once', async () => {
      await exportClickTrack(longPieces, 100);
      for (const ctx of ctxs()) expect(ctx.startRendering).toHaveBeenCalledTimes(1);
    });

    it('produces one WAV of 44 + totalSamples * 2 bytes with a matching header', async () => {
      await exportClickTrack(longPieces, 100);
      expect(createdBlobs).toHaveLength(1);
      const blob = createdBlobs[0]!;
      expect(blob.size).toBe(44 + total * 2);
      const view = new DataView(await blob.arrayBuffer());
      expect(view.getUint32(40, true)).toBe(total * 2);
      expect(view.getUint32(4, true)).toBe(36 + total * 2);
      expect(downloads).toEqual(['click-track.wav']);
    });

    it('drops the lead from later chunks so the PCM is continuous across the seam', async () => {
      await exportClickTrack(longPieces, 100);
      const view = new DataView(await createdBlobs[0]!.arrayBuffer());
      const left = (frame: number) => view.getInt16(44 + frame * 2, true);
      const expectedLeft = (local: number) => Math.trunc(ramp(local) * 0x7fff);
      expect(left(CHUNK - 1)).toBe(expectedLeft(CHUNK - 1));
      // first frame of chunk 1 is its local sample LEAD (lead frames 0..LEAD-1 are not written)
      expect(left(CHUNK)).toBe(expectedLeft(LEAD));
      expect(left(CHUNK + 10)).toBe(expectedLeft(LEAD + 10));
    });

    it('schedules every click in the chunk that owns it, exactly once within a chunk', async () => {
      await exportClickTrack(longPieces, 100);
      expectOwnership(expected);
    });

    it('keeps a click that is well before the boundary out of the next chunk', async () => {
      await exportClickTrack(longPieces, 100);
      expect(has(globalTimes(0), 4.5)).toBe(1);
      expect(has(globalTimes(1), 4.5)).toBe(0);
      // 5 s sits exactly on the boundary: owned by chunk 1 only
      expect(has(globalTimes(0), 5)).toBe(0);
      expect(has(globalTimes(1), 5)).toBe(1);
    });

    it('passes chunk-local times, so a later chunk\'s first click lands one lead after its buffer start', async () => {
      await exportClickTrack(longPieces, 100);
      const c1 = clicks.filter((c) => c.ctx === ctxs()[1]);
      for (const c of c1) {
        expect(c.time).toBeGreaterThanOrEqual(0);
        expect(c.time).toBeLessThan(ctxs()[1]!.length / SAMPLE_RATE);
      }
      expect(c1.some((c) => Math.abs(c.time - LEAD / SAMPLE_RATE) < TOL)).toBe(true);
    });
  });

  describe('a click inside the 50 ms lead before a chunk edge', () => {
    // 4 clicks one second apart (0..3), then 4/4 clicks at 4 + k * 0.9804: the 2nd (k = 1) lands at ~4.98 s.
    const bpm = 61.2;
    const beat = 60 / bpm;
    const pieces = [piece({ id: 'a', bpm: 60, repeats: 1 }), piece({ id: 'b', bpm, repeats: 1 })];
    const nearEdge = 4 + beat;
    const expected = [
      ...Array.from({ length: 4 }, (_, i) => i),
      ...Array.from({ length: 4 }, (_, k) => 4 + k * beat),
    ];

    it('is rendered by its own chunk and again in the lead of the next chunk', async () => {
      expect(CHUNK_SECONDS - nearEdge).toBeGreaterThan(0);
      expect(CHUNK_SECONDS - nearEdge).toBeLessThan(0.05);

      await exportClickTrack(pieces, 100);
      expect(ctxs()).toHaveLength(2);
      expect(has(globalTimes(0), nearEdge)).toBe(1);
      expect(has(globalTimes(1), nearEdge)).toBe(1);
      // in the next chunk it sits before the kept range: local time below the lead length
      const local = clicks.find((c) => c.ctx === ctxs()[1] && Math.abs(c.time + chunks()[1]!.origin - nearEdge) < TOL)!;
      expect(local.time).toBeLessThan(LEAD / SAMPLE_RATE);
    });

    it('schedules every click in its owning chunk and never twice in one chunk', async () => {
      await exportClickTrack(pieces, 100);
      expectOwnership(expected);
    });

    it('schedules exactly one extra click overall: the lead duplicate', async () => {
      await exportClickTrack(pieces, 100);
      expect(clicks.length - expected.length).toBe(1);
    });
  });

  describe('a dense track (more clicks than one context should hold)', () => {
    // 4/4 in sixteenths at 2400 BPM: a click every 6.25 ms, 160 per second, 16 per 0.1 s measure.
    // 100 measures = 10 s = 1600 clicks; 500 clicks take 3.125 s, so the click cap bites before the 5 s slice length.
    const dense = [piece({ subdivision: 'sixteenth', bpm: 2400, repeats: 100 })];
    const expected = Array.from({ length: 1600 }, (_, i) => i * 0.00625);
    const GAP = 0.00625;
    const LEAD_CLICKS = Math.ceil(0.05 / GAP) + 1; // 8 clicks in the 50 ms lead, 9 when the previous cut landed on one

    it('ends a chunk after 500 clicks even though 5 s have not passed', async () => {
      await exportClickTrack(dense, 100);
      const cs = chunks();
      expect(cs.length).toBeGreaterThanOrEqual(4);
      expect(cs[0]!.endSec).toBeLessThan(CHUNK_SECONDS);
      expect(cs[0]!.endSec).toBeCloseTo(MAX_CLICKS * GAP, 3); // 500 clicks x 6.25 ms
      for (const c of cs) expect(c.end - c.start).toBeLessThanOrEqual(CHUNK);
    });

    it('schedules at most 2000 own clicks plus the lead-region clicks in every context', async () => {
      await exportClickTrack(dense, 100);
      const cs = chunks();
      cs.forEach((c, k) => {
        const times = globalTimes(k);
        const startSec = c.start / SAMPLE_RATE;
        const inLead = times.filter((t) => t < startSec - TOL).length;
        // The cut is rounded up to a whole sample, so the click that triggered it (the 2001st) falls just
        // inside the chunk, and a click a hair before the previous cut counts as own here too (tolerance):
        // a soft cap of 500 plus those two boundary clicks.
        expect(times.length - inLead).toBeLessThanOrEqual(MAX_CLICKS + 2);
        // the lead is 50 ms = 8 clicks at 6.25 ms apart (9 when the previous chunk kept a boundary click)
        expect(inLead).toBeLessThanOrEqual(k === 0 ? 0 : LEAD_CLICKS);
      });
      expect(Math.max(...ctxs().map((_, k) => globalTimes(k).length))).toBeLessThanOrEqual(MAX_CLICKS + 2 + LEAD_CLICKS);
    });

    it('schedules every click in the chunk that owns it (and the lead of the next) and covers the whole track', async () => {
      await exportClickTrack(dense, 100);
      expectOwnership(expected);
      // every click is rendered at least once
      const all = ctxs().flatMap((_, k) => globalTimes(k));
      for (const t of expected) expect(has(all, t)).toBeGreaterThanOrEqual(1);
    });

    it('keeps the chunks contiguous and the Blob exactly 44 + totalSamples * 2 bytes', async () => {
      await exportClickTrack(dense, 100);
      const cs = chunks();
      cs.forEach((c, k) => {
        if (k > 0) expect(c.start).toBe(cs[k - 1]!.end);
        expect(ctxs()[k]!.length).toBe(c.lead + (c.end - c.start));
      });
      const totalSamples = keptSamples();
      expect(Math.abs(totalSamples - Math.ceil(SAMPLE_RATE * 10.5))).toBeLessThanOrEqual(1);
      const blob = createdBlobs[0]!;
      expect(blob.size).toBe(44 + totalSamples * 2);
      const header = new DataView(await blob.slice(0, 44).arrayBuffer());
      expect(header.getUint32(40, true)).toBe(totalSamples * 2);
    });
  });

  describe('output format', () => {
    beforeEach(() => {
      vi.mocked(mp3Sink).mockClear();
      vi.mocked(wavSink).mockClear();
    });

    it('defaults to WAV: builds a wav sink for the whole track and never loads the MP3 encoder', async () => {
      await exportClickTrack([piece({ repeats: 1 })], 100);
      expect(wavSink).toHaveBeenCalledWith(Math.ceil(SAMPLE_RATE * 2.5), SAMPLE_RATE);
      expect(mp3Sink).not.toHaveBeenCalled();
      expect(downloads).toEqual(['click-track.wav']);
    });

    it('renders an MP3 at 22.05 kHz, downloads it as click-track.mp3 and labels the Blob audio/mpeg', async () => {
      const done = exportClickTrack([piece({ repeats: 2 })], 100, undefined, 'mp3');
      await vi.runAllTimersAsync(); // the MP3 sink yields to the page with setTimeout 0
      await done;
      expect(mp3Sink).toHaveBeenCalledWith(SAMPLE_RATE);
      expect(wavSink).not.toHaveBeenCalled();
      expect(downloads).toEqual(['click-track.mp3']);
      expect(createdBlobs).toHaveLength(1);
      expect(createdBlobs[0]!.type).toBe('audio/mpeg');
    });

    it('produces real MP3 data, far smaller than the equivalent WAV', async () => {
      const done = exportClickTrack([piece({ repeats: 4 })], 100, undefined, 'mp3'); // 8 s
      await vi.runAllTimersAsync();
      await done;
      const bytes = new Uint8Array(await createdBlobs[0]!.arrayBuffer());
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]! & 0xe0).toBe(0xe0);
      const wavSize = 44 + Math.ceil(SAMPLE_RATE * 8.5) * 2;
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.length).toBeLessThan(wavSize / 8);
    });

    it('passes a caller-supplied file name through to the download, whatever the format', async () => {
      const done = exportClickTrack([piece({ repeats: 1 })], 100, 'Song-click.mp3', 'mp3');
      await vi.runAllTimersAsync();
      await done;
      await exportClickTrack([piece({ repeats: 1 })], 100, 'Song-click.wav', 'wav');
      expect(downloads).toEqual(['Song-click.mp3', 'Song-click.wav']);
    });

    it('awaits each slice push, in order, before finishing the file', async () => {
      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      vi.mocked(mp3Sink).mockImplementationOnce(async () => ({
        push: async (pcm: ArrayBuffer) => {
          order.push(`push:${pcm.byteLength}`);
          if (order.length === 1) await gate;
          order.push('pushed');
        },
        finish: () => {
          order.push('finish');
          return new Blob(['x'], { type: 'audio/mpeg' });
        },
      }));
      const done = exportClickTrack([piece({ repeats: 3 })], 100, undefined, 'mp3'); // 6.5 s -> 2 slices
      await vi.advanceTimersByTimeAsync(0);
      expect(order).toEqual([`push:${CHUNK * 2}`]); // the second slice waits for the first push
      expect(ctxs()).toHaveLength(1);
      release();
      await done;
      expect(order).toEqual([`push:${CHUNK * 2}`, 'pushed', `push:${(Math.ceil(SAMPLE_RATE * 6.5) - CHUNK) * 2}`, 'pushed', 'finish']);
      expect(ctxs()).toHaveLength(2);
    });

    it('fails before rendering or downloading anything when the MP3 encoder cannot load', async () => {
      vi.mocked(mp3Sink).mockRejectedValueOnce(new Error("Couldn't load the MP3 encoder."));
      await expect(exportClickTrack([piece()], 100, undefined, 'mp3')).rejects.toThrow("Couldn't load the MP3 encoder.");
      expect(ctxs()).toHaveLength(0);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });

    it('does not load the MP3 encoder for an empty track', async () => {
      await exportClickTrack([], 100, undefined, 'mp3');
      expect(mp3Sink).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });
  });

  describe('aborting', () => {
    it('rejects with the signal\'s reason and does nothing when already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('page left'));
      await expect(exportClickTrack([piece()], 100, undefined, 'wav', controller.signal)).rejects.toThrow('page left');
      expect(ctxs()).toHaveLength(0);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });

    it('rejects with an AbortError when aborted without a reason', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(exportClickTrack([piece()], 100, undefined, 'wav', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });

    /** A wav sink stand-in that aborts `controller` during its `abortOnPush`th push. */
    const abortingSink = (controller: AbortController, reason: unknown, abortOnPush: number) => {
      let pushes = 0;
      return {
        push: async () => {
          pushes++;
          if (pushes === abortOnPush) controller.abort(reason);
        },
        finish: () => new Blob(['x'], { type: 'audio/wav' }),
      };
    };

    it('stops between slices, rendering no further slice and downloading nothing', async () => {
      const controller = new AbortController();
      const reason = new Error('stop');
      vi.mocked(wavSink).mockImplementationOnce(() => abortingSink(controller, reason, 1));
      // 12.5 s = 3 slices; the abort lands after the first one is pushed
      await expect(exportClickTrack([piece({ repeats: 6 })], 100, undefined, 'wav', controller.signal)).rejects.toBe(reason);
      expect(ctxs()).toHaveLength(1);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });

    it('checks again after the last slice, so an abort during the final push still downloads nothing', async () => {
      const controller = new AbortController();
      const reason = new Error('late');
      vi.mocked(wavSink).mockImplementationOnce(() => abortingSink(controller, reason, 1));
      await expect(exportClickTrack([piece({ repeats: 1 })], 100, undefined, 'wav', controller.signal)).rejects.toBe(reason);
      expect(ctxs()).toHaveLength(1); // the only slice was rendered, then the final check refused the download
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(downloads).toEqual([]);
    });

    it('is a no-op when the signal is never aborted', async () => {
      const controller = new AbortController();
      await exportClickTrack([piece({ repeats: 3 })], 100, 'x.wav', 'wav', controller.signal);
      expect(ctxs()).toHaveLength(2);
      expect(downloads).toEqual(['x.wav']);
      expect(createdBlobs).toHaveLength(1);
    });

    it('an abort after the download started changes nothing', async () => {
      const controller = new AbortController();
      await exportClickTrack([piece({ repeats: 1 })], 100, undefined, 'wav', controller.signal);
      controller.abort();
      expect(downloads).toEqual(['click-track.wav']);
    });
  });
});
