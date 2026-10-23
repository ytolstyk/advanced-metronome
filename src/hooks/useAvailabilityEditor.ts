import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AvailabilityBlockedError, deleteMyAvailabilityWithin, saveMyAvailability } from '../api/availabilityApi';
import type { AvailabilityRead, BandRecord } from '../bandTypes';
import { applyEdits, isSlotEditable } from '../availabilitySlots';
import { NO_ROW_READ, blockReasonOf, classifyOwnRow, type SaveBlockReason } from '../availabilityUtils';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type AvailabilityEditorState = ReturnType<typeof useAvailabilityEditor>;

const AUTOSAVE_MS = 800;
const SAVE_FAILED = 'Could not save your availability. Please try again.';
const DELETE_FAILED = 'Could not delete your availability. Please try again.';

interface Options {
  band: BandRecord;
  sub: string;
  /** The caller's stored row as last loaded, and when that load started. */
  ownRead: AvailabilityRead;
  fetchedAt: number;
  /** Nothing is written until the person has seen what saving shares. */
  disclosureAccepted: boolean;
  nowMs: number;
  debounceMs?: number;
}

const sameEdits = (a: ReadonlyMap<number, boolean>, b: ReadonlyMap<number, boolean>): boolean =>
  a.size === b.size && [...a].every(([slot, mark]) => b.get(slot) === mark);

/**
 * The caller's own availability while they edit it. What is shown is the stored row with the
 * unsaved edits laid over it, so a background refetch can never wipe an edit.
 *
 * - The stored row has ONE source: the loader's, unless our own save or delete finished after that
 *   load began (`override`), in which case ours wins. There is no copy to keep in sync.
 * - A save only clears the edits it actually sent: a slot toggled again meanwhile stays pending.
 * - Edits that equal what is stored are dropped, so toggling a slot on and off sends nothing.
 * - Nothing is written (autosave, retry, or the flush when the page hides or unmounts) before the
 *   disclosure is accepted, and none while a delete is running.
 * - "Delete my availability" cancels everything pending first, so a queued save can't bring it back.
 *
 * Refs hold what async callbacks need to read at the time they run; state is what renders. (This is
 * not `useOptimisticChoice`: edits here are batched per slot and saved after a pause, not per click.)
 */
