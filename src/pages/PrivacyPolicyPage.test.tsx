import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';

describe('PrivacyPolicyPage', () => {
  it('renders a main landmark labelled "Privacy Policy"', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('main', { name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('renders the h1 heading', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('shows a last-updated date', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/^Last updated: .+/)).toBeInTheDocument();
  });

  it('renders at least one section heading', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });
});
