import { useState, useRef } from 'react';
import {
  Play, Pause, SkipForward, SkipBack,
  Repeat, Shuffle, Volume2, ChevronDown,
  ListMusic, Mic2, Heart, GripVertical, Timer, Gauge
} from 'lucide-react';
import type { AudioPlayerHookType } from '../hooks/useAudioPlayer';
import type { Song } from '../services/pipedService';
import { LyricsPanel } from './LyricsPanel';
import { AddToPlaylistButton } from './AddToPlaylistButton';

interface Props {
  player: AudioPlayerHookType;
  likedSongs: Song[];
  onToggleLike: (song: Song) => void;
  onShowLyrics?: () => void;
}

export function AudioPlayerControls({ player, likedSongs, onToggleLike }: Props) {
  const [isExpanded, setIsExpanded]           = useState(false);
  const [showQueue, setShowQueue]             = useState(false);
  const [showLyricsInPlayer, setShowLyricsInPlayer] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu]     = useState(false);
  const [showTimerMenu, setShowTimerMenu]     = useState(false);
  const [playbackSpeed, setPlaybackSpeed]     = useState(1);
  const [sleepTimer, setSleepTimer]           = useState<number | null>(null); // remaining mins
  const sleepTimerRef                         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepCountRef                         = useRef<ReturnType<typeof setInterval> | null>(null);

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const SLEEP_MINS = [15, 30, 45, 60];

  const {
    currentSong, queue, isPlaying, isLoading,
    currentTime, duration, volume, loopMode, isShuffle,
    togglePlay, nextTrack, prevTrack,
    seekTo, setVolume, toggleLoop, toggleShuffle, playSong, setQueue
  } = player;

  const dragIndexRef = useRef<number>(-1);

  const handleDragStart = (i: number) => { dragIndexRef.current = i; };
  const handleDragOver  = (e: React.DragEvent) => e.preventDefault();
  const handleDrop      = (toIdx: number) => {
    const fromIdx = dragIndexRef.current;
    if (fromIdx === -1 || fromIdx === toIdx) return;
    const updated = [...queue];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setQueue(updated);
    dragIndexRef.current = -1;
  };

  const applySpeed = (s: number) => {
    // HTML5 Audio playbackRate
    const audio = (window as any)._audioPlayer;
    if (audio) {
      audio.playbackRate = s;
    }
    setPlaybackSpeed(s);
    setShowSpeedMenu(false);
  };

  const startSleep = (mins: number) => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepCountRef.current) clearInterval(sleepCountRef.current);
    setSleepTimer(mins);
    setShowTimerMenu(false);
    let remaining = mins;
    sleepCountRef.current = setInterval(() => {
      remaining -= 1;
      setSleepTimer(remaining);
      if (remaining <= 0) {
        clearInterval(sleepCountRef.current!);
        player.togglePlay();
      }
    }, 60000);
  };

  const cancelSleep = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (sleepCountRef.current) clearInterval(sleepCountRef.current);
    setSleepTimer(null);
  };

  if (!currentSong) return null;

  const isLiked   = likedSongs.some(s => s.id === currentSong.id);
  const progress  = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (t: number) => {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getLoopColor = () =>
    loopMode === 'all' ? 'var(--primary)' : loopMode === 'one' ? '#f43f5e' : 'rgba(255,255,255,0.4)';

  return (
    <>
      {/* ── MINI PLAYER BAR (always visible when song is playing) ──────────── */}
      {!isExpanded && (
        <div className="mini-player-bar" onClick={() => setIsExpanded(true)}>
          {/* Progress line at top */}
          <div className="mini-progress-track">
            <div className="mini-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <div className="mini-player-inner">
            {/* Thumbnail + info */}
            <div className="mini-info">
              <div className="mini-thumb-wrap">
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong.title}
                  className="mini-thumb"
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100';
                  }}
                />
                {isPlaying && !isLoading && (
                  <div className="mini-playing-dot" />
                )}
              </div>
              <div className="mini-text">
                <p className="mini-title">{currentSong.title}</p>
                <p className="mini-artist">{currentSong.artist}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="mini-controls" onClick={e => e.stopPropagation()}>
              <button
                className="mini-btn"
                onClick={() => onToggleLike(currentSong)}
                style={{ color: isLiked ? '#ef4444' : 'rgba(255,255,255,0.5)' }}
              >
                <Heart size={18} fill={isLiked ? '#ef4444' : 'none'} />
              </button>
              <button className="mini-btn mini-play-btn" onClick={togglePlay}>
                {isLoading ? (
                  <div className="mini-spinner" />
                ) : isPlaying ? (
                  <Pause size={20} fill="#000" />
                ) : (
                  <Play size={20} fill="#000" style={{ marginLeft: 2 }} />
                )}
              </button>
              <button className="mini-btn" onClick={nextTrack}>
                <SkipForward size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FULL SCREEN PLAYER (Spotify-style) ────────────────────────────── */}
      {isExpanded && (
        <div className="fullplayer-overlay">
          {/* Header */}
          <div className="fp-header">
            <button className="fp-btn-icon" onClick={() => setIsExpanded(false)}>
              <ChevronDown size={26} />
            </button>
            <div className="fp-header-title">
              <p>Now Playing</p>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>

              {/* Sleep Timer button */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`fp-btn-icon ${sleepTimer !== null ? 'fp-btn-active' : ''}`}
                  onClick={() => { setShowTimerMenu(v => !v); setShowSpeedMenu(false); }}
                  title="Sleep timer"
                >
                  <Timer size={18} />
                  {sleepTimer !== null && <span style={{ fontSize: 9, position: 'absolute', top: 2, right: 2, background: 'var(--primary)', borderRadius: 99, padding: '0 3px', color: '#fff' }}>{sleepTimer}m</span>}
                </button>
                {showTimerMenu && (
                  <div className="fp-popup-menu">
                    <p className="fp-popup-label">Sleep after</p>
                    {SLEEP_MINS.map(m => (
                      <button key={m} className="fp-popup-item" onClick={() => startSleep(m)}>{m} min</button>
                    ))}
                    {sleepTimer !== null && <button className="fp-popup-item" style={{ color: '#ef4444' }} onClick={cancelSleep}>Cancel timer</button>}
                  </div>
                )}
              </div>

              {/* Playback speed button */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`fp-btn-icon ${playbackSpeed !== 1 ? 'fp-btn-active' : ''}`}
                  onClick={() => { setShowSpeedMenu(v => !v); setShowTimerMenu(false); }}
                  title="Playback speed"
                >
                  <Gauge size={18} />
                  {playbackSpeed !== 1 && <span style={{ fontSize: 9, position: 'absolute', top: 2, right: 2, background: 'var(--primary)', borderRadius: 99, padding: '0 3px', color: '#fff' }}>{playbackSpeed}×</span>}
                </button>
                {showSpeedMenu && (
                  <div className="fp-popup-menu">
                    <p className="fp-popup-label">Playback speed</p>
                    {SPEEDS.map(s => (
                      <button
                        key={s}
                        className="fp-popup-item"
                        style={{ fontWeight: s === playbackSpeed ? 700 : 400, color: s === playbackSpeed ? 'var(--primary)' : undefined }}
                        onClick={() => applySpeed(s)}
                      >{s === 1 ? 'Normal' : `${s}×`}</button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className={`fp-btn-icon ${showLyricsInPlayer ? 'fp-btn-active' : ''}`}
                onClick={() => { setShowLyricsInPlayer(!showLyricsInPlayer); setShowQueue(false); }}
              >
                <Mic2 size={20} />
              </button>
              <button
                className={`fp-btn-icon ${showQueue ? 'fp-btn-active' : ''}`}
                onClick={() => { setShowQueue(!showQueue); setShowLyricsInPlayer(false); }}
              >
                <ListMusic size={20} />
              </button>
            </div>
          </div>

          {/* ── LYRICS view ── */}
          {showLyricsInPlayer && (
            <div className="fp-lyrics-area">
              <LyricsPanel
                song={currentSong}
                currentTime={currentTime}
                isOpen={true}
                onClose={() => setShowLyricsInPlayer(false)}
                inline={true}
              />
            </div>
          )}

          {/* ── QUEUE view ── */}
          {showQueue && !showLyricsInPlayer && (
            <div className="fp-queue">
              <p className="fp-queue-title">Up Next — drag ☰ to reorder</p>
              <div className="fp-queue-list">
                {queue.map((song, i) => (
                  <div
                    key={`${song.id}-${i}`}
                    className={`fp-queue-row ${song.id === currentSong.id ? 'active' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(i)}
                    onClick={() => playSong(song)}
                  >
                    <GripVertical size={16} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0, cursor: 'grab' }} onClick={e => e.stopPropagation()} />
                    <img src={song.thumbnail} alt={song.title} className="fp-queue-thumb" />
                    <div className="fp-queue-info">
                      <p className="fp-queue-name">{song.title}</p>
                      <p className="fp-queue-artist">{song.artist}</p>
                    </div>
                    {song.id === currentSong.id && (
                      <div className="fp-queue-playing">
                        <div className="playing-bar" /><div className="playing-bar" /><div className="playing-bar" />
                      </div>
                    )}
                  </div>
                ))}
                {queue.length === 0 && <p className="fp-empty">Queue is empty</p>}
              </div>
            </div>
          )}

          {/* ── MAIN ART + controls ── */}
          {!showQueue && !showLyricsInPlayer && (
            <div className="fp-art-area">
              <div className="fp-art-wrap">
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong.title}
                  className={`fp-art ${isPlaying ? 'fp-art-playing' : ''}`}
                  onError={e => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400';
                  }}
                />
                {isLoading && <div className="fp-art-loading" />}
              </div>
            </div>
          )}

          {/* ── Bottom Controls (always visible) ── */}
          <div className="fp-controls-area">
            {/* Title + like */}
            <div className="fp-song-row">
              <div className="fp-song-info">
                <p className="fp-song-title">{currentSong.title}</p>
                <p className="fp-song-artist">{currentSong.artist}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <AddToPlaylistButton song={currentSong} size={20} className="fp-atp" />
                <button
                  className="fp-like-btn"
                  onClick={() => onToggleLike(currentSong)}
                >
                  <Heart size={22} fill={isLiked ? '#ef4444' : 'none'} color={isLiked ? '#ef4444' : 'rgba(255,255,255,0.5)'} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="fp-progress-area">
              <input
                type="range"
                className="fp-slider"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={e => seekTo(parseFloat(e.target.value))}
              />
              <div className="fp-time-row">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback buttons */}
            <div className="fp-playback-row">
              <button
                className="fp-ctrl-btn"
                onClick={toggleShuffle}
                style={{ color: isShuffle ? 'var(--primary)' : 'rgba(255,255,255,0.4)' }}
              >
                <Shuffle size={22} />
              </button>
              <button className="fp-ctrl-btn fp-ctrl-skip" onClick={prevTrack}>
                <SkipBack size={28} fill="currentColor" />
              </button>
              <button className="fp-play-btn" onClick={togglePlay}>
                {isLoading ? (
                  <div className="fp-spinner" />
                ) : isPlaying ? (
                  <Pause size={30} fill="#000" />
                ) : (
                  <Play size={30} fill="#000" style={{ marginLeft: 3 }} />
                )}
              </button>
              <button className="fp-ctrl-btn fp-ctrl-skip" onClick={nextTrack}>
                <SkipForward size={28} fill="currentColor" />
              </button>
              <button
                className="fp-ctrl-btn"
                onClick={toggleLoop}
                style={{ color: getLoopColor(), position: 'relative' }}
              >
                <Repeat size={22} />
                {loopMode === 'one' && (
                  <span style={{ position: 'absolute', fontSize: '9px', fontWeight: 800, bottom: 2, right: 2, background: '#f43f5e', borderRadius: '50%', width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>1</span>
                )}
              </button>
            </div>

            {/* Volume */}
            <div className="fp-volume-row">
              <Volume2 size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
              <input
                type="range"
                className="fp-slider fp-volume-slider"
                min={0} max={1} step={0.05}
                value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
