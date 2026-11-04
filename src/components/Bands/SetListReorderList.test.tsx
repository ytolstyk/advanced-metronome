import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { SetListReorderList } from './SetListReorderList';

const LISTS = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bravo' },
  { id: 'c', name: 'Charlie' },
];

function setup(setLists = LISTS) {
  const onReorder = vi.fn();
  const utils = render(<SetListReorderList setLists={setLists} onReorder={onReorder} />);
  return { onReorder, ...utils };
}

const rows = () => within(screen.getByRole('list', { name: 'Set list order' })).getAllByRole('listitem');
const position = (name: string) => screen.getByRole('spinbutton', { name: `Position of ${name}` });

function dataTransfer() {
  return {
    effectAllowed: '',
    setData: vi.fn(),
    setDragImage: vi.fn(),
  };
}

/** jsdom has no DragEvent, so `relatedTarget` has to be set on the event by hand. */
function dragLeave(row: HTMLElement, relatedTarget: Node | null) {
  const event = createEvent.dragLeave(row);
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  fireEvent(row, event);
}

/** Owns the order like the real parent: a move re-renders with the new order in the same event. */
function Harness() {
  const [lists, setLists] = useState(LISTS);
  return (
    <SetListReorderList
      setLists={lists}
      onReorder={(ids) => setLists(ids.map((id) => LISTS.find((l) => l.id === id)!))}
    />
  );
}

function gripOf(row: HTMLElement): HTMLElement {
  const grip = row.querySelector<HTMLElement>('[draggable="true"]');
  if (!grip) throw new Error('no grip');
  return grip;
}

describe('SetListReorderList rendering', () => {
  it('renders one row per set list, in the given order, with 1-based positions', () => {
    setup();
    expect(rows()).toHaveLength(3);
    expect(within(rows()[0]).getByText('Alpha')).toBeInTheDocument();
    expect(within(rows()[2]).getByText('Charlie')).toBeInTheDocument();
    expect(position('Alpha')).toHaveValue(1);
    expect(position('Bravo')).toHaveValue(2);
    expect(position('Charlie')).toHaveValue(3);
  });

  it('gives the position inputs min 1 and max equal to the list length', () => {
    setup();
    expect(position('Alpha')).toHaveAttribute('min', '1');
    expect(position('Alpha')).toHaveAttribute('max', '3');
  });

  it('has an empty status region at first', () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('SetListReorderList arrow buttons', () => {
  it('disables the first row\'s up arrow and the last row\'s down arrow only', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Alpha down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Bravo up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Bravo down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Charlie up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Charlie down' })).toBeDisabled();
  });

  it('moves a row up one place', () => {
    const { onReorder } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Move Bravo up' }));
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('moves a row down one place', () => {
    const { onReorder } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Move Bravo down' }));
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
  });

  it('does not call onReorder from a disabled arrow', () => {
    const { onReorder } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Charlie down' }));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('announces the move for screen readers', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Move Bravo down' }));
    expect(screen.getByRole('status')).toHaveTextContent('Bravo moved to position 3 of 3');
  });

  it('moves focus to the opposite arrow when the pressed one becomes disabled', () => {
    render(<Harness />);
    const up = screen.getByRole('button', { name: 'Move Bravo up' });
    up.focus();
    fireEvent.click(up);
    // Bravo is now first, so its up arrow is disabled and focus falls to its down arrow.
    expect(screen.getByRole('button', { name: 'Move Bravo up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bravo down' })).toHaveFocus();
    expect(within(rows()[0]).getByText('Bravo')).toBeInTheDocument();
  });

  it('moves focus to the up arrow when a down arrow reaches the bottom', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Bravo down' }));
    expect(screen.getByRole('button', { name: 'Move Bravo down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bravo up' })).toHaveFocus();
  });

  it('keeps focus on the same arrow while it stays enabled', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Charlie up' }));
    // Charlie is now second: both of its arrows are enabled.
    expect(screen.getByRole('button', { name: 'Move Charlie up' })).toHaveFocus();
  });

  it('disables both arrows on a single-item list', () => {
    setup([LISTS[0]]);
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Alpha down' })).toBeDisabled();
  });
});

