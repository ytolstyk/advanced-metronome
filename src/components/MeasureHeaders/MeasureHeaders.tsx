import type { Measure, TimeSignature } from '../../types';
import { TIME_SIGNATURE_OPTIONS } from '../../constants';
import './MeasureHeaders.css';

interface MeasureHeadersProps {
  measures: Measure[];
  onTimeSignatureChange: (index: number, ts: TimeSignature) => void;
}

export function MeasureHeaders({
  measures,
  onTimeSignatureChange,
}: MeasureHeadersProps) {
  return (
    <>
      <div className="measure-header-spacer" />
      {measures.map((measure, i) => {
        const { beats, subdivision } = measure.timeSignature;
        const value = `${beats}/${subdivision}`;
        return (
          <div
            key={i}
            className="measure-header"
            style={{ gridColumn: `span ${beats}` }}
          >
            <span className="measure-number">M{i + 1}</span>
            <select
              className="time-sig-select"
              value={value}
              onChange={(e) => {
                const [b, s] = e.target.value.split('/').map(Number);
                onTimeSignatureChange(i, { beats: b, subdivision: s });
              }}
            >
              {TIME_SIGNATURE_OPTIONS.map((ts) => (
                <option key={`${ts.beats}/${ts.subdivision}`} value={`${ts.beats}/${ts.subdivision}`}>
                  {ts.beats}/{ts.subdivision}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </>
  );
}
