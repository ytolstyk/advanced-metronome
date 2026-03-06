import { useRef, useEffect, useState } from 'react';
import type { AppState, InstrumentId, TimeSignature } from '../../types';
import type { Action } from '../../state';
import { INSTRUMENTS } from '../../constants';
import { getTotalBeats } from '../../state';
import { MeasureHeaders } from '../MeasureHeaders/MeasureHeaders';
import { InstrumentRow } from '../InstrumentRow/InstrumentRow';
import './DrumGrid.css';

const CELL_WIDTH = 56;
const GRID_PADDING = 14;
const LABEL_COL_WIDTH = 80;
const GRID_GAP = 4;

interface DrumGridProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

export function DrumGrid({ state, dispatch }: DrumGridProps) {
  const totalBeats = getTotalBeats(state.config.measures);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevBeatRef = useRef(0);
  const [copiedMeasure, setCopiedMeasure] = useState<number | null>(null);

  const handleToggle = (instrument: InstrumentId, beat: number) => {
    dispatch({ type: 'TOGGLE_BEAT', instrument, beat });
  };

  const handleTimeSignatureChange = (
    index: number,
    timeSignature: TimeSignature,
  ) => {
    dispatch({ type: 'SET_TIME_SIGNATURE', measureIndex: index, timeSignature });
  };

  useEffect(() => {
    if (!state.isPlaying || !scrollRef.current) return;
    const container = scrollRef.current;
    const beat = state.currentBeat;
    const isRewind = beat < prevBeatRef.current;
    prevBeatRef.current = beat;
    const beatLeft = GRID_PADDING + LABEL_COL_WIDTH + GRID_GAP + beat * (CELL_WIDTH + GRID_GAP);
    const targetScrollLeft = Math.max(0, beatLeft - container.clientWidth / 2 + CELL_WIDTH / 2);
    container.scrollTo({ left: targetScrollLeft, behavior: isRewind ? 'instant' : 'smooth' });
  }, [state.currentBeat, state.isPlaying]);

  return (
    <div className="drum-grid-scroll" ref={scrollRef}>
      <div
        className="drum-grid"
        style={{
          gridTemplateColumns: `${LABEL_COL_WIDTH}px repeat(${totalBeats}, ${CELL_WIDTH}px)`,
        }}
      >
        <MeasureHeaders
          measures={state.config.measures}
          onTimeSignatureChange={handleTimeSignatureChange}
          copiedMeasure={copiedMeasure}
          onCopyMeasure={(i) => setCopiedMeasure(i === copiedMeasure ? null : i)}
          onPasteMeasure={(to) => {
            if (copiedMeasure !== null) {
              dispatch({ type: 'COPY_MEASURE', from: copiedMeasure, to });
              setCopiedMeasure(null);
            }
          }}
          onDeleteMeasure={(i) => dispatch({ type: 'DELETE_MEASURE', index: i })}
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
    </div>
  );
}
