// src/services/streamService.ts
// Resolves stream URLs client-side using Cobalt API (with CORS-enabled direct audio tunnels)
// Primary: Cobalt (cobaltapi.kittycat.boo) -> fetched as blob with correct MIME type
// Fallback: Server-side proxy via backend

import { API_BASE_URL } from './apiConfig';

export interface StreamResult {
  url: string;
  type: string;
  source: string;
}

const COBALT_INSTANCES = [
  'https://cobaltapi.kittycat.boo/'
];

// Revokable blob URLs - clean up previous ones to prevent memory leaks
let _lastBlobUrl: string | null = null;
function revokePreviousBlob() {
  if (_lastBlobUrl) {
    URL.revokeObjectURL(_lastBlobUrl);
    _lastBlobUrl = null;
  }
}

/**
 * Resolve a Cobalt tunnel URL for the given YouTube video.
 * Returns the raw tunnel URL (not yet fetched as audio data).
 */
async function resolveCobaltTunnelUrl(videoId: string): Promise<string | null> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  for (const base of COBALT_INSTANCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

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
        console.log(`[stream] Cobalt resolved tunnel URL via: ${base}`);
        return json.url;
      }
    } catch (e: any) {
      console.log(`[stream] Cobalt ${base} failed: ${e?.message?.substring?.(0, 50)}`);
    }
  }
  return null;
}

/**
 * Fetch audio data from a Cobalt tunnel URL and return a blob URL
 * with the correct MIME type. This is necessary because Cobalt's tunnel
 * responses lack Content-Type headers and send Content-Length: 0,
 * which causes HTML5 <audio> elements to abort playback.
 */
async function fetchCobaltAsBlob(tunnelUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // 30s for full download

    const resp = await fetch(tunnelUrl, {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!resp.ok) {
      console.warn(`[stream] Cobalt tunnel fetch failed: ${resp.status}`);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength < 1000) {
      console.warn(`[stream] Cobalt tunnel returned too little data: ${arrayBuffer.byteLength} bytes`);
      return null;
    }

    // Revoke previous blob to free memory
    revokePreviousBlob();

    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);
    _lastBlobUrl = blobUrl;

    console.log(`[stream] ✅ Cobalt audio blob created: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
    return blobUrl;
  } catch (e: any) {
    console.warn(`[stream] Cobalt blob fetch error: ${e?.message?.substring?.(0, 60)}`);
    return null;
  }
}

export async function getStreamUrl(videoId: string): Promise<StreamResult | null> {
  console.log(`[stream] Resolving stream URL for: ${videoId}`);

  // 1. Try Cobalt — resolve tunnel URL, then fetch as blob with correct MIME type
  try {
    const tunnelUrl = await resolveCobaltTunnelUrl(videoId);
    if (tunnelUrl) {
      console.log('[stream] Fetching Cobalt audio as blob...');
      const blobUrl = await fetchCobaltAsBlob(tunnelUrl);
      if (blobUrl) {
        return {
          url: blobUrl,
          type: 'audio/mpeg',
          source: 'cobalt-client-blob'
        };
      }
    }
  } catch (e) {
    console.warn('[stream] Cobalt resolution error:', e);
  }

  // 2. Fallback to server-side resolution (yt-dlp / youtubei on backend)
  console.log('[stream] Fallback: Using backend server-side proxy stream');
  return {
    url: `${API_BASE_URL}/api/proxy-stream?id=${videoId}`,
    type: 'audio/mp4',
    source: 'server-resolved-proxied'
  };
}
