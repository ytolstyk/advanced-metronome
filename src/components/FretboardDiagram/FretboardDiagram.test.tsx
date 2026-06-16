/**
 * Unit tests for FretboardDiagram — a shared SVG fretboard chord diagram used
 * by ChordsPage, ArpeggiosPage, and ChordProgressionPage. The component is
 * wrapped in React.memo; these tests focus on rendering correctness rather
 * than asserting on memoization internals (not meaningfully observable via RTL).
 *
 * The root <svg> has aria-hidden="true" (decorative), so queries go through
 * the render container rather than getByRole.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FretboardDiagram } from './FretboardDiagram';
import type { FretDiagramVoicing } from './FretboardDiagram';

describe('FretboardDiagram', () => {
  const openCMajor: FretDiagramVoicing = { frets: [-1, 3, 2, 0, 1, 0] };

  it('renders without crashing given a basic voicing', () => {
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders one string line and one fretted-note marker per string', () => {
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    // 6 strings → 6 vertical string <line> elements plus 6 horizontal fret lines.
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(6 + 6);
  });

  it('renders an open-string marker (○) for fret 0 and a muted marker (×) for fret -1', () => {
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    const markerTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(markerTexts).toContain('○');
    expect(markerTexts).toContain('×');
  });

  it('renders a fretted-note dot for each positive fret value', () => {
    // frets: [-1, 3, 2, 0, 1, 0] → positive frets at indices 1, 2, 4 (3 dots)
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    const dots = container.querySelectorAll('circle');
    expect(dots).toHaveLength(3);
  });

  it('renders string-name labels when stringNames is passed', () => {
    const stringNames = ['E', 'A', 'D', 'G', 'B', 'e'];
    const { container } = render(
      <FretboardDiagram voicing={openCMajor} stringNames={stringNames} />,
    );
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    for (const name of stringNames) {
      expect(texts).toContain(name);
    }
  });

  it('omits string-name labels when stringNames is not passed', () => {
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    // Without stringNames, single-letter string-name labels should not appear —
    // only the ○/× markers (multi-char-safe check: no length-1 alpha text nodes).
    const alphaLabels = texts.filter((t) => t !== null && /^[A-Za-z]$/.test(t));
    expect(alphaLabels).toHaveLength(0);
  });

  it('renders a barre rectangle when voicing.barre is set', () => {
    const barreF: FretDiagramVoicing = {
      frets: [1, 1, 2, 2, 1, 1],
      barre: { fret: 1, fromString: 1, toString: 6 },
      startFret: 1,
    };
    const { container } = render(<FretboardDiagram voicing={barreF} />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(1);
  });

  it('omits the barre rectangle when voicing.barre is not set', () => {
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('excludes barred strings from the individual dot count to avoid double-rendering', () => {
    // Barre covers strings 1-6 at fret 1; string 3 has its own higher fret (3),
    // which still renders as a separate dot. The two barred strings (idx 0, 4 — fret 1)
    // must not also render individual dots.
    const barreVoicing: FretDiagramVoicing = {
      frets: [1, 0, 3, 0, 1, 0],
      barre: { fret: 1, fromString: 1, toString: 5 },
    };
    const { container } = render(<FretboardDiagram voicing={barreVoicing} />);
    // Only the fret-3 note (index 2) should render as an individual dot.
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.querySelectorAll('rect')).toHaveLength(1);
  });

  it('shows a fret-position label (e.g. "3fr") when startFret is greater than 1', () => {
    const shiftedVoicing: FretDiagramVoicing = { frets: [3, 5, 5, 4, 3, 3], startFret: 3 };
    const { container } = render(<FretboardDiagram voicing={shiftedVoicing} />);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('3fr');
  });

  it('omits the fret-position label for open positions (startFret 1 or unset)', () => {
    const { container } = render(<FretboardDiagram voicing={openCMajor} />);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts.some((t) => t?.endsWith('fr'))).toBe(false);
  });

  it('supports a variable string count (e.g. 8-string voicings)', () => {
    const eightString: FretDiagramVoicing = { frets: [0, 0, 0, 2, 2, 1, 0, 0] };
    const { container } = render(<FretboardDiagram voicing={eightString} />);
    const stringLines = container.querySelectorAll('line');
    // 8 vertical string lines + 6 horizontal fret lines (FRETS_SHOWN=5 is fixed)
    expect(stringLines).toHaveLength(8 + 6);
  });

  it('mirrors string order for left-handed rendering', () => {
    // For a non-symmetric voicing, the x-position of string 0 in a left-handed
    // render should equal the x-position of the last string in a right-handed
    // render (and vice versa) — i.e. the string order is mirrored horizontally.
    const voicing: FretDiagramVoicing = { frets: [1, 2, 0, 0, 0, 0] };
    const { container: rightHanded } = render(<FretboardDiagram voicing={voicing} />);
    const { container: leftHanded } = render(
      <FretboardDiagram voicing={voicing} leftHanded />,
    );
    const rhFirstStringX = rightHanded.querySelectorAll('line')[0]?.getAttribute('x1');
    const lhFirstStringX = leftHanded.querySelectorAll('line')[0]?.getAttribute('x1');
    const rhLastStringX = rightHanded.querySelectorAll('line')[5]?.getAttribute('x1');
    expect(lhFirstStringX).toBe(rhLastStringX);
    expect(lhFirstStringX).not.toBe(rhFirstStringX);
  });

  it('applies a custom dot/barre color when provided', () => {
    const barreVoicing: FretDiagramVoicing = {
      frets: [1, 1, 1, 1, 1, 1],
      barre: { fret: 1, fromString: 1, toString: 6 },
    };
    const { container } = render(
      <FretboardDiagram voicing={barreVoicing} color="#ff0000" />,
    );
    const rect = container.querySelector('rect');
    expect(rect).toHaveAttribute('fill', '#ff0000');
  });
});
