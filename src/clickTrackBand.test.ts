import { describe, expect, it } from 'vitest';
import type { TrackPiece } from './audio/ClickTrackEngine';
import {
  BAND_TRACK_FORMAT,
  BAND_TRACK_LIMITS,
  encodeBandTrack,
  maxBandTrackPieces,
  parseBandTrack,
  parseBandTrackHandoff,
  serializeBandTrackHandoff,
  utf8ByteLength,
  worstCasePieceBytes,
} from './clickTrackBand';
import type { SegmentGroup } from './clickTrackTypes';
import { measureTrack } from './audio/clickMath';

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
// Two 32/4 eighth-triplet segments at 99 repeats: 2 x 19,008 clicks, over the 30,000 cap but short in time.
const denseTrack = (): TrackPiece[] =>
  ['a', 'b'].map((id) => piece({ id, subdivision: 'eighth-triplet', timeSignature: { numerator: 32, denominator: 4 }, repeats: 99, bpm: 400 }));
const group: SegmentGroup = { id: 'g1', name: 'Intro', color: '#38bdf8' };

const stored = (pieces: unknown[], groups: unknown[] = []) => {
  const track = JSON.stringify({ pieces, groups });
  return { format: 1, bytes: utf8ByteLength(track), track };
};

describe('limits', () => {
  it('fits the worst-case segment into the byte cap at the derived piece count', () => {
    const pieces = maxBandTrackPieces();
    expect(pieces).toBeGreaterThan(100);
    expect(pieces).toBeLessThanOrEqual(300);
    expect(pieces * worstCasePieceBytes()).toBeLessThan(BAND_TRACK_LIMITS.maxBytes);
  });

  it('counts UTF-8 bytes, including 4-byte characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('measures playing time and clicks like the exporter', () => {
    // 4 bars of 4/4 at 120 BPM = 8 s, 16 quarter clicks
    expect(measureTrack([piece()])).toEqual({ seconds: 8, clicks: 16 });
    // eighth subdivision doubles the clicks, not the time
    expect(measureTrack([piece({ subdivision: 'eighth' })])).toEqual({ seconds: 8, clicks: 32 });
    // whole = one click per bar
    expect(measureTrack([piece({ subdivision: 'whole' })]).clicks).toBe(4);
    expect(measureTrack([piece({ subdivision: 'whole' })]).seconds).toBe(8);
  });

  it('measures an odd numerator on a half-note subdivision as it renders (rounded-up bars run longer)', () => {
    // 1/4 on 'half': round(0.5) = 1 click spaced two beats apart, so each bar lasts 2 beats, not 1.
    // 3/4 on 'half': round(1.5) = 2 clicks, 4 beats, not 3.
    expect(measureTrack([piece({ timeSignature: { numerator: 1, denominator: 4 }, subdivision: 'half', repeats: 1 })])).toEqual({ seconds: 1, clicks: 1 });
    expect(measureTrack([piece({ timeSignature: { numerator: 3, denominator: 4 }, subdivision: 'half', repeats: 1 })])).toEqual({ seconds: 2, clicks: 2 });
  });
});

