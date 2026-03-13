import { useRef, useEffect, useState } from "react";
import type { AppState, InstrumentId, TimeSignature } from "../../types";
import type { Action } from "../../state";
import { INSTRUMENTS } from "../../constants";
import { getTotalBeats } from "../../state";
import { MeasureHeaders } from "../MeasureHeaders/MeasureHeaders";
import { InstrumentRow } from "../InstrumentRow/InstrumentRow";
import { ChordRow } from "../ChordRow/ChordRow";
import type { ChordBeat } from "../../types";
import type { RootNote, ChordType } from "../../data/chords";
import "./DrumGrid.css";

const CELL_WIDTH = 60;
const GRID_PADDING = 14;
const LABEL_COL_WIDTH = 80;
const GRID_GAP = 4;

interface DrumGridProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onPreviewChord: (root: RootNote, type: ChordType) => void;
  onPreviewDrum: (instrumentId: string) => void;
}

export function DrumGrid({ state, dispatch, onPreviewChord, onPreviewDrum }: DrumGridProps) {
  const totalBeats = getTotalBeats(state.config.measures);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevBeatRef = useRef(0);
  const targetScrollRef = useRef(0);
  const [copiedMeasure, setCopiedMeasure] = useState<number | null>(null);

  const handleToggle = (instrument: InstrumentId, beat: number) => {
    const isCurrentlyActive = state.pattern[instrument][beat];
    dispatch({ type: "TOGGLE_BEAT", instrument, beat });
    if (!isCurrentlyActive) {
      onPreviewDrum(instrument);
    }
  };

  const handleTimeSignatureChange = (
    index: number,
    timeSignature: TimeSignature,
  ) => {
    dispatch({
      type: "SET_TIME_SIGNATURE",
      measureIndex: index,
      timeSignature,
    });
  };

  // Update the scroll target whenever the beat changes.
  // Instant-snap on rewind (loop restart); otherwise just move the target
  // and let the continuous loop below chase it smoothly.
  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const beat = state.currentBeat;
    const isRewind = beat < prevBeatRef.current;
    prevBeatRef.current = beat;

    const beatLeft =
      GRID_PADDING +
      LABEL_COL_WIDTH +
      GRID_GAP +
      beat * (CELL_WIDTH + GRID_GAP);
    const target = Math.max(
      0,
      beatLeft - container.clientWidth / 2 + CELL_WIDTH / 2,
    );
    targetScrollRef.current = target;

    if (isRewind) {
      container.scrollLeft = target;
    }
  }, [state.currentBeat]);

  // Single persistent RAF loop while playing — exponential lerp toward target.
  // One loop for all speeds: no per-beat start/cancel, no animation overlap.
  useEffect(() => {
    if (!state.isPlaying) return;
    if (scrollRef.current) {
      targetScrollRef.current = scrollRef.current.scrollLeft;
    }

    let rafId: number;
    const tick = () => {
      const el = scrollRef.current;
      if (el) {
        const diff = targetScrollRef.current - el.scrollLeft;
        if (Math.abs(diff) > 0.5) {
          el.scrollLeft += diff * 0.2;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [state.isPlaying]);

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
          onCopyMeasure={(i) =>
            setCopiedMeasure(i === copiedMeasure ? null : i)
          }
          onPasteMeasure={(to) => {
            if (copiedMeasure !== null) {
              dispatch({ type: "COPY_MEASURE", from: copiedMeasure, to });
              setCopiedMeasure(null);
            }
          }}
          onDeleteMeasure={(i) =>
            dispatch({ type: "DELETE_MEASURE", index: i })
          }
        />
        <div className="beat-count-spacer" />
        {(() => {
          const cells: {
            label: string;
            kind: "beat" | "half" | "triplet" | "quarter";
            measureStart: boolean;
          }[] = [];
          for (const [mi, m] of state.config.measures.entries()) {
            const spb = m.timeSignature.stepsPerBeat ?? 1;
            for (let b = 0; b < m.timeSignature.beats; b++) {
              for (let s = 0; s < spb; s++) {
                const measureStart = mi > 0 && b === 0 && s === 0;
                if (s === 0) {
                  cells.push({
                    label: String(b + 1),
                    kind: "beat",
                    measureStart,
                  });
                } else if (spb === 2) {
                  cells.push({ label: "+", kind: "half", measureStart: false });
                } else if (spb === 4) {
                  const subLabels = ["e", "+", "a"] as const;
                  cells.push({
                    label: subLabels[s - 1],
                    kind: "quarter",
                    measureStart: false,
                  });
                } else {
                  cells.push({
                    label: "·",
                    kind: "triplet",
                    measureStart: false,
                  });
                }
              }
            }
          }
          return cells.map(({ label, kind, measureStart }, i) => (
            <div
              key={i}
              className={[
                "beat-count-cell",
                kind !== "beat" ? `beat-count-cell--${kind}` : "",
                measureStart ? "beat-count-cell--measure-start" : "",
                state.isPlaying && state.currentBeat === i
                  ? "beat-count-cell--active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {label}
            </div>
          ));
        })()}
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
        <ChordRow
          chordPattern={state.chordPattern}
          measures={state.config.measures}
          currentBeat={state.currentBeat}
          isPlaying={state.isPlaying}
          onSetChord={(beat, chord: ChordBeat | null) =>
            dispatch({ type: "SET_CHORD_BEAT", beat, chord })
          }
          onPreviewChord={onPreviewChord}
        />
      </div>
    </div>
  );
}
