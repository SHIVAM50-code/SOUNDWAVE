// src/pages/SearchPage.tsx
import { useState, useRef, useEffect } from 'react';
import { Search, X, ArrowLeft, Download, Loader } from 'lucide-react';
import { pipedService } from '../services/pipedService';
import type { Song } from '../services/pipedService';
import { SongCard } from '../components/SongCard';
import { downloadService } from '../services/downloadService';
import type { AudioPlayerHookType } from '../hooks/useAudioPlayer';

interface Props {
  player: AudioPlayerHookType;
  likedSongs: Song[];
  onToggleLike: (song: Song) => void;
  initialQuery?: string;
  onBack: () => void;
}

const GENRE_SEARCHES = [
  { label: '🔥 Trending',   query: 'trending songs 2025' },
  { label: '🎬 Bollywood',  query: 'new bollywood 2025' },
  { label: '🌍 Global',     query: 'global top hits 2025' },
  { label: '🎸 Rock',       query: 'best rock songs' },
  { label: '🎤 Hip-Hop',    query: 'hip hop rap 2025' },
  { label: '⚡ EDM',        query: 'edm electronic hits' },
  { label: '🌙 Lo-fi',      query: 'lofi chill beats' },
  { label: '🎷 Jazz',       query: 'jazz classics instrumental' },
  { label: '🙏 Devotional', query: 'bhajan devotional hindi' },
  { label: '💜 Punjabi',    query: 'punjabi hits 2025' },
  { label: '😴 Sleep',      query: 'sleep music relaxing' },
  { label: '🏋️ Workout',   query: 'workout gym motivation songs' },
];

export function SearchPage({ player, likedSongs, onToggleLike, initialQuery = '', onBack }: Props) {
  const [query,       setQuery]       = useState(initialQuery);
  const [results,     setResults]     = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bulkState,   setBulkState]   = useState<'idle' | 'downloading' | 'done'>('idle');
  const [bulkProgress, setBulkProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialQuery) doSearch(initialQuery);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    setBulkState('idle');
    try {
      const songs = await pipedService.searchSongs(q);
      setResults(songs);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // Bulk download all results
  const downloadAll = async () => {
    if (results.length === 0) return;
    setBulkState('downloading');
    setBulkProgress(0);
    let done = 0;
    for (const song of results) {
      const already = await downloadService.isDownloaded(song.id);
      if (!already) {
        await downloadService.downloadSong(
          song,
          undefined,
          (msg) => console.warn('[bulk-dl]', msg),
        );
      }
      done++;
      setBulkProgress(Math.round((done / results.length) * 100));
    }
    setBulkState('done');
  };

  return (
    <div className="search-page">
      {/* Search Bar */}
      <div className="search-bar-wrapper">
        <button className="back-btn" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={20} />
        </button>
        <form className="search-form" onSubmit={handleSubmit}>
          <Search size={18} className="search-icon-input" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Songs, artists, albums, podcasts..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="search-clear" onClick={clearSearch}>
              <X size={16} />
            </button>
          )}
        </form>
      </div>

      {/* Genre chips — show when no search yet */}
      {!hasSearched && (
        <div className="search-genres">
          <h2 className="browse-title">Browse Categories</h2>
          <div className="genre-chips-grid">
            {GENRE_SEARCHES.map(g => (
              <button
                key={g.label}
                className="genre-chip-big"
                onClick={() => { setQuery(g.query); doSearch(g.query); }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isSearching && (
        <div className="skeleton-list">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton-row" />)}
        </div>
      )}

      {/* Results */}
      {!isSearching && hasSearched && (
        <>
          <div className="results-header">
            <p className="results-count">
              {results.length > 0 ? `${results.length} results for "${query}"` : 'No results found'}
            </p>
            {results.length > 1 && (
              <button
                className={`bulk-download-btn ${bulkState === 'done' ? 'done' : ''}`}
                onClick={downloadAll}
                disabled={bulkState === 'downloading'}
                title="Download all results for offline"
              >
                {bulkState === 'downloading' ? (
                  <><Loader size={14} className="spin-icon" /> {bulkProgress}%</>
                ) : bulkState === 'done' ? (
                  <>✓ Downloaded</>
                ) : (
                  <><Download size={14} /> Download All</>
                )}
              </button>
            )}
          </div>
          <div className="song-list">
            {results.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isPlaying={player.currentSong?.id === song.id && player.isPlaying}
                isActive={player.currentSong?.id === song.id}
                isLiked={likedSongs.some(s => s.id === song.id)}
                onPlay={() => player.playSong(song, results)}
                onAddToQueue={() => player.addToQueue(song)}
                onToggleLike={() => onToggleLike(song)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
