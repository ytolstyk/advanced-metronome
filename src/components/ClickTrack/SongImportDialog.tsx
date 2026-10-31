import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { TrackPiece } from '@/audio/ClickTrackEngine';
import { MAX_MEASURES } from '@/constants';
import {
  barsToPieces,
  importScoreFile,
  maxRoundingErrorPercent,
  pluralize,
  type ImportedSong,
  type PlayedBar,
} from '@/utils/scoreToClickTrack';

type Outcome = { file: File; id: number; value: { error: string } | ImportedSong };

const PREVIEW_SEGMENTS = 8;
let nextOutcomeId = 0;

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

interface SongImportDialogProps {
  /** The picked file. The dialog is open while this is set and reads it as soon as it changes. */
  file: File | null;
  /** Decides between "Import" and "Replace track". */
  trackIsEmpty: boolean;
  /** Called with the segments; the page decides whether to confirm and how to replace its state. */
  onAccept: (pieces: TrackPiece[]) => void;
  onClose: () => void;
}

export function SongImportDialog({ file, trackIsEmpty, onAccept, onClose }: SongImportDialogProps) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Keep rendering the last file while the dialog fades out, instead of flashing "Reading…" once `file` is cleared.
  const [shown, setShown] = useState<File | null>(file);
  if (file && file !== shown) setShown(file);

  useEffect(() => {
    if (!file) return;
    let stale = false;
    void (async () => {
      // Let "Reading…" paint before the synchronous parse and tick-lookup expansion: the effect runs
      // before the first paint, so wait for a frame and then for the task after it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (stale) return;
      let value: Outcome['value'];
      try {
        value = await importScoreFile(file);
      } catch {
        value = { error: 'Something went wrong while reading that file.' };
      }
      if (!stale) setOutcome({ file, id: ++nextOutcomeId, value });
    })();
    return () => {
      stale = true;
    };
  }, [file]);

  // The result only counts while it belongs to the current file; otherwise we are still reading.
  const current = shown && outcome?.file === shown ? outcome : null;

  return (
    <Dialog open={file !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import tempo map</DialogTitle>
          <DialogDescription className="break-all">{shown?.name ?? ''}</DialogDescription>
        </DialogHeader>
        {!current && <p className="text-sm text-muted-foreground" role="status">Reading {shown?.name}…</p>}
        {current && 'error' in current.value && (
          <>
            <p className="text-sm text-red-400" role="alert">{current.value.error}</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}
        {current && 'bars' in current.value && (
          <ImportPreview
            key={current.id}
            imported={current.value}
            trackIsEmpty={trackIsEmpty}
            onAccept={onAccept}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportPreview({ imported, trackIsEmpty, onAccept, onClose }: {
  imported: ImportedSong;
  trackIsEmpty: boolean;
  onAccept: (pieces: TrackPiece[]) => void;
  onClose: () => void;
}) {
  const { bars, meta, warnings: importWarnings } = imported;
  const [skipPickup, setSkipPickup] = useState(false);
  const built = useMemo(
    () => barsToPieces(bars, meta, { includePickup: !skipPickup }),
    [bars, meta, skipPickup],
  );
  const pickup = bars[0]?.isPickup ? bars[0] : null;
  const heading = [meta.title, meta.artist].filter(Boolean).join(' – ');

  if ('error' in built) {
    return (
      <>
        <p className="text-sm text-red-400" role="alert">{built.error}</p>
        {pickup && <PickupToggle pickup={pickup} skipPickup={skipPickup} onChange={setSkipPickup} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  const { pieces, stats } = built;
  const warnings = [...importWarnings, ...built.warnings];
  const expanded = importWarnings.some((w) => w.code === 'repeats-expanded');
  const tempo = stats.bpmMin === stats.bpmMax ? `${stats.bpmMin}` : `${stats.bpmMin}–${stats.bpmMax}`;
  const hasEighthOrFiner = stats.finestDenominator >= 8;

  return (
    <>
      <div className="space-y-3 text-sm">
        {heading && <p className="font-medium break-words">{heading}</p>}
        <p>
          {pluralize(stats.playedBars, 'bar')}
          {expanded && ` (${stats.writtenBars} written)`}, {pluralize(stats.segments, 'segment')},
          {' '}♩ {tempo}, {stats.signatures.join(' ')}, {formatDuration(stats.seconds)} at 100% speed.
        </p>
        <p className="text-xs text-muted-foreground">
          Tempos are rounded to whole BPM, so the total length can differ from the recording by up to about {maxRoundingErrorPercent(stats.bpmMin).toFixed(1)}%.
          Bar numbers count the repeat-expanded song{pickup ? ', including the pickup' : ''}.
        </p>

        <ul className="space-y-1" aria-label="First segments">
          {pieces.slice(0, PREVIEW_SEGMENTS).map((piece) => (
            <li key={piece.id} className="flex items-center gap-2 break-words">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: piece.color }} aria-hidden />
              <span>{piece.label} × {piece.repeats}</span>
            </li>
          ))}
          {pieces.length > PREVIEW_SEGMENTS && (
            <li className="text-muted-foreground">…and {pieces.length - PREVIEW_SEGMENTS} more</li>
          )}
        </ul>

        {pickup && <PickupToggle pickup={pickup} skipPickup={skipPickup} onChange={setSkipPickup} />}

        {(warnings.length > 0 || meta.hasGradualTempo) && (
          <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200" aria-label="Import notes">
            {warnings.map((w) => <li key={w.code}>{w.message}</li>)}
            {meta.hasGradualTempo && <li>Gradual tempo changes (accelerando or ritardando) are imported as steps.</li>}
          </ul>
        )}

        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {hasEighthOrFiner && <li>Bars in /8 or /16 click on every eighth or sixteenth, so a 6/8 bar clicks six times.</li>}
          {pickup && <li>The page&apos;s count-in is separate from a pickup bar; turn it off if the pickup is your lead-in.</li>}
          <li>Sending a long imported track to the drum machine keeps only its first {MAX_MEASURES} measures.</li>
        </ul>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onAccept(pieces)}>{trackIsEmpty ? 'Import' : 'Replace track'}</Button>
      </DialogFooter>
    </>
  );
}

function PickupToggle({ pickup, skipPickup, onChange }: { pickup: PlayedBar; skipPickup: boolean; onChange: (skip: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={skipPickup} onChange={(e) => onChange(e.target.checked)} />
      Skip the {pickup.numerator}/{pickup.denominator} pickup bar at the start
      <span className="text-xs text-muted-foreground">(bar numbers in the notes still count it)</span>
    </label>
  );
}
