import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { moveId } from '../../bandUtils';
import { CARD_SURFACE } from './cardStyles';

/** Which control of a row keeps focus after a move: its arrows, or its position box. */
type Control = 'up' | 'down' | 'pos';

/**
 * The owner's reorder view of the set lists. Three ways to move one, so it works with a mouse, a
 * keyboard and a touch screen (the browser's drag and drop does not fire on touch): drag a row by
 * its grip, type a position number (1 = top), or use the up/down buttons. It holds no state about
 * the order itself: every move reports the full new order and the parent re-renders with it.
 */
export function SetListReorderList({
  setLists,
  onReorder,
  label = 'Set list order',
}: {
  /** The rows to order: `name` is what each row shows and what its controls are labelled with. */
  setLists: { id: string; name: string }[];
  onReorder: (ids: string[]) => void;
  /** Accessible name of the list ("Song order" when the rows are songs). */
  label?: string;
}) {
  const ids = setLists.map((s) => s.id);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  // The arrow the user just used: React moves the row in the DOM, which can drop focus, so it is put back.
  const refocus = useRef<{ id: string; control: Control } | null>(null);

  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const controls = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-move]') ?? []);
    const find = (control: Control) =>
      controls.find((el) => el.dataset.move === `${target.id}:${control}` && !(el as HTMLButtonElement).disabled);
    // At the top or bottom the arrow is now disabled, so focus its opposite instead of losing it.
    const fallback = target.control === 'up' ? 'down' : target.control === 'down' ? 'up' : null;
    (find(target.control) ?? (fallback && find(fallback)))?.focus();
  });

  const moveToIndex = (from: number, to: number) => {
    const next = moveId(ids, from, to);
    const landed = next.indexOf(ids[from]);
    if (landed === from) {
      refocus.current = null; // nothing re-renders, so a stale target would steal focus later
      return;
    }
    setAnnouncement(`${setLists[from].name} moved to position ${landed + 1} of ${ids.length}`);
    onReorder(next);
  };
  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  return (
    <>
      <ol ref={listRef} className="grid gap-2" aria-label={label}>
        {setLists.map((setList, index) => (
          <li
            key={setList.id}
            onDragOver={(e) => {
              if (dragId === null) return;
              e.preventDefault();
              setOverId(setList.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragId === null ? -1 : ids.indexOf(dragId);
              endDrag();
              if (from >= 0) moveToIndex(from, index);
            }}
            className={cn(
              'flex min-h-12 items-center gap-2 rounded-lg px-2 text-foreground',
              CARD_SURFACE,
              dragId === setList.id && 'opacity-50',
              overId === setList.id && dragId !== setList.id && 'ring-2 ring-ring',
            )}
          >
            {/* Only the grip is draggable: a draggable ancestor stops Firefox placing a caret in the number input. */}
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', setList.id); // Firefox only starts a drag with data set
                const row = e.currentTarget.closest('li');
                if (row) e.dataTransfer.setDragImage(row, 0, 0);
                setDragId(setList.id);
              }}
              onDragEnd={endDrag}
              className="shrink-0 cursor-grab p-1 text-muted-foreground"
              title="Drag to reorder"
            >
              <GripVertical size={18} aria-hidden />
            </span>
            <Input
              // Uncontrolled: re-keyed on the position so it shows the new number after a move.
              key={index}
              type="number"
              min={1}
              max={setLists.length}
              defaultValue={index + 1}
              data-move={`${setList.id}:pos`}
              aria-label={`Position of ${setList.name}`}
              className="w-14 shrink-0 px-2 text-center"
              onBlur={(e) => {
                const typed = Number.parseInt(e.currentTarget.value, 10);
                e.currentTarget.value = String(index + 1); // shows the real position again if nothing moved
                if (Number.isNaN(typed)) refocus.current = null; // nothing will move, so no focus to restore
                else moveToIndex(index, typed - 1); // out of range clamps to the top or bottom
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                refocus.current = { id: setList.id, control: 'pos' }; // the move re-keys this input; focus follows it
                e.currentTarget.blur();
              }}
            />
            <span className="min-w-0 flex-1 truncate">{setList.name}</span>
            <Button
              variant="ghost"
              size="icon"
              disabled={index === 0}
              data-move={`${setList.id}:up`}
              onClick={() => {
                refocus.current = { id: setList.id, control: 'up' };
                moveToIndex(index, index - 1);
              }}
              aria-label={`Move ${setList.name} up`}
            >
              <ArrowUp size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={index === setLists.length - 1}
              data-move={`${setList.id}:down`}
              onClick={() => {
                refocus.current = { id: setList.id, control: 'down' };
                moveToIndex(index, index + 1);
              }}
              aria-label={`Move ${setList.name} down`}
            >
              <ArrowDown size={16} aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">{announcement}</p>
    </>
  );
}