export function useAvailabilityEditor({
  band,
  sub,
  ownRead,
  fetchedAt,
  disclosureAccepted,
  nowMs,
  debounceMs = AUTOSAVE_MS,
}: Options) {
  const [override, setOverride] = useState<{ read: AvailabilityRead; at: number } | null>(null);
  const [pending, setPending] = useState<ReadonlyMap<number, boolean>>(() => new Map());
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [replacedUnreadable, setReplacedUnreadable] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pendingRef = useRef(pending);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const unmountedRef = useRef(false);

  // Our own save/delete wins over a load that began before it finished. It also wins over a load whose
  // read of our row FAILED: the client holds the row it just wrote, and blocking editing on a flaky
  // refresh would strand the edits queued meanwhile. (With no override, a failed read does block.)
  const read = override && (override.at >= fetchedAt || ownRead.status === 'failed') ? override.read : ownRead;
  const ownState = useMemo(() => classifyOwnRow(read, band, sub), [read, band, sub]);
  const blocked: SaveBlockReason | null = blockReasonOf(ownState);
  const base = useMemo(() => (ownState.kind === 'ok' ? ownState.parsed.free : new Set<number>()), [ownState]);
  const free = useMemo(() => applyEdits(base, pending, nowMs), [base, pending, nowMs]);
  const canWrite = disclosureAccepted && !blocked && !deleting;

  // What async callbacks (save, the unmount flush) read when they run, not when they were created.
  const latest = useRef({ base, nowMs, canWrite, band });
  useEffect(() => {
    latest.current = { base, nowMs, canWrite, band };
  });

  const setEdits = useCallback((next: ReadonlyMap<number, boolean>) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  /** Marks (or unmarks) slots. Ignored while editing is blocked, a delete runs, or for slots that started. */
  const setSlots = useCallback(
    (slots: Iterable<number>, mark: boolean) => {
      if (blocked || deletingRef.current) return;
      const next = new Map(pendingRef.current);
      for (const slot of slots) {
        if (!isSlotEditable(slot, latest.current.nowMs)) continue;
        // Back to what is stored: nothing to send. (While a save runs the stored row is about to
        // change, so the entry stays and is compared by value when the save finishes.)
        if (!savingRef.current && latest.current.base.has(slot) === mark) next.delete(slot);
        else next.set(slot, mark);
      }
      if (sameEdits(next, pendingRef.current)) return;
      setEdits(next);
      setStatus(next.size > 0 ? 'dirty' : savingRef.current ? 'saving' : 'idle');
      setError(null);
    },
    [blocked, setEdits],
  );

  const save = useCallback(async () => {
    const snapshot = new Map(pendingRef.current);
    if (snapshot.size === 0 || savingRef.current || deletingRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    setError(null);
    try {
      const saved = await saveMyAvailability(latest.current.band, snapshot);
      setOverride({ read: { status: 'ok', row: saved.row }, at: Date.now() });
      if (saved.reset) setReplacedUnreadable(true);
      // Clear only what was sent and not changed since (compared by value, not just by slot).
      const remaining = new Map(pendingRef.current);
      for (const [slot, mark] of snapshot) if (remaining.get(slot) === mark) remaining.delete(slot);
      setEdits(remaining);
      setStatus(remaining.size > 0 ? 'dirty' : 'saved');
      // The page was left while this save ran: edits made after it started would otherwise be lost.
      if (unmountedRef.current && remaining.size > 0 && latest.current.canWrite) {
        saveMyAvailability(latest.current.band, remaining).catch((e) => console.warn('Could not save leftover availability edits', e));
      }
    } catch (e) {
      console.warn('Could not save availability', e);
      setError(e instanceof AvailabilityBlockedError ? 'Your times can’t be saved right now.' : SAVE_FAILED);
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [setEdits]);

  // Autosave after a pause. An error stops it so a failing save can't loop; a new edit (which
  // re-marks the status "dirty") or an explicit retry starts it again. Saving a batch swaps in a new
  // `pending` map, and that new identity is what re-arms this effect for edits queued meanwhile.
  useEffect(() => {
    if (pending.size === 0 || !canWrite || status === 'saving' || status === 'error') return;
    const timer = setTimeout(() => void save(), debounceMs);
    return () => clearTimeout(timer);
  }, [pending, canWrite, status, save, debounceMs]);

  const retry = useCallback(() => {
    if (canWrite) void save();
  }, [canWrite, save]);

  // Edits not yet saved warn before the page goes away.
  const hasPending = pending.size > 0;
  useEffect(() => {
    if (!hasPending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPending]);

  // Best-effort flush when the tab is hidden or the page unmounts (same gates as autosave).
  useEffect(() => {
    // StrictMode runs this effect's cleanup and then the effect again while still mounted.
    unmountedRef.current = false;
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && latest.current.canWrite) void save();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      unmountedRef.current = true;
      if (latest.current.canWrite && pendingRef.current.size > 0 && !savingRef.current && !deletingRef.current) {
        saveMyAvailability(latest.current.band, new Map(pendingRef.current)).catch((e) =>
          console.warn('Could not save availability on leaving', e),
        );
      }
    };
  }, [save]);

  /** Deletes the caller's row, dropping pending edits first. Rejects (for the confirm dialog to show) if it is not gone. */
  const removeAll = useCallback(async () => {
    deletingRef.current = true;
    setDeleting(true);
    setEdits(new Map());
    setError(null);
    try {
      await deleteMyAvailabilityWithin(band.id);
      setOverride({ read: NO_ROW_READ, at: Date.now() });
      setReplacedUnreadable(false);
      setStatus('idle');
    } catch (e) {
      console.warn('Could not delete availability', e);
      setStatus('idle');
      throw new Error(DELETE_FAILED);
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [band.id, setEdits]);

  const storedRow = read.status === 'ok' ? read.row : null;
  return {
    /** Slots shown as free: the stored marks with unsaved edits applied. */
    free,
    setSlots,
    status,
    error,
    retry,
    removeAll,
    deleting,
    /** Why editing is off, or `null`. */
    blocked,
    /** The stored row can't be read and will be replaced by the next save. */
    willReplaceUnreadable: ownState.kind === 'invalid',
    replacedUnreadable,
    hasUnsavedEdits: hasPending,
    /** Server time of the last save (advisory). */
    lastSaved: storedRow ? (storedRow.updatedAt ?? storedRow.createdAt ?? null) : null,
    hasRow: storedRow !== null,
  };
}
