import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AuthGate } from '@/components/AuthGate/AuthGate';
import { TUNINGS } from '@/data/tunings';
import type { StringCount } from '@/data/tunings';
import { buildOpenMidi } from '@/tabEditorState';
import { transcribeGuitarAudio } from '@/api/tabTranscriptionApi';
import { geminiResponseToTabTrack } from '@/utils/transcriptionToTrack';
import { useGuitarRecorder } from '@/hooks/useGuitarRecorder';
import { useMetronome } from '@/hooks/useMetronome';
import type { TabTrack, MasterBar, Measure } from '../../tabEditorTypes';
import './RecordTranscribeModal.css';

const TIME_SIGS = [
  { label: '4/4', num: 4, den: 4 },
  { label: '3/4', num: 3, den: 4 },
  { label: '6/8', num: 6, den: 8 },
  { label: '2/4', num: 2, den: 4 },
  { label: '5/4', num: 5, den: 4 },
  { label: '7/8', num: 7, den: 8 },
];

type Panel = 'setup' | 'recording' | 'review' | 'import' | 'overwrite-confirm';

export interface RecordTranscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTuningName: string;
  defaultOpenMidi: number[];
  defaultStringCount: StringCount;
  defaultBpm: number;
  defaultTimeSigNum: number;
  defaultTimeSigDen: number;
  onInsertAtCursor: (measures: Measure[], masterBars: MasterBar[]) => void;
  onOverwriteTrack: (track: TabTrack) => void;
  hasExistingContent: boolean;
}

