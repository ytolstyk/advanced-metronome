import { useMemo, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { normalizeHttpUrl } from '../../bandUtils';
import type { ValidSong } from '../../bandTypes';
import { LinkifiedText } from './LinkifiedText';

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

/** Title, artist/key/BPM, links and notes of one song: shared by the members' row and the public one. */
export function SongDetails({ song, children }: { song: ValidSong; children?: ReactNode }) {
  const meta = [song.key, song.bpm ? `${song.bpm} BPM` : null].filter(Boolean);
  return (
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
      {children}
    </div>
  );
}
