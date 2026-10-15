import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VoteButtons } from './VoteButtons';

const tally = { up: 3, down: 1, score: 2 };

describe('VoteButtons', () => {
  it('shows the score with an accessible breakdown', () => {
    render(<VoteButtons songTitle="Wonderwall" myVote={undefined} tally={tally} onVote={() => {}} />);
    expect(screen.getByLabelText('Score 2, 3 up, 1 down')).toHaveTextContent('2');
    expect(screen.getByRole('group', { name: 'Vote on Wonderwall' })).toBeInTheDocument();
  });

  it('marks only the active direction as pressed', () => {
    const { rerender } = render(<VoteButtons songTitle="S" myVote="up" tally={tally} onVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Upvote S' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Downvote S' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<VoteButtons songTitle="S" myVote="down" tally={tally} onVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Upvote S' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Downvote S' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<VoteButtons songTitle="S" myVote={undefined} tally={tally} onVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Upvote S' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the clicked direction', () => {
    const onVote = vi.fn();
    render(<VoteButtons songTitle="S" myVote={undefined} tally={tally} onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upvote S' }));
    fireEvent.click(screen.getByRole('button', { name: 'Downvote S' }));
    expect(onVote.mock.calls).toEqual([['up'], ['down']]);
  });

  it('does not report clicks while disabled', () => {
    const onVote = vi.fn();
    render(<VoteButtons songTitle="S" myVote={undefined} tally={tally} disabled onVote={onVote} />);
    expect(screen.getByRole('button', { name: 'Upvote S' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Upvote S' }));
    expect(onVote).not.toHaveBeenCalled();
  });
});
