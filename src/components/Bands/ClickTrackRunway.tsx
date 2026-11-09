import { memo, useMemo, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { getMeasureDots, subTickToDotIndex, type MeasureDot } from '../../utils/measureDots';
import {
  RUNWAY_BARS_BEFORE,
  RUNWAY_VISIBLE_BARS,
  anchorFlat,
  barSeconds,
  countInOffset,
  effectiveColor,
  type RunwayControls,
  buildBarIndex,
  flatIndexOf,
  runwayHeading,
  runwayWindow,
} from '../../utils/trackRunway';
import './ClickTrackRunway.css';

interface RunwayBarProps {
  flat: number;
  /** Slot relative to the current bar: -1 = previous, 0 = current, 1 and 2 = upcoming; further ones wait off-screen. */
  offset: number;
  color: string;
  dots: readonly MeasureDot[];
  numerator: number;
  denominator: number;
  /** The dot clicking right now; -1 for every bar but the current one. */
  activeDot: number;
}

/** Above this many dots a bar would wrap past its height, so they are drawn smaller. */
const PACKED_DOT_COUNT = 12;
/** The densest bars (up to 128 dots) get the smallest dots, and anything that still doesn't fit is clipped, not spilled over the labels. */
const TINY_DOT_COUNT = 32;
/** The slide never takes longer than this share of a bar, so very fast bars stay in step with the clicks. */
const MAX_SLIDE_SHARE_OF_BAR = 0.8;
const MAX_SLIDE_MS = 280;

/** Memoized on primitives, so a click re-renders only the current bar and a bar change only the moved ones. */
const RunwayBar = memo(function RunwayBar({ flat, offset, color, dots, numerator, denominator, activeDot }: RunwayBarProps) {
  return (
    <div
      className={cn('ct-runway-bar', offset === 0 && 'is-current')}
      style={{ '--piece-color': color, '--slot': offset + RUNWAY_BARS_BEFORE } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ct-runway-number">{flat + 1}</span>
      <div className={cn('ct-runway-dots', dots.length > PACKED_DOT_COUNT && 'is-packed', dots.length > TINY_DOT_COUNT && 'is-tiny')}>
        {dots.map((type, i) => (
          <span key={i} className={cn('ct-runway-dot', `ct-runway-dot--${type}`, i === activeDot && 'ct-runway-dot--clicking')} />
        ))}
      </div>
      <span className="ct-runway-meter">
        {numerator}/{denominator}
      </span>
    </div>
  );
});

/** The count-in card: the number being counted, in the slot just before bar 1. */
const CountInCard = memo(function CountInCard({ offset, color, beat }: { offset: number; color: string; beat: number | null }) {
  return (
    <div
      className={cn('ct-runway-bar ct-runway-count', offset === 0 && 'is-current')}
      style={{ '--piece-color': color, '--slot': offset + RUNWAY_BARS_BEFORE } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ct-runway-number">Count in</span>
      <span className={cn('ct-runway-count-number', beat !== null && 'is-counting')} key={beat ?? 'go'}>
        {beat ?? 'Go'}
      </span>
    </div>
  );
});

/**
 * The unrolled view of a playing click track: the previous bar (fading out), the current bar, and the next
 * two (the last fading in), with the current tempo and the group / section name above. When the current
 * bar completes the row slides one bar to the left.
 */
export function ClickTrackRunway({ pieces, groups, position, countIn }: RunwayControls) {
  const { pieceIndex, rep, subTick } = useSyncExternalStore(position.subscribe, position.getSnapshot);
  const index = useMemo(() => buildBarIndex(pieces), [pieces]);
  const dotsByPiece = useMemo(() => pieces.map(getMeasureDots), [pieces]);

  const piece = pieces[pieceIndex];
  if (!piece) return null;

  const currentFlat = flatIndexOf(index, pieceIndex, rep);
  const counting = countIn?.beat != null;
  const anchor = anchorFlat(currentFlat, counting);
  const countInSlot = countIn ? countInOffset(currentFlat, counting) : null;
  const slideMs = Math.round(Math.min(MAX_SLIDE_MS, barSeconds(piece, rep) * 1000 * MAX_SLIDE_SHARE_OF_BAR));
  const heading = runwayHeading(piece, rep, groups);
  const title = heading.group || heading.section;
  const section = heading.group && heading.section ? heading.section : '';
  const activeDot = subTick < 0 ? -1 : subTickToDotIndex(piece, subTick);

  return (
    <div className="ct-runway" role="group" aria-label="Click track position">
      <div className="ct-runway-heading" style={{ '--runway-color': effectiveColor(piece, groups) } as CSSProperties}>
        {title && (
          <span className="ct-runway-title">
            {title}
            {section && <span className="ct-runway-section"> · {section}</span>}
          </span>
        )}
        <span className="ct-runway-bpm">
          {heading.bpm} <small>BPM</small>
        </span>
      </div>
      <div
        className="ct-runway-viewport"
        style={{ '--runway-bars': RUNWAY_VISIBLE_BARS, '--runway-slide': `${slideMs}ms` } as CSSProperties}
      >
        {countIn && countInSlot !== null && (
          <CountInCard key="count-in" offset={countInSlot} color={effectiveColor(pieces[0], groups)} beat={countIn.beat} />
        )}
        {runwayWindow(index, anchor).map((bar) => {
          const barPiece = pieces[bar.pieceIndex];
          const offset = bar.flat - anchor;
          return (
            <RunwayBar
              key={bar.flat}
              flat={bar.flat}
              offset={offset}
              color={effectiveColor(barPiece, groups)}
              dots={dotsByPiece[bar.pieceIndex]}
              numerator={barPiece.timeSignature.numerator}
              denominator={barPiece.timeSignature.denominator}
              activeDot={offset === 0 ? activeDot : -1}
            />
          );
        })}
      </div>
    </div>
  );
}
