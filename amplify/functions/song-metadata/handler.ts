import type { AppSyncResolverHandler } from 'aws-lambda';
import { MAX_URL_LENGTH, parseMetadata, planLookup } from './parse';

const FETCH_TIMEOUT_MS = 6000;
const MAX_BODY_BYTES = 600_000; // a Spotify track page is ~170 KB; og tags sit in <head>

/**
 * Reads the body as text, stopping at `</head>` (all the meta tags we use are there; a Spotify
 * page is ~170 KB and the rest is useless) or after `MAX_BODY_BYTES`, whichever comes first.
 */
async function readHead(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  while (total < MAX_BODY_BYTES && !text.includes('</head>')) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, MAX_BODY_BYTES - total);
    total += chunk.length;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

// AppSync can't return a custom type from a function resolver, so the result is a JSON string:
// '{"title":…,"artist":…}', or null when the link is unsupported or has no readable metadata.
// Only fixed provider hosts are ever requested (see `planLookup`), and redirects are refused.
export const handler: AppSyncResolverHandler<{ url: string }, string | null> = async (event) => {
  const raw = (event.arguments.url ?? '').trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;

  const plan = planLookup(raw);
  if (!plan) {
    console.info('song-metadata: unsupported link');
    return null;
  }

  try {
    const res = await fetch(plan.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; DrummaLlamaBot/1.0)', accept: 'application/json,text/html' },
    });
    if (!res.ok) {
      console.warn('song-metadata: provider refused', plan.provider, res.status);
      // Rate limits and provider outages are transient: surface them (the client offers a retry)
      // instead of caching "nothing readable" for this link.
      if (res.status === 429 || res.status >= 500) throw new Error(`provider unavailable (${res.status})`);
      return null;
    }
    const metadata = parseMetadata(plan.provider, await readHead(res));
    if (!metadata) console.warn('song-metadata: no title found', plan.provider);
    return metadata ? JSON.stringify(metadata) : null;
  } catch (e) {
    // Never log the link itself: only which provider failed and why. Timeouts and network errors are
    // transient too, so they propagate as a GraphQL error rather than a "no result".
    console.error('song-metadata: lookup failed', plan.provider, e instanceof Error ? e.name : 'unknown');
    throw e;
  }
};
