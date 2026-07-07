// src/services/streamService.ts
// Gets YouTube audio stream URLs entirely from the BROWSER side (no server IP blocking)
// Primary: Piped API instances (browser IP = residential = not blocked by YouTube)
// Fallback: Server /api/stream

import { API_BASE_URL } from './apiConfig';

export interface StreamResult {
  url: string;
  type: string;
  source: string;
}

// Piped instances with CORS enabled — called directly from the browser
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://piped-api.blackgoku.moe',
  'https://pipedapi.lunar.icu',
  'https://pipedapi.privacydev.net'
];

async function tryPipedBrowser(videoId: string): Promise<StreamResult | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(`${base}/streams/${videoId}`, { signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.error) continue;

      const streams: any[] = data.audioStreams || [];
      const chosen = streams.find((s) => s.mimeType?.includes('audio/mp4'))
                  || streams.find((s) => s.mimeType?.includes('audio/webm'))
                  || streams[0];

      if (chosen?.url) {
        console.log(`[stream] ✅ Piped browser (${base})`);
        return { url: chosen.url, type: chosen.mimeType || 'audio/mp4', source: `piped:${base}` };
      }
    } catch (e: any) {
      console.log(`[stream] Piped ${base} failed: ${e?.message?.substring?.(0, 60)}`);
    }
  }
  return null;
}

async function tryServerStream(videoId: string): Promise<StreamResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${API_BASE_URL}/api/stream?id=${videoId}`, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.url) {
      console.log(`[stream] ✅ Server stream (${data.source})`);
      return { url: data.url, type: data.type || 'audio/mp4', source: data.source };
    }
  } catch (e: any) {
    console.log(`[stream] Server /api/stream failed: ${e?.message?.substring?.(0, 80)}`);
  }
  return null;
}

/**
 * Gets a streamable audio URL for a YouTube video ID.
 * Tries browser-side Piped API first (no server IP blocking),
 * then falls back to server-side extraction.
 */
export async function getStreamUrl(videoId: string): Promise<StreamResult | null> {
  console.log(`[stream] Fetching stream URL for: ${videoId}`);

  // 1. Try Piped directly from browser (residential IP, no blocking)
  const piped = await tryPipedBrowser(videoId);
  if (piped) return piped;

  // 2. Fallback to server (yt-dlp / ytdl-core / invidious)
  const server = await tryServerStream(videoId);
  if (server) return server;

  console.error(`[stream] ❌ All sources failed for ${videoId}`);
  return null;
}
