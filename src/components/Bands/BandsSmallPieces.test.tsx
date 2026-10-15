import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BandsShell } from './BandsShell';
import { DisplayNameField } from './DisplayNameField';
import { InlineAlert } from './InlineAlert';
import { StatusNotice } from './StatusNotice';

describe('InlineAlert', () => {
  it('errors are announced assertively (role=alert)', () => {
    render(<InlineAlert tone="error">Bad thing</InlineAlert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad thing');
  });

  it('warnings are announced politely (role=status)', () => {
    render(<InlineAlert tone="warning">Heads up</InlineAlert>);
    expect(screen.getByRole('status')).toHaveTextContent('Heads up');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('merges a caller class after the base classes', () => {
    render(
      <InlineAlert tone="error" className="mt-2">
        x
      </InlineAlert>,
    );
    expect(screen.getByRole('alert')).toHaveClass('mt-2', 'p-3');
  });
});

describe('StatusNotice', () => {
  it('renders the title as the page heading and its children as the explanation', () => {
    render(
      <StatusNotice title="Band not found">
        <a href="/bands">Back to my bands</a>
      </StatusNotice>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Band not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my bands' })).toBeInTheDocument();
  });

  it('works without children', () => {
    render(<StatusNotice title="Gone" />);
    expect(screen.getByRole('heading', { name: 'Gone' })).toBeInTheDocument();
  });
});

describe('DisplayNameField', () => {
  it('is a required, length-limited field bound to the label, with the privacy note', () => {
    render(<DisplayNameField id="dn" value="Alice" onChange={() => {}} />);
    const input = screen.getByLabelText('Your name in this band');
    expect(input).toHaveValue('Alice');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('maxlength', '30');
    expect(screen.getByText(/Your email is never shown/)).toBeInTheDocument();
  });

  it('reports typed text', () => {
    const onChange = vi.fn();
    render(<DisplayNameField id="dn" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Your name in this band'), { target: { value: 'Bo' } });
    expect(onChange).toHaveBeenCalledWith('Bo');
  });

  it('only autofocuses when asked to', () => {
    const { unmount } = render(<DisplayNameField id="a" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Your name in this band')).not.toHaveFocus();
    unmount();
    render(<DisplayNameField id="b" value="" onChange={() => {}} autoFocus />);
    expect(screen.getByLabelText('Your name in this band')).toHaveFocus();
  });
});

describe('BandsShell', () => {
  it('is a labelled main landmark around its children', () => {
    render(
      <MemoryRouter>
        <BandsShell label="Your bands">
          <p>content</p>
        </BandsShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('main', { name: 'Your bands' })).toHaveTextContent('content');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a back link only when one is given', () => {
    render(
      <MemoryRouter>
        <BandsShell label="Band" back={{ to: '/bands', text: '← All bands' }}>
          <p>content</p>
        </BandsShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: '← All bands' })).toHaveAttribute('href', '/bands');
  });
});
