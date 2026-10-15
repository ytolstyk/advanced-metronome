import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LoaderBoundary } from './LoaderBoundary';
import type { LoaderState } from '../../hooks/useLoader';

function setup(
  state: LoaderState<{ name: string }>,
  props: { refreshing?: boolean; refreshError?: string | null; reload?: () => Promise<void> } = {},
) {
  const reload = props.reload ?? vi.fn().mockResolvedValue(undefined);
  const children = vi.fn((data: { name: string }) => <p>Loaded {data.name}</p>);
  render(
    <LoaderBoundary
      state={state}
      refreshing={props.refreshing ?? false}
      reload={reload}
      loadingText="Loading band…"
      errorPrefix="Couldn’t load this band"
      refreshError={props.refreshError}
    >
      {children}
    </LoaderBoundary>,
  );
  return { reload, children };
}

describe('LoaderBoundary', () => {
  it('shows the loading text and never calls the render callback while loading', () => {
    const { children } = setup({ status: 'loading' });
    expect(screen.getByText('Loading band…')).toBeInTheDocument();
    expect(children).not.toHaveBeenCalled();
  });

  it('shows prefix + message in an alert with a retry button when the first load failed', () => {
    const { reload, children } = setup({ status: 'error', message: 'Network down' });
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load this band: Network down');
    expect(children).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('disables the retry button and says Retrying… while a refresh is in flight', () => {
    setup({ status: 'error', message: 'x' }, { refreshing: true });
    const btn = screen.getByRole('button', { name: 'Retrying…' });
    expect(btn).toBeDisabled();
  });

  it('renders the children with the loaded data when ready', () => {
    const { children } = setup({ status: 'ready', data: { name: 'Zeppelin' } });
    expect(screen.getByText('Loaded Zeppelin')).toBeInTheDocument();
    expect(children).toHaveBeenCalledWith({ name: 'Zeppelin' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the old data on screen and warns (politely) when a background refresh failed', () => {
    setup({ status: 'ready', data: { name: 'Zeppelin' } }, { refreshError: 'timeout' });
    expect(screen.getByText('Loaded Zeppelin')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t refresh, so this may be out of date: timeout');
  });

  it('ignores a refresh error while loading or in the error state (only the first-load state is shown)', () => {
    setup({ status: 'error', message: 'first' }, { refreshError: 'later' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('first');
    expect(screen.queryByText(/out of date/)).not.toBeInTheDocument();
  });

  it('does not show a warning when the refresh error is null or empty', () => {
    setup({ status: 'ready', data: { name: 'A' } }, { refreshError: null });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
