import { useState, useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatClock, type ReadableProgress } from '../../utils/playerProgress';

/** What the player bar needs from the hook: the position store and the three things a person can do to it. */
export interface BackingTrackPlayerControls {
  progress: ReadableProgress;
  onSeek: (seconds: number) => void;
  /** Jump relative to now (negative = back). */
  onSkip: (deltaSeconds: number) => void;
  onTogglePause: () => void;
}

/** The player's own look for the shared slider: a thick glowing groove, and a thumb that swells under the finger. */
const SEEK_TRACK = 'h-2 overflow-visible bg-white/10 shadow-[inset_0_1px_2px_rgb(0_0_0/0.5)] transition-[height] group-hover:h-2.5';
const SEEK_RANGE = 'rounded-full bg-gradient-to-r from-primary to-[hsl(280_75%_68%)] shadow-[0_0_10px_hsl(237_100%_69%/0.55)]';
const SEEK_THUMB = [
  'relative h-4 w-4 border-2 border-primary bg-white',
  'shadow-[0_0_0_4px_hsl(237_100%_69%/0.25),0_2px_6px_rgb(0_0_0/0.5)]',
  'transition-[transform,box-shadow] duration-150 group-hover:scale-125 active:scale-150',
  'focus-visible:ring-0 focus-visible:shadow-[0_0_0_6px_hsl(237_100%_69%/0.5),0_2px_6px_rgb(0_0_0/0.5)]',
  // A bigger invisible target than the dot itself, for a thumb.
  "after:absolute after:-inset-3 after:content-['']",
  // No known length: nothing to drag, so it should not look live.
  'data-[disabled]:opacity-50 data-[disabled]:shadow-none data-[disabled]:group-hover:scale-100',
].join(' ');

/** How far the back / forward buttons jump. */
export const SKIP_SECONDS = 10;

interface Props {
  label: string;
  player: BackingTrackPlayerControls;
}

/**
 * Shown under the track that is playing: a seek bar, elapsed and total time, pause / resume and a 10 second
 * jump each way. Reads the position from the store itself, so a tick re-renders only this bar.
 */
export function BackingTrackPlayer({ label, player }: Props) {
  const { currentTime, duration, paused } = useSyncExternalStore(player.progress.subscribe, player.progress.getSnapshot);
  // While the thumb is being dragged it follows the finger, not the audio; the seek happens on release.
  const [dragValue, setDragValue] = useState<number | null>(null);
  // Without a known length (a stream that reports none) there is nothing to seek in: a dead bar and a live clock.
  const seekable = duration !== null;
  const shown = seekable ? Math.min(dragValue ?? currentTime, duration) : 0;
  const whole = Math.floor(shown);

  return (
    <div role="group" aria-label={`Playback controls for ${label}`} className="mt-2 grid gap-0.5 rounded-xl bg-black/25 px-3 pb-2 pt-1 ring-1 ring-white/10">
      <Slider
        className="group h-10"
        trackClassName={SEEK_TRACK}
        rangeClassName={SEEK_RANGE}
        min={0}
        max={duration ?? 1}
        step={1}
        value={[whole]}
        disabled={!seekable}
        onValueChange={([v]) => setDragValue(v)}
        onValueCommit={([v]) => {
          setDragValue(null);
          player.onSeek(v);
        }}
        // Radix commits only when the value changed: a drag that ends where it began would leave the thumb pinned.
        onPointerUp={() => setDragValue(null)}
        onPointerCancel={() => setDragValue(null)}
        thumbProps={{
          className: SEEK_THUMB,
          'aria-label': `Seek ${label}`,
          'aria-valuetext': seekable ? `${formatClock(whole)} of ${formatClock(duration)}` : formatClock(currentTime),
        }}
      />
      <div className="flex items-center justify-between gap-2 text-sm tabular-nums text-muted-foreground">
        <span className="min-w-12 font-semibold text-foreground" title="Elapsed">
          {formatClock(seekable ? whole : currentTime)}
        </span>
        <div className="flex items-center gap-1">
          <SkipButton seconds={-SKIP_SECONDS} disabled={!seekable} onSkip={player.onSkip} />
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shadow-[0_0_16px_hsl(237_100%_69%/0.6)] transition-transform hover:scale-105 active:scale-95"
            onClick={player.onTogglePause}
            aria-label={paused ? `Resume ${label}` : `Pause ${label}`}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
          </Button>
          <SkipButton seconds={SKIP_SECONDS} disabled={!seekable} onSkip={player.onSkip} />
        </div>
        <span className="min-w-12 text-right" title="Total length">
          {seekable ? formatClock(duration) : '–:––'}
        </span>
      </div>
    </div>
  );
}

function SkipButton({ seconds, disabled, onSkip }: { seconds: number; disabled: boolean; onSkip: (delta: number) => void }) {
  const back = seconds < 0;
  const text = `${back ? 'Back' : 'Forward'} ${Math.abs(seconds)} seconds`;
  return (
    <Button variant="ghost" size="sm" className="h-10 rounded-full px-3 text-xs hover:text-foreground" onClick={() => onSkip(seconds)} disabled={disabled} aria-label={text} title={text}>
      {back ? '−' : '+'}
      {Math.abs(seconds)}s
    </Button>
  );
}
