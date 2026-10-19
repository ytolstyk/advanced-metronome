import { useRef, useState } from 'react';
import type { PendingChoice } from '../bandTypes';
import { activePending } from '../bandUtils';

/**
 * Optimistic per-id choices on top of loaded server data: a choice shows at once and is trusted while
 * its write is in flight and for a short grace period after (the index can lag a refetch), then the
 * server's answer wins (`activePending`). A failed write puts back what was pending before it, but
 * only if no later choice for the same id replaced it meanwhile. Earlier choices whose writes also
 * failed are skipped, and one whose write finished while this one was queued behind it is put back as
 * settled (nothing would settle it again).
 *
 * `fetchedAt` is when the loaded data's fetch STARTED.
 */
export function useOptimisticChoice<T>(fetchedAt: number) {
  const [pending, setPending] = useState<Record<string, PendingChoice<T>>>({});
  const pendingRef = useRef(pending);
  /** The choice each write replaced, and which writes failed: a rollback skips back over failed ones. */
  const replaced = useRef(new WeakMap<PendingChoice<T>, PendingChoice<T> | undefined>());
  const failed = useRef(new WeakSet<PendingChoice<T>>());
  /** When each write finished, for writes that a later choice replaced before they could settle. */
  const finishedAt = useRef(new WeakMap<PendingChoice<T>, number>());
  const commit = (next: Record<string, PendingChoice<T>>) => {
    pendingRef.current = next;
    setPending(next);
  };

  /** The pending choice to show for `id`, or `undefined` when the server's answer should be used. */
  const pendingFor = (id: string): PendingChoice<T> | undefined => activePending(pending[id], fetchedAt);

  /** Whether any write for `id` was made (and not rolled back) in this session. */
  const hasWritten = (id: string): boolean => pendingRef.current[id] !== undefined;

  /** Shows `value` now, runs `write`, and rethrows its failure after restoring the previous state. */
  const run = async (id: string, value: T | null, write: () => Promise<void>): Promise<void> => {
    const before = pendingRef.current[id];
    const mine: PendingChoice<T> = { value, settledAt: null };
    replaced.current.set(mine, before);
    commit({ ...pendingRef.current, [id]: mine });
    try {
      await write();
      finishedAt.current.set(mine, Date.now());
      if (pendingRef.current[id] === mine) commit({ ...pendingRef.current, [id]: { value, settledAt: Date.now() } });
    } catch (e) {
      failed.current.add(mine);
      if (pendingRef.current[id] === mine) {
        let previous: PendingChoice<T> | undefined = before;
        while (previous && failed.current.has(previous)) previous = replaced.current.get(previous);
        const rest = { ...pendingRef.current };
        const finished = previous && finishedAt.current.get(previous);
        if (previous) rest[id] = previous.settledAt === null && finished ? { ...previous, settledAt: finished } : previous;
        else delete rest[id];
        commit(rest);
      }
      throw e;
    }
  };

  return { pendingFor, hasWritten, run };
}
