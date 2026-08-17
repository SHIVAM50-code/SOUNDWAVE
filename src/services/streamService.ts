// src/services/streamService.ts
// Resolves stream URLs using Piped client-side APIs, proxied through our backend for CORS-bypassing range support.
import { API_BASE_URL } from './apiConfig';

export interface StreamResult {
  url: string;
  type: string;
  source: string;
}

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.privacydev.net',
  'https://piped-api.lunar.icu'
];

async function tryPipedBrowser(videoId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(`${base}/streams/${videoId}`, { signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.error) continue;

      // Strategy 1: Pure audio streams
      const audioStreams: any[] = data.audioStreams || [];
      if (audioStreams.length > 0) {
        const chosen = audioStreams.find((s: any) => s.mimeType?.includes('audio/mp4'))
                    || audioStreams.find((s: any) => s.mimeType?.includes('audio/webm'))
                    || audioStreams[0];
        if (chosen?.url) {
          console.log(`[stream] Resolved audio stream client-side from Piped: ${base}`);
          return chosen.url;
        }
      }

      // Strategy 2: Video streams with audio (videoOnly=false)
      const videoStreams: any[] = data.videoStreams || [];
      const withAudio = videoStreams.filter((s: any) => !s.videoOnly);
      if (withAudio.length > 0) {
        const mp4s = withAudio.filter((s: any) => s.mimeType?.includes('video/mp4'));
        const chosen = mp4s[mp4s.length - 1] || withAudio[withAudio.length - 1];
        if (chosen?.url) {
          console.log(`[stream] Resolved video stream client-side from Piped: ${base}`);
          return chosen.url;
        }
      }
    } catch (e: any) {
      console.log(`[stream] Piped client-side ${base} failed: ${e?.message?.substring?.(0, 50)}`);
    }
  }
  return null;
}

export async function getStreamUrl(videoId: string): Promise<StreamResult | null> {
  console.log(`[stream] Resolving stream URL for: ${videoId}`);

  // 1. Try to resolve client-side using Piped (residential/mobile IP)
  try {
    const directUrl = await tryPipedBrowser(videoId);
    if (directUrl) {
      const proxiedUrl = `${API_BASE_URL}/api/proxy-stream?url=${encodeURIComponent(directUrl)}`;
      console.log('[stream] ✅ Using client-resolved stream routed through backend proxy');
      return {
        url: proxiedUrl,
        type: 'audio/mp4',
        source: 'client-resolved-proxied'
      };
    }
  } catch (e) {
    console.warn('[stream] Client-side resolution error:', e);
  }

  // 2. Fallback to server-side resolution
  console.log('[stream] Fallback: Using backend server-side proxy stream');
  return {
    url: `${API_BASE_URL}/api/proxy-stream?id=${videoId}`,
    type: 'audio/mp4',
    source: 'server-resolved-proxied'
  };
}
