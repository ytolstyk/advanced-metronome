// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeEntities, metaContent, parseMetadata, planLookup } from './parse';

const SPOTIFY_ID = '4cOdK2wGLETKBW3PvgPWqT';
const YT_ID = 'dQw4w9WgXcQ';
const ytOembed = (id: string) =>
  `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;

describe('planLookup', () => {
  describe('YouTube', () => {
    it.each([
      ['watch URL', `https://www.youtube.com/watch?v=${YT_ID}`],
      ['watch URL with extra params', `https://www.youtube.com/watch?v=${YT_ID}&t=42s&list=PLabc`],
      ['bare youtube.com', `https://youtube.com/watch?v=${YT_ID}`],
      ['mobile host', `https://m.youtube.com/watch?v=${YT_ID}`],
      ['music.youtube.com', `https://music.youtube.com/watch?v=${YT_ID}`],
      ['youtu.be short link', `https://youtu.be/${YT_ID}`],
      ['youtu.be with tracking query', `https://youtu.be/${YT_ID}?si=abcdef`],
      ['shorts', `https://www.youtube.com/shorts/${YT_ID}`],
      ['embed', `https://www.youtube.com/embed/${YT_ID}`],
      ['live', `https://www.youtube.com/live/${YT_ID}`],
      ['upper-case host', `https://WWW.YouTube.com/watch?v=${YT_ID}`],
    ])('plans an oEmbed lookup for %s', (_label, link) => {
      expect(planLookup(link)).toEqual({ provider: 'youtube', url: ytOembed(YT_ID) });
    });

    it('accepts ids containing dashes and underscores', () => {
      expect(planLookup('https://youtu.be/a-b_c-d_e-f')).toEqual({ provider: 'youtube', url: ytOembed('a-b_c-d_e-f') });
    });

    it.each([
      ['an id that is too short', 'https://www.youtube.com/watch?v=short'],
      ['an id that is too long', `https://www.youtube.com/watch?v=${YT_ID}X`],
      ['an id with illegal characters', 'https://www.youtube.com/watch?v=dQw4w9WgXc%2F'],
      ['a watch URL without v', 'https://www.youtube.com/watch'],
      ['a playlist page', 'https://www.youtube.com/playlist?list=PLabcdefghijk'],
      ['a channel page', 'https://www.youtube.com/@RickAstley'],
      ['a youtu.be link with no id', 'https://youtu.be/'],
      ['an unknown youtube subdomain', `https://evil.youtube.com/watch?v=${YT_ID}`],
    ])('returns null for %s', (_label, link) => {
      expect(planLookup(link)).toBeNull();
    });
  });

  describe('Spotify', () => {
    it('plans a fetch of the canonical track page', () => {
      expect(planLookup(`https://open.spotify.com/track/${SPOTIFY_ID}`)).toEqual({
        provider: 'spotify',
        url: `https://open.spotify.com/track/${SPOTIFY_ID}`,
      });
    });

    it('drops tracking query strings', () => {
      expect(planLookup(`https://open.spotify.com/track/${SPOTIFY_ID}?si=deadbeef&utm_source=copy-link`)).toEqual({
        provider: 'spotify',
        url: `https://open.spotify.com/track/${SPOTIFY_ID}`,
      });
    });

    it('accepts the international /intl-xx/ prefix', () => {
      expect(planLookup(`https://open.spotify.com/intl-de/track/${SPOTIFY_ID}`)).toEqual({
        provider: 'spotify',
        url: `https://open.spotify.com/track/${SPOTIFY_ID}`,
      });
    });

    it.each([
      ['an album', `https://open.spotify.com/album/${SPOTIFY_ID}`],
      ['a playlist', `https://open.spotify.com/playlist/${SPOTIFY_ID}`],
      ['an artist', `https://open.spotify.com/artist/${SPOTIFY_ID}`],
      ['an intl-prefixed album', `https://open.spotify.com/intl-de/album/${SPOTIFY_ID}`],
      ['a track id that is too short', 'https://open.spotify.com/track/abc123'],
      ['a track id that is too long', `https://open.spotify.com/track/${SPOTIFY_ID}A`],
      ['a track id with punctuation', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPW-T'],
      ['the bare host', 'https://open.spotify.com/'],
      ['a non-open spotify host', `https://spotify.com/track/${SPOTIFY_ID}`],
    ])('returns null for %s', (_label, link) => {
      expect(planLookup(link)).toBeNull();
    });
  });

  describe('Apple Music', () => {
    it('plans an iTunes lookup for a /song/ link', () => {
      expect(planLookup('https://music.apple.com/us/song/never-gonna-give-you-up/1558533900')).toEqual({
        provider: 'apple',
        url: 'https://itunes.apple.com/lookup?id=1558533900&entity=song&country=us',
      });
    });

    it('uses the ?i= track id on an album link', () => {
      expect(planLookup('https://music.apple.com/us/album/whenever-you-need-somebody/1558533899?i=1558533900')).toEqual({
        provider: 'apple',
        url: 'https://itunes.apple.com/lookup?id=1558533900&entity=song&country=us',
      });
    });

    it('prefers ?i= over the trailing path id', () => {
      expect(planLookup('https://music.apple.com/us/song/x/111?i=222')).toEqual({
        provider: 'apple',
        url: 'https://itunes.apple.com/lookup?id=222&entity=song&country=us',
      });
    });

    it.each([
      ['an album without a track id', 'https://music.apple.com/us/album/whenever-you-need-somebody/1558533899'],
      ['a non-numeric ?i=', 'https://music.apple.com/us/album/x/1558533899?i=abc'],
      ['an injected ?i= value', 'https://music.apple.com/us/album/x/1?i=1%26entity%3Dmovie'],
      ['a song link with a non-numeric id', 'https://music.apple.com/us/song/x/not-a-number'],
      ['an over-long numeric id', `https://music.apple.com/us/song/x/${'1'.repeat(21)}`],
      ['a playlist', 'https://music.apple.com/us/playlist/x/pl.abcdef'],
    ])('returns null for %s', (_label, link) => {
      expect(planLookup(link)).toBeNull();
    });

    it('accepts the longest allowed numeric id', () => {
      const id = '9'.repeat(20);
      expect(planLookup(`https://music.apple.com/us/song/x/${id}`)).toEqual({
        provider: 'apple',
        url: `https://itunes.apple.com/lookup?id=${id}&entity=song&country=us`,
      });
    });

    it('passes the storefront of other regions through as the country', () => {
      expect(planLookup('https://music.apple.com/gb/song/x/123')?.url).toBe(
        'https://itunes.apple.com/lookup?id=123&entity=song&country=gb',
      );
      expect(planLookup('https://music.apple.com/jp/album/x/1?i=456')?.url).toBe(
        'https://itunes.apple.com/lookup?id=456&entity=song&country=jp',
      );
    });

    it.each([
      ['no storefront segment', 'https://music.apple.com/song/x/123'],
      ['an upper-case storefront', 'https://music.apple.com/US/song/x/123'],
      ['a three-letter first segment', 'https://music.apple.com/usa/song/x/123'],
      ['an injected first segment', 'https://music.apple.com/u%26/song/x/123'],
    ])('omits the country parameter for %s', (_label, link) => {
      expect(planLookup(link)).toEqual({ provider: 'apple', url: 'https://itunes.apple.com/lookup?id=123&entity=song' });
    });

    it('omits the country parameter when the album link has no storefront', () => {
      expect(planLookup('https://music.apple.com/album/x/1?i=456')?.url).toBe('https://itunes.apple.com/lookup?id=456&entity=song');
    });
  });

  describe('SoundCloud', () => {
    const oembed = (path: string) =>
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(`https://soundcloud.com/${path}`)}`;

    it('plans an oEmbed lookup for user/track', () => {
      expect(planLookup('https://soundcloud.com/rick-astley/never-gonna-give-you-up')).toEqual({
        provider: 'soundcloud',
        url: oembed('rick-astley/never-gonna-give-you-up'),
      });
    });

    it('accepts www and normalises to the bare host, dropping the query', () => {
      expect(planLookup('https://www.soundcloud.com/rick-astley/never-gonna?si=abc')).toEqual({
        provider: 'soundcloud',
        url: oembed('rick-astley/never-gonna'),
      });
    });

    it.each([
      ['a profile page', 'https://soundcloud.com/rick-astley'],
      ['a set', 'https://soundcloud.com/rick-astley/sets/greatest-hits'],
      ['a bare /sets segment', 'https://soundcloud.com/rick-astley/sets'],
      ['a bare /tracks segment', 'https://soundcloud.com/rick-astley/tracks'],
      ['a private-share path', 'https://soundcloud.com/rick-astley/song/s-AbCdEf'],
      ['the bare host', 'https://soundcloud.com/'],
      ['a lookalike host', 'https://soundcloud.com.evil.com/a/b'],
    ])('returns null for %s', (_label, link) => {
      expect(planLookup(link)).toBeNull();
    });
  });

  describe('rejections shared by every provider', () => {
    it.each([
      ['http instead of https (youtube)', `http://www.youtube.com/watch?v=${YT_ID}`],
      ['http instead of https (spotify)', `http://open.spotify.com/track/${SPOTIFY_ID}`],
      ['http instead of https (youtu.be)', `http://youtu.be/${YT_ID}`],
      ['embedded credentials', `https://user:pw@www.youtube.com/watch?v=${YT_ID}`],
      ['a username only', `https://user@open.spotify.com/track/${SPOTIFY_ID}`],
      ['a non-default port', `https://open.spotify.com:8443/track/${SPOTIFY_ID}`],
      ['a custom port on youtu.be', `https://youtu.be:444/${YT_ID}`],
      ['an unsupported host', 'https://example.com/watch?v=dQw4w9WgXcQ'],
      ['a spotify look-alike subdomain', `https://open.spotify.com.evil.example/track/${SPOTIFY_ID}`],
      ['a userinfo host trick', `https://open.spotify.com@evil.example/track/${SPOTIFY_ID}`],
      ['a javascript: URL', 'javascript:alert(1)'],
      ['an ftp URL', 'ftp://youtu.be/dQw4w9WgXcQ'],
      ['a non-URL string', 'not a url'],
      ['an empty string', ''],
      ['a scheme-less link', `youtu.be/${YT_ID}`],
    ])('returns null for %s', (_label, link) => {
      expect(planLookup(link)).toBeNull();
    });

    it('treats the default https port as no port', () => {
      expect(planLookup(`https://youtu.be:443/${YT_ID}`)).not.toBeNull();
    });
  });

  it('only ever returns fixed provider hosts, whatever the input', () => {
    const allowed = new Set(['www.youtube.com', 'open.spotify.com', 'itunes.apple.com', 'soundcloud.com']);
    const inputs = [
      `https://youtu.be/${YT_ID}?url=https://evil.example`,
      `https://www.youtube.com/watch?v=${YT_ID}&url=https://evil.example/x`,
      `https://m.youtube.com/embed/${YT_ID}/../../evil`,
      `https://open.spotify.com/track/${SPOTIFY_ID}/../../../evil`,
      `https://open.spotify.com/intl-xx/track/${SPOTIFY_ID}?redirect=https://evil.example`,
      'https://music.apple.com/us/song/x/123?i=456&evil=https://evil.example',
      'https://soundcloud.com/a/b?url=https://evil.example',
      'https://www.soundcloud.com/a%2Fevil/b',
      `https://music.youtube.com/shorts/${YT_ID}#https://evil.example`,
    ];
    for (const input of inputs) {
      const plan = planLookup(input);
      if (!plan) continue;
      expect(plan.url.startsWith('https://')).toBe(true);
      expect(allowed.has(new URL(plan.url).hostname)).toBe(true);
      expect(new URL(plan.url).username).toBe('');
    }
    // and at least some of those inputs must actually plan, or the loop above proves nothing
    expect(inputs.filter((i) => planLookup(i) !== null).length).toBeGreaterThan(4);
  });

  it('percent-encodes the inner URL so it cannot add query parameters', () => {
    const plan = planLookup('https://soundcloud.com/a/b');
    expect(plan).not.toBeNull();
    const params = new URL(plan!.url).searchParams;
    expect([...params.keys()].sort()).toEqual(['format', 'url']);
    expect(params.get('url')).toBe('https://soundcloud.com/a/b');
  });
});

