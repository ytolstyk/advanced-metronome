// Strict: validates a clean watch URL with no extra params.
// Must stay in sync with amplify/functions/gemini-chords/handler.ts (cross-boundary duplication, forced by Lambda deployment).
export const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+$/;

// Permissive: extracts video ID from any YouTube URL (timestamped, playlist, short links, youtu.be).
// Must stay in sync with amplify/functions/gemini-chords/handler.ts (cross-boundary duplication, forced by Lambda deployment).
export const YOUTUBE_VIDEO_ID_RE = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]+)/;

const SHORTS_RE = /youtube\.com\/shorts\//;

export function isYoutubeShorts(url: string): boolean {
  return SHORTS_RE.test(url);
}

export function extractVideoId(url: string): string | null {
  const match = YOUTUBE_VIDEO_ID_RE.exec(url);
  return match ? match[1] : null;
}

/** Returns a canonical watch URL, or null if the URL is not a recognizable YouTube video link. */
export function normalizeYoutubeUrl(url: string): string | null {
  if (isYoutubeShorts(url)) return null;
  const id = extractVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** Returns a user-facing error string for a URL input, or '' if the URL is valid. */
export function getYoutubeUrlError(v: string): string {
  if (!v) return '';
  if (isYoutubeShorts(v))
    return 'YouTube Shorts links are not supported — use a standard youtube.com/watch link.';
  if (!YOUTUBE_VIDEO_ID_RE.test(v))
    return 'Enter a valid YouTube URL (e.g. https://youtube.com/watch?v=...)';
  return '';
}