describe('encodeBandTrack / parseBandTrack round trip', () => {
  it('round-trips an editor-built track with groups, ramps and accents', () => {
    const pieces = [
      piece({ id: 'a', groupId: 'g1' }),
      piece({ id: 'b', rampMode: 'linear', rampEndBpm: 140, label: '' }),
      piece({ id: 'c', rampMode: 'stepped', rampEndBpm: 160, rampStepSize: 5, rampStepMeasures: 4, repeats: 8 }),
      piece({ id: 'd', timeSignature: { numerator: 3, denominator: 4 }, accentPattern: ['accent', 'ghost', 'normal'] }),
    ];
    const { track, bytes } = encodeBandTrack(pieces, [group]);
    const parsed = parseBandTrack({ format: BAND_TRACK_FORMAT, bytes, track });
    expect(parsed.kind).toBe('ok');
    if (parsed.kind === 'ok') {
      expect(parsed.pieces).toEqual(pieces);
      expect(parsed.groups).toEqual([group]);
    }
  });

  it('tidies labels, group names and colors so importer output still saves', () => {
    const messy = piece({ label: '  Intro ​ riff ‮ ', color: 'rebeccapurple' });
    const long = piece({ id: 'p2', label: 'x'.repeat(200) });
    const { track, bytes } = encodeBandTrack([messy, long], [{ id: 'g1', name: '​', color: 'nope' }]);
    const parsed = parseBandTrack({ format: 1, bytes, track });
    expect(parsed.kind).toBe('ok');
    if (parsed.kind === 'ok') {
      expect(parsed.pieces[0]!.label).toBe('Intro riff');
      expect(parsed.pieces[0]!.color).toBe('#94a3b8');
      expect(parsed.pieces[1]!.label).toHaveLength(BAND_TRACK_LIMITS.labelMax);
      expect(parsed.groups[0]!.name).toBe('Group 1');
    }
  });

  it('keeps ids unique and group references valid when ids collide or dangle', () => {
    const { track, bytes } = encodeBandTrack(
      [piece({ id: 'same', groupId: 'g1' }), piece({ id: 'same', groupId: 'missing' })],
      [group, { ...group, name: 'Dupe' }],
    );
    const parsed = parseBandTrack({ format: 1, bytes, track });
    expect(parsed.kind).toBe('ok');
    if (parsed.kind === 'ok') {
      expect(new Set(parsed.pieces.map((p) => p.id)).size).toBe(2);
      expect(parsed.pieces[0]!.groupId).toBe('g1');
      expect(parsed.pieces[1]!.groupId).toBeNull();
    }
  });

  it('drops unknown fields instead of storing them', () => {
    const { track } = encodeBandTrack([{ ...piece(), extra: 'x' } as TrackPiece], []);
    expect(track).not.toContain('extra');
  });

  it('refuses, in plain language, a track over a limit', () => {
    expect(() => encodeBandTrack([], [])).toThrow(/nothing to save/);
    const tooMany = Array.from({ length: maxBandTrackPieces() + 3 }, (_, i) => piece({ id: `p${i}`, repeats: 1 }));
    expect(() => encodeBandTrack(tooMany, [])).toThrow(/Remove 3/);
    expect(() => encodeBandTrack([piece({ repeats: 99, bpm: 20 }), piece({ id: 'b', repeats: 99, bpm: 20 })], [])).toThrow(/minutes/);
    expect(() => encodeBandTrack(denseTrack(), [])).toThrow(/clicks/);
    expect(() => encodeBandTrack([piece({ timeSignature: { numerator: 99, denominator: 4 } })], [])).toThrow(/can't be saved/);
  });
});

describe('parseBandTrack', () => {
  const ok = () => stored([piece()], [group]);

  it('reads the empty / cleared row', () => {
    expect(parseBandTrack({ format: 1, bytes: 0, track: '' })).toEqual({ kind: 'cleared' });
    expect(parseBandTrack({ format: 1, bytes: 0, track: null })).toEqual({ kind: 'cleared' });
    expect(parseBandTrack({ format: 1, bytes: 0, track: '{}' }).kind).toBe('unreadable');
  });

  it('reports a newer format and rejects unknown ones', () => {
    expect(parseBandTrack({ ...ok(), format: 2 })).toEqual({ kind: 'newer' });
    expect(parseBandTrack({ ...ok(), format: 0 }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...ok(), format: 1.5 }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...ok(), format: null }).kind).toBe('unreadable');
  });

  it('rejects a claimed size that does not match the real one, before parsing', () => {
    const row = ok();
    expect(parseBandTrack({ ...row, bytes: row.bytes - 1 }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...row, bytes: 1 }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...row, bytes: -5 }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...row, track: null }).kind).toBe('unreadable');
    const huge = 'x'.repeat(BAND_TRACK_LIMITS.maxBytes + 1);
    expect(parseBandTrack({ format: 1, bytes: huge.length, track: huge })).toEqual({ kind: 'unreadable', reason: 'too large' });
  });

  it('rejects data that is not a {pieces, groups} object', () => {
    for (const track of ['not json', '[]', '{"pieces":[],"groups":[]}', '{"pieces":[1],"groups":[]}', '{"pieces":{},"groups":[]}']) {
      expect(parseBandTrack({ format: 1, bytes: utf8ByteLength(track), track }).kind).toBe('unreadable');
    }
    const extra = JSON.stringify({ pieces: [piece()], groups: [], more: 1 });
    expect(parseBandTrack({ format: 1, bytes: utf8ByteLength(extra), track: extra }).kind).toBe('unreadable');
  });

  const bad: Array<[string, Record<string, unknown>]> = [
    ['unknown key', { extra: 1 }],
    ['empty id', { id: '' }],
    ['over-long id', { id: 'x'.repeat(40) }],
    ['label with zero-width text', { label: 'a​b' }],
    ['label with padding', { label: ' a ' }],
    ['over-long label', { label: 'x'.repeat(BAND_TRACK_LIMITS.labelMax + 1) }],
    ['non-string label', { label: 3 }],
    ['css color', { color: 'url(http://evil)' }],
    ['short hex color', { color: '#fff' }],
    ['missing group', { groupId: 'nope' }],
    ['numerator 0', { timeSignature: { numerator: 0, denominator: 4 } }],
    ['numerator too big', { timeSignature: { numerator: 33, denominator: 4 } }],
    ['fractional denominator', { timeSignature: { numerator: 4, denominator: 4.5 } }],
    ['signature extra key', { timeSignature: { numerator: 4, denominator: 4, x: 1 } }],
    ['bad subdivision', { subdivision: 'thirtysecond' }],
    ['bpm too low', { bpm: 19 }],
    ['bpm too high', { bpm: 401 }],
    ['fractional bpm', { bpm: 120.5 }],
    ['repeats 0', { repeats: 0 }],
    ['repeats 100', { repeats: 100 }],
    ['ramp mode without tempo', { rampMode: 'linear' }],
    ['ramp tempo without mode', { rampEndBpm: 140 }],
    ['bad ramp mode', { rampMode: 'wavy', rampEndBpm: 140 }],
    ['ramp tempo out of range', { rampMode: 'linear', rampEndBpm: 1000 }],
    ['ramp steps without a ramp', { rampStepSize: 5 }],
    ['bad ramp step', { rampMode: 'stepped', rampEndBpm: 140, rampStepSize: 0 }],
    ['accent pattern wrong length', { accentPattern: ['accent'] }],
    ['accent pattern bad level', { accentPattern: ['accent', 'loud', 'normal', 'normal'] }],
  ];
  it.each(bad)('rejects a segment with %s', (_name, over) => {
    const row = stored([{ ...piece({ groupId: null }), ...over }], [group]);
    expect(parseBandTrack({ ...row }).kind).toBe('unreadable');
  });

  it('rejects structural problems', () => {
    expect(parseBandTrack({ ...stored([piece(), piece()], []) }).kind).toBe('unreadable'); // duplicate piece id
    expect(parseBandTrack({ ...stored([piece()], [group, group]) }).kind).toBe('unreadable'); // duplicate group id
    expect(parseBandTrack({ ...stored([], []) }).kind).toBe('unreadable'); // no segments
    expect(parseBandTrack({ ...stored([piece()], [{ ...group, name: '' }]) }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...stored([piece()], [{ ...group, color: 'red' }]) }).kind).toBe('unreadable');
    expect(parseBandTrack({ ...stored([piece()], [{ ...group, extra: 1 }]) }).kind).toBe('unreadable');
    const manyGroups = Array.from({ length: BAND_TRACK_LIMITS.maxGroups + 1 }, (_, i) => ({ ...group, id: `g${i}` }));
    expect(parseBandTrack({ ...stored([piece()], manyGroups) }).kind).toBe('unreadable');
  });

  it('rejects a track that is too long or has too many clicks, even if every field is valid', () => {
    const long = stored([piece({ repeats: 99, bpm: 20 }), piece({ id: 'b', repeats: 99, bpm: 20 })]);
    expect(parseBandTrack({ ...long })).toEqual({ kind: 'unreadable', reason: 'the track is too long' });
    const dense = stored(denseTrack());
    expect(parseBandTrack({ ...dense })).toEqual({ kind: 'unreadable', reason: 'the track has too many clicks' });
  });

  it('rejects more segments than the cap', () => {
    const many = Array.from({ length: maxBandTrackPieces() + 1 }, (_, i) => piece({ id: `p${i}`, repeats: 1 }));
    expect(parseBandTrack({ ...stored(many) }).kind).toBe('unreadable');
  });
});