describe('SetListReorderList position input', () => {
  const typeAndBlur = (name: string, value: string) => {
    const input = position(name);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    return input;
  };

  it('moves a row to the typed position on blur', () => {
    const { onReorder } = setup();
    typeAndBlur('Alpha', '3');
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('moves a row to the typed position on Enter', () => {
    const { onReorder } = setup();
    const input = position('Charlie');
    input.focus();
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Enter blurs the field, the blur handler does the move, and focus is put back on the position box.
    expect(input).toHaveFocus();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('ignores other keys', () => {
    const { onReorder } = setup();
    const input = position('Charlie');
    input.focus();
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'a' });
    expect(input).toHaveFocus();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('clamps a number above the length to the bottom', () => {
    const { onReorder } = setup();
    typeAndBlur('Alpha', '99');
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('clamps zero and negative numbers to the top', () => {
    const { onReorder } = setup();
    typeAndBlur('Charlie', '0');
    expect(onReorder).toHaveBeenLastCalledWith(['c', 'a', 'b']);
    typeAndBlur('Bravo', '-4');
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('snaps an empty field back to the real position without moving anything', () => {
    const { onReorder } = setup();
    const input = typeAndBlur('Bravo', '');
    expect(onReorder).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
  });

  it('snaps a non-numeric entry back without moving anything', () => {
    const { onReorder } = setup();
    const input = position('Bravo');
    fireEvent.change(input, { target: { value: 'abc' } }); // a number input in jsdom sanitizes this to ''
    fireEvent.blur(input);
    expect(onReorder).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
  });

  it('does nothing when the typed position is the current one, but resets the field', () => {
    const { onReorder } = setup();
    const input = typeAndBlur('Bravo', '2');
    expect(onReorder).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
  });

  it('resets the field to the real position after a move request (the parent decides the order)', () => {
    const { onReorder } = setup();
    const input = typeAndBlur('Alpha', '3');
    expect(onReorder).toHaveBeenCalledTimes(1);
    // Props did not change, so the row is still first and shows 1.
    expect(input).toHaveValue(1);
  });

  it('truncates a decimal entry like parseInt does', () => {
    const { onReorder } = setup();
    typeAndBlur('Alpha', '2.9');
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('announces a position-input move', () => {
    setup();
    typeAndBlur('Alpha', '2');
    expect(screen.getByRole('status')).toHaveTextContent('Alpha moved to position 2 of 3');
  });

  it('shows the new numbers when the parent re-renders with a new order', () => {
    const onReorder = vi.fn();
    const { rerender } = render(<SetListReorderList setLists={LISTS} onReorder={onReorder} />);
    rerender(<SetListReorderList setLists={[LISTS[2], LISTS[0], LISTS[1]]} onReorder={onReorder} />);
    expect(position('Charlie')).toHaveValue(1);
    expect(position('Alpha')).toHaveValue(2);
    expect(position('Bravo')).toHaveValue(3);
  });
});

describe('SetListReorderList drag and drop', () => {
  it('marks only the grips as draggable', () => {
    setup();
    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(3);
    for (const row of rows()) expect(row).not.toHaveAttribute('draggable');
  });

  it('drops a dragged row onto another row and reports the new order', () => {
    const { onReorder } = setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    fireEvent.dragOver(rows()[2], { dataTransfer: dt });
    fireEvent.drop(rows()[2], { dataTransfer: dt });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('drags upward too', () => {
    const { onReorder } = setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[2]), { dataTransfer: dt });
    fireEvent.drop(rows()[0], { dataTransfer: dt });
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('sets drag data and the drag image on start (Firefox needs the data)', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[1]), { dataTransfer: dt });
    expect(dt.effectAllowed).toBe('move');
    expect(dt.setData).toHaveBeenCalledWith('text/plain', 'b');
    expect(dt.setDragImage).toHaveBeenCalledWith(rows()[1], 0, 0);
  });

  it('dims the dragged row and highlights the row under it', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    expect(rows()[0].className).toContain('opacity-50');
    fireEvent.dragOver(rows()[1], { dataTransfer: dt });
    expect(rows()[1].className).toContain('ring-2');
    expect(rows()[0].className).not.toContain('ring-2'); // the dragged row itself is never the target
    fireEvent.dragOver(rows()[0], { dataTransfer: dt });
    expect(rows()[0].className).not.toContain('ring-2');
  });

  it('clears the highlight when the pointer leaves the row', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    fireEvent.dragOver(rows()[1], { dataTransfer: dt });
    expect(rows()[1].className).toContain('ring-2');
    dragLeave(rows()[1], document.body);
    expect(rows()[1].className).not.toContain('ring-2');
  });

  it('clears the highlight when the drag leaves the window (no related target)', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    fireEvent.dragOver(rows()[1], { dataTransfer: dt });
    dragLeave(rows()[1], null);
    expect(rows()[1].className).not.toContain('ring-2');
  });

  it('keeps the highlight when the pointer moves onto a child of the same row', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    fireEvent.dragOver(rows()[1], { dataTransfer: dt });
    dragLeave(rows()[1], within(rows()[1]).getByText('Bravo'));
    expect(rows()[1].className).toContain('ring-2');
  });

  it('clears the drag state on dragEnd without moving anything', () => {
    const { onReorder } = setup();
    const dt = dataTransfer();
    const grip = gripOf(rows()[0]);
    fireEvent.dragStart(grip, { dataTransfer: dt });
    fireEvent.dragOver(rows()[1], { dataTransfer: dt });
    fireEvent.dragEnd(grip);
    expect(rows()[0].className).not.toContain('opacity-50');
    expect(rows()[1].className).not.toContain('ring-2');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('ignores a drag over that did not start on a grip (no preventDefault, no highlight)', () => {
    setup();
    const notPrevented = fireEvent.dragOver(rows()[1]);
    expect(notPrevented).toBe(true); // true = default NOT prevented
    expect(rows()[1].className).not.toContain('ring-2');
  });

  it('prevents default on a drag over while dragging, so the row accepts the drop', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    expect(fireEvent.dragOver(rows()[1], { dataTransfer: dt })).toBe(false);
  });

  it('ignores a drop from outside (no drag started here)', () => {
    const { onReorder } = setup();
    fireEvent.drop(rows()[1]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('dropping a row on itself reports nothing', () => {
    const { onReorder } = setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[1]), { dataTransfer: dt });
    fireEvent.drop(rows()[1], { dataTransfer: dt });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('clears the drag styling after a drop', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    fireEvent.dragOver(rows()[2], { dataTransfer: dt });
    fireEvent.drop(rows()[2], { dataTransfer: dt });
    expect(rows()[0].className).not.toContain('opacity-50');
    expect(rows()[2].className).not.toContain('ring-2');
  });

  it('announces a drag move', () => {
    setup();
    const dt = dataTransfer();
    fireEvent.dragStart(gripOf(rows()[0]), { dataTransfer: dt });
    fireEvent.drop(rows()[2], { dataTransfer: dt });
    expect(screen.getByRole('status')).toHaveTextContent('Alpha moved to position 3 of 3');
  });
});
