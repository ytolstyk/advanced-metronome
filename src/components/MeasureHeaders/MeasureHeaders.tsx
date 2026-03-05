import { useState } from 'react';
import type { Measure, TimeSignature } from '../../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import './MeasureHeaders.css';

const MIN_BEATS = 1;
const MAX_BEATS = 32;
const MIN_SUBDIV = 1;
const MAX_SUBDIV = 64;

interface MeasureHeaderCellProps {
  measure: Measure;
  index: number;
  onTimeSignatureChange: (index: number, ts: TimeSignature) => void;
  isCopySource: boolean;
  copyActive: boolean;
  onCopy: () => void;
  onPaste: () => void;
}

function MeasureHeaderCell({
  measure,
  index,
  onTimeSignatureChange,
  isCopySource,
  copyActive,
  onCopy,
  onPaste,
}: MeasureHeaderCellProps) {
  const { beats, subdivision, stepsPerBeat = 1 } = measure.timeSignature;

  const [beatsDraft, setBeatsDraft] = useState('');
  const [beatsFocused, setBeatsFocused] = useState(false);
  const [subdivDraft, setSubdivDraft] = useState('');
  const [subdivFocused, setSubdivFocused] = useState(false);

  const commitBeats = () => {
    const parsed = parseInt(beatsDraft, 10);
    const clamped = isNaN(parsed) ? beats : Math.min(MAX_BEATS, Math.max(MIN_BEATS, parsed));
    onTimeSignatureChange(index, { beats: clamped, subdivision, stepsPerBeat });
  };

  const commitSubdiv = () => {
    const parsed = parseInt(subdivDraft, 10);
    const clamped = isNaN(parsed) ? subdivision : Math.min(MAX_SUBDIV, Math.max(MIN_SUBDIV, parsed));
    onTimeSignatureChange(index, { beats, subdivision: clamped, stepsPerBeat });
  };

  return (
    <div
      className={['measure-header', isCopySource ? 'measure-header--copy-source' : ''].filter(Boolean).join(' ')}
      style={{ gridColumn: `span ${beats * stepsPerBeat}` }}
    >
      <span className="measure-number">M{index + 1}</span>
      <div className="time-sig-inputs">
        <Input
          type="number"
          className="w-[34px] h-6 px-1 text-center text-[0.85rem] font-bold bg-secondary border-border [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          title="Beats per measure"
          min={MIN_BEATS}
          max={MAX_BEATS}
          value={beatsFocused ? beatsDraft : String(beats)}
          onChange={(e) => setBeatsDraft(e.target.value)}
          onFocus={() => { setBeatsDraft(String(beats)); setBeatsFocused(true); }}
          onBlur={() => { setBeatsFocused(false); commitBeats(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitBeats(); (e.target as HTMLInputElement).blur(); }
          }}
        />
        <span className="time-sig-sep">/</span>
        <Input
          type="number"
          className="w-[34px] h-6 px-1 text-center text-[0.85rem] font-bold bg-secondary border-border [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          title="Subdivision (note value)"
          min={MIN_SUBDIV}
          max={MAX_SUBDIV}
          value={subdivFocused ? subdivDraft : String(subdivision)}
          onChange={(e) => setSubdivDraft(e.target.value)}
          onFocus={() => { setSubdivDraft(String(subdivision)); setSubdivFocused(true); }}
          onBlur={() => { setSubdivFocused(false); commitSubdiv(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitSubdiv(); (e.target as HTMLInputElement).blur(); }
          }}
        />
      </div>
      <ToggleGroup
        type="single"
        value={String(stepsPerBeat)}
        onValueChange={(val) => {
          if (val) onTimeSignatureChange(index, { beats, subdivision, stepsPerBeat: Number(val) as 1 | 2 | 3 });
        }}
        className="gap-0 border border-border rounded-md overflow-hidden"
      >
        {([1, 2, 3] as const).map((n) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            className="rounded-none h-6 px-1.5 text-[0.72rem] font-bold min-w-0 data-[state=on]:bg-[#363880] data-[state=on]:text-[#c0c4ff]"
            title={n === 1 ? 'Straight' : n === 2 ? 'Half beats' : 'Triplets'}
          >
            {n === 1 ? '1' : n === 2 ? '½' : '⅓'}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="measure-header-actions">
        {copyActive && !isCopySource ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[0.68rem] font-bold uppercase tracking-wider text-green-400 hover:text-green-300 hover:bg-[#1e3428]"
            title="Paste pattern here"
            onClick={onPaste}
          >
            paste
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[0.68rem] font-bold uppercase tracking-wider ${
              isCopySource
                ? 'text-[#8080ff] bg-[#242456] border border-primary'
                : 'text-muted-foreground'
            }`}
            title={isCopySource ? 'Cancel copy' : 'Copy pattern'}
            onClick={onCopy}
          >
            copy
          </Button>
        )}
      </div>
    </div>
  );
}

interface MeasureHeadersProps {
  measures: Measure[];
  onTimeSignatureChange: (index: number, ts: TimeSignature) => void;
  copiedMeasure: number | null;
  onCopyMeasure: (index: number) => void;
  onPasteMeasure: (index: number) => void;
}

export function MeasureHeaders({
  measures,
  onTimeSignatureChange,
  copiedMeasure,
  onCopyMeasure,
  onPasteMeasure,
}: MeasureHeadersProps) {
  return (
    <>
      <div className="measure-header-spacer" />
      {measures.map((measure, i) => (
        <MeasureHeaderCell
          key={i}
          measure={measure}
          index={i}
          onTimeSignatureChange={onTimeSignatureChange}
          isCopySource={copiedMeasure === i}
          copyActive={copiedMeasure !== null}
          onCopy={() => onCopyMeasure(i)}
          onPaste={() => onPasteMeasure(i)}
        />
      ))}
    </>
  );
}