export function RecordTranscribeModal({
  open,
  onOpenChange,
  defaultTuningName,
  defaultOpenMidi,
  defaultStringCount,
  defaultBpm,
  defaultTimeSigNum,
  defaultTimeSigDen,
  onInsertAtCursor,
  onOverwriteTrack,
  hasExistingContent,
}: RecordTranscribeModalProps) {
  const [panel, setPanel] = useState<Panel>('setup');

  // Setup state
  const [stringCount, setStringCount] = useState<StringCount>(defaultStringCount);
  const [tuningName, setTuningName] = useState(defaultTuningName);
  const [openMidi, setOpenMidi] = useState(defaultOpenMidi);
  const [bpm, setBpm] = useState(defaultBpm);
  const [timeSigKey, setTimeSigKey] = useState(`${defaultTimeSigNum}/${defaultTimeSigDen}`);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Transcription state — only the resulting track; measures/masterBars derived from it
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribedTrack, setTranscribedTrack] = useState<TabTrack | null>(null);

  const timeSig = TIME_SIGS.find(t => t.label === timeSigKey) ?? TIME_SIGS[0]!;
  const recorder = useGuitarRecorder();
  const metronome = useMetronome(bpm, timeSig);

  // ── Open / close lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      // Resync form state from current editor cursor context on every open.
      // The modal is always-mounted (open prop toggles), so useState defaults only apply
      // at the very first render — without this resync the form shows stale values if the
      // user moves the cursor to a different BPM/time-sig measure between sessions.
      setStringCount(defaultStringCount);
      setTuningName(defaultTuningName);
      setOpenMidi(defaultOpenMidi);
      setBpm(defaultBpm);
      setTimeSigKey(`${defaultTimeSigNum}/${defaultTimeSigDen}`);
      void recorder.open();
    } else {
      metronome.stop();
      recorder.close();
      setPanel('setup');
      setIsTranscribing(false);
      setTranscribeError(null);
      setTranscribedTrack(null);
    }
  // Intentional: only fire on open toggle; individual deps would cause unwanted re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-select first device once enumeration completes
  useEffect(() => {
    if (recorder.audioDevices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(recorder.audioDevices[0]!.deviceId);
    }
  }, [recorder.audioDevices, selectedDeviceId]);

  // ── Tuning helpers ────────────────────────────────────────────────────────
  function handleStringCountChange(sc: StringCount) {
    setStringCount(sc);
    const first = TUNINGS[sc][0]!;
    setTuningName(first.name);
    setOpenMidi(buildOpenMidi(first.name, sc));
  }

  function handleTuningChange(name: string) {
    setTuningName(name);
    setOpenMidi(buildOpenMidi(name, stringCount));
  }

  // ── Recording actions ─────────────────────────────────────────────────────
  async function handleStartRecording() {
    const err = await recorder.start(selectedDeviceId);
    if (!err) setPanel('recording');
  }

  function handleStopRecording() {
    recorder.stop();
    metronome.stop();
    setPanel('review');
  }

  // ── Transcription ─────────────────────────────────────────────────────────
  async function handleTranscribe() {
    if (!recorder.recordedBlob) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      const geminiResult = await transcribeGuitarAudio({
        audioBlob: recorder.recordedBlob,
        tuningName, openMidi, stringCount, bpm,
        timeSigNumerator: timeSig.num,
        timeSigDenominator: timeSig.den,
      });

      if (geminiResult.status === 'no_notes' || geminiResult.measures.length === 0) {
        setTranscribeError('No notes detected. Try recording a clearer passage closer to the microphone.');
        return;
      }

      const track = geminiResponseToTabTrack(
        geminiResult.measures, geminiResult.detectedBpm, tuningName, openMidi,
        stringCount, bpm, { numerator: timeSig.num, denominator: timeSig.den },
      );
      setTranscribedTrack(track);
      setPanel('import');
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Transcription failed. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  }

  // ── Import actions ────────────────────────────────────────────────────────
  function handleInsertAtCursor() {
    if (!transcribedTrack) return;
    onInsertAtCursor(transcribedTrack.measures, transcribedTrack.masterBars);
    onOpenChange(false);
  }

  function handleOverwriteRequest() {
    if (hasExistingContent) setPanel('overwrite-confirm');
    else confirmOverwrite();
  }

  function confirmOverwrite() {
    if (!transcribedTrack) return;
    onOverwriteTrack(transcribedTrack);
    onOpenChange(false);
  }

  // Derived from transcribedTrack — no redundant state
  const detectedBpm = transcribedTrack?.masterBars[0]?.bpm ?? 0;
  const measureCount = transcribedTrack?.measures.length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="record-transcribe-modal">
        <DialogHeader>
          <DialogTitle>Record & Transcribe</DialogTitle>
        </DialogHeader>

        {panel === 'setup' && (
          <div className="rtm-panel">
            <div className="rtm-row">
              <label className="rtm-label">Strings</label>
              <Select
                value={String(stringCount)}
                onValueChange={v => handleStringCountChange(Number(v) as StringCount)}
              >
                <SelectTrigger className="rtm-select-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {([6, 7, 8] as StringCount[]).map(n => (
                    <SelectItem key={n} value={String(n)}>{n}-string</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rtm-row">
              <label className="rtm-label">Tuning</label>
              <Select value={tuningName} onValueChange={handleTuningChange}>
                <SelectTrigger className="rtm-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TUNINGS[stringCount].map(t => (
                    <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rtm-row">
              <label className="rtm-label">Time</label>
              <Select value={timeSigKey} onValueChange={setTimeSigKey}>
                <SelectTrigger className="rtm-select-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SIGS.map(t => (
                    <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rtm-row">
              <label className="rtm-label">BPM <span className="rtm-value">{bpm}</span></label>
              <Slider
                min={40} max={300} step={1}
                value={[bpm]}
                onValueChange={([v]) => setBpm(v!)}
                className="rtm-slider"
              />
            </div>

            {recorder.audioDevices.length > 0 && (
              <div className="rtm-row">
                <label className="rtm-label">Input</label>
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger className="rtm-select"><SelectValue placeholder="Default" /></SelectTrigger>
                  <SelectContent>
                    {recorder.audioDevices.map(d => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rtm-row rtm-metro-row">
              <label className="rtm-label">Metronome</label>
              <button
                className={`rtm-metro-toggle${metronome.isOn ? ' rtm-metro-on' : ''}`}
                onClick={() => metronome.setEnabled(!metronome.isOn)}
              >
                {metronome.isOn ? 'On' : 'Off'}
              </button>
            </div>

            {metronome.isOn && (
              <p className="rtm-warning">
                If using a microphone, wear headphones — metronome may bleed into your recording. Direct guitar input is unaffected.
              </p>
            )}

            {recorder.error && <p className="rtm-error">{recorder.error}</p>}

            <Button className="rtm-cta" onClick={handleStartRecording}>
              Start Recording
            </Button>
          </div>
        )}

        {panel === 'recording' && (
          <div className="rtm-panel">
            <div className="rtm-countdown">{recorder.secondsLeft}s</div>

            <div className="rtm-meter-wrap" aria-label="Input level">
              <div className="rtm-meter-bar" ref={recorder.meterBarRef} />
            </div>

            <p className="rtm-hint">Recording… play something!</p>

            <Button variant="destructive" className="rtm-cta" onClick={handleStopRecording}>
              Stop
            </Button>
          </div>
        )}

        {panel === 'review' && (
          <div className="rtm-panel">
            {recorder.recordedUrl && (
              <audio controls src={recorder.recordedUrl} className="rtm-audio">
                <track kind="captions" />
              </audio>
            )}

            {transcribeError && <p className="rtm-error">{transcribeError}</p>}

            <div className="rtm-row-btns">
              <Button variant="outline" onClick={() => { setPanel('setup'); setTranscribeError(null); }}>
                Re-record
              </Button>

              <AuthGate message="Sign in to use AI tab transcription" inline>
                <Button
                  onClick={handleTranscribe}
                  disabled={isTranscribing || !recorder.recordedBlob}
                >
                  {isTranscribing ? 'Transcribing…' : 'Transcribe'}
                </Button>
              </AuthGate>
            </div>
          </div>
        )}

        {panel === 'import' && transcribedTrack && (
          <div className="rtm-panel">
            <p className="rtm-result-info">
              {measureCount} measure{measureCount !== 1 ? 's' : ''} detected
              {detectedBpm > 0 ? ` at ${detectedBpm} BPM` : ''}.
              Results are a starting point — edit freely in the tab editor.
            </p>

            <div className="rtm-row-btns">
              <Button onClick={handleInsertAtCursor}>
                Insert at Cursor
              </Button>
              <Button variant="outline" onClick={handleOverwriteRequest}>
                Overwrite Track
              </Button>
            </div>

            <button className="rtm-link" onClick={() => { setPanel('setup'); setTranscribedTrack(null); }}>
              Try again
            </button>
          </div>
        )}

        {panel === 'overwrite-confirm' && (
          <div className="rtm-panel">
            <p className="rtm-warning">
              This will replace your current tab and clear the undo history. Make sure you've saved first.
            </p>
            <div className="rtm-row-btns">
              <Button variant="destructive" onClick={confirmOverwrite}>
                Overwrite
              </Button>
              <Button variant="outline" onClick={() => setPanel('import')}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
