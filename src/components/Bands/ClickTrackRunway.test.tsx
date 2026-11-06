import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { TrackPiece } from '../../audio/ClickTrackEngine';
import type { SegmentGroup } from '../../clickTrackTypes';
import { createPositionStore, type PlaybackPosition } from '../../utils/playbackPosition';
import { ClickTrackRunway } from './ClickTrackRunway';

const piece = (over: Partial<TrackPiece> = {}): TrackPiece => ({
  id: 'p1',
  label: '',
  color: '#8b5cf6',
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 4,
  ...over,
});

const group = (over: Partial<SegmentGroup> = {}): SegmentGroup => ({ id: 'g1', name: 'Chorus', color: '#ef4444', ...over });

function setup(pieces: TrackPiece[], groups: SegmentGroup[] = [], at: PlaybackPosition = { pieceIndex: 0, rep: 0, subTick: -1 }) {
  const position = createPositionStore(at);
  const utils = render(<ClickTrackRunway pieces={pieces} groups={groups} position={position} />);
  const move = (next: PlaybackPosition) => act(() => position.set(next));
  const bars = () => Array.from(utils.container.querySelectorAll<HTMLElement>('.ct-runway-bar'));
  const current = () => utils.container.querySelector<HTMLElement>('.ct-runway-bar.is-current');
  const numbers = () => bars().map((b) => b.querySelector('.ct-runway-number')?.textContent);
  const slot = (bar: HTMLElement) => bar.style.getPropertyValue('--slot');
  const clicking = () =>
    Array.from(current()?.querySelectorAll('.ct-runway-dot') ?? []).flatMap((d, i) =>
      d.classList.contains('ct-runway-dot--clicking') ? [i] : [],
    );
  const bpm = () => utils.container.querySelector('.ct-runway-bpm')?.textContent;
  const title = () => utils.container.querySelector('.ct-runway-title')?.textContent;
  return { ...utils, position, move, bars, current, numbers, slot, clicking, bpm, title };
}

