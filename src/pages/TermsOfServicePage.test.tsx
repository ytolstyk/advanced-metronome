import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('shows the October 31, 2026 last-updated date', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByText('Last updated: October 31, 2026')).toBeInTheDocument();
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
    const avail = names.indexOf('Availability and changes');
    expect(ai).toBeGreaterThanOrEqual(0);
    expect(oss).toBe(ai + 1);
    expect(avail).toBe(oss + 1);
  });

  describe('Open-source software section', () => {
    it('links LAME to its home page in a new tab with noopener', () => {
      render(<TermsOfServicePage />);
      const link = screen.getByRole('link', { name: 'LAME' });
      expect(link).toHaveAttribute('href', 'https://lame.sourceforge.net/');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('links the lamejs source to its GitHub repository', () => {
      render(<TermsOfServicePage />);
      const link = screen.getByRole('link', { name: 'source' });
      expect(link).toHaveAttribute('href', 'https://github.com/zhuker/lamejs');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('names @breezystack/lamejs, LGPL-3.0, unmodified use and on-demand loading', () => {
      render(<TermsOfServicePage />);
      const item = screen.getByRole('link', { name: 'LAME' }).closest('li')!;
      expect(item).toHaveTextContent('@breezystack/lamejs');
      expect(item).toHaveTextContent(/LGPL-3\.0/);
      expect(item).toHaveTextContent(/We use it unmodified/);
      expect(item).toHaveTextContent(/loads only\s+when you ask for an MP3/);
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

    it('keeps all four links inside the Open-source software section', () => {
      render(<TermsOfServicePage />);
      const section = within(openSourceSection());
      expect(section.getAllByRole('link').map((a) => a.textContent?.trim())).toEqual([
        'LAME',
        'source',
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
    expect(external.length).toBeGreaterThanOrEqual(4);
    for (const a of external) {
      const rel = (a.getAttribute('rel') ?? '').split(/\s+/);
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
    }
  });
});
