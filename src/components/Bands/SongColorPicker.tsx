import { Check, Palette, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SONG_COLOR_OPTIONS, SONG_COLOR_STYLES } from '../../bandSongColors';
import type { SongColorKey } from '../../bandTypes';

interface SongColorPickerProps {
  songTitle: string;
  color: SongColorKey | undefined;
  /** `null` clears the color. */
  onChange: (color: SongColorKey | null) => void;
}

/** Any member can color a song; the color is shared with the whole band. */
export function SongColorPicker({ songTitle, color, onChange }: SongColorPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Set color for ${songTitle}${color ? `, now ${SONG_COLOR_STYLES[color].label}` : ''}`}
        >
          {color ? (
            <span
              className="mr-1 size-3.5 rounded-full border border-white/60"
              style={{ backgroundColor: SONG_COLOR_STYLES[color].hex }}
              aria-hidden
            />
          ) : (
            <Palette size={14} className="mr-1" aria-hidden />
          )}
          Color
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid grid-cols-4 gap-1 p-2">
        {SONG_COLOR_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.key}
            aria-label={color === option.key ? `${option.label}, selected` : option.label}
            title={option.label}
            onSelect={() => onChange(option.key)}
            className="size-11 justify-center rounded-full p-0 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-popover"
            style={{ backgroundColor: option.hex }}
          >
            {color === option.key && (
              <span className="rounded-full bg-black/60 p-0.5 text-white" aria-hidden>
                <Check size={14} />
              </span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onSelect={() => onChange(null)}
          disabled={color === undefined}
          className="col-span-4 justify-center gap-1 text-muted-foreground"
        >
          <X size={14} aria-hidden /> No color
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
