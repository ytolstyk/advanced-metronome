import { useCallback, useEffect, useState } from 'react';
import { RigBlockedError, RigConflictError, saveMyRig } from '../api/rigApi';
import { errorMessage } from '../lib/errors';
import { hasPendingCleanup } from '../rigData';
import type { MemberRig, RigDraft } from '../rigData';

interface UseRigDraftArgs {
  bandId: string;
  /** The caller's own row as last loaded. */
  own: MemberRig;
  reload: () => Promise<void>;
}

export interface RigDraftState {
  draft: RigDraft;
  dirty: boolean;
  /** Saving would do something: there are edits, or hidden items waiting to be pruned. */
  canSave: boolean;
  /** Why saving isn't possible at all (a newer app wrote the row, or it couldn't be read), else null. */
  blockedReason: string | null;
  /** The stored row is unreadable and will be replaced by the next save. */
  willReplaceUnreadable: boolean;
  saving: boolean;
  error: string | null;
  /** The stored row changed since this editor loaded it. */
  conflict: boolean;
  edit: (fn: (draft: RigDraft) => RigDraft) => void;
  save: () => Promise<void>;
  overwrite: () => Promise<void>;
  /** Throw away local edits and show what is stored. */
  discard: () => Promise<void>;
}

const NEWER_MESSAGE =
  'Your gear and rigs were saved by a newer version of the app, so this version can’t change them. Refresh the page to update.';

const BLOCKED_MESSAGE: Partial<Record<MemberRig['state'], string>> = {
  newer: NEWER_MESSAGE,
  failed: 'Couldn’t read your saved gear and rigs, so saving is off to avoid overwriting them. Try refreshing.',
};

const SAVE_REFUSED_MESSAGE: Record<RigBlockedError['reason'], string> = {
  newer: NEWER_MESSAGE,
  invalid: 'Something in your gear or rigs isn’t valid, so it can’t be saved. Reload the page and try again.',
  'too-big': 'Your gear and rigs are too large to save. Remove some gear or diagrams and try again.',
};

/** A load that actually told us what is stored (a failed read of the own row tells us nothing). */
const isReadable = (own: MemberRig): boolean => own.state === 'ok' || own.state === 'none' || own.state === 'unreadable';

/**
 * The caller's local copy of their gear and rigs. Edits stay local until Save. A background refresh
 * of the page never overwrites a dirty draft: if the stored row moved on meanwhile (`rev` changed)
 * the person is asked what to do instead of being rebased silently.
 *
 * `base` is the draft as last loaded or saved; the draft is dirty exactly when it is no longer that
 * object, so edits made while a save is in flight stay dirty and edits that were saved don't.
 */
export function useRigDraft({ bandId, own, reload }: UseRigDraftArgs): RigDraftState {
  const [draft, setDraft] = useState(own.draft);
  const [base, setBase] = useState(own.draft);
  const [baselineRev, setBaselineRev] = useState(own.rev);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [seen, setSeen] = useState(own);
  const dirty = draft !== base;

  // Adopt freshly loaded data while rendering (the documented alternative to an effect that sets
  // state): a clean draft follows the store, a dirty one only notices that the store moved. A load
  // where our own row couldn't be read says nothing about what is stored, so it changes nothing.
  if (seen !== own) {
    setSeen(own);
    if (isReadable(own)) {
      if (!dirty) {
        setDraft(own.draft);
        setBase(own.draft);
        setBaselineRev(own.rev);
        setConflict(false);
      } else if (own.rev !== baselineRev) {
        setConflict(true);
      }
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const blockedReason = BLOCKED_MESSAGE[own.state] ?? null;
  const willReplaceUnreadable = own.state === 'unreadable';

  const edit = useCallback((fn: (d: RigDraft) => RigDraft) => setDraft(fn), []);

  const run = useCallback(
    async (overwriteStored: boolean) => {
      setSaving(true);
      setError(null);
      let saved = false;
      try {
        const row = await saveMyRig(bandId, draft, { baselineRev, overwrite: overwriteStored || willReplaceUnreadable });
        setBase(draft); // what was just written; anything edited since stays dirty
        setBaselineRev(row.rev);
        setConflict(false);
        saved = true;
      } catch (e) {
        if (e instanceof RigConflictError) setConflict(true);
        else if (e instanceof RigBlockedError) setError(SAVE_REFUSED_MESSAGE[e.reason]);
        else setError(errorMessage(e, 'Couldn’t save. Please try again.'));
      } finally {
        setSaving(false);
      }
      // Refresh in the background: the save already told us the new `rev`, so editing needn't wait
      // for the page's two reload round trips (a refresh that arrives matches that rev: no conflict).
      if (saved) void reload();
    },
    [bandId, draft, baselineRev, willReplaceUnreadable, reload],
  );

  const save = useCallback(() => run(false), [run]);
  const overwrite = useCallback(() => run(true), [run]);
  const discard = useCallback(async () => {
    // Show what was last loaded right away; the reload then refreshes it. Nothing is changed when
    // the last load couldn't read our own row (it would blank the draft).
    if (isReadable(own)) {
      setDraft(own.draft);
      setBase(own.draft);
      setBaselineRev(own.rev);
    }
    setConflict(false);
    setError(null);
    await reload();
  }, [own, reload]);

  return {
    draft,
    dirty,
    canSave: blockedReason === null && !saving && (dirty || hasPendingCleanup(own) || willReplaceUnreadable),
    blockedReason,
    willReplaceUnreadable,
    saving,
    error,
    conflict,
    edit,
    save,
    overwrite,
    discard,
  };
}