describe('decodeEntities', () => {
  it('decodes the common named entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &gt; &quot;hi&quot; &apos;x&apos;')).toBe('Tom & Jerry <3 > "hi" \'x\'');
  });

  it('turns &nbsp; into a regular space', () => {
    expect(decodeEntities('a&nbsp;b')).toBe('a b');
  });

  it('decodes decimal and hex numeric entities', () => {
    expect(decodeEntities('Don&#39;t Stop Me Now')).toBe("Don't Stop Me Now");
    expect(decodeEntities('Don&#x27;t')).toBe("Don't");
    expect(decodeEntities('Don&#X27;t')).toBe("Don't");
  });

  it('decodes code points beyond the BMP', () => {
    expect(decodeEntities('&#x1F3B8;')).toBe('\u{1F3B8}');
    expect(decodeEntities('&#127928;')).toBe('\u{1F3B8}');
  });

  it('is case-insensitive for named entities', () => {
    expect(decodeEntities('&AMP; &Lt;')).toBe('& <');
  });

  it('leaves unknown named entities untouched', () => {
    expect(decodeEntities('&foo; &copy;')).toBe('&foo; &copy;');
  });

  it('leaves invalid or out-of-range numeric entities untouched', () => {
    expect(decodeEntities('&#0;')).toBe('&#0;');
    expect(decodeEntities('&#x110000;')).toBe('&#x110000;');
    expect(decodeEntities('&#99999999999;')).toBe('&#99999999999;');
  });

  it('does not decode twice', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('&amp;#39;')).toBe('&#39;');
  });

  it('leaves text without entities unchanged', () => {
    expect(decodeEntities('plain text & more')).toBe('plain text & more');
    expect(decodeEntities('')).toBe('');
  });
});

