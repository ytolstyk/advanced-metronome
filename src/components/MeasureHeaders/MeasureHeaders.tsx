import { useState } from 'react';
import type { Measure, TimeSignature } from '../../types';
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
  const { beats, subdivision } = measure.timeSignature;

  const [beatsDraft, setBeatsDraft] = useState('');
  const [beatsFocused, setBeatsFocused] = useState(false);
  const [subdivDraft, setSubdivDraft] = useState('');
  const [subdivFocused, setSubdivFocused] = useState(false);

  const commitBeats = () => {
    const parsed = parseInt(beatsDraft, 10);
    const clamped = isNaN(parsed) ? beats : Math.min(MAX_BEATS, Math.max(MIN_BEATS, parsed));
    onTimeSignatureChange(index, { beats: clamped, subdivision });
  };

  const commitSubdiv = () => {
    const parsed = parseInt(subdivDraft, 10);
    const clamped = isNaN(parsed) ? subdivision : Math.min(MAX_SUBDIV, Math.max(MIN_SUBDIV, parsed));
    onTimeSignatureChange(index, { beats, subdivision: clamped });
  };

  return (
    <div
      className={['measure-header', isCopySource ? 'measure-header--copy-source' : ''].filter(Boolean).join(' ')}
      style={{ gridColumn: `span ${beats}` }}
    >
      <span className="measure-number">M{index + 1}</span>
      <div className="time-sig-inputs">
        <input
          type="number"
          className="time-sig-input"
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
        <input
          type="number"
          className="time-sig-input"
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
      <div className="measure-header-actions">
        {copyActive && !isCopySource ? (
          <button
            type="button"
            className="measure-action-btn measure-action-btn--paste"
            title="Paste pattern here"
            onClick={onPaste}
          >
            paste
          </button>
        ) : (
          <button
            type="button"
            className={['measure-action-btn', isCopySource ? 'measure-action-btn--active' : ''].filter(Boolean).join(' ')}
            title={isCopySource ? 'Cancel copy' : 'Copy pattern'}
            onClick={onCopy}
          >
            copy
          </button>
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
