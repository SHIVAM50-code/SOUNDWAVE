// src/hooks/useAudioPlayer.ts
// Unified HTML5 Audio Player (supports offline, online streaming, and flawless background playback)
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song } from '../services/pipedService';
import { downloadService } from '../services/downloadService';
import { getStreamUrl } from '../services/streamService';
import { API_BASE_URL } from '../services/apiConfig';

export type LoopMode = 'none' | 'all' | 'one';

export function useAudioPlayer() {
  const [currentSong, setCurrentSong]   = useState<Song | null>(null);
  const [queue, setQueue]               = useState<Song[]>([]);
  const [history, setHistory]           = useState<Song[]>([]);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [currentTime, setCurrentTime]   = useState(0);
  const [duration, setDuration]         = useState(0);
  const [volume, setVolumeState]        = useState(1);
  const [loopMode, setLoopMode]         = useState<LoopMode>('none');
  const [isShuffle, setIsShuffle]       = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // refs
  const audioRef            = useRef<HTMLAudioElement | null>(null);
  const queueIndexRef       = useRef<number>(-1);
  const currentSongRef      = useRef<Song | null>(null);
  const queueRef            = useRef<Song[]>([]);
  const loopModeRef         = useRef<LoopMode>('none');
  const isShuffleRef        = useRef(false);
  const playSongRef         = useRef<((song: Song, newQueue?: Song[]) => void) | null>(null);
  const nextTrackRef        = useRef<(() => void) | null>(null);

  // Sync state → refs
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // ── Update Media Session ──────────────────────────────────────────────────
  const updateMediaSession = useCallback((song: Song) => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: 'Soundwave',
      artwork: [
        { src: song.thumbnail, sizes: '96x96',   type: 'image/jpeg' },
        { src: song.thumbnail, sizes: '256x256', type: 'image/jpeg' },
        { src: song.thumbnail, sizes: '512x512', type: 'image/jpeg' },
      ],
    });
    navigator.mediaSession.playbackState = 'playing';
  }, []);

  // ── Initialize HTML5 Audio ──────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.id = 'soundwave-audio';
    audioRef.current = audio;
    window._audioPlayer = audio;

    const savedVol = localStorage.getItem('soundwave_volume');
    const savedVolNum = savedVol ? parseFloat(savedVol) : 1;
    audio.volume = savedVolNum;
    setVolumeState(savedVolNum);

    // HTML5 Audio Event Listeners
    audio.onplay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    };
    audio.onpause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };
    audio.onwaiting = () => {
      setIsLoading(true);
    };
    audio.onplaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };
    audio.ondurationchange = () => {
      if (audio.duration && !isNaN(audio.duration)) setDuration(audio.duration);
    };
    audio.onended = () => {
      setIsPlaying(false);
      if (loopModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        nextTrackRef.current?.();
      }
    };
    audio.onerror = (e) => {
      console.error('[audio] Playback error:', e);
      setIsLoading(false);
      setIsPlaying(false);
      showToast('Playback error — skipping...');
      setTimeout(() => nextTrackRef.current?.(), 1500);
    };

    // Media Session action handlers (for background lockscreen controls)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play',  () => {
        audio.play().catch(console.error);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
      });
      navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrackRef.current?.());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrackRef.current?.());
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime !== undefined) {
          audio.currentTime = d.seekTime;
          setCurrentTime(d.seekTime);
        }
      });
    }

    return () => {
      audio.pause();
      audioRef.current = null;
      window._audioPlayer = null;
    };
  }, [showToast]);

  // ── Track navigation ──────────────────────────────────────────────────────
  const nextTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    let nextIdx = queueIndexRef.current + 1;
    if (isShuffleRef.current) {
      nextIdx = Math.floor(Math.random() * q.length);
    } else if (nextIdx >= q.length) {
      if (loopModeRef.current === 'all') nextIdx = 0;
      else { showToast('End of Queue'); return; }
    }
    queueIndexRef.current = nextIdx;
    playSongRef.current?.(q[nextIdx]);
  }, [showToast]);

  useEffect(() => { nextTrackRef.current = nextTrack; }, [nextTrack]);

  const prevTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    
    const curTime = audioRef.current?.currentTime || 0;
    if (curTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    let prevIdx = queueIndexRef.current - 1;
    if (prevIdx < 0) prevIdx = loopModeRef.current === 'all' ? q.length - 1 : 0;
    queueIndexRef.current = prevIdx;
    playSongRef.current?.(q[prevIdx]);
  }, []);

  const prevTrackRef = useRef(prevTrack);
  useEffect(() => { prevTrackRef.current = prevTrack; }, [prevTrack]);

  // ── Main playSong ─────────────────────────────────────────────────────────
  const playSong = useCallback(async (song: Song, newQueue: Song[] = []) => {
    setCurrentSong(song);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(song.duration || 0);

    // Sync queue
    if (newQueue.length > 0) {
      setQueue(newQueue);
      queueRef.current = newQueue;
      queueIndexRef.current = newQueue.findIndex((s) => s.id === song.id);
    } else {
      const q = queueRef.current;
      const idx = q.findIndex((s) => s.id === song.id);
      if (idx !== -1) {
        queueIndexRef.current = idx;
      } else {
        const updated = [...q, song];
        setQueue(updated);
        queueRef.current = updated;
        queueIndexRef.current = updated.length - 1;
      }
    }

    updateMediaSession(song);

    // History
    setHistory((prev) => {
      const updated = [song, ...prev.filter((s) => s.id !== song.id)].slice(0, 50);
      localStorage.setItem('soundwave_history', JSON.stringify(updated));
      return updated;
    });

    const audio = audioRef.current;
    if (!audio) return;

    // Check for offline download first
    let blobUrl: string | null = null;
    try {
      blobUrl = await downloadService.getOfflineUrl(song.id);
    } catch (_) {}

    if (blobUrl) {
      console.log('[player] Playing from local IndexedDB:', song.title);
      audio.src = blobUrl;
      audio.play().catch((e) => {
        console.error('[player] Offline play failed:', e);
        setIsLoading(false);
      });
    } else {
      // Online mode: Try direct stream URL, fall back to server proxy
      console.log('[player] Fetching direct stream URL for:', song.title);
      let directStream = null;
      try {
        directStream = await getStreamUrl(song.id);
      } catch (_) {}

      if (directStream?.url) {
        console.log(`[player] Direct stream URL succeeded (${directStream.source}) — playing via HTML5 Audio`);
        audio.src = directStream.url;
        audio.play().catch((err) => {
          console.warn('[player] Direct stream play failed, falling back to server proxy:', err);
          playViaServerProxy(song, audio);
        });
      } else {
        console.warn('[player] Direct stream URL not resolved, playing via server proxy');
        playViaServerProxy(song, audio);
      }
    }
  }, [updateMediaSession]);

  playSongRef.current = playSong;

  function playViaServerProxy(song: Song, audio: HTMLAudioElement) {
    console.log('[player] Playing via server proxy stream...');
    audio.src = `${API_BASE_URL}/api/proxy-stream?id=${song.id}`;
    audio.play().catch((err) => {
      console.error('[player] Server proxy play failed:', err);
      setIsLoading(false);
      showToast('Playback failed — skipping track...');
      setTimeout(() => nextTrackRef.current?.(), 1500);
    });
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!currentSongRef.current || !audioRef.current) return;
    const audio = audioRef.current;
    audio.paused ? audio.play().catch(console.error) : audio.pause();
  }, []);

  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);

  const seekTo = useCallback((time: number) => {
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const seekToRef = useRef(seekTo);
  useEffect(() => { seekToRef.current = seekTo; }, [seekTo]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('soundwave_volume', vol.toString());
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  const toggleLoop = useCallback(() => {
    setLoopMode((prev) => {
      const map: Record<LoopMode, LoopMode> = { none: 'all', all: 'one', one: 'none' };
      const next = map[prev];
      loopModeRef.current = next;
      showToast(`Loop: ${next}`);
      return next;
    });
  }, [showToast]);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => {
      const next = !prev;
      isShuffleRef.current = next;
      showToast(`Shuffle: ${next ? 'On' : 'Off'}`);
      return next;
    });
  }, [showToast]);

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => {
      if (prev.some((s) => s.id === song.id)) { showToast('Already in Queue'); return prev; }
      const updated = [...prev, song];
      queueRef.current = updated;
      showToast('Added to Queue');
      return updated;
    });
  }, [showToast]);

  return {
    currentSong, queue, history,
    isPlaying, isLoading,
    currentTime, duration,
    volume, loopMode, isShuffle, toastMessage,
    playSong, togglePlay, nextTrack, prevTrack,
    seekTo, setVolume, toggleLoop, toggleShuffle,
    addToQueue, setQueue, setHistory, showToast,
  };
}

export type AudioPlayerHookType = ReturnType<typeof useAudioPlayer>;
