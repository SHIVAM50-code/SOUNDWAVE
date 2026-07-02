// src/services/lyricsService.ts — LRCLIB.net (free, no API key)
import { API_BASE_URL } from './apiConfig';

export interface LyricsResult {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  source: 'lrclib' | 'none';
}

const cache = new Map<string, LyricsResult>();

function cacheKey(title: string, artist: string) {
  return `${title.toLowerCase()}::${artist.toLowerCase()}`;
}

// Aggressive cleaning of YouTube-style titles & channel names
function cleanTitle(raw: string): string {
  return raw
    .replace(/\(.*?(official|lyric|audio|video|full|hd|4k|music|song|clip).*?\)/gi, '')
    .replace(/\[.*?(official|lyric|audio|video|full|hd|4k|music|song|clip).*?\]/gi, '')
    .replace(/\s*\|.*$/, '')          // strip " | T-Series" suffix
    .replace(/\s*-\s*(official|lyric|audio|video|hd|4k|full).*$/gi, '')
    .replace(/\s*\(official.*\)/gi, '')
    .replace(/ft\..*/gi, '')          // strip ft. features
    .replace(/feat\..*/gi, '')
    .trim();
}

function cleanArtist(raw: string): string {
  return raw
    .replace(/\s*\|.*$/, '')          // strip " | Sony Music" etc.
    .replace(/\s*-\s*Topic$/i, '')    // strip "- Topic" from auto-generated channels
    .replace(/VEVO$/i, '')
    .replace(/(T-Series|Zee Music|Sony Music|Tips Music|Speed Records|Saregama|YRF|Dharma|T Series)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLyrics(
  title: string, artist: string, duration?: number
): Promise<LyricsResult | null> {
  const empty: LyricsResult = { syncedLyrics: null, plainLyrics: null, source: 'none' };

  // Try 1: with duration (exact match)
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (duration) params.set('duration', String(Math.round(duration)));

    const res = await fetch(`${API_BASE_URL}/api/lyrics?${params}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics || data.plainLyrics) {
        return {
          syncedLyrics: data.syncedLyrics || null,
          plainLyrics: data.plainLyrics || null,
          source: 'lrclib',
        };
      }
    }
  } catch { /* continue */ }

  // Try 2: without duration (looser match)
  try {
    const params2 = new URLSearchParams({ track_name: title, artist_name: artist });
    const res2 = await fetch(`${API_BASE_URL}/api/lyrics?${params2}`, { signal: AbortSignal.timeout(8000) });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.syncedLyrics || data2.plainLyrics) {
        return {
          syncedLyrics: data2.syncedLyrics || null,
          plainLyrics: data2.plainLyrics || null,
          source: 'lrclib',
        };
      }
    }
  } catch { /* continue */ }

  // Try 3: direct LRCLIB call (bypass proxy, LRCLIB now supports CORS)
  try {
    const params3 = new URLSearchParams({ track_name: title, artist_name: artist });
    const res3 = await fetch(`https://lrclib.net/api/get?${params3}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res3.ok) {
      const data3 = await res3.json();
      if (data3.syncedLyrics || data3.plainLyrics) {
        return {
          syncedLyrics: data3.syncedLyrics || null,
          plainLyrics: data3.plainLyrics || null,
          source: 'lrclib',
        };
      }
    }
  } catch { /* all failed */ }

  // Try 4: search endpoint (broadest match)
  try {
    const params4 = new URLSearchParams({ q: `${title} ${artist}` });
    const res4 = await fetch(`https://lrclib.net/api/search?${params4}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res4.ok) {
      const results = await res4.json();
      if (Array.isArray(results) && results.length > 0) {
        const best = results[0];
        if (best.syncedLyrics || best.plainLyrics) {
          return {
            syncedLyrics: best.syncedLyrics || null,
            plainLyrics: best.plainLyrics || null,
            source: 'lrclib',
          };
        }
      }
    }
  } catch { /* give up */ }

  return empty;
}

export const lyricsService = {
  async getLyrics(rawTitle: string, rawArtist: string, durationSecs?: number): Promise<LyricsResult> {
    const title  = cleanTitle(rawTitle);
    const artist = cleanArtist(rawArtist);
    const key    = cacheKey(title, artist);
    if (cache.has(key)) return cache.get(key)!;

    console.log(`[lyrics] Searching: "${title}" by "${artist}"`);

    const result = await fetchLyrics(title, artist, durationSecs) ??
                   { syncedLyrics: null, plainLyrics: null, source: 'none' as const };

    // If no match, try with just title (no artist) as last resort
    if (!result.syncedLyrics && !result.plainLyrics && artist) {
      const titleOnly = await fetchLyrics(title, '', undefined);
      if (titleOnly?.syncedLyrics || titleOnly?.plainLyrics) {
        cache.set(key, titleOnly!);
        return titleOnly!;
      }
    }

    cache.set(key, result);
    return result;
  },

  // Parse LRC format into timed lines: [{ time: seconds, text: string }]
  parseLRC(lrc: string): { time: number; text: string }[] {
    const lines: { time: number; text: string }[] = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
    let match;
    while ((match = regex.exec(lrc)) !== null) {
      const mins = parseInt(match[1]);
      const secs = parseInt(match[2]);
      const ms   = parseInt(match[3].padEnd(3, '0'));
      const time = mins * 60 + secs + ms / 1000;
      const text = match[4].trim();
      if (text) lines.push({ time, text });
    }
    return lines;
  },
};
