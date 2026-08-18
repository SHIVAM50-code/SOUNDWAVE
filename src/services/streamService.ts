// src/services/streamService.ts
// Resolves stream URLs client-side using public Cobalt API instances (with CORS-enabled direct audio tunnels)
// Primary: Cobalt (api.kittycat.boo) -> plays direct mp3 audio
// Secondary: Piped browser-direct
// Fallback: Server-side proxy

import { API_BASE_URL } from './apiConfig';

export interface StreamResult {
  url: string;
  type: string;
  source: string;
}

const COBALT_INSTANCES = [
  'https://cobaltapi.kittycat.boo/'
];

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.privacydev.net'
];

async function tryCobaltBrowser(videoId: string): Promise<string | null> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  for (const base of COBALT_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      
      const resp = await fetch(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          url: youtubeUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timer);
      if (!resp.ok) continue;
      
      const json = await resp.json();
      if (json.status === 'tunnel' && json.url) {
        console.log(`[stream] Resolved audio stream client-side via Cobalt: ${base}`);
        return json.url;
      }
    } catch (e: any) {
      console.log(`[stream] Cobalt ${base} failed: ${e?.message?.substring?.(0, 50)}`);
    }
  }
  return null;
}

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

  // 1. Try Cobalt (kittycat.boo) first - extremely fast, routed through our backend proxy to enforce correct headers
  try {
    const cobaltUrl = await tryCobaltBrowser(videoId);
    if (cobaltUrl) {
      console.log('[stream] ✅ Using Cobalt client-resolved audio stream directly');
      return {
        url: cobaltUrl,
        type: 'audio/mp3',
        source: 'cobalt-client-resolved-direct'
      };
    }
  } catch (e) {
    console.warn('[stream] Cobalt resolution error:', e);
  }

  // 2. Try Piped second
  try {
    const pipedUrl = await tryPipedBrowser(videoId);
    if (pipedUrl) {
      console.log('[stream] ✅ Using Piped client-resolved stream directly');
      return {
        url: pipedUrl,
        type: 'audio/mp4',
        source: 'piped-client-resolved-direct'
      };
    }
  } catch (e) {
    console.warn('[stream] Piped resolution error:', e);
  }

  // 3. Fallback to server-side resolution
  console.log('[stream] Fallback: Using backend server-side proxy stream');
  return {
    url: `${API_BASE_URL}/api/proxy-stream?id=${videoId}`,
    type: 'audio/mp4',
    source: 'server-resolved-proxied'
  };
}