describe('band track hand-off', () => {
  const parts = { pieces: [piece()], groups: [group] };

  it('round-trips a fresh hand-off', () => {
    const raw = serializeBandTrackHandoff(parts, '  Song ​ title ', 1_000);
    expect(parseBandTrackHandoff(raw, 1_500)).toEqual({ ...parts, title: 'Song title' });
  });

  it('ignores a stale, future-dated, malformed or invalid hand-off', () => {
    const raw = serializeBandTrackHandoff(parts, 'Song', 1_000);
    expect(parseBandTrackHandoff(raw, 1_000 + BAND_TRACK_LIMITS.handoffMaxAgeMs + 1)).toBeNull();
    expect(parseBandTrackHandoff(raw, 1_000 - 60_000)).toBeNull();
    expect(parseBandTrackHandoff(null)).toBeNull();
    expect(parseBandTrackHandoff('nope')).toBeNull();
    expect(parseBandTrackHandoff(JSON.stringify({ pieces: [{ id: 'x' }], groups: [], title: 't', at: 1_000 }), 1_000)).toBeNull();
    expect(parseBandTrackHandoff(JSON.stringify({ pieces: [piece()], groups: [], title: 't' }), 1_000)).toBeNull();
    expect(parseBandTrackHandoff('x'.repeat(BAND_TRACK_LIMITS.maxBytes + 2000))).toBeNull();
  });
});
