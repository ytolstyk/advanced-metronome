import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalPage } from './LegalPage';

function renderPage() {
  return render(
    <LegalPage title="Sample Policy" lastUpdated="January 1, 2026">
      <p>Child content</p>
    </LegalPage>,
  );
}

describe('LegalPage', () => {
  it('renders a main landmark labelled with the title', () => {
    renderPage();
    expect(screen.getByRole('main', { name: 'Sample Policy' })).toBeInTheDocument();
  });

  it('renders the title as a level-1 heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Sample Policy' })).toBeInTheDocument();
  });

  it('renders the last-updated date', () => {
    renderPage();
    expect(screen.getByText('Last updated: January 1, 2026')).toBeInTheDocument();
  });

  it('renders children inside the main landmark', () => {
    renderPage();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Child content'));
  });
});
