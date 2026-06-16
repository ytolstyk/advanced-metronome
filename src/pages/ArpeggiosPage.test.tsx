/**
 * Smoke tests for ArpeggiosPage.
 *
 * This page has no Amplify/router/context dependencies (stateless browse,
 * no cloud persistence), so it's cheap to render directly — unlike
 * ChordProgressionPage. Scope here is deliberately minimal: this pass only
 * wrapped the existing ArpeggioCard in React.memo (no new behavior), so we
 * cover baseline rendering + the one interactive path (clicking a card
 * triggers playback) rather than building out full page test coverage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArpeggiosPage } from './ArpeggiosPage';
import { ARPEGGIO_DATABASE } from '../data/arpeggios';

const mockPlayArpeggio = vi.fn();
vi.mock('../audio/arpeggioSynths', () => ({
  playArpeggio: (...args: unknown[]) => mockPlayArpeggio(...args),
}));

class FakeGainNode {
  gain = { value: 1 };
  connect = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = {};
  createGain() {
    return new FakeGainNode() as unknown as GainNode;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('ArpeggiosPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPlayArpeggio.mockClear();
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('renders without crashing and shows the key/quality/sweep filters', () => {
    render(<ArpeggiosPage />);
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.getByText('Sweep')).toBeInTheDocument();
  });

  it('defaults to key "C" and renders one card per shape of every C-root arpeggio', () => {
    render(<ArpeggiosPage />);
    const cCardCount = ARPEGGIO_DATABASE
      .filter((e) => e.root === 'C')
      .reduce((sum, e) => sum + e.shapes.length, 0);
    expect(screen.getAllByRole('button')).toHaveLength(cCardCount);
  });

  it('plays the clicked arpeggio shape via playArpeggio', () => {
    render(<ArpeggiosPage />);
    const cards = screen.getAllByRole('button');
    cards[0].click();
    expect(mockPlayArpeggio).toHaveBeenCalledTimes(1);
  });

  it('renders one card per shape across all roots when key filter is "all"', () => {
    localStorage.setItem('arpeggios-selectedKey', 'all');
    render(<ArpeggiosPage />);
    const totalCardCount = ARPEGGIO_DATABASE.reduce((sum, e) => sum + e.shapes.length, 0);
    expect(screen.getAllByRole('button')).toHaveLength(totalCardCount);
  });
});
