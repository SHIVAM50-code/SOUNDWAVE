// src/hooks/useAudioPlayer.ts — Unified HTML5 Audio Player (supports offline and background audio)
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song } from '../services/pipedService';
import { downloadService } from '../services/downloadService';
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

  // References
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const queueIndexRef  = useRef<number>(-1);
  const currentSongRef = useRef<Song | null>(null);
  const queueRef       = useRef<Song[]>([]);
  const loopModeRef    = useRef<LoopMode>('none');
  const isShuffleRef   = useRef(false);
  const retryingRef    = useRef(false); // tracks whether we're mid-retry to avoid double-skip

  // Sync state to refs to prevent stale closure issues in callbacks
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // ── Set up Unified HTML Audio Element ──────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.id = 'soundwave-audio';
    audio.preload = 'auto';
    audioRef.current = audio;
    (window as any)._audioPlayer = audio; // Expose globally for speed control

    // Set saved volume
    const savedVol = localStorage.getItem('soundwave_volume');
    if (savedVol) {
      const vol = parseFloat(savedVol);
      audio.volume = vol;
      setVolumeState(vol);
    }

    // Media Session callbacks (for Android / iOS notification & lockscreen)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => audio.play().catch(console.error));
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime !== undefined) {
          audio.currentTime = d.seekTime;
          setCurrentTime(d.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const step = d.seekOffset ?? 10;
        const target = Math.max(0, audio.currentTime - step);
        audio.currentTime = target;
        setCurrentTime(target);
      });
      navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const step = d.seekOffset ?? 10;
        const target = Math.min(audio.duration || 0, audio.currentTime + step);
        audio.currentTime = target;
        setCurrentTime(target);
      });
    }

    // Audio element event listeners
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
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      if (loopModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        nextTrack();
      }
    };

    audio.onerror = async (e) => {
      console.error('[audio] Playback error:', e);
      // If we have a current song and haven't retried yet, try fetching a fresh stream URL
      const song = currentSongRef.current;
      if (song && !retryingRef.current && !audio.src.startsWith('blob:')) {
        retryingRef.current = true;
        console.log('[player] Retrying with fresh stream URL for:', song.title);
        try {
          const resp = await fetch(`${API_BASE_URL}/api/stream?id=${song.id}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.url) {
              audio.src = data.url;
              audio.play().catch(() => {
                setIsLoading(false);
                setIsPlaying(false);
                showToast('Playback failed — skipping track...');
                setTimeout(() => nextTrack(), 1500);
              });
              return;
            }
          }
        } catch (_) { /* fall through */ }
      }
      setIsLoading(false);
      setIsPlaying(false);
      showToast('Playback failed — skipping track...');
      setTimeout(() => nextTrack(), 1500);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
      (window as any)._audioPlayer = null;
    };
  }, []);

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

  const prevTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    
    // If more than 3 seconds in, restart the song
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    let prevIdx = queueIndexRef.current - 1;
    if (prevIdx < 0) {
      prevIdx = loopModeRef.current === 'all' ? q.length - 1 : 0;
    }
    queueIndexRef.current = prevIdx;
    playSongRef.current?.(q[prevIdx]);
  }, []);

  // ref so nextTrack/prevTrack can trigger playSong without circular deps
  const playSongRef = useRef<((song: Song, newQueue?: Song[]) => void) | null>(null);

  const playSong = useCallback(async (song: Song, newQueue: Song[] = []) => {
    setCurrentSong(song);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(song.duration || 0);
    retryingRef.current = false; // Reset retry flag for new song

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

    if (!audioRef.current) return;
    const audio = audioRef.current;

    try {
      // 1. Check if song is downloaded locally in IndexedDB (fully offline)
      const blobUrl = await downloadService.getOfflineUrl(song.id);
      if (blobUrl) {
        console.log('[player] Playing from local IndexedDB:', song.title);
        audio.src = blobUrl;
      } else {
        // 2. Online: get a direct CDN signed URL (supports range requests + proper seeking)
        console.log('[player] Fetching direct stream URL for:', song.title);
        try {
          const resp = await fetch(`${API_BASE_URL}/api/stream?id=${song.id}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.url) {
              console.log('[player] Got direct CDN URL, source:', data.source);
              audio.src = data.url;
            } else {
              throw new Error('No URL in stream response');
            }
          } else {
            throw new Error(`Stream API returned ${resp.status}`);
          }
        } catch (streamErr) {
          // 3. Fallback: use proxy-stream (no range support, but works as last resort)
          console.warn('[player] Direct URL failed, falling back to proxy-stream:', streamErr);
          audio.src = `${API_BASE_URL}/api/proxy-stream?id=${song.id}`;
        }
      }
    } catch (e) {
      console.warn('[player] IndexDB check failed, falling back to online streaming:', e);
      audio.src = `${API_BASE_URL}/api/proxy-stream?id=${song.id}`;
    }

    // Set lockscreen metadata
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: 'Soundwave',
        artwork: [
          { src: song.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: song.thumbnail, sizes: '128x128', type: 'image/jpeg' },
          { src: song.thumbnail, sizes: '192x192', type: 'image/jpeg' },
          { src: song.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: song.thumbnail, sizes: '384x384', type: 'image/jpeg' },
          { src: song.thumbnail, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    }

    // Add to history
    setHistory((prev) => {
      const filtered = prev.filter((s) => s.id !== song.id);
      const updated = [song, ...filtered].slice(0, 50);
      localStorage.setItem('soundwave_history', JSON.stringify(updated));
      return updated;
    });

    // Start playing
    audio.play().catch((e) => {
      console.error('[player] Playback failed on start:', e);
      setIsLoading(false);
    });
  }, []);

  playSongRef.current = playSong;

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentSongRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    setVolumeState(vol);
    localStorage.setItem('soundwave_volume', vol.toString());
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
      if (prev.some((s) => s.id === song.id)) {
        showToast('Already in Queue');
        return prev;
      }
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
    addToQueue, setQueue, setHistory, showToast
  };
}

export type AudioPlayerHookType = ReturnType<typeof useAudioPlayer>;
