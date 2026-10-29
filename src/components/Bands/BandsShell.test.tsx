import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BandsShell } from './BandsShell';

const renderShell = (props: Partial<Parameters<typeof BandsShell>[0]> = {}) =>
  render(
    <MemoryRouter>
      <BandsShell label="Test page" {...props}>
        <p>content</p>
      </BandsShell>
    </MemoryRouter>,
  );

describe('BandsShell', () => {
  it('is a main landmark named by its label, wrapping the children', () => {
    renderShell();
    expect(screen.getByRole('main', { name: 'Test page' })).toContainElement(screen.getByText('content'));
  });

  it('uses the narrow reading column by default', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(main).toHaveClass('max-w-3xl');
    expect(main).not.toHaveClass('max-w-6xl');
  });

  it('uses more of the screen for a wide page', () => {
    renderShell({ wide: true });
    const main = screen.getByRole('main');
    expect(main).toHaveClass('max-w-6xl');
    expect(main).not.toHaveClass('max-w-3xl');
  });

  it('treats wide={false} like the default', () => {
    renderShell({ wide: false });
    expect(screen.getByRole('main')).toHaveClass('max-w-3xl');
  });

  it('shows a back link only when asked', () => {
    const { unmount } = renderShell();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();
    renderShell({ back: { to: '/bands/b1', text: '← Back' } });
    expect(screen.getByRole('link', { name: '← Back' })).toHaveAttribute('href', '/bands/b1');
  });
});
