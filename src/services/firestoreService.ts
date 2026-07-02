// src/services/firestoreService.ts
import {
  doc, setDoc, getDoc,
  onSnapshot, type Unsubscribe
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import type { Song } from './pipedService';

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  createdAt: number;
}

// ── Liked Songs ──────────────────────────────────────────────────────────────
export const firestoreService = {
  async saveLikedSongs(userId: string, songs: Song[]): Promise<void> {
    if (!isFirebaseConfigured) return;
    await setDoc(doc(db, 'users', userId, 'data', 'liked'), { songs, updatedAt: Date.now() });
  },

  async getLikedSongs(userId: string): Promise<Song[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDoc(doc(db, 'users', userId, 'data', 'liked'));
    return snap.exists() ? (snap.data().songs as Song[]) : [];
  },

  onLikedSongsChange(userId: string, callback: (songs: Song[]) => void): Unsubscribe {
    if (!isFirebaseConfigured) return () => {};
    return onSnapshot(doc(db, 'users', userId, 'data', 'liked'), (snap) => {
      if (snap.exists()) callback(snap.data().songs as Song[]);
    });
  },

  // ── History ────────────────────────────────────────────────────────────────
  async saveHistory(userId: string, history: Song[]): Promise<void> {
    if (!isFirebaseConfigured) return;
    await setDoc(doc(db, 'users', userId, 'data', 'history'), {
      songs: history.slice(0, 100), updatedAt: Date.now()
    });
  },

  async getHistory(userId: string): Promise<Song[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDoc(doc(db, 'users', userId, 'data', 'history'));
    return snap.exists() ? (snap.data().songs as Song[]) : [];
  },

  // ── Playlists ──────────────────────────────────────────────────────────────
  async savePlaylists(userId: string, playlists: Playlist[]): Promise<void> {
    if (!isFirebaseConfigured) return;
    await setDoc(doc(db, 'users', userId, 'data', 'playlists'), {
      playlists, updatedAt: Date.now()
    });
  },

  async getPlaylists(userId: string): Promise<Playlist[]> {
    if (!isFirebaseConfigured) return [];
    const snap = await getDoc(doc(db, 'users', userId, 'data', 'playlists'));
    return snap.exists() ? (snap.data().playlists as Playlist[]) : [];
  },

  onPlaylistsChange(userId: string, callback: (playlists: Playlist[]) => void): Unsubscribe {
    if (!isFirebaseConfigured) return () => {};
    return onSnapshot(doc(db, 'users', userId, 'data', 'playlists'), (snap) => {
      if (snap.exists()) callback(snap.data().playlists as Playlist[]);
    });
  },
};
