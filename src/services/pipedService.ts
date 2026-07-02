export interface Song {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // seconds
  offlineUrl?: string; // blob URL for offline playback from IndexedDB
}

import { API_BASE_URL } from './apiConfig';

// Search uses our local Express server (yt-search scrapes YouTube server-side)
// Playback uses the YouTube IFrame Player API directly — no stream extraction needed!
export const pipedService = {
  async searchSongs(query: string): Promise<Song[]> {
    if (!query.trim()) return [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(15000)
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
