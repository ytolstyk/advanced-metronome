import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { LocalDay } from '../../availabilityCalendar';
import { describeAge } from '../../availabilityUtils';
import type { AvailabilityEditorState as EditorState } from '../../hooks/useAvailabilityEditor';
import { AvailabilityEditor } from './AvailabilityEditor';
import { ConfirmDialog } from './ConfirmDialog';
import { InlineAlert } from './InlineAlert';

interface Props {
  days: LocalDay[];
  todayKey: string;
  dayNote?: (day: LocalDay) => string | null;
  lastVisibleSlot: number;
  timeZone: string;
  nowMs: number;
  editor: EditorState;
  noticeAccepted: boolean;
}

/** One line telling the person where their edits stand. */
function saveStatusText(editor: EditorState, noticeAccepted: boolean, nowMs: number): string | null {
  switch (editor.status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved.';
    case 'dirty':
      return noticeAccepted ? 'Unsaved changes…' : 'Waiting for you to accept the notice above.';
    case 'idle': {
      const age = describeAge(editor.lastSaved, nowMs);
      return editor.hasRow && age ? `Last saved ${age}.` : null;
    }
    default:
      return null;
  }
}

/** The "My times" view: the day's editor, the save status, and deleting everything. */
export function AvailabilityMine({ days, todayKey, dayNote, lastVisibleSlot, timeZone, nowMs, editor, noticeAccepted }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <AvailabilityEditor
        days={days}
        todayKey={todayKey}
        dayNote={dayNote}
        lastVisibleSlot={lastVisibleSlot}
        timeZone={timeZone}
        nowMs={nowMs}
        free={editor.free}
        disabled={editor.blocked !== null || editor.deleting}
        onSetSlots={editor.setSlots}
      />
      <div aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {saveStatusText(editor, noticeAccepted, nowMs)}
      </div>
      {editor.error && (
        <InlineAlert tone="error" className="mt-2">
          {editor.error}{' '}
          {editor.hasUnsavedEdits && (
            <Button variant="link" className="h-auto min-h-11 p-0 align-baseline" onClick={editor.retry}>
              Try again
            </Button>
          )}
        </InlineAlert>
      )}
      <div className="mt-6 border-t border-border pt-4">
        <Button variant="destructive" className="min-h-11" disabled={editor.deleting} onClick={() => setConfirmDelete(true)}>
          {editor.deleting ? 'Deleting…' : 'Delete my availability'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete your availability?"
        description="This removes every time you’ve marked from this band. You can mark new times later."
        confirmLabel="Delete"
        destructive
        onConfirm={editor.removeAll}
      />
    </>
  );
}
