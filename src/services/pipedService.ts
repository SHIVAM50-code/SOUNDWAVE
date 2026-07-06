export interface Song {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // seconds
  offlineUrl?: string; // blob URL for offline playback from IndexedDB
}

import { API_BASE_URL } from './apiConfig';

// Ping Render backend on app load to wake it from sleep (free tier sleeps after inactivity)
export function wakeupBackend() {
  if (!API_BASE_URL) return; // dev mode, no need
  fetch(`${API_BASE_URL}/api/search?q=ping`, { signal: AbortSignal.timeout(60000) })
    .then(() => console.log('[client] Backend warmed up'))
    .catch(() => {}); // silent
}

// Search uses our Express server (yt-search scrapes YouTube server-side)
export const pipedService = {
  async searchSongs(query: string): Promise<Song[]> {
    if (!query.trim()) return [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(45000) // 45s handles Render cold start (30-60s)
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const songs: Song[] = await res.json();
      console.log(`[client] Search returned ${songs.length} songs`);
      return songs;
    } catch (err) {
      console.error('[client] Search error:', err);
      return [];
    }
  },
};
