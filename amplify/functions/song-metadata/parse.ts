// NOTE: src/ imports this module at runtime (client-side allow-list), so it must stay dependency-free:
// no `node:` / `aws-*` imports, no `process`.
// Pure parsing for the song-link lookup. No I/O: the handler fetches, this decides WHAT may be
// fetched (fixed hosts only, ids validated, so no user-controlled URL is ever requested) and
// turns the responses into { title, artist }.

export interface SongMetadata {
  title: string;
  artist: string;
}

export type Provider = 'spotify' | 'youtube' | 'apple' | 'soundcloud';
export type FetchPlan = { provider: Provider; url: string } | null;

// Must match BAND_LIMITS.titleMax / artistMax in src/bandTypes.ts (the Lambda can't import from src).
export const TITLE_MAX = 100;
export const ARTIST_MAX = 100;
/** Must match BAND_LIMITS.urlMax; longer links are never looked up. */
export const MAX_URL_LENGTH = 300;
/** Provider titles are read at this length first ("Artist - Title (Official Video)" is longer than a song title). */
const RAW_TITLE_MAX = 300;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YOUTUBE_ID = /^[\w-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const NUMERIC_ID = /^\d{1,20}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split('/');
    id = first === 'watch' ? url.searchParams.get('v') : first === 'shorts' || first === 'embed' || first === 'live' ? second : null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Maps a pasted link to the one fixed-host request that can describe it, or null if unsupported. */
export function planLookup(raw: string): FetchPlan {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();

  const ytId = youtubeId(url);
  if (ytId) {
    const watch = `https://www.youtube.com/watch?v=${ytId}`;
    return { provider: 'youtube', url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}` };
  }

  if (host === 'open.spotify.com') {
    // /track/ID or /intl-xx/track/ID
    const parts = url.pathname.split('/').filter(Boolean);
    const at = parts[0]?.startsWith('intl-') ? 1 : 0;
    if (parts[at] === 'track' && SPOTIFY_ID.test(parts[at + 1] ?? '')) {
      return { provider: 'spotify', url: `https://open.spotify.com/track/${parts[at + 1]}` };
    }
    return null;
  }

  if (host === 'music.apple.com') {
    // /us/song/name/ID, or /us/album/name/ALBUM?i=ID (the track id is the one to look up)
    const parts = url.pathname.split('/').filter(Boolean);
    const trackId = url.searchParams.get('i') ?? (parts.includes('song') ? parts[parts.length - 1] : null);
    if (trackId && NUMERIC_ID.test(trackId)) {
      // The storefront is the first path segment; without it iTunes only searches the US catalogue.
      const storefront = /^[a-z]{2}$/.test(parts[0] ?? '') ? `&country=${parts[0]}` : '';
      return { provider: 'apple', url: `https://itunes.apple.com/lookup?id=${trackId}&entity=song${storefront}` };
    }
    return null;
  }

  if (host === 'soundcloud.com' || host === 'www.soundcloud.com') {
    // user/track only (not /sets/, profiles, or deeper paths)
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2 && parts[1] !== 'sets' && parts[1] !== 'tracks') {
      return {
        provider: 'soundcloud',
        url: `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(`https://soundcloud.com/${parts[0]}/${parts[1]}`)}`,
      };
    }
    return null;
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Content of the first <meta> whose property/name equals `key`, or null. */
export function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /(?<![\w-])(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if ((name?.[1] ?? name?.[2])?.toLowerCase() !== key) continue;
    const contentMatch = /(?<![\w-])content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const content = contentMatch?.[1] ?? contentMatch?.[2];
    if (content !== undefined) return decodeEntities(content);
  }
  return null;
}

// Only shape and length are enforced here; the client re-sanitises everything it shows or stores
// (`sanitizeText`), so there is deliberately no second copy of its character rules.
function clean(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  return Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, max).join('').trimEnd();
}

/** "(Official Video)", "[Lyrics]", "(4K Remaster)" and friends: video noise, not part of the song name. */
const NOISE_GROUP = /\s*[([][^)\]]*\b(official|video|audio|lyrics?|remaster(ed)?|hd|4k|visuali[sz]er|mv)\b[^)\]]*[)\]]/gi;

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

const GENERIC_CHANNEL = /(-\s*topic|vevo)$/i;

function youtubeArtist(author: string): string {
  return author.replace(/\s*-\s*topic$/i, '').replace(/\s*vevo$/i, '').trim();
}

/** Does "Artist" in an "Artist - Title" video title name the uploading channel? */
function namesChannel(left: string, channelArtist: string): boolean {
  const a = normalize(left);
  const c = normalize(channelArtist);
  if (a.length < 2 || !c) return false; // "!!! - Song" must not match every channel
  return a === c || (a.length >= 3 && c.includes(a));
}

function parseYoutube(json: { title?: unknown; author_name?: unknown }): SongMetadata | null {
  const rawTitle = clean(json.title, RAW_TITLE_MAX).replace(NOISE_GROUP, '').trim();
  const author = clean(json.author_name, ARTIST_MAX);
  if (!rawTitle) return null;
  let artist = youtubeArtist(author);
  let title = rawTitle;
  // "Artist - Title": split when the left part is the channel (or the channel is a generic label).
  const dash = rawTitle.indexOf(' - ');
  if (dash > 0) {
    const left = rawTitle.slice(0, dash).trim();
    const right = rawTitle.slice(dash + 3).trim();
    if (right && (!artist || GENERIC_CHANNEL.test(author) || namesChannel(left, artist))) {
      title = right;
      artist = left;
    }
  }
  return { title: clean(title, TITLE_MAX), artist: clean(artist, ARTIST_MAX) };
}

function parseSoundcloud(json: { title?: unknown; author_name?: unknown }): SongMetadata | null {
  const author = clean(json.author_name, ARTIST_MAX);
  let title = clean(json.title, RAW_TITLE_MAX);
  // oEmbed titles read "Song by Author".
  const suffix = ` by ${author}`;
  if (author && title.toLowerCase().endsWith(suffix.toLowerCase())) title = title.slice(0, -suffix.length);
  return title ? { title: clean(title, TITLE_MAX), artist: author } : null;
}

function parseSpotify(page: string): SongMetadata | null {
  const end = page.indexOf('</head>');
  const html = end === -1 ? page : page.slice(0, end); // the tags we need are all in <head>
  const title = clean(metaContent(html, 'og:title'), TITLE_MAX);
  const artist = clean(metaContent(html, 'music:musician_description'), ARTIST_MAX);
  return title ? { title, artist } : null;
}

function parseApple(json: { results?: Array<{ wrapperType?: unknown; trackName?: unknown; artistName?: unknown }> }): SongMetadata | null {
  const track = json.results?.find((r) => r.wrapperType === 'track');
  const title = clean(track?.trackName, TITLE_MAX);
  return title ? { title, artist: clean(track?.artistName, ARTIST_MAX) } : null;
}

/** Turns a provider response body (JSON text or HTML) into metadata, or null if it has no title. */
export function parseMetadata(provider: Provider, body: string): SongMetadata | null {
  if (provider === 'spotify') return parseSpotify(body);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  if (provider === 'youtube') return parseYoutube(json);
  if (provider === 'soundcloud') return parseSoundcloud(json);
  return parseApple(json);
}
