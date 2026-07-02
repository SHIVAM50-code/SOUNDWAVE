import { Plus, Heart, BarChart2 } from 'lucide-react';
import type { Song } from '../services/pipedService';
import { DownloadButton } from './DownloadButton';

interface SongCardProps {
  song: Song;
  isActive: boolean;
  isPlaying?: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onAddToQueue: () => void;
  onToggleLike: () => void;
}

export function SongCard({
  song,
  isActive,
  isPlaying,
  isLiked,
  onPlay,
  onAddToQueue,
  onToggleLike,
}: SongCardProps) {
  const formatDuration = (seconds: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={`song-card ${isActive ? 'active' : ''}`} onClick={onPlay}>
      <div className="song-art-wrapper">
        <img
          src={song.thumbnail}
          alt={song.title}
          className="song-art"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=150';
          }}
        />
        {isActive && isPlaying && (
          <div className="playing-indicator">
            <BarChart2 size={14} className="bars-icon" />
          </div>
        )}
      </div>

      <div className="song-details">
        <h4 className="song-title">{song.title}</h4>
        <p className="song-artist">{song.artist}</p>
      </div>

      <div className="song-duration">{formatDuration(song.duration)}</div>

      <DownloadButton song={song} size={16} />

      <button
        className="song-action-btn"
        onClick={(e) => { e.stopPropagation(); onAddToQueue(); }}
        title="Add to queue"
      >
        <Plus size={18} />
      </button>

      <button
        className={`song-action-btn ${isLiked ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
        title={isLiked ? 'Remove from Liked' : 'Like'}
        style={isLiked ? { color: '#ef4444' } : {}}
      >
        <Heart size={18} fill={isLiked ? '#ef4444' : 'none'} />
      </button>
    </div>
  );
}
