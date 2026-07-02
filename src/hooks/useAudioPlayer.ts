import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song } from '../services/pipedService';
import { downloadService } from '../services/downloadService';

export type LoopMode = 'none' | 'all' | 'one';

// Extend Window with YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (id: string, opts: YTPlayerOptions) => YTPlayer;
      PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayerOptions {
  height: string; width: string; videoId: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
}
interface YTPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(vol: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
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

  const ytPlayerRef    = useRef<YTPlayer | null>(null);
  const playerReadyRef = useRef(false);
  const pendingVideoRef = useRef<string | null>(null);
  const queueIndexRef  = useRef<number>(-1);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSongRef = useRef<Song | null>(null);
  const queueRef       = useRef<Song[]>([]);
  const loopModeRef    = useRef<LoopMode>('none');
  const isShuffleRef   = useRef(false);
  // Silent audio context — keeps browser from suspending playback when screen off
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const silentNodeRef  = useRef<OscillatorNode | null>(null);
  // Offline HTML Audio element for playing downloaded songs
  const offlineAudioRef = useRef<HTMLAudioElement | null>(null);
  const isOfflineModeRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Start/stop the silent oscillator that keeps audio context alive when screen is off
  const startSilentAudio = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      if (silentNodeRef.current) { try { silentNodeRef.current.stop(); } catch {} }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // near-silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      silentNodeRef.current = osc;
    } catch { /* AudioContext may not be available */ }
  }, []);

  const stopSilentAudio = useCallback(() => {
    try {
      silentNodeRef.current?.stop();
      silentNodeRef.current = null;
    } catch {}
  }, []);

  // Start polling for time/duration updates while playing
  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      // Offline mode polling
      if (isOfflineModeRef.current && offlineAudioRef.current) {
        const a = offlineAudioRef.current;
        setCurrentTime(a.currentTime);
        if (a.duration && !isNaN(a.duration)) setDuration(a.duration);
        setIsPlaying(!a.paused);
        setIsLoading(false);
        return;
      }
      // YouTube mode polling
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        const state = p.getPlayerState();
        const t = p.getCurrentTime();
        const d = p.getDuration();
        setCurrentTime(t);
        if (d && d > 0) setDuration(d);
        setIsPlaying(state === 1);
        setIsLoading(state === 3);
      } catch (_) { /* player not ready */ }
    }, 500);
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
    // playSong is defined below; we call it via ref
    playSongRef.current?.(q[nextIdx]);
  }, [showToast]);

  // ref so nextTrack / handleTrackEnd can call playSong without circular deps
  const playSongRef = useRef<((song: Song, newQueue?: Song[]) => void) | null>(null);

  // Initialize YouTube IFrame Player once API is ready
  useEffect(() => {
    const initPlayer = () => {
      if (ytPlayerRef.current) return; // already initialized

      ytPlayerRef.current = new window.YT.Player('yt-player', {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          iv_load_policy: 3,   // hide annotations
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          fs: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            (window as any)._ytPlayer = ytPlayerRef.current; // expose for speed control
            console.log('[YT] Player ready');
            // Apply saved volume
            const saved = localStorage.getItem('soundwave_volume');
            if (saved) {
              const vol = parseFloat(saved);
              ytPlayerRef.current?.setVolume(vol * 100);
              setVolumeState(vol);
            }
            // If a song was queued before the player was ready, play it now
            if (pendingVideoRef.current) {
              ytPlayerRef.current?.loadVideoById(pendingVideoRef.current);
              pendingVideoRef.current = null;
            }
          },
          onStateChange: (e) => {
            const YTState = window.YT.PlayerState;
            switch (e.data) {
              case YTState.PLAYING:
                setIsPlaying(true);
                setIsLoading(false);
                startPolling();
                startSilentAudio();
                break;
              case YTState.PAUSED:
                setIsPlaying(false);
                setIsLoading(false);
                stopSilentAudio();
                break;
              case YTState.BUFFERING:
                setIsLoading(true);
                break;
              case YTState.ENDED:
                setIsPlaying(false);
                stopPolling();
                // Handle loop/next
                if (loopModeRef.current === 'one') {
                  ytPlayerRef.current?.seekTo(0, true);
                  ytPlayerRef.current?.playVideo();
                } else {
                  nextTrack();
                }
                break;
              case YTState.UNSTARTED:
                setIsLoading(true);
                break;
            }
          },
          onError: (e) => {
            // YT error codes: 2=invalid id, 5=HTML5 error, 100=not found, 101/150=embed blocked
            const msg = e.data === 150 || e.data === 101
              ? 'This video cannot be embedded — skipping...'
              : `Playback error (${e.data}) — skipping...`;
            console.error('[YT] Player error code:', e.data, msg);
            setIsLoading(false);
            setIsPlaying(false);
            showToast(msg);
            setTimeout(() => nextTrack(), 1200);
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      // API already loaded (e.g. script cached by browser)
      initPlayer();
    } else {
      // Set the global callback YouTube IFrame API will call when ready
      window.onYouTubeIframeAPIReady = initPlayer;

      // Also poll as a safety net — handles cases where the callback fires
      // before this effect runs or the script loads out of order
      const pollId = setInterval(() => {
        if (window.YT && window.YT.Player && !ytPlayerRef.current) {
          clearInterval(pollId);
          initPlayer();
        }
      }, 300);

      // Give up polling after 15 seconds
      setTimeout(() => clearInterval(pollId), 15000);
    }

    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling, startSilentAudio, stopSilentAudio, nextTrack, showToast]);

  // Sync Media Session Metadata (Lock screen controls)
  useEffect(() => {
    if (!currentSong || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: 'Soundwave',
      artwork: [{ src: currentSong.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
    });

    setHistory((prev) => {
      const filtered = prev.filter((s) => s.id !== currentSong.id);
      const updated = [currentSong, ...filtered].slice(0, 50);
      localStorage.setItem('soundwave_history', JSON.stringify(updated));
      return updated;
    });
  }, [currentSong]);

  // Media Session playback state
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Media Session action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play',  () => ytPlayerRef.current?.playVideo());
      navigator.mediaSession.setActionHandler('pause', () => ytPlayerRef.current?.pauseVideo());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime !== undefined) seekTo(d.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const step = d.seekOffset ?? 10;
        seekTo(Math.max(0, (ytPlayerRef.current?.getCurrentTime() ?? 0) - step));
      });
      navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const step = d.seekOffset ?? 10;
        seekTo((ytPlayerRef.current?.getCurrentTime() ?? 0) + step);
      });
    } catch (e) {
      console.warn('Media session handler error:', e);
    }
  }, [nextTrack]);

  // Helper: stop offline audio and clean up
  const stopOfflineAudio = useCallback(() => {
    if (offlineAudioRef.current) {
      offlineAudioRef.current.pause();
      offlineAudioRef.current.removeAttribute('src');
      offlineAudioRef.current.load();
    }
    isOfflineModeRef.current = false;
  }, []);

  // Helper: play from offline blob URL
  const playOffline = useCallback((blobUrl: string, song: Song) => {
    isOfflineModeRef.current = true;

    // Pause YouTube player
    try { ytPlayerRef.current?.pauseVideo(); } catch {}

    // Create or reuse offline audio element
    if (!offlineAudioRef.current) {
      const audio = new Audio();
      audio.id = 'offline-audio';
      offlineAudioRef.current = audio;
    }
    const audio = offlineAudioRef.current;

    // Apply current volume
    const savedVol = localStorage.getItem('soundwave_volume');
    audio.volume = savedVol ? parseFloat(savedVol) : 1;

    // Set up events
    audio.onended = () => {
      if (loopModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else {
        // Trigger next track (uses ref to avoid stale closure)
        setTimeout(() => playSongRef.current && nextTrackRef.current?.(), 100);
      }
    };
    audio.onerror = () => {
      console.error('[offline-audio] Playback error');
      setIsLoading(false);
      setIsPlaying(false);
      showToast('Offline playback failed');
    };

    audio.src = blobUrl;
    audio.play().then(() => {
      setIsLoading(false);
      setIsPlaying(true);
      startPolling();
      startSilentAudio();
    }).catch((e) => {
      console.error('[offline-audio] Play error:', e);
      setIsLoading(false);
    });
  }, [startSilentAudio, startPolling, showToast]);

  // Ref for nextTrack so offline ended handler can call it
  const nextTrackRef = useRef<() => void>(nextTrack);
  nextTrackRef.current = nextTrack;

  const playSong = useCallback(async (song: Song, newQueue: Song[] = []) => {
    setCurrentSong(song);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);

    // Update queue
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

    // Check if song is downloaded in IndexedDB → play offline
    try {
      const blobUrl = await downloadService.getOfflineUrl(song.id);
      if (blobUrl) {
        console.log('[player] Playing from offline download:', song.title);
        playOffline(blobUrl, song);
        return;
      }
    } catch { /* IndexedDB unavailable, fall through to online */ }

    // Online mode — stop any offline audio
    stopOfflineAudio();
    isOfflineModeRef.current = false;

    if (playerReadyRef.current && ytPlayerRef.current) {
      ytPlayerRef.current.loadVideoById(song.id);
    } else {
      pendingVideoRef.current = song.id;
    }
  }, [playOffline, stopOfflineAudio]);

  // Expose playSong via ref so nextTrack / prevTrack can call it
  playSongRef.current = playSong;

  const togglePlay = useCallback(() => {
    if (!currentSongRef.current) return;
    // Offline mode
    if (isOfflineModeRef.current && offlineAudioRef.current) {
      if (offlineAudioRef.current.paused) {
        offlineAudioRef.current.play();
        setIsPlaying(true);
        startSilentAudio();
      } else {
        offlineAudioRef.current.pause();
        setIsPlaying(false);
        stopSilentAudio();
      }
      return;
    }
    // YouTube mode
    if (!ytPlayerRef.current) return;
    const state = ytPlayerRef.current.getPlayerState();
    if (state === 1) {
      ytPlayerRef.current.pauseVideo();
    } else {
      ytPlayerRef.current.playVideo();
    }
  }, [startSilentAudio, stopSilentAudio]);

  const prevTrack = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;

    // If more than 3s in, restart current
    const curTime = isOfflineModeRef.current
      ? offlineAudioRef.current?.currentTime ?? 0
      : ytPlayerRef.current?.getCurrentTime() ?? 0;
    if (curTime > 3) {
      if (isOfflineModeRef.current && offlineAudioRef.current) {
        offlineAudioRef.current.currentTime = 0;
      } else {
        ytPlayerRef.current?.seekTo(0, true);
      }
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

  const seekTo = useCallback((time: number) => {
    if (isOfflineModeRef.current && offlineAudioRef.current) {
      offlineAudioRef.current.currentTime = time;
    } else {
      ytPlayerRef.current?.seekTo(time, true);
    }
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((vol: number) => {
    // YouTube volume
    ytPlayerRef.current?.setVolume(vol * 100);
    if (vol === 0) ytPlayerRef.current?.mute();
    else ytPlayerRef.current?.unMute();
    // Offline audio volume
    if (offlineAudioRef.current) offlineAudioRef.current.volume = vol;
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
