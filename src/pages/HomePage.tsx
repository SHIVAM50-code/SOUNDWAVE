// src/pages/HomePage.tsx
import { useEffect, useState } from 'react';
import { Flame, Clock, Heart, Music2, Radio, Mic2 } from 'lucide-react';
import { pipedService } from '../services/pipedService';
import type { Song } from '../services/pipedService';
import { SongCard } from '../components/SongCard';
import type { AudioPlayerHookType } from '../hooks/useAudioPlayer';

interface Props {
  player: AudioPlayerHookType;
  likedSongs: Song[];
  onToggleLike: (song: Song) => void;
  onSearch: (q: string) => void;
}

const TRENDING_QUERIES = [
  { label: 'Top Global Hits 2025', query: 'top hits 2025', emoji: '🌍' },
  { label: 'Viral Bollywood', query: 'bollywood viral 2025', emoji: '🎬' },
  { label: 'Chill Vibes', query: 'chill lofi beats 2025', emoji: '🌙' },
  { label: 'Hip-Hop Bangers', query: 'hip hop hits 2025', emoji: '🔥' },
  { label: 'EDM Drop', query: 'edm electronic 2025', emoji: '⚡' },
  { label: 'Classic Rock', query: 'classic rock hits', emoji: '🎸' },
];

const GENRE_CHIPS = [
  { label: 'Pop', query: 'pop hits 2025' },
  { label: 'Bollywood', query: 'new bollywood songs 2025' },
  { label: 'Hip-Hop', query: 'hip hop rap 2025' },
  { label: 'EDM', query: 'edm dance 2025' },
  { label: 'Rock', query: 'rock songs 2025' },
  { label: 'Classical', query: 'classical music best' },
  { label: 'Jazz', query: 'jazz instrumental' },
  { label: 'R&B', query: 'rnb soul 2025' },
  { label: 'Devotional', query: 'bhajan devotional songs' },
  { label: 'Lo-fi', query: 'lofi hip hop study' },
  { label: 'Punjabi', query: 'punjabi hits 2025' },
  { label: 'Podcast', query: 'popular podcast 2025' },
];

export function HomePage({ player, likedSongs, onToggleLike, onSearch }: Props) {
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  useEffect(() => {
    setLoadingTrending(true);
    pipedService.searchSongs('top global hits playlist 2025')
      .then(songs => setTrendingSongs(songs.slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoadingTrending(false));
  }, []);

  const recentHistory = player.history.slice(0, 10);

  return (
    <div className="home-page">
      {/* Greeting */}
      <div className="home-greeting">
        <div className="greeting-text">
          <span className="greeting-wave">👋</span>
          <h1>{greeting}</h1>
          <p>What do you want to listen to?</p>
        </div>
        <div className="greeting-icon">
          <Music2 size={28} />
        </div>
      </div>

      {/* Genre Chips */}
      <div className="section">
        <div className="genre-chips">
          {GENRE_CHIPS.map(g => (
            <button key={g.label} className="genre-chip" onClick={() => onSearch(g.query)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trending Cards */}
      <div className="section">
        <div className="section-header">
          <Flame size={18} className="section-icon fire" />
          <h2>Trending Now</h2>
        </div>
        <div className="trending-grid">
          {TRENDING_QUERIES.map(t => (
            <button key={t.label} className="trending-card" onClick={() => onSearch(t.query)}>
              <span className="trending-emoji">{t.emoji}</span>
              <span className="trending-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Liked Songs */}
      {likedSongs.length > 0 && (
        <div className="section">
          <div className="section-header">
            <Heart size={18} className="section-icon liked" />
            <h2>Liked Songs</h2>
            <span className="section-count">{likedSongs.length}</span>
          </div>
          <div className="song-list">
            {likedSongs.slice(0, 5).map(song => (
              <SongCard
                key={song.id}
                song={song}
                isPlaying={player.currentSong?.id === song.id && player.isPlaying}
                isActive={player.currentSong?.id === song.id}
                isLiked={true}
                onPlay={() => player.playSong(song, likedSongs)}
                onAddToQueue={() => player.addToQueue(song)}
                onToggleLike={() => onToggleLike(song)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent History */}
      {recentHistory.length > 0 && (
        <div className="section">
          <div className="section-header">
            <Clock size={18} className="section-icon" />
            <h2>Recently Played</h2>
          </div>
          <div className="song-list">
            {recentHistory.slice(0, 5).map(song => (
              <SongCard
                key={song.id}
                song={song}
                isPlaying={player.currentSong?.id === song.id && player.isPlaying}
                isActive={player.currentSong?.id === song.id}
                isLiked={likedSongs.some(s => s.id === song.id)}
                onPlay={() => player.playSong(song, recentHistory)}
                onAddToQueue={() => player.addToQueue(song)}
                onToggleLike={() => onToggleLike(song)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top Picks */}
      <div className="section">
        <div className="section-header">
          <Radio size={18} className="section-icon" />
          <h2>Top Picks For You</h2>
        </div>
        {loadingTrending ? (
          <div className="skeleton-list">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        ) : (
          <div className="song-list">
            {trendingSongs.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isPlaying={player.currentSong?.id === song.id && player.isPlaying}
                isActive={player.currentSong?.id === song.id}
                isLiked={likedSongs.some(s => s.id === song.id)}
                onPlay={() => player.playSong(song, trendingSongs)}
                onAddToQueue={() => player.addToQueue(song)}
                onToggleLike={() => onToggleLike(song)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="home-footer">
        <Mic2 size={14} />
        <span>Soundwave — Ad-free music, always</span>
      </div>
    </div>
  );
}
