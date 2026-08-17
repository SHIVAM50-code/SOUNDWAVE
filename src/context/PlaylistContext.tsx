// src/context/PlaylistContext.tsx
// Lets any component (SongCard, AudioPlayerControls, etc.) read playlists and
// add songs to them without every page having to pass the props down manually.
import { createContext, useContext } from 'react';
import type { Playlist } from '../services/firestoreService';
import type { Song } from '../services/pipedService';

export interface PlaylistContextValue {
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, song: Song) => void;
  createPlaylist: (name: string, initialSong?: Song) => void;
}

export const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function usePlaylistContext(): PlaylistContextValue {
  const ctx = useContext(PlaylistContext);
  if (!ctx) {
    throw new Error('usePlaylistContext must be used within a <PlaylistContext.Provider>');
  }
  return ctx;
}