describe('ClickTrackRunway', () => {
  it('is a labelled region for the position', () => {
    setup([piece()]);
    expect(screen.getByRole('group', { name: 'Click track position' })).toBeInTheDocument();
  });

  describe('bars', () => {
    it('numbers bars from 1 across the whole track and marks the current one', () => {
      const r = setup([piece({ repeats: 3 }), piece({ id: 'p2', repeats: 3 })], [], { pieceIndex: 1, rep: 0, subTick: -1 });
      expect(r.current()).toHaveTextContent('4');
      expect(r.numbers()).toEqual(['2', '3', '4', '5', '6']);
    });

    it('has exactly one current bar', () => {
      const r = setup([piece({ repeats: 8 })], [], { pieceIndex: 0, rep: 4, subTick: -1 });
      expect(r.container.querySelectorAll('.is-current')).toHaveLength(1);
      expect(r.current()).toHaveTextContent('5');
    });

    it('mounts only the first bars at the start of the track, with the current bar in slot 1', () => {
      const r = setup([piece({ repeats: 10 })]);
      expect(r.numbers()).toEqual(['1', '2', '3', '4']);
      expect(r.bars().map(r.slot)).toEqual(['1', '2', '3', '4']);
      expect(r.slot(r.current()!)).toBe('1');
    });

    it('positions bars around the current one by slot, with off-screen bars outside 0..3', () => {
      const r = setup([piece({ repeats: 10 })], [], { pieceIndex: 0, rep: 5, subTick: -1 });
      expect(r.numbers()).toEqual(['4', '5', '6', '7', '8', '9']);
      expect(r.bars().map(r.slot)).toEqual(['-1', '0', '1', '2', '3', '4']);
    });

    it('clips at the end of the track', () => {
      const r = setup([piece({ repeats: 10 })], [], { pieceIndex: 0, rep: 9, subTick: -1 });
      expect(r.numbers()).toEqual(['8', '9', '10']);
      expect(r.current()).toHaveTextContent('10');
    });

    it('shows the time signature of each bar from its own segment', () => {
      const r = setup(
        [piece({ repeats: 1 }), piece({ id: 'p2', repeats: 2, timeSignature: { numerator: 7, denominator: 8 } })],
        [],
        { pieceIndex: 0, rep: 0, subTick: -1 },
      );
      expect(r.bars().map((b) => b.querySelector('.ct-runway-meter')?.textContent)).toEqual(['4/4', '7/8', '7/8']);
    });

    it('gives each bar the colour of its segment', () => {
      const r = setup([piece({ repeats: 1, color: '#111111' }), piece({ id: 'p2', repeats: 1, color: '#222222' })]);
      expect(r.bars().map((b) => b.style.getPropertyValue('--piece-color'))).toEqual(['#111111', '#222222']);
    });

    it('hides the bars from assistive technology', () => {
      const r = setup([piece()]);
      for (const bar of r.bars()) expect(bar).toHaveAttribute('aria-hidden', 'true');
    });

    it('draws accent, beat and sub dots for the bar subdivision', () => {
      const r = setup([piece({ subdivision: 'eighth', timeSignature: { numerator: 2, denominator: 4 }, repeats: 1 })]);
      const dots = Array.from(r.current()!.querySelectorAll('.ct-runway-dot'));
      expect(dots.map((d) => ['accent', 'beat', 'sub'].find((t) => d.classList.contains(`ct-runway-dot--${t}`)))).toEqual([
        'accent',
        'sub',
        'beat',
        'sub',
      ]);
    });
  });

  describe('moving', () => {
    it('lights the dot for the sub-tick that just clicked, only on the current bar', () => {
      const r = setup([piece({ repeats: 3 })], [], { pieceIndex: 0, rep: 1, subTick: 2 });
      expect(r.clicking()).toEqual([2]);
      expect(r.container.querySelectorAll('.ct-runway-dot--clicking')).toHaveLength(1);
    });

    it('lights nothing before the first click', () => {
      const r = setup([piece()]);
      expect(r.container.querySelectorAll('.ct-runway-dot--clicking')).toHaveLength(0);
    });

    it('moves the lit dot as the store position changes', () => {
      const r = setup([piece()]);
      r.move({ pieceIndex: 0, rep: 0, subTick: 0 });
      expect(r.clicking()).toEqual([0]);
      r.move({ pieceIndex: 0, rep: 0, subTick: 3 });
      expect(r.clicking()).toEqual([3]);
    });

    it('lights one sixteenth dot per sub-tick', () => {
      const r = setup([piece({ subdivision: 'sixteenth' })]);
      r.move({ pieceIndex: 0, rep: 0, subTick: 9 });
      expect(r.clicking()).toEqual([9]);
    });

    it('lights one dot per three engine ticks for eighth triplets', () => {
      const r = setup([piece({ subdivision: 'eighth-triplet' })]);
      const lit: number[][] = [];
      for (const subTick of [0, 1, 2, 3, 5, 6, 11, 12]) {
        r.move({ pieceIndex: 0, rep: 0, subTick });
        lit.push(r.clicking());
      }
      expect(lit).toEqual([[0], [0], [0], [1], [1], [2], [3], [4]]);
    });

    it('lights one dot per three engine ticks for quarter triplets', () => {
      const r = setup([piece({ subdivision: 'quarter-triplet' })]);
      r.move({ pieceIndex: 0, rep: 0, subTick: 4 });
      expect(r.clicking()).toEqual([1]);
    });

    it('slides: keeps the same elements for bars that stay, changing only their slot and the current marker', () => {
      const r = setup([piece({ repeats: 10 })], [], { pieceIndex: 0, rep: 5, subTick: -1 });
      const before = new Map(r.bars().map((b) => [b.querySelector('.ct-runway-number')?.textContent, b]));
      r.move({ pieceIndex: 0, rep: 6, subTick: -1 });
      expect(r.numbers()).toEqual(['5', '6', '7', '8', '9', '10']);
      for (const bar of r.bars()) {
        const prior = before.get(bar.querySelector('.ct-runway-number')?.textContent);
        if (prior) expect(bar).toBe(prior);
      }
      const six = before.get('6')!;
      expect(six.classList.contains('is-current')).toBe(false);
      expect(r.slot(six)).toBe('0');
      expect(r.current()).toBe(before.get('7'));
      expect(r.slot(r.current()!)).toBe('1');
    });

    it('drops the bar that fell out of the window and adds the one that arrived', () => {
      const r = setup([piece({ repeats: 10 })], [], { pieceIndex: 0, rep: 5, subTick: -1 });
      r.move({ pieceIndex: 0, rep: 6, subTick: -1 });
      expect(r.numbers()).not.toContain('4');
      expect(r.numbers()).toContain('10');
    });

    it('moves across a segment boundary and takes the new segment tempo', () => {
      const r = setup([piece({ repeats: 2, bpm: 100 }), piece({ id: 'p2', repeats: 2, bpm: 140 })], [], {
        pieceIndex: 0,
        rep: 1,
        subTick: 3,
      });
      expect(r.bpm()).toBe('100 BPM');
      r.move({ pieceIndex: 1, rep: 0, subTick: 0 });
      expect(r.bpm()).toBe('140 BPM');
      expect(r.current()).toHaveTextContent('3');
    });

    it('shows the lit dot for the right segment after a boundary with a different subdivision', () => {
      const r = setup([piece({ repeats: 1 }), piece({ id: 'p2', repeats: 1, subdivision: 'sixteenth' })]);
      r.move({ pieceIndex: 1, rep: 0, subTick: 13 });
      expect(r.current()!.querySelectorAll('.ct-runway-dot')).toHaveLength(16);
      expect(r.clicking()).toEqual([13]);
    });
  });

  describe('heading', () => {
    it('shows the tempo rounded and no title for an unnamed ungrouped segment', () => {
      const r = setup([piece({ bpm: 96 })]);
      expect(r.bpm()).toBe('96 BPM');
      expect(r.title()).toBeUndefined();
    });

    it('shows the segment label when it is in no group', () => {
      const r = setup([piece({ label: 'Verse' })]);
      expect(r.title()).toBe('Verse');
      expect(r.container.querySelector('.ct-runway-section')).toBeNull();
    });

    it('shows the group name alone when the segment has no label', () => {
      const r = setup([piece({ groupId: 'g1' })], [group()]);
      expect(r.title()).toBe('Chorus');
      expect(r.container.querySelector('.ct-runway-section')).toBeNull();
    });

    it('shows "group · section" when both exist', () => {
      const r = setup([piece({ groupId: 'g1', label: 'Lift' })], [group()]);
      expect(r.title()).toBe('Chorus · Lift');
      expect(r.container.querySelector('.ct-runway-section')).toHaveTextContent('· Lift');
    });

    it('falls back to the label when the group id matches no group', () => {
      const r = setup([piece({ groupId: 'gone', label: 'Verse' })], [group()]);
      expect(r.title()).toBe('Verse');
    });

    it('follows a tempo ramp bar by bar, rounded', () => {
      const ramp = piece({ bpm: 100, rampEndBpm: 105, rampMode: 'linear', repeats: 3 });
      const r = setup([ramp]);
      expect(r.bpm()).toBe('100 BPM');
      r.move({ pieceIndex: 0, rep: 1, subTick: -1 });
      expect(r.bpm()).toBe('103 BPM');
      r.move({ pieceIndex: 0, rep: 2, subTick: -1 });
      expect(r.bpm()).toBe('105 BPM');
    });

    it('updates the title when the position moves into a differently named segment', () => {
      const r = setup([piece({ repeats: 1, label: 'Verse' }), piece({ id: 'p2', repeats: 1, label: 'Chorus' })]);
      r.move({ pieceIndex: 1, rep: 0, subTick: -1 });
      expect(r.title()).toBe('Chorus');
    });

    it('carries the segment colour on the heading', () => {
      const r = setup([piece({ color: '#abcdef' })]);
      const heading = r.container.querySelector<HTMLElement>('.ct-runway-heading')!;
      expect(heading.style.getPropertyValue('--runway-color')).toBe('#abcdef');
    });
  });

  describe('out-of-range positions', () => {
    it('renders nothing when the piece index is past the end', () => {
      const r = setup([piece()], [], { pieceIndex: 3, rep: 0, subTick: 0 });
      expect(r.container).toBeEmptyDOMElement();
    });

    it('renders nothing for an empty track', () => {
      const r = setup([]);
      expect(r.container).toBeEmptyDOMElement();
    });

    it('renders nothing for a negative piece index', () => {
      const r = setup([piece()], [], { pieceIndex: -1, rep: 0, subTick: 0 });
      expect(r.container).toBeEmptyDOMElement();
    });

    it('comes back when the position returns to a valid piece', () => {
      const r = setup([piece()], [], { pieceIndex: 5, rep: 0, subTick: 0 });
      expect(r.container).toBeEmptyDOMElement();
      r.move({ pieceIndex: 0, rep: 0, subTick: 0 });
      expect(screen.getByRole('group', { name: 'Click track position' })).toBeInTheDocument();
    });

    it('stops following the store after it unmounts', () => {
      const r = setup([piece()]);
      r.unmount();
      expect(() => r.move({ pieceIndex: 0, rep: 1, subTick: 0 })).not.toThrow();
    });
  });
});
