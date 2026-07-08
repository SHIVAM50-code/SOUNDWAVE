import { useState, useEffect, useRef, useCallback } from 'react';
import type { Song } from '../services/pipedService';
import { downloadService } from '../services/downloadService';
import { youtubePlayer } from '../services/youtubePlayer';

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
  const isOfflineRef        = useRef(false);

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

  // ── Initialize HTML5 Audio (For Offline Playback) ──────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.id = 'soundwave-audio';
    audioRef.current = audio;
    (window as any)._audioPlayer = audio;

    const savedVol = localStorage.getItem('soundwave_volume');
    const savedVolNum = savedVol ? parseFloat(savedVol) : 1;
    audio.volume = savedVolNum;

    audio.onplay = () => {
      if (!isOfflineRef.current) return;
      setIsPlaying(true);
      setIsLoading(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    };
    audio.onpause = () => {
      if (!isOfflineRef.current) return;
      setIsPlaying(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    };
    audio.onwaiting = () => {
      if (!isOfflineRef.current) return;
      setIsLoading(true);
    };
    audio.onplaying = () => {
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
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
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
    audio.onerror = (e) => {
      if (!isOfflineRef.current) return;
      console.error('[audio] Offline playback error:', e);
      setIsLoading(false);
      setIsPlaying(false);
      showToast('Playback error — skipping...');
      setTimeout(() => nextTrackRef.current?.(), 1500);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
      (window as any)._audioPlayer = null;
    };
  }, [showToast]);

  // ── Initialize YouTube Player Callbacks ──────────────────────────────────────
  useEffect(() => {
    // Volume initialization
    const savedVol = localStorage.getItem('soundwave_volume');
    const savedVolNum = savedVol ? parseFloat(savedVol) : 1;
    setVolumeState(savedVolNum);
    youtubePlayer.setVolume(savedVolNum);

    // Register callbacks to sync YouTube Player state with React state
    youtubePlayer.onStateChange((state) => {
      if (isOfflineRef.current) return; // Ignore YouTube events if playing offline

      // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
      if (state === 1) { // Playing
        setIsPlaying(true);
        setIsLoading(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        
        // Sync duration once details load
        const d = youtubePlayer.getDuration();
        if (d && !isNaN(d)) setDuration(d);
      } else if (state === 2) { // Paused
        setIsPlaying(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      } else if (state === 3) { // Buffering / Loading
        setIsLoading(true);
      } else if (state === -1 || state === 5) {
        setIsLoading(false);
      }
    });

    youtubePlayer.onTimeUpdate((time) => {
      if (isOfflineRef.current) return;

      setCurrentTime(time);
      
      const d = youtubePlayer.getDuration();
      if (d && d > 0 && !isNaN(d)) setDuration(d);
    });

    youtubePlayer.onEnded(() => {
      if (isOfflineRef.current) return;

      setIsPlaying(false);
      if (loopModeRef.current === 'one') {
        const curSong = currentSongRef.current;
        if (curSong) {
          youtubePlayer.loadAndPlay(curSong.id);
        }
      } else {
        nextTrackRef.current?.();
      }
    });

    // Media Session action handlers (for background lockscreen controls)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play',  () => {
        const audio = audioRef.current;
        if (isOfflineRef.current) {
          if (audio) audio.play().catch(console.error);
        } else {
          youtubePlayer.play();
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        const audio = audioRef.current;
        if (isOfflineRef.current) {
          if (audio) audio.pause();
        } else {
          youtubePlayer.pause();
        }
      });
      navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrackRef.current?.());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrackRef.current?.());
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime !== undefined) {
          const audio = audioRef.current;
          if (isOfflineRef.current) {
            if (audio) audio.currentTime = d.seekTime;
          } else {
            youtubePlayer.seekTo(d.seekTime);
          }
          setCurrentTime(d.seekTime);
        }
      });
    }

    return () => {
      youtubePlayer.pause();
    };
  }, []);

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
    
    // Check if we should restart the current song
    let curTime = 0;
    const audio = audioRef.current;
    if (isOfflineRef.current) {
      curTime = audio ? audio.currentTime : 0;
    } else {
      curTime = youtubePlayer.getCurrentTime();
    }

    if (curTime > 3) {
      if (isOfflineRef.current && audio) audio.currentTime = 0;
      else youtubePlayer.seekTo(0);
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

    // Check for offline download first
    let blobUrl: string | null = null;
    try {
      blobUrl = await downloadService.getOfflineUrl(song.id);
    } catch (_) {}

    const audio = audioRef.current;

    if (blobUrl) {
      console.log('[player] Playing from local IndexedDB:', song.title);
      isOfflineRef.current = true;
      // Pause YouTube Player
      youtubePlayer.pause();
      
      // Load and play native audio
      if (audio) {
        audio.src = blobUrl;
        audio.play().catch((e) => {
          console.error('[player] Offline play failed:', e);
          setIsLoading(false);
        });
      }
    } else {
      console.log('[player] Playing client-side via YouTube IFrame:', song.title);
      isOfflineRef.current = false;
      // Clear offline audio src
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      youtubePlayer.loadAndPlay(song.id);
    }
  }, [updateMediaSession]);

  playSongRef.current = playSong;

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (!currentSongRef.current) return;
    const audio = audioRef.current;
    if (isOfflineRef.current) { // Offline Mode
      if (audio) {
        audio.paused ? audio.play().catch(console.error) : audio.pause();
      }
    } else { // Online Mode
      if (isPlaying) {
        youtubePlayer.pause();
      } else {
        youtubePlayer.play();
      }
    }
  }, [isPlaying]);

  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);

  const seekTo = useCallback((time: number) => {
    setCurrentTime(time);
    const audio = audioRef.current;
    if (isOfflineRef.current) {
      if (audio) audio.currentTime = time;
    } else {
      youtubePlayer.seekTo(time);
    }
  }, []);

  const seekToRef = useRef(seekTo);
  useEffect(() => { seekToRef.current = seekTo; }, [seekTo]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('soundwave_volume', vol.toString());
    if (audioRef.current) audioRef.current.volume = vol;
    youtubePlayer.setVolume(vol);
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
