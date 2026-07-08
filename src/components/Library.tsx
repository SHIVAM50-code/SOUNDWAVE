import { useState } from 'react';
import { Heart, Clock, Play } from 'lucide-react';
import type { Song } from '../services/pipedService';
import { SongCard } from './SongCard';

interface LibraryProps {
  likedSongs: Song[];
  history: Song[];
  activeSongId?: string;
  onPlaySong: (song: Song, queue: Song[]) => void;
  onAddToQueue: (song: Song) => void;
  onToggleLike: (song: Song) => void;
}

type LibraryTab = 'liked' | 'history';

export function Library({
  likedSongs,
  history,
  activeSongId,
  onPlaySong,
  onAddToQueue,
  onToggleLike
}: LibraryProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('liked');

  const getActiveSongs = () => {
    return activeTab === 'liked' ? likedSongs : history;
  };

  const playAll = () => {
    const songs = getActiveSongs();
    if (songs.length > 0) {
      onPlaySong(songs[0], songs);
    }
  };

  return (
    <div>
      {/* Quick Playlists Grid */}
      <div className="quick-lib-grid">
        <div className="quick-lib-card" onClick={() => setActiveTab('liked')} style={activeTab === 'liked' ? { border: '1px solid var(--primary)', background: 'rgba(139, 92, 246, 0.05)' } : {}}>
          <div className="quick-lib-card-icon">
            <Heart size={20} fill={activeTab === 'liked' ? 'var(--primary)' : 'none'} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Liked Songs</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{likedSongs.length} songs</p>
          </div>
        </div>

        <div className="quick-lib-card" onClick={() => setActiveTab('history')} style={activeTab === 'history' ? { border: '1px solid var(--primary)', background: 'rgba(139, 92, 246, 0.05)' } : {}}>
          <div className="quick-lib-card-icon" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--secondary)' }}>
            <Clock size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Recent History</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{history.length} songs</p>
          </div>
        </div>
      </div>

      {/* Header with Play All Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, textTransform: 'capitalize' }}>
          {activeTab === 'liked' ? 'My Favorites' : 'Recent Plays'}
        </h3>
        
        {getActiveSongs().length > 0 && (
          <button
            onClick={playAll}
            style={{
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Play size={12} fill="#fff" /> Play All
          </button>
        )}
      </div>

      {/* Song List */}
      <div className="song-list">
        {getActiveSongs().map((song) => (
          <SongCard
            key={song.id}
            song={song}
            isActive={song.id === activeSongId}
            isLiked={likedSongs.some((s) => s.id === song.id)}
            onPlay={() => onPlaySong(song, getActiveSongs())}
            onAddToQueue={() => onAddToQueue(song)}
            onToggleLike={() => onToggleLike(song)}
          />
        ))}

        {getActiveSongs().length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '12px', display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }}>
              {activeTab === 'liked' ? <Heart size={28} /> : <Clock size={28} />}
            </div>
            <p style={{ fontSize: '0.9rem' }}>
              {activeTab === 'liked'
                ? 'No liked songs yet. Search and tap the heart icon to add songs here!'
                : 'No listening history yet. Start searching and listening to tracks!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
