import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Once the owner sets a real address, both legal pages must show it.
vi.mock('../legalContact', () => ({
  TAKEDOWN_CONTACT: 'takedown@example.com',
  isTakedownContactSet: () => true,
}));

import { PrivacyPolicyPage } from './PrivacyPolicyPage';
import { TermsOfServicePage } from './TermsOfServicePage';

describe('takedown contact once it is configured', () => {
  it('the Terms tell people to write to it', () => {
    render(<TermsOfServicePage />);
    const text = screen.getByRole('heading', { level: 2, name: 'Backing tracks' }).nextElementSibling!;
    expect(text).toHaveTextContent('write to takedown@example.com');
    expect(text).not.toHaveTextContent('contact details below');
  });

  it('the Privacy Policy tells people to write to it', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByText(/To report an audio file you believe was added without permission/)).toHaveTextContent(
      'write to takedown@example.com',
    );
  });
});
