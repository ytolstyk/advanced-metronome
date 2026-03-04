import type { AppState, InstrumentId, TimeSignature } from '../../types';
import type { Action } from '../../state';
import { INSTRUMENTS } from '../../constants';
import { getTotalBeats } from '../../state';
import { MeasureHeaders } from '../MeasureHeaders/MeasureHeaders';
import { InstrumentRow } from '../InstrumentRow/InstrumentRow';
import './DrumGrid.css';

interface DrumGridProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

export function DrumGrid({ state, dispatch }: DrumGridProps) {
  const totalBeats = getTotalBeats(state.config.measures);

  const handleToggle = (instrument: InstrumentId, beat: number) => {
    dispatch({ type: 'TOGGLE_BEAT', instrument, beat });
  };

  const handleTimeSignatureChange = (
    index: number,
    timeSignature: TimeSignature,
  ) => {
    dispatch({ type: 'SET_TIME_SIGNATURE', measureIndex: index, timeSignature });
  };

  return (
    <div
      className="drum-grid"
      style={{
        gridTemplateColumns: `80px repeat(${totalBeats}, 1fr)`,
      }}
    >
      <MeasureHeaders
        measures={state.config.measures}
        onTimeSignatureChange={handleTimeSignatureChange}
      />
      {INSTRUMENTS.map((instrument) => (
        <InstrumentRow
          key={instrument.id}
          instrument={instrument}
          beats={state.pattern[instrument.id]}
          measures={state.config.measures}
          currentBeat={state.currentBeat}
          isPlaying={state.isPlaying}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
