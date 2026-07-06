// src/hooks/useAudioPlayer.ts
// Dual-mode player:
//   • Online songs  → YouTube IFrame Player API (works on any IP, no server needed for audio)
//   • Offline songs → HTML5 Audio from IndexedDB blob

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song } from '../services/pipedService';
import { downloadService } from '../services/downloadService';

export type LoopMode = 'none' | 'all' | 'one';

// ── YouTube IFrame API types ──────────────────────────────────────────────────
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    _ytPlayer: any;
    _audioPlayer: HTMLAudioElement | null;
  }
}

const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

// ── Load YouTube IFrame API once ──────────────────────────────────────────────
let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) { resolve(); return; }
    window.onYouTubeIframeAPIReady = resolve;
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}

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
  const ytPlayerRef         = useRef<any>(null);
  const audioRef            = useRef<HTMLAudioElement | null>(null);
  const isOfflineRef        = useRef(false);
  const queueIndexRef       = useRef<number>(-1);
  const currentSongRef      = useRef<Song | null>(null);
  const queueRef            = useRef<Song[]>([]);
  const loopModeRef         = useRef<LoopMode>('none');
  const isShuffleRef        = useRef(false);
  const timeIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSongRef         = useRef<((song: Song, newQueue?: Song[]) => void) | null>(null);
  const nextTrackRef        = useRef<(() => void) | null>(null);  // avoids stale closures
  const consecutiveFailsRef = useRef(0);   // stops cascade when too many songs are blocked

  // Sync state → refs
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // ── Time polling for YouTube IFrame player ────────────────────────────────
  const startTimePolling = useCallback(() => {
    if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
    timeIntervalRef.current = setInterval(() => {
      if (!isOfflineRef.current && ytPlayerRef.current) {
        try {
          const t = ytPlayerRef.current.getCurrentTime?.() || 0;
          const d = ytPlayerRef.current.getDuration?.() || 0;
          setCurrentTime(t);
          if (d > 0 && !isNaN(d)) setDuration(d);
        } catch (_) {}
      }
    }, 500);
  }, []);

  const stopTimePolling = useCallback(() => {
    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
      timeIntervalRef.current = null;
    }
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

  // ── Handle YT player state changes ───────────────────────────────────────
  const onYTStateChange = useCallback((event: any) => {
    const state: number = event.data;

    // Clear any existing buffering timeout
    if (bufferingTimeoutRef.current) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }

    if (state === YT_STATE.PLAYING) {
      // Successful playback — reset fail counter
      consecutiveFailsRef.current = 0;
      setIsPlaying(true);
      setIsLoading(false);
      startTimePolling();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (state === YT_STATE.PAUSED) {
      setIsPlaying(false);
      stopTimePolling();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (state === YT_STATE.BUFFERING) {
      setIsLoading(true);
      // Start a 12-second timeout to catch silent network hangs (like QUIC protocol errors)
      bufferingTimeoutRef.current = setTimeout(() => {
        console.warn('[YTPlayer] Buffering timed out (12s) — forcing skip');
        setIsLoading(false);
        setIsPlaying(false);
        consecutiveFailsRef.current += 1;
        
        if (consecutiveFailsRef.current >= 5) {
          consecutiveFailsRef.current = 0;
          showToast('Network/Playback issues detected — stopping auto-play');
          return;
        }

        showToast('Stream hung (network error) — skipping...');
        nextTrackRef.current?.();
      }, 12000);
    } else if (state === YT_STATE.ENDED) {
      setIsPlaying(false);
      stopTimePolling();
      if (loopModeRef.current === 'one') {
        ytPlayerRef.current?.seekTo(0, true);
        ytPlayerRef.current?.playVideo();
      } else {
        nextTrackRef.current?.();
      }
    }
  }, [startTimePolling, stopTimePolling, showToast]);

  // ── Initialize YouTube IFrame Player & HTML5 Audio ───────────────────────
  useEffect(() => {
    // HTML5 Audio for offline blobs
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    window._audioPlayer = audio;

    const savedVol = localStorage.getItem('soundwave_volume');
    const savedVolNum = savedVol ? parseFloat(savedVol) : 1;
    audio.volume = savedVolNum;
    setVolumeState(savedVolNum);

    audio.onplay     = () => {
      if (!isOfflineRef.current) return;
      setIsPlaying(true);  
      setIsLoading(false);
    };
    audio.onpause    = () => {
      if (!isOfflineRef.current) return;
      setIsPlaying(false);
    };
    audio.onwaiting  = () => {
      if (!isOfflineRef.current) return;
      setIsLoading(true);
    };
    audio.onplaying  = () => {
      if (!isOfflineRef.current) return;
      setIsLoading(false); 
      setIsPlaying(true);
    };
    audio.ontimeupdate = () => {
      if (!isOfflineRef.current) return;
      setCurrentTime(audio.currentTime);
    };
    audio.ondurationchange = () => {
      if (!isOfflineRef.current) return;
      if (audio.duration && !isNaN(audio.duration)) setDuration(audio.duration);
    };
    audio.onended = () => {
      if (!isOfflineRef.current) return;
      setIsPlaying(false);
      if (loopModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        nextTrackRef.current?.();
      }
    };
    audio.onerror = () => {
      if (!isOfflineRef.current) return;
      setIsLoading(false); 
      setIsPlaying(false);
      showToast('Playback error — skipping...');
      setTimeout(() => nextTrackRef.current?.(), 1500);
    };


    // Initialize YouTube IFrame API + player
    let ytDiv: HTMLDivElement | null = null;
    (async () => {
      try {
        await loadYTApi();
        ytDiv = document.createElement('div');
        ytDiv.id = '__yt_player__';
        ytDiv.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;';
        document.body.appendChild(ytDiv);

        ytPlayerRef.current = new window.YT.Player('__yt_player__', {
          width: '1', height: '1',
          videoId: '',
          playerVars: {
            autoplay: 0, controls: 0, playsinline: 1,
            rel: 0, modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              console.log('[YTPlayer] Ready ✅');
              window._ytPlayer = ytPlayerRef.current;
              // Apply saved volume
              ytPlayerRef.current?.setVolume(Math.round(savedVolNum * 100));
            },
            onStateChange: onYTStateChange,
            onError: (e: any) => {
              const code: number = e.data;
              // 101/150 = embedding not allowed by video owner
              // 100    = video not found / private
              // 2      = invalid param
              // 5      = HTML5 player error
              const isBlocked = code === 101 || code === 150 || code === 100;
              console.warn(`[YTPlayer] Error ${code} (${isBlocked ? 'blocked/unavailable' : 'playback error'})`);

              setIsLoading(false);
              setIsPlaying(false);

              consecutiveFailsRef.current += 1;
              const fails = consecutiveFailsRef.current;

              if (fails >= 5) {
                // Too many consecutive blocked songs — stop cascading
                consecutiveFailsRef.current = 0;
                showToast('Many songs blocked by YouTube — try different songs');
                return; // Don't auto-skip any further
              }

              const msg = isBlocked
                ? `Song unavailable (${fails}/5) — skipping...`
                : `Playback error — skipping...`;
              showToast(msg);
              setTimeout(() => nextTrackRef.current?.(), 800);
            },
          },
        });
      } catch (err) {
        console.error('[YTPlayer] Init failed:', err);
      }
    })();

    // Media Session action handlers
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play',  () => togglePlayRef.current?.());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayRef.current?.());
      navigator.mediaSession.setActionHandler('nexttrack',     () => playSongRef.current && nextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => playSongRef.current && prevTrack());
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime !== undefined) seekToRef.current?.(d.seekTime);
      });
    }

    return () => {
      audio.pause();
      audioRef.current = null;
      window._audioPlayer = null;
      stopTimePolling();
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current);
      try { ytPlayerRef.current?.destroy(); } catch (_) {}
      if (ytDiv) ytDiv.remove();
      ytPlayerRef.current = null;
    };
  }, [onYTStateChange, stopTimePolling, showToast]);

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
    // Restart if > 3s in
    const curTime = isOfflineRef.current
      ? (audioRef.current?.currentTime || 0)
      : (ytPlayerRef.current?.getCurrentTime?.() || 0);
    if (curTime > 3) {
      if (isOfflineRef.current) { audioRef.current!.currentTime = 0; }
      else { ytPlayerRef.current?.seekTo(0, true); }
      setCurrentTime(0);
      return;
    }
    let prevIdx = queueIndexRef.current - 1;
    if (prevIdx < 0) prevIdx = loopModeRef.current === 'all' ? q.length - 1 : 0;
    queueIndexRef.current = prevIdx;
    playSongRef.current?.(q[prevIdx]);
  }, []);

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

    // Lock screen / notification metadata
    updateMediaSession(song);

    // History
    setHistory((prev) => {
      const updated = [song, ...prev.filter((s) => s.id !== song.id)].slice(0, 50);
      localStorage.setItem('soundwave_history', JSON.stringify(updated));
      return updated;
    });

    // 1. Check for offline download first
    let blobUrl: string | null = null;
    try {
      blobUrl = await downloadService.getOfflineUrl(song.id);
    } catch (_) {}

    if (blobUrl) {
      // ── Offline mode: HTML5 Audio ─────────────────────────────────────────
      console.log('[player] 🔇 Offline playback:', song.title);
      isOfflineRef.current = true;
      stopTimePolling();
      // Stop YT player if running
      try { ytPlayerRef.current?.stopVideo(); } catch (_) {}
      const audio = audioRef.current!;
      audio.src = blobUrl;
      audio.play().catch((e) => {
        console.error('[player] Offline play failed:', e);
        setIsLoading(false);
      });
    } else {
      // ── Online mode: YouTube IFrame Player ───────────────────────────────
      console.log('[player] ▶️ Online YT playback:', song.title);
      isOfflineRef.current = false;
      // Stop HTML5 audio if running
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ''; }
      // Load via YT IFrame API
      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideoById(song.id);
        // loadVideoById auto-plays; no extra .playVideo() needed
      } else {
        console.warn('[player] YT player not ready yet, retrying in 1s...');
        setTimeout(() => {
          if (ytPlayerRef.current) ytPlayerRef.current.loadVideoById(song.id);
          else setIsLoading(false);
        }, 1000);
      }
    }
  }, [updateMediaSession, stopTimePolling]);

  playSongRef.current = playSong;

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!currentSongRef.current) return;
    if (isOfflineRef.current) {
      const audio = audioRef.current;
      if (!audio) return;
      audio.paused ? audio.play().catch(console.error) : audio.pause();
    } else {
      const yt = ytPlayerRef.current;
      if (!yt) return;
      const state = yt.getPlayerState?.();
      state === YT_STATE.PLAYING ? yt.pauseVideo() : yt.playVideo();
    }
  }, []);

  // Expose togglePlay via ref so Media Session handler (in useEffect) can call it
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);

  const seekTo = useCallback((time: number) => {
    setCurrentTime(time);
    if (isOfflineRef.current) {
      if (audioRef.current) audioRef.current.currentTime = time;
    } else {
      ytPlayerRef.current?.seekTo(time, true);
    }
  }, []);

  const seekToRef = useRef(seekTo);
  useEffect(() => { seekToRef.current = seekTo; }, [seekTo]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('soundwave_volume', vol.toString());
    if (audioRef.current) audioRef.current.volume = vol;
    ytPlayerRef.current?.setVolume(Math.round(vol * 100));
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