describe('metaContent', () => {
  it('reads a property meta tag', () => {
    expect(metaContent('<meta property="og:title" content="Never Gonna Give You Up"/>', 'og:title')).toBe('Never Gonna Give You Up');
  });

  it('reads a name meta tag', () => {
    expect(metaContent('<meta name="music:musician_description" content="Rick Astley">', 'music:musician_description')).toBe('Rick Astley');
  });

  it('works when content comes before property', () => {
    expect(metaContent('<meta content="Rick Astley" property="og:title">', 'og:title')).toBe('Rick Astley');
  });

  it('matches case-insensitively on tag and attribute names', () => {
    expect(metaContent('<META PROPERTY="OG:TITLE" CONTENT="Loud">', 'og:title')).toBe('Loud');
  });

  it('returns the first matching tag', () => {
    const html = '<meta property="og:title" content="First"><meta property="og:title" content="Second">';
    expect(metaContent(html, 'og:title')).toBe('First');
  });

  it('picks the right tag among several', () => {
    const html = '<head><meta charset="utf-8"><meta property="og:image" content="x.png"><meta property="og:title" content="Right"></head>';
    expect(metaContent(html, 'og:title')).toBe('Right');
  });

  it('decodes entities in the content', () => {
    expect(metaContent('<meta property="og:title" content="Don&#x27;t Stop &amp; Go"/>', 'og:title')).toBe("Don't Stop & Go");
  });

  it('returns an empty string for empty content', () => {
    expect(metaContent('<meta property="og:title" content="">', 'og:title')).toBe('');
  });

  it('skips a matching tag that has no content and keeps looking', () => {
    const html = '<meta property="og:title"><meta property="og:title" content="Later">';
    expect(metaContent(html, 'og:title')).toBe('Later');
  });

  it('returns null when the key is absent', () => {
    expect(metaContent('<meta property="og:image" content="x">', 'og:title')).toBeNull();
  });

  it('returns null when there are no meta tags at all', () => {
    expect(metaContent('<html><body>hello</body></html>', 'og:title')).toBeNull();
    expect(metaContent('', 'og:title')).toBeNull();
  });

  it('reads single-quoted attributes', () => {
    expect(metaContent("<meta property='og:title' content='Single'/>", 'og:title')).toBe('Single');
    expect(metaContent("<meta name='music:musician_description' content='Rick Astley'>", 'music:musician_description')).toBe('Rick Astley');
  });

  it('keeps the other kind of quote inside the value', () => {
    expect(metaContent(`<meta property="og:title" content="Don't Stop"/>`, 'og:title')).toBe("Don't Stop");
    expect(metaContent(`<meta property='og:title' content='Say "Hi"'/>`, 'og:title')).toBe('Say "Hi"');
  });

  it('accepts mixed quote styles on one tag', () => {
    expect(metaContent(`<meta property="og:title" content='Mixed'/>`, 'og:title')).toBe('Mixed');
  });

  it('ignores data-name and data-property attributes', () => {
    expect(metaContent('<meta data-name="og:title" content="Fake">', 'og:title')).toBeNull();
    expect(metaContent('<meta data-property="og:title" content="Fake">', 'og:title')).toBeNull();
  });

  it('finds the real name attribute even when a data-name comes first', () => {
    expect(metaContent('<meta data-name="decoy" name="og:title" content="Real">', 'og:title')).toBe('Real');
  });

  it('ignores data-content in favour of the real content attribute', () => {
    expect(metaContent('<meta property="og:title" data-content="Fake" content="Real">', 'og:title')).toBe('Real');
  });

  it('does not take data-content as the content when there is no real content', () => {
    expect(metaContent('<meta property="og:title" data-content="Fake">', 'og:title')).toBeNull();
  });

  it('does not treat <metadata> or other tags as meta', () => {
    expect(metaContent('<metadata property="og:title" content="nope">', 'og:title')).toBeNull();
  });
});

