import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InstrumentKey } from '../../bandInstruments';
import { InstrumentIcons, InstrumentLabels } from './InstrumentBadges';

describe('InstrumentIcons', () => {
  it('is one image named for what the person plays, with the same text as its tooltip', () => {
    render(<InstrumentIcons instruments={['guitar', 'bass']} />);
    const img = screen.getByRole('img', { name: 'plays Guitar, Bass' });
    expect(img).toHaveAttribute('title', 'Guitar, Bass');
  });

  it('draws one hidden icon per instrument and no visible text', () => {
    render(<InstrumentIcons instruments={['guitar', 'bass', 'drums']} />);
    const img = screen.getByRole('img');
    const svgs = img.querySelectorAll('svg');
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveTextContent('');
  });

  it('renders nothing when the list is empty', () => {
    const { container } = render(<InstrumentIcons instruments={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders nothing when every key is unknown', () => {
    const { container } = render(<InstrumentIcons instruments={['theremin' as InstrumentKey]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists instruments in palette order and once each', () => {
    render(<InstrumentIcons instruments={['vocals', 'guitar', 'guitar']} />);
    expect(screen.getByRole('img', { name: 'plays Guitar, Vocals' })).toBeInTheDocument();
  });

  it('uses the full label for winds', () => {
    render(<InstrumentIcons instruments={['winds']} />);
    expect(screen.getByRole('img', { name: 'plays Winds & brass' })).toBeInTheDocument();
  });

  it('adds a class from the caller', () => {
    render(<InstrumentIcons instruments={['keys']} className="extra-class" />);
    expect(screen.getByRole('img')).toHaveClass('extra-class');
  });
});

describe('InstrumentLabels', () => {
  it('shows each label with an icon, comma separated, in palette order', () => {
    const { container } = render(
      <p>
        <InstrumentLabels instruments={['drums', 'guitar']} />
      </p>,
    );
    expect(container).toHaveTextContent('Guitar, Drums');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('puts no comma before the first or after the last', () => {
    const { container } = render(
      <p>
        <InstrumentLabels instruments={['bass']} />
      </p>,
    );
    expect(container.textContent).toBe('Bass');
  });

  it('hides its icons from assistive tech', () => {
    const { container } = render(
      <p>
        <InstrumentLabels instruments={['bass', 'keys']} />
      </p>,
    );
    for (const svg of container.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(
      <p>
        <InstrumentLabels instruments={[]} />
      </p>,
    );
    expect(container.querySelector('p')).toBeEmptyDOMElement();
  });

  it('drops unknown keys', () => {
    const { container } = render(
      <p>
        <InstrumentLabels instruments={['kazoo' as InstrumentKey, 'strings']} />
      </p>,
    );
    expect(container.textContent).toBe('Strings');
  });
});
