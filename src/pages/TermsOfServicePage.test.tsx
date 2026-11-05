import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TAKEDOWN_CONTACT } from '../legalContact';
import { TermsOfServicePage } from './TermsOfServicePage';

function openSourceSection(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: 'Open-source software' });
  // The section is the heading plus its following siblings up to the next h2.
  const wrapper = document.createElement('div');
  let node: Element | null = heading;
  while (node) {
    wrapper.appendChild(node.cloneNode(true));
    node = node.nextElementSibling;
    if (node?.tagName === 'H2') break;
  }
  return wrapper;
}

describe('TermsOfServicePage', () => {
  it('renders a main landmark labelled "Terms of Service"', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByRole('main', { name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('renders the h1 heading', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('shows a last-updated date', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByText(/^Last updated: .+/)).toBeInTheDocument();
  });

  it('shows the November 4, 2026 last-updated date', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByText('Last updated: November 4, 2026')).toBeInTheDocument();
  });

  it('has a Backing tracks section: upload only what you may share, anyone with the link can play it, owners can remove it, where to report', () => {
    render(<TermsOfServicePage />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Backing tracks' });
    const text = heading.nextElementSibling!;
    expect(text).toHaveTextContent(/Only upload audio you made or have permission to share/);
    expect(text).toHaveTextContent(/Anyone with an account who has a band.s link can play and download/);
    expect(text).toHaveTextContent(/band.s owner may remove any backing track/);
    // The placeholder address is never shown as if it were real.
    expect(text).not.toHaveTextContent(TAKEDOWN_CONTACT);
    expect(text).toHaveTextContent(/tell us through the contact details below/);
  });

  it('renders at least one section heading', () => {
    render(<TermsOfServicePage />);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });

  it('asks users to import or attach only files and songs they have the right to use', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByText(/Only import or attach files\s+and songs you have the right to use\./)).toBeInTheDocument();
  });

  it('places "Open-source software" after "AI-generated output" and before "Availability and changes"', () => {
    render(<TermsOfServicePage />);
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const ai = names.indexOf('AI-generated output');
    const oss = names.indexOf('Open-source software');
    expect(names.indexOf('Backing tracks')).toBe(ai - 1);
    const avail = names.indexOf('Availability and changes');
    expect(ai).toBeGreaterThanOrEqual(0);
    expect(oss).toBe(ai + 1);
    expect(avail).toBe(oss + 1);
  });

  describe('Open-source software section', () => {
    it('no longer mentions LAME, lamejs or the LGPL (the MP3 encoder was removed)', () => {
      render(<TermsOfServicePage />);
      const section = openSourceSection();
      expect(section).not.toHaveTextContent(/LAME|lamejs|LGPL|MP3/i);
      expect(screen.queryByRole('link', { name: 'LAME' })).not.toBeInTheDocument();
      expect(document.querySelector('a[href*="lamejs"], a[href*="lame.sourceforge"]')).toBeNull();
    });

    it('lists alphaTab (MPL-2.0) as the only open-source library bullet', () => {
      render(<TermsOfServicePage />);
      const items = within(openSourceSection()).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent(/alphaTab/);
      expect(items[0]).toHaveTextContent(/MPL-2\.0/);
    });

    it('links alphaTab to its repository and states MPL-2.0', () => {
      render(<TermsOfServicePage />);
      const link = screen.getByRole('link', { name: 'alphaTab' });
      expect(link).toHaveAttribute('href', 'https://github.com/CoderLine/alphaTab');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.closest('li')).toHaveTextContent(/MPL-2\.0/);
    });

    it('links GitHub to the project repository and mentions package.json', () => {
      render(<TermsOfServicePage />);
      // A second GitHub link lives under Contact, so scope to the paragraph that mentions package.json.
      const paragraph = screen.getByText('package.json').closest('p')!;
      const link = within(paragraph).getByRole('link', { name: 'GitHub' });
      expect(link).toHaveAttribute('href', 'https://github.com/ytolstyk/advanced-metronome');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(paragraph).toHaveTextContent('package.json');
    });

    it('keeps both links inside the Open-source software section', () => {
      render(<TermsOfServicePage />);
      const section = within(openSourceSection());
      expect(section.getAllByRole('link').map((a) => a.textContent?.trim())).toEqual([
        'alphaTab',
        'GitHub',
      ]);
    });
  });

  it('gives every external link rel with noopener and noreferrer', () => {
    render(<TermsOfServicePage />);
    const external = screen
      .getAllByRole('link')
      .filter((a) => /^https?:\/\//.test(a.getAttribute('href') ?? ''));
    expect(external.length).toBeGreaterThanOrEqual(2);
    for (const a of external) {
      const rel = (a.getAttribute('rel') ?? '').split(/\s+/);
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });
});