describe('parseMetadata', () => {
  describe('Spotify', () => {
    const page = (title: string, artist?: string) =>
      `<!DOCTYPE html><html><head><title>x</title><meta property="og:title" content="${title}"/>` +
      (artist === undefined ? '' : `<meta name="music:musician_description" content="${artist}"/>`) +
      '<meta property="og:image" content="x.png"/></head><body></body></html>';

    it('reads the real og:title + music:musician_description sample', () => {
      const html =
        '<meta property="og:title" content="Never Gonna Give You Up"/><meta name="music:musician_description" content="Rick Astley"/>';
      expect(parseMetadata('spotify', html)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
    });

    it('decodes entities in both fields', () => {
      expect(parseMetadata('spotify', page('Don&#x27;t Stop Me Now', 'Queen &amp; Friends'))).toEqual({
        title: "Don't Stop Me Now",
        artist: 'Queen & Friends',
      });
    });

    it('returns an empty artist when the artist tag is missing', () => {
      expect(parseMetadata('spotify', page('Solo Title'))).toEqual({ title: 'Solo Title', artist: '' });
    });

    it('returns null when there is no og:title', () => {
      expect(parseMetadata('spotify', '<meta name="music:musician_description" content="Rick Astley">')).toBeNull();
    });

    it('returns null when og:title is blank', () => {
      expect(parseMetadata('spotify', page('   ', 'Rick Astley'))).toBeNull();
    });

    it('returns null for an empty body', () => {
      expect(parseMetadata('spotify', '')).toBeNull();
    });

    it('collapses runs of whitespace (including newlines) and trims', () => {
      expect(parseMetadata('spotify', page('  A   B\n\tC  ', '\n Band \n'))).toEqual({ title: 'A B C', artist: 'Band' });
    });

    it('leaves invisible characters for the client to sanitise', () => {
      expect(parseMetadata('spotify', page('A\u200bB', 'Ban\u202ed'))).toEqual({ title: 'A\u200bB', artist: 'Ban\u202ed' });
    });

    it('clamps by code point so an emoji is never cut in half', () => {
      const result = parseMetadata('spotify', page('\u{1F3B5}'.repeat(150), 'a'));
      expect(Array.from(result?.title ?? '')).toHaveLength(100);
      expect(result?.title).toBe('\u{1F3B5}'.repeat(100));
    });

    it('reads the tags only up to </head>', () => {
      const html =
        '<head><meta property="og:title" content="Real"/></head>' +
        '<body><meta property="og:title" content="Injected"/><meta name="music:musician_description" content="Evil"/></body>';
      expect(parseMetadata('spotify', html)).toEqual({ title: 'Real', artist: '' });
    });

    it('ignores a title that only appears after </head>', () => {
      const html = '<head><meta name="music:musician_description" content="Rick Astley"/></head><body><meta property="og:title" content="Late"/></body>';
      expect(parseMetadata('spotify', html)).toBeNull();
    });

    it('reads the whole body when there is no </head>', () => {
      expect(parseMetadata('spotify', '<meta property="og:title" content="Headless"/>')).toEqual({ title: 'Headless', artist: '' });
    });

    it('reads single-quoted meta attributes', () => {
      const html = "<head><meta property='og:title' content='Single Quoted'/><meta name='music:musician_description' content='Some Band'/></head>";
      expect(parseMetadata('spotify', html)).toEqual({ title: 'Single Quoted', artist: 'Some Band' });
    });

    it('clamps title and artist to 100 characters', () => {
      const result = parseMetadata('spotify', page('t'.repeat(150), 'a'.repeat(150)));
      expect(result?.title).toHaveLength(100);
      expect(result?.artist).toHaveLength(100);
    });
  });

  describe('YouTube', () => {
    const oembed = (title: unknown, author?: unknown) => JSON.stringify({ title, author_name: author });

    it('cleans the real "Artist - Title (Official Video) (4K Remaster)" sample', () => {
      const body = '{"title":"Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)","author_name":"Rick Astley"}';
      expect(parseMetadata('youtube', body)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
    });

    it.each([
      ['(Official Video)', 'Song (Official Video)'],
      ['[Official Music Video]', 'Song [Official Music Video]'],
      ['(Official Audio)', 'Song (Official Audio)'],
      ['[Lyrics]', 'Song [Lyrics]'],
      ['(Lyric Video)', 'Song (Lyric Video)'],
      ['(Remastered 2011)', 'Song (Remastered 2011)'],
      ['(HD)', 'Song (HD)'],
      ['[4K]', 'Song [4K]'],
      ['(Visualizer)', 'Song (Visualizer)'],
      ['(Visualiser)', 'Song (Visualiser)'],
      ['(MV)', 'Song (MV)'],
      ['lower-case noise', 'Song (official video)'],
    ])('strips %s', (_label, title) => {
      expect(parseMetadata('youtube', oembed(title, 'Someone'))).toEqual({ title: 'Song', artist: 'Someone' });
    });

    it('strips several noise groups from one title', () => {
      expect(parseMetadata('youtube', oembed('Song [HD] (Official Video) [Lyrics]', 'Someone'))?.title).toBe('Song');
    });

    it('keeps bracketed text that is part of the song name', () => {
      expect(parseMetadata('youtube', oembed('Song (feat. Guest)', 'Someone'))?.title).toBe('Song (feat. Guest)');
      expect(parseMetadata('youtube', oembed('Song (Live at Wembley)', 'Someone'))?.title).toBe('Song (Live at Wembley)');
    });

    it('does not strip words that merely contain a noise word', () => {
      expect(parseMetadata('youtube', oembed('Song (Hdr Mix)', 'Someone'))?.title).toBe('Song (Hdr Mix)');
    });

    it('uses the channel as artist when the title has no dash', () => {
      expect(parseMetadata('youtube', oembed('Bohemian Rhapsody', 'Queen'))).toEqual({ title: 'Bohemian Rhapsody', artist: 'Queen' });
    });

    it('removes the "- Topic" suffix from auto-generated channels', () => {
      expect(parseMetadata('youtube', oembed('Never Gonna Give You Up', 'Rick Astley - Topic'))).toEqual({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
      });
    });

    it('removes the VEVO suffix and still splits "Artist - Title"', () => {
      expect(parseMetadata('youtube', oembed('Rick Astley - Never Gonna Give You Up', 'RickAstleyVEVO'))).toEqual({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
      });
    });

    it('splits "Artist - Title" on a Topic channel even when the names differ', () => {
      expect(parseMetadata('youtube', oembed('Queen - Bohemian Rhapsody', 'Some Label - Topic'))).toEqual({
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
      });
    });

    it('splits when the channel name contains the left part ("Queen Official")', () => {
      expect(parseMetadata('youtube', oembed('Queen - Bohemian Rhapsody', 'Queen Official'))).toEqual({
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
      });
    });

    it('ignores punctuation and case when comparing the left part with the channel', () => {
      expect(parseMetadata('youtube', oembed('AC/DC - Thunderstruck', 'ACDC'))).toEqual({ title: 'Thunderstruck', artist: 'AC/DC' });
    });

    it('does not split when the left part is unrelated to the channel (e.g. a cover channel)', () => {
      expect(parseMetadata('youtube', oembed('Cover - Song', 'Some Guy'))).toEqual({ title: 'Cover - Song', artist: 'Some Guy' });
    });

    it('splits on the first " - " only', () => {
      expect(parseMetadata('youtube', oembed('Rick Astley - Never - Gonna', 'Rick Astley'))).toEqual({
        title: 'Never - Gonna',
        artist: 'Rick Astley',
      });
    });

    it('splits when there is no channel name at all', () => {
      expect(parseMetadata('youtube', oembed('Rick Astley - Never Gonna Give You Up'))).toEqual({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
      });
    });

    it('returns an empty artist when neither a channel nor a dash is available', () => {
      expect(parseMetadata('youtube', oembed('Just A Title'))).toEqual({ title: 'Just A Title', artist: '' });
    });

    it('does not split when nothing follows the dash', () => {
      expect(parseMetadata('youtube', oembed('Artist - ', 'Artist'))).toEqual({ title: 'Artist -', artist: 'Artist' });
    });

    it('decodes nothing and keeps literal ampersands from JSON', () => {
      expect(parseMetadata('youtube', oembed('Simon & Garfunkel - Mrs. Robinson', 'Simon & Garfunkel'))).toEqual({
        title: 'Mrs. Robinson',
        artist: 'Simon & Garfunkel',
      });
    });

    it('returns null when the title is missing, blank or not a string', () => {
      expect(parseMetadata('youtube', JSON.stringify({ author_name: 'x' }))).toBeNull();
      expect(parseMetadata('youtube', oembed('   ', 'x'))).toBeNull();
      expect(parseMetadata('youtube', oembed(42, 'x'))).toBeNull();
      expect(parseMetadata('youtube', oembed(null, 'x'))).toBeNull();
    });

    it('returns null when the title is only noise', () => {
      expect(parseMetadata('youtube', oembed('(Official Video)', 'x'))).toBeNull();
    });

    it('treats a non-string channel as no channel', () => {
      expect(parseMetadata('youtube', oembed('Title', 42))).toEqual({ title: 'Title', artist: '' });
    });

    it('clamps the title to 100 characters', () => {
      expect(parseMetadata('youtube', oembed('t'.repeat(150), 'x'))?.title).toHaveLength(100);
    });

    it('clamps the artist to 100 characters', () => {
      expect(parseMetadata('youtube', oembed('Title', 'a'.repeat(150)))?.artist).toHaveLength(100);
    });

    it('collapses whitespace but leaves control and invisible characters for the client to sanitise', () => {
      expect(parseMetadata('youtube', oembed('Hello\u200bWorld\u0007!  \n x', 'Some\u202eone'))).toEqual({
        title: 'Hello\u200bWorld\u0007! x',
        artist: 'Some\u202eone',
      });
    });

    it('does not split "!!! - Song" just because the left part normalises to nothing', () => {
      expect(parseMetadata('youtube', oembed('!!! - Song', 'Some Guy'))).toEqual({ title: '!!! - Song', artist: 'Some Guy' });
    });

    it('does not split "!!! - Song" even when the channel is also punctuation', () => {
      expect(parseMetadata('youtube', oembed('!!! - Song', '???'))).toEqual({ title: '!!! - Song', artist: '???' });
    });

    it('does not split a one-character left part, even on an identical channel', () => {
      expect(parseMetadata('youtube', oembed('X - Song', 'X'))).toEqual({ title: 'X - Song', artist: 'X' });
    });

    it('splits a two-character left part only when it equals the channel exactly', () => {
      expect(parseMetadata('youtube', oembed('U2 - One', 'U2'))).toEqual({ title: 'One', artist: 'U2' });
    });

    it('does not use substring matching for a two-character left part', () => {
      expect(parseMetadata('youtube', oembed('U2 - One', 'U2 Official'))).toEqual({ title: 'U2 - One', artist: 'U2 Official' });
    });

    it('does not split a short left part that merely appears inside an unrelated channel', () => {
      expect(parseMetadata('youtube', oembed('DJ - Song', 'DJ Mixes Daily'))).toEqual({ title: 'DJ - Song', artist: 'DJ Mixes Daily' });
    });

    it('uses substring matching from three characters up', () => {
      expect(parseMetadata('youtube', oembed('ABC - Song', 'ABC Records'))).toEqual({ title: 'Song', artist: 'ABC' });
    });

    it('treats a VEVO channel as generic and splits even when the names differ', () => {
      expect(parseMetadata('youtube', oembed('Queen - Bohemian Rhapsody', 'SomeLabelVEVO'))).toEqual({
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
      });
    });

    it('matches the generic-channel suffix case-insensitively', () => {
      expect(parseMetadata('youtube', oembed('Queen - Bohemian Rhapsody', 'some label - TOPIC'))).toEqual({
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
      });
    });
  });

  describe('SoundCloud', () => {
    const oembed = (title: unknown, author?: unknown) => JSON.stringify({ title, author_name: author });

    it('removes the " by Author" suffix', () => {
      expect(parseMetadata('soundcloud', oembed('Never Gonna Give You Up by Rick Astley', 'Rick Astley'))).toEqual({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
      });
    });

    it('matches the suffix case-insensitively', () => {
      expect(parseMetadata('soundcloud', oembed('Song BY rick astley', 'Rick Astley'))).toEqual({ title: 'Song', artist: 'Rick Astley' });
    });

    it('keeps the title when the suffix names someone else', () => {
      expect(parseMetadata('soundcloud', oembed('Song by Someone Else', 'Rick Astley'))).toEqual({
        title: 'Song by Someone Else',
        artist: 'Rick Astley',
      });
    });

    it('keeps a title that has no suffix', () => {
      expect(parseMetadata('soundcloud', oembed('Plain Title', 'Rick Astley'))).toEqual({ title: 'Plain Title', artist: 'Rick Astley' });
    });

    it('only removes the trailing suffix', () => {
      expect(parseMetadata('soundcloud', oembed('Song by Rick Astley live by Rick Astley', 'Rick Astley'))?.title).toBe(
        'Song by Rick Astley live',
      );
    });

    it('returns an empty artist when the author is missing', () => {
      expect(parseMetadata('soundcloud', oembed('Orphan Track'))).toEqual({ title: 'Orphan Track', artist: '' });
    });

    it('returns null when the title is missing or blank', () => {
      expect(parseMetadata('soundcloud', oembed(undefined, 'x'))).toBeNull();
      expect(parseMetadata('soundcloud', oembed('  ', 'x'))).toBeNull();
      expect(parseMetadata('soundcloud', oembed(5, 'x'))).toBeNull();
    });

    it('clamps title and artist to 100 characters', () => {
      const result = parseMetadata('soundcloud', oembed('t'.repeat(150), 'a'.repeat(150)));
      expect(result?.title).toHaveLength(100);
      expect(result?.artist).toHaveLength(100);
    });
  });

  describe('Apple Music', () => {
    it('reads the track entry of an iTunes lookup', () => {
      const body = JSON.stringify({
        resultCount: 1,
        results: [{ wrapperType: 'track', kind: 'song', trackName: 'Never Gonna Give You Up', artistName: 'Rick Astley' }],
      });
      expect(parseMetadata('apple', body)).toEqual({ title: 'Never Gonna Give You Up', artist: 'Rick Astley' });
    });

    it('skips non-track entries and uses the first track', () => {
      const body = JSON.stringify({
        results: [
          { wrapperType: 'collection', collectionName: 'Album', artistName: 'Wrong' },
          { wrapperType: 'track', trackName: 'First', artistName: 'A' },
          { wrapperType: 'track', trackName: 'Second', artistName: 'B' },
        ],
      });
      expect(parseMetadata('apple', body)).toEqual({ title: 'First', artist: 'A' });
    });

    it('returns an empty artist when it is missing', () => {
      expect(parseMetadata('apple', JSON.stringify({ results: [{ wrapperType: 'track', trackName: 'Solo' }] }))).toEqual({
        title: 'Solo',
        artist: '',
      });
    });

    it('returns null when there is no track', () => {
      expect(parseMetadata('apple', JSON.stringify({ results: [{ wrapperType: 'artist', artistName: 'x' }] }))).toBeNull();
      expect(parseMetadata('apple', JSON.stringify({ resultCount: 0, results: [] }))).toBeNull();
      expect(parseMetadata('apple', JSON.stringify({}))).toBeNull();
    });

    it('returns null when the track has no usable name', () => {
      expect(parseMetadata('apple', JSON.stringify({ results: [{ wrapperType: 'track', trackName: '' }] }))).toBeNull();
      expect(parseMetadata('apple', JSON.stringify({ results: [{ wrapperType: 'track', trackName: 7 }] }))).toBeNull();
    });

    it('clamps to 100 characters and collapses whitespace only', () => {
      const body = JSON.stringify({ results: [{ wrapperType: 'track', trackName: `A\u200bB  C${'x'.repeat(150)}`, artistName: 'a'.repeat(150) }] });
      const result = parseMetadata('apple', body);
      expect(result?.title).toHaveLength(100);
      expect(result?.title.startsWith('A\u200bB Cxx')).toBe(true);
      expect(result?.artist).toHaveLength(100);
    });
  });

  describe('malformed JSON bodies', () => {
    it.each(['youtube', 'soundcloud', 'apple'] as const)('%s returns null for invalid JSON', (provider) => {
      expect(parseMetadata(provider, '<html>not json</html>')).toBeNull();
      expect(parseMetadata(provider, '')).toBeNull();
    });

    it.each(['youtube', 'soundcloud', 'apple'] as const)('%s returns null for JSON that is not an object', (provider) => {
      expect(parseMetadata(provider, 'null')).toBeNull();
      expect(parseMetadata(provider, '42')).toBeNull();
      expect(parseMetadata(provider, '"a string"')).toBeNull();
      expect(parseMetadata(provider, 'true')).toBeNull();
    });

    it.each(['youtube', 'soundcloud', 'apple'] as const)('%s returns null for an empty JSON array', (provider) => {
      expect(parseMetadata(provider, '[]')).toBeNull();
    });
  });
});
