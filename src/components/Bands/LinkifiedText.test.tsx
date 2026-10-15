import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinkifiedText } from './LinkifiedText';

describe('LinkifiedText', () => {
  it('renders plain text unchanged when there are no links', () => {
    const { container } = render(<p><LinkifiedText text="Just a plain note" /></p>);
    expect(container).toHaveTextContent('Just a plain note');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a link that opens in a new tab without leaking the opener', () => {
    render(<p><LinkifiedText text="Watch https://example.com/a?b=1 first" /></p>);
    const a = screen.getByRole('link', { name: 'https://example.com/a?b=1' });
    expect(a).toHaveAttribute('href', 'https://example.com/a?b=1');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps surrounding text and linkifies every URL', () => {
    const { container } = render(
      <p><LinkifiedText text="A https://one.example/x and http://two.example/y end" /></p>,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['https://one.example/x', 'http://two.example/y']);
    expect(container).toHaveTextContent('A https://one.example/x and http://two.example/y end');
  });

  it('leaves trailing punctuation outside the link', () => {
    const { container } = render(<p><LinkifiedText text="(see https://example.com/z)." /></p>);
    expect(screen.getByRole('link')).toHaveTextContent(/^https:\/\/example\.com\/z$/);
    expect(container).toHaveTextContent('(see https://example.com/z).');
  });

  it('does not link javascript:, data: or credentialed URLs', () => {
    render(
      <p><LinkifiedText text="javascript:alert(1) data:text/html,x https://user:pw@example.com/p" /></p>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders markup-looking text as text, never as elements', () => {
    const { container } = render(<p><LinkifiedText text={'<img src=x onerror=alert(1)> https://example.com'} /></p>);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
});
