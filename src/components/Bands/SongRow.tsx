import { useMemo } from 'react';
import { ExternalLink, Pencil, Trash2, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { normalizeHttpUrl } from '../../bandUtils';
import type { SongTally, ValidSong, VoteValue } from '../../bandTypes';
import { LinkifiedText } from './LinkifiedText';
import { VoteButtons } from './VoteButtons';

interface SongRowProps {
  song: ValidSong;
  rank: number;
  tally: SongTally;
  myVote: VoteValue | undefined;
  suggestedBy: string;
  /** The caller suggested this song (may edit/delete it). */
  isAuthor: boolean;
  /** The caller owns the band (may hide any song). */
  isOwner: boolean;
  isVoting: boolean;
  onVote: (value: VoteValue) => void;
  onEdit: () => void;
  onDelete: () => void;
  onHide: () => void;
}

/** A song updated this long after it was created shows an "edited" note. */
const EDITED_AFTER_MS = 60_000;

function wasEdited(song: ValidSong): boolean {
  if (!song.updatedAt) return false;
  return Date.parse(song.updatedAt) - Date.parse(song.createdAt) > EDITED_AFTER_MS;
}

/** The destination shown beside the label so teammates can see where a link goes (IDN hosts show as xn--). */
function hostOf(href: string): string {
  return new URL(href).hostname.replace(/^www\./, '');
}

function ExternalAnchor({ url, label, songTitle }: { url: string; label: string; songTitle: string }) {
  // Re-checked at render: only a canonical http(s) link is ever an href.
  const link = useMemo(() => {
    const href = normalizeHttpUrl(url);
    return href ? { href, host: hostOf(href) } : null;
  }, [url]);
  if (!link) return null;
  const { href, host } = link;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} link for ${songTitle} (opens in a new tab)`}
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
    >
      {label} <span className="text-xs text-muted-foreground">{host}</span>
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

export function SongRow({
  song,
  rank,
  tally,
  myVote,
  suggestedBy,
  isAuthor,
  isOwner,
  isVoting,
  onVote,
  onEdit,
  onDelete,
  onHide,
}: SongRowProps) {
  const meta = [song.key, song.bpm ? `${song.bpm} BPM` : null].filter(Boolean);
  return (
    <li className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground" aria-label={`Rank ${rank}`}>
            {rank}
          </span>
          <div className="min-w-0">
            <p className="break-words font-medium text-foreground">
              {song.title}
              {wasEdited(song) && <span className="ml-2 text-xs font-normal text-muted-foreground">edited</span>}
            </p>
            {(song.artist || meta.length > 0) && (
              <p className="break-words text-sm text-foreground/70">{[song.artist, ...meta].filter(Boolean).join(' · ')}</p>
            )}
            {(song.songUrl || song.tabUrl) && (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {song.songUrl && <ExternalAnchor url={song.songUrl} label="Song" songTitle={song.title} />}
                {song.tabUrl && <ExternalAnchor url={song.tabUrl} label="Tab" songTitle={song.title} />}
              </p>
            )}
            {song.notes && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                <LinkifiedText text={song.notes} />
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Suggested by {suggestedBy}</p>
          </div>
        </div>
        <VoteButtons songTitle={song.title} myVote={myVote} tally={tally} disabled={isVoting} onVote={onVote} />
      </div>
      {(isAuthor || isOwner) && (
        <div className="mt-2 flex flex-wrap gap-1 pl-9">
          {isAuthor && (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${song.title}`}>
                <Pencil size={14} className="mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${song.title}`}>
                <Trash2 size={14} className="mr-1" /> Delete
              </Button>
            </>
          )}
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={onHide} aria-label={`Hide ${song.title}`}>
              <EyeOff size={14} className="mr-1" /> Hide
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
