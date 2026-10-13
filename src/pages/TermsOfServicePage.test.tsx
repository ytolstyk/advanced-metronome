import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TermsOfServicePage } from './TermsOfServicePage';

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

  it('renders at least one section heading', () => {
    render(<TermsOfServicePage />);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });
});
