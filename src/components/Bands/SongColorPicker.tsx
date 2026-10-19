import { Check, Palette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SONG_COLOR_OPTIONS, SONG_COLOR_STYLES, songColorAriaName, songColorName, type ColorLabels } from '../../bandSongColors';
import type { SongColorKey } from '../../bandTypes';

interface SongColorPickerProps {
  songTitle: string;
  color: SongColorKey | undefined;
  /** The band's names for its colors, shown instead of the palette names. */
  labels?: ColorLabels;
  /** `null` clears the color. */
  onChange: (color: SongColorKey | null) => void;
}

/** Any member can color a song; the color (and the band's name for it) is shared with the whole band. */
export function SongColorPicker({ songTitle, color, labels, onChange }: SongColorPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Set color for ${songTitle}${color ? `, now ${songColorAriaName(color, labels)}` : ''}`}
        >
          {color ? (
            <span
              className="mr-1 size-3.5 shrink-0 rounded-full border border-white/60"
              style={{ backgroundColor: SONG_COLOR_STYLES[color].hex }}
              aria-hidden
            />
          ) : (
            <Palette size={14} className="mr-1" aria-hidden />
          )}
          <span className="max-w-32 truncate">{color ? songColorName(color, labels) : 'Color'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid min-w-44 gap-0.5 p-1">
        {SONG_COLOR_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.key}
            aria-label={color === option.key ? `${songColorAriaName(option.key, labels)}, selected` : songColorAriaName(option.key, labels)}
            onSelect={() => onChange(option.key)}
            className="min-h-11 gap-2"
          >
            <span
              className="size-4 shrink-0 rounded-full border border-white/60"
              style={{ backgroundColor: option.hex }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{songColorName(option.key, labels)}</span>
            {color === option.key && <Check size={14} aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onSelect={() => onChange(null)}
          disabled={color === undefined}
          className="min-h-11 justify-center gap-1 text-muted-foreground"
        >
          <X size={14} aria-hidden /> No color
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
